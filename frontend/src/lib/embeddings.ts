import {
  pipeline,
  type FeatureExtractionPipeline,
} from "@huggingface/transformers";

// ~120 MB ONNX model, 384-dim output, 50+ languages including Russian
const MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

let extractor: FeatureExtractionPipeline | null = null;

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    extractor = await pipeline("feature-extraction", MODEL_ID, {
      dtype: "fp32",
    });
  }
  return extractor;
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