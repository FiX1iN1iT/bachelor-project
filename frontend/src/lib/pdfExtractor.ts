import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export function cleanMedicalText(rawText: string): string {
  let text = rawText;

  // --- 1. Fix hyphenated line breaks ---
  // "hyper-\ntension" → "hypertension"
  text = text.replace(/(\w+)-\n(\w+)/g, "$1$2");

  // Fix broken words with hyphen + space
  // "mod- ifiable" → "modifiable"
  text = text.replace(/(\w+)-\s+(\w+)/g, "$1$2");

  // --- 2. Remove repeated headers/footers ---
  const lines = text.split("\n");
  const lineCount: Record<string, number> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      lineCount[trimmed] = (lineCount[trimmed] || 0) + 1;
    }
  }

  const repeatedLines = new Set(
    Object.entries(lineCount)
      .filter(([, count]) => count > 2)
      .map(([line]) => line)
  );

  const cleanedLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (trimmed.length === 0) return true;

    // Remove repeated headers/footers
    if (repeatedLines.has(trimmed)) return false;

    // Remove standalone page numbers: "42", "- 42 -"
    if (/^\s*-?\s*\d+\s*-?\s*$/.test(trimmed)) return false;

    // Remove "Page N" / "Page N of M"
    if (/^[Pp]age\s+\d+(\s+of\s+\d+)?\s*$/.test(trimmed)) return false;

    return true;
  });

  text = cleanedLines.join("\n");

  // --- 3. Remove obvious universal noise ---
  // Remove DOI links
  text = text.replace(/https?:\/\/doi\.org\/\S+/gi, "");

  // Remove emails
  text = text.replace(/\S+@\S+\.\S+/g, "");

  // Remove copyright lines (universal journal boilerplate)
  text = text.replace(/^©.*/gm, "");

  // Remove vertical-text artifacts from PDF figures:
  // sequences of 4+ single letters separated by spaces ("n o i t a c i f i t n e d I")
  text = text.replace(/(?<!\w)(?:[A-Za-z] ){4,}[A-Za-z](?!\w)/g, " ");

  // --- 4. Smart line joining ---

  // a) Short standalone lines are section/subsection headings in any academic paper.
  //    Pattern: a line between newlines consisting only of letters+spaces,
  //    1–7 words, no sentence-ending punctuation → surround with paragraph breaks.
  text = text.replace(/\n([A-Z][A-Za-z ]{2,60})\n/g, (match, content) => {
    const words = content.trim().split(/\s+/).length;
    return words <= 7 ? `\n\n${content.trim()}\n\n` : match;
  });

  // b) Lines ending with sentence punctuation before new content → paragraph break
  text = text.replace(/([.!?])\n([^\n])/g, "$1\n\n$2");

  // c) Collapse remaining single newlines (visual PDF line-wraps) into spaces.
  //    Protect paragraph breaks first.
  const PARA_MARKER = "\x01";
  text = text.replace(/\n\n+/g, PARA_MARKER);
  text = text.replace(/\n/g, " ");
  text = text.replace(new RegExp(PARA_MARKER, "g"), "\n\n");

  // --- 5. Remove references section (common in most papers)
  text = text.replace(/References[\s\S]*/i, "");

  // --- 6. Normalize whitespace ---
  // Collapse 3+ newlines into paragraph breaks
  text = text.replace(/\n{3,}/g, "\n\n");

  // Normalize spaces/tabs
  text = text.replace(/[ \t]+/g, " ");

  // Trim each line
  text = text
    .split("\n")
    .map((l) => l.trim())
    .join("\n");

  return text.trim();
}

export interface Chunk {
  id: string;
  text: string;
  startIndex: number;
  endIndex: number;
}

export type ChunkProgressCallback = (
  message: string,
  current: number,
  total: number
) => void;

// ---------------------------------------------------------------------------
// Paragraph splitting
// ---------------------------------------------------------------------------

interface Paragraph {
  /** cleaned single-line text for LLM */
  text: string;
  /** character offset of this paragraph's first character in the full text */
  offset: number;
}

