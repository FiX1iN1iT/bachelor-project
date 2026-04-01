import { embedText } from "@/lib/embeddings";
import { vectorStore } from "@/lib/vectorStore";
import type { Chunk } from "@/lib/pdfExtractor";

const TOP_K = 5;

export interface RetrievedChunk extends Chunk {
  docId: string;
  chunkIndex: number;
  score: number;
}

export async function retrieveContext(query: string): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedText(query);
  const results = await vectorStore.search(queryEmbedding, TOP_K);

  return results.map(({ chunk, score }) => ({
    id: chunk.id,
    text: chunk.content,
    startIndex: 0,
    endIndex: chunk.content.length,
    docId: chunk.metadata.source,
    chunkIndex: chunk.metadata.chunkIndex,
    score,
  }));
}