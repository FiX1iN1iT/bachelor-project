const DB_NAME = "vector_store";
const DB_VERSION = 1;
const STORE_NAME = "chunks";

export interface VectorChunk {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    source: string;
    chunkIndex: number;
    docTitle?: string;
  };
}

export interface SearchResult {
  chunk: VectorChunk;
  score: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class VectorStore {
  private db: IDBDatabase | null = null;

  private async getDB(): Promise<IDBDatabase> {
    if (!this.db) {
      this.db = await openDB();
    }
    return this.db;
  }

  async addChunks(chunks: VectorChunk[]): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const chunk of chunks) {
        store.put(chunk);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async deleteBySource(source: string): Promise<void> {
    const db = await this.getDB();
    const all = await this.getAllChunks(db);
    const toDelete = all.filter((c) => c.metadata.source === source);
    if (toDelete.length === 0) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      for (const chunk of toDelete) {
        store.delete(chunk.id);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async search(queryEmbedding: number[], topK: number): Promise<SearchResult[]> {
    const db = await this.getDB();
    const all = await this.getAllChunks(db);

    const scored = all.map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async getBySource(source: string): Promise<VectorChunk[]> {
    const db = await this.getDB();
    const all = await this.getAllChunks(db);
    return all
      .filter((c) => c.metadata.source === source)
      .sort((a, b) => a.metadata.chunkIndex - b.metadata.chunkIndex);
  }

  async countBySource(source: string): Promise<number> {
    const chunks = await this.getBySource(source);
    return chunks.length;
  }

  async totalCount(): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  private getAllChunks(db: IDBDatabase): Promise<VectorChunk[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => resolve(req.result as VectorChunk[]);
      req.onerror = () => reject(req.error);
    });
  }
}

export const vectorStore = new VectorStore();