function splitIntoParagraphs(text: string): Paragraph[] {
  const result: Paragraph[] = [];
  const sep = /\n\n+/g;
  let lastIdx = 0;

  const push = (rawSlice: string, sliceStart: number) => {
    // find where the actual content starts (skip leading whitespace)
    let offset = sliceStart;
    while (offset < text.length && /\s/.test(text[offset])) offset++;
    const trimmed = rawSlice.trim();
    if (trimmed.length >= 30) {
      result.push({
        text: trimmed.replace(/\n/g, " ").replace(/\s+/g, " "),
        offset,
      });
    }
  };

  let m: RegExpExecArray | null;
  while ((m = sep.exec(text)) !== null) {
    push(text.slice(lastIdx, m.index), lastIdx);
    lastIdx = m.index + m[0].length;
  }
  push(text.slice(lastIdx), lastIdx);

  return result;
}

// ---------------------------------------------------------------------------
// LLM boundary detection (paragraph-index based)
// ---------------------------------------------------------------------------

// Keep the prompt short and unambiguous for weak models.
const BOUNDARY_PROMPT = (paragraphs: Paragraph[]) => {
  const numbered = paragraphs
    .map((p, i) => `[${i}] ${p.text.slice(0, 220)}`)
    .join("\n");
  return `Numbered paragraphs from a medical text:
${numbered}

Which paragraph numbers start a NEW topic or section?
Always include 0. Only mark clear topic shifts.
Return JSON only: {"boundaries": [0, 3, 7]}`;
};

function parseBoundaryIndices(response: string): number[] {
  const match = response.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed.boundaries)) {
      return (parsed.boundaries as unknown[]).filter(
        (n): n is number => typeof n === "number" && n >= 0
      );
    }
  } catch {
    // malformed JSON — return empty
  }
  return [];
}

async function detectBoundariesInParagraphs(paragraphs: Paragraph[]): Promise<number[]> {
  const { webLLMService } = await import("@/lib/webllm");
  const response = await webLLMService.generateRaw([
    { role: "user", content: BOUNDARY_PROMPT(paragraphs) },
  ]);
  return parseBoundaryIndices(response);
}

// ---------------------------------------------------------------------------
// Paragraph windows
// ---------------------------------------------------------------------------

interface ParaWindow {
  paragraphs: Paragraph[];
  /** index of paragraphs[0] in the global paragraphs array */
  startGlobalIdx: number;
}

function buildParagraphWindows(
  paragraphs: Paragraph[],
  windowSize = 8,
  overlap = 2
): ParaWindow[] {
  const windows: ParaWindow[] = [];
  const step = windowSize - overlap;
  let i = 0;
  while (i < paragraphs.length) {
    const end = Math.min(i + windowSize, paragraphs.length);
    windows.push({ paragraphs: paragraphs.slice(i, end), startGlobalIdx: i });
    if (end >= paragraphs.length) break;
    i += step;
  }
  return windows;
}

// ---------------------------------------------------------------------------
// Snap boundary to nearest word start
// ---------------------------------------------------------------------------

function snapToWordBoundary(text: string, pos: number): number {
  if (pos <= 0 || pos >= text.length) return pos;
  // Already at a word start (preceded by whitespace)
  if (/\s/.test(text[pos - 1])) return pos;
  // Walk back to the start of the current word
  let p = pos;
  while (p > 0 && !/\s/.test(text[p - 1])) p--;
  return p;
}

// ---------------------------------------------------------------------------
// Boundary deduplication and chunk building
// ---------------------------------------------------------------------------

function deduplicateBoundaries(boundaries: number[], tolerance = 60): number[] {
  const sorted = [...new Set(boundaries)].sort((a, b) => a - b);
  const result: number[] = [];
  for (const b of sorted) {
    if (result.length === 0 || b - result[result.length - 1] > tolerance) {
      result.push(b);
    }
  }
  return result;
}

