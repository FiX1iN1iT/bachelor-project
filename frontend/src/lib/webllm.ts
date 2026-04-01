import * as webllm from "@mlc-ai/web-llm";

export type InitProgressCallback = (progress: webllm.InitProgressReport) => void;

const SYSTEM_PROMPT = `Ты — медицинский ИИ-ассистент. Отвечай ТОЛЬКО на русском языке. Никогда не используй английский, латиницу или любые другие языки и символы.
Отвечай кратко и по существу. Давай конкретные советы. Всегда напоминай, что твои ответы носят информационный характер и не заменяют консультацию врача.`;

const MODEL_ID = "Qwen2.5-7B-Instruct-q4f16_1-MLC";

let engine: webllm.MLCEngine | null = null;
let isInitializing = false;
let isInitialized = false;

export const webLLMService = {
  get isInitialized() {
    return isInitialized;
  },

  get isInitializing() {
    return isInitializing;
  },

  async initialize(onProgress?: InitProgressCallback): Promise<void> {
    if (isInitialized || isInitializing) return;

    isInitializing = true;
    try {
      engine = new webllm.MLCEngine({ initProgressCallback: onProgress });
      await engine.reload(MODEL_ID);
      isInitialized = true;
    } finally {
      isInitializing = false;
    }
  },

  async generateResponse(
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    if (!engine || !isInitialized) {
      throw new Error("WebLLM engine not initialized");
    }

    const chatMessages: webllm.ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
      ...messages,
    ];

    const params = {
      messages: chatMessages,
    //   max_tokens: 512,
    //   temperature: 0.4,
    //   repetition_penalty: 1.1,
    };

    if (onChunk) {
      const stream = await engine.chat.completions.create({
        ...params,
        stream: true,
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          fullResponse += delta;
          onChunk(delta);
        }
      }
      return fullResponse;
    } else {
      const reply = await engine.chat.completions.create(params);
      return reply.choices[0]?.message?.content ?? "";
    }
  },

  // Raw call: caller supplies full messages array; no system prompt injected.
  // Intended for structured JSON outputs (e.g. boundary detection).
  async generateRaw(
    messages: webllm.ChatCompletionMessageParam[]
  ): Promise<string> {
    if (!engine || !isInitialized) {
      throw new Error("WebLLM engine not initialized");
    }
    const reply = await engine.chat.completions.create({
      messages,
      temperature: 0.1,
      max_tokens: 512,
    });
    return reply.choices[0]?.message?.content ?? "";
  },

  // Raw call with optional streaming. Used by the RAG pipeline.
  async generateWithMessages(
    messages: webllm.ChatCompletionMessageParam[],
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    if (!engine || !isInitialized) {
      throw new Error("WebLLM engine not initialized");
    }

    if (onChunk) {
      const stream = await engine.chat.completions.create({
        messages,
        stream: true,
      });
      let full = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          full += delta;
          onChunk(delta);
        }
      }
      return full;
    }

    const reply = await engine.chat.completions.create({ messages });
    return reply.choices[0]?.message?.content ?? "";
  },

  reset() {
    engine = null;
    isInitialized = false;
    isInitializing = false;
  },
};
