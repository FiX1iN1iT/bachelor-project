import {
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";
import { storageService } from "@/lib/storage";

let extractor: FeatureExtractionPipeline | null = null;
let loadedModelId: string | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  const modelId = storageService.getMLParams().retrieverModel;
  if (!extractor || loadedModelId !== modelId) {
    extractor = await pipeline("feature-extraction", modelId, { dtype: "fp32" });
    loadedModelId = modelId;
  }
  return extractor;
}

export function resetExtractor(): void {
  extractor = null;
  loadedModelId = null;
}

/**
 * Embed multiple texts in a single batched forward pass.
 * Prefer this over calling embedText() in a loop.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const ext = await getExtractor();
  const output = await ext(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

/**
 * Embed a single text. Returns a flat number[] suitable for storage in IndexedDB.
 */
export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}