function boundariesToChunks(text: string, sortedBoundaries: number[]): Chunk[] {
  const chunks: Chunk[] = [];
  for (let i = 0; i < sortedBoundaries.length - 1; i++) {
    let start = sortedBoundaries[i];
    let end = sortedBoundaries[i + 1];
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    const chunkText = text.slice(start, end);
    if (chunkText.trim()) {
      chunks.push({ id: `chunk-${i}`, text: chunkText, startIndex: start, endIndex: end });
    }
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function splitLargeChunk(chunk: Chunk, maxWords = 300): Chunk[] {
  if (wordCount(chunk.text) <= maxWords) return [chunk];

  const sentences = chunk.text.match(/[^.!?]+[.!?]+(?:\s|$)/g) ?? [chunk.text];
  const parts: string[] = [];
  let buffer = "";

  for (const sentence of sentences) {
    if (buffer && wordCount(buffer + sentence) > maxWords) {
      parts.push(buffer.trim());
      buffer = sentence;
    } else {
      buffer += sentence;
    }
  }
  if (buffer.trim()) parts.push(buffer.trim());

  let searchFrom = chunk.startIndex;
  return parts.map((text, idx) => {
    const start = chunk.text.indexOf(text, searchFrom - chunk.startIndex) + chunk.startIndex;
    searchFrom = start + text.length;
    return { id: `${chunk.id}-${idx}`, text, startIndex: start, endIndex: start + text.length };
  });
}

function postProcessChunks(chunks: Chunk[]): Chunk[] {
  // 1. Merge tiny chunks (<50 words) into their previous neighbor
  const merged: Chunk[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (wordCount(c.text) < 50 && merged.length > 0) {
      const prev = merged[merged.length - 1];
      merged[merged.length - 1] = {
        ...prev,
        text: prev.text + " " + c.text,
        endIndex: c.endIndex,
      };
    } else {
      merged.push(c);
    }
  }

  // 2. Split oversized chunks (>300 words)
  const result: Chunk[] = [];
  for (const c of merged) {
    result.push(...splitLargeChunk(c));
  }

  // 3. Re-assign sequential IDs
  return result.map((c, i) => ({ ...c, id: `chunk-${i}` }));
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function detectSemanticChunks(
  text: string,
  onProgress?: ChunkProgressCallback
): Promise<Chunk[]> {
  const paragraphs = splitIntoParagraphs(text);
  if (paragraphs.length === 0) return [];

  const windows = buildParagraphWindows(paragraphs);
  const allCharBoundaries: number[] = [0];

  for (let i = 0; i < windows.length; i++) {
    const win = windows[i];
    onProgress?.(`Анализ окна ${i + 1} из ${windows.length}…`, i + 1, windows.length);
    const t0 = performance.now();

    const localIndices = await detectBoundariesInParagraphs(win.paragraphs);

    // Convert local paragraph indices → global paragraph → char offset
    for (const localIdx of localIndices) {
      const globalIdx = win.startGlobalIdx + localIdx;
      if (globalIdx < paragraphs.length) {
        const charOffset = snapToWordBoundary(text, paragraphs[globalIdx].offset);
        allCharBoundaries.push(charOffset);
      }
    }

    console.log(
      `[chunker] window ${i + 1}/${windows.length} — ${localIndices.length} boundaries — ${(performance.now() - t0).toFixed(0)}ms`
    );
  }

  allCharBoundaries.push(text.length);
  const boundaries = deduplicateBoundaries(allCharBoundaries);
  const rawChunks = boundariesToChunks(text, boundaries);
  return postProcessChunks(rawChunks);
}

export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    let pageText = "";
    for (const item of textContent.items) {
      if (!("str" in item)) continue;
      pageText += item.str;
      // pdfjs marks end-of-line items with hasEOL
      if ((item as { hasEOL?: boolean }).hasEOL) {
        pageText += "\n";
      } else if (item.str && !item.str.endsWith(" ")) {
        pageText += " ";
      }
    }
    pageTexts.push(pageText.trim());
  }

  return pageTexts.join("\n\n").trim();
}
