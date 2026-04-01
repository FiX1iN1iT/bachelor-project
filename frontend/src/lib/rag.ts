import { retrieveContext } from "@/lib/retrieval";
import { buildContext } from "@/lib/context";
import { webLLMService } from "@/lib/webllm";

const RAG_SYSTEM_PROMPT = `You are a medical assistant AI.

Answer the question using ONLY the provided context.

Rules:
- Do NOT hallucinate
- If information is missing, say "I don't have enough information"
- Cite sources using [Source X]
- Be precise and clinical`;

function buildRAGPrompt(context: string, question: string): string {
  return `Context:\n${context}\n\nQuestion:\n${question}\n\nAnswer:`;
}

export interface RAGSource {
  docId: string;
  chunkIndex: number;
  preview: string;
}

export interface RAGResult {
  answer: string;
  sources: RAGSource[];
  /** Full context string passed to the model — for debugging */
  contextUsed: string;
}

/**
 * Full RAG pipeline: retrieve → build context → generate answer.
 * Sources are captured before generation and returned alongside the answer.
 */
export async function answerWithRAG(
  query: string,
  onChunk?: (chunk: string) => void
): Promise<RAGResult> {
  const chunks = await retrieveContext(query);

  const sources: RAGSource[] = chunks.map((c) => ({
    docId: c.docId,
    chunkIndex: c.chunkIndex,
    preview: c.text.slice(0, 160).trimEnd(),
  }));

  const context =
    chunks.length > 0
      ? buildContext(chunks)
      : "No relevant documents found in the knowledge base.";

  const answer = await webLLMService.generateWithMessages(
    [
      { role: "system", content: RAG_SYSTEM_PROMPT },
      { role: "user", content: buildRAGPrompt(context, query) },
    ],
    onChunk
  );

  return { answer, sources, contextUsed: context };
}