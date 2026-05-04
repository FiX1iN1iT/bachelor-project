import { embedText } from "@/lib/embeddings";
import { vectorStore } from "@/lib/vectorStore";
import { storageService } from "@/lib/storage";
import type { Chunk } from "@/lib/pdfExtractor";

export interface RetrievedChunk extends Chunk {
  docId: string;
  docTitle?: string;
  chunkIndex: number;
  score: number;
}

export async function retrieveContext(query: string): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedText(query);
  const { retrieverTopK } = storageService.getMLParams();
  const results = await vectorStore.search(queryEmbedding, retrieverTopK);

  return results.map(({ chunk, score }) => ({
    id: chunk.id,
    text: chunk.content,
    startIndex: 0,
    endIndex: chunk.content.length,
    docId: chunk.metadata.source,
    docTitle: chunk.metadata.docTitle,
    chunkIndex: chunk.metadata.chunkIndex,
    score,
  }));
}