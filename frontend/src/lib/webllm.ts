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
      engine = new webllm.MLCEngine();
      await engine.reload(MODEL_ID, {
        initProgressCallback: onProgress,
      });
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

  reset() {
    engine = null;
    isInitialized = false;
    isInitializing = false;
  },
};
