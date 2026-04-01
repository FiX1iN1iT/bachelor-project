import type { Chunk } from "@/lib/pdfExtractor";

// Rough upper bound: 1 token ≈ 4 chars for mixed Russian/English medical text
const MAX_CHARS = 6000;

export function buildContext(chunks: Chunk[]): string {
  const parts: string[] = [];
  let total = 0;

  for (let i = 0; i < chunks.length; i++) {
    const header = `[Source ${i + 1}]`;
    const block = `${header}\n${chunks[i].text}`;
    const blockLen = block.length + 2; // +2 for the separator newline

    if (total + blockLen > MAX_CHARS) {
      // Fit a truncated version of the last block if there is room
      const remaining = MAX_CHARS - total - header.length - 2;
      if (remaining > 100) {
        parts.push(`${header}\n${chunks[i].text.slice(0, remaining)}…`);
      }
      break;
    }

    parts.push(block);
    total += blockLen;
  }

  return parts.join("\n\n");
}