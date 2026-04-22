import { retrieveContext } from "@/lib/retrieval";
import { buildContext } from "@/lib/context";
import { webLLMService } from "@/lib/webllm";

const RAG_SYSTEM_PROMPT = `Ты — медицинский ИИ-ассистент. Отвечай ТОЛЬКО на русском языке.

Отвечай на вопрос, используя ИСКЛЮЧИТЕЛЬНО предоставленный контекст.

Правила:
- НЕ придумывай информацию, которой нет в контексте
- Если информации недостаточно, отвечай: «В загруженных документах недостаточно информации по этому вопросу»
- Ссылайся на источники в формате [Источник X]
- Отвечай точно и по существу
- Никогда не используй английский язык`;

function buildRAGPrompt(context: string, question: string): string {
  return `Контекст:\n${context}\n\nВопрос:\n${question}\n\nОтвет:`;
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
      : "В базе знаний не найдено подходящих документов.";

  const answer = await webLLMService.generateWithMessages(
    [
      { role: "system", content: RAG_SYSTEM_PROMPT },
      { role: "user", content: buildRAGPrompt(context, query) },
    ],
    onChunk
  );

  return { answer, sources, contextUsed: context };
}