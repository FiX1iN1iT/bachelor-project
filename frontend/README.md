# Frontend

Браузерное SPA на React + TypeScript, реализующее локальный RAG-пайплайн поверх WebLLM. Все вычисления — эмбеддинги, семантическая разбивка, инференс LLM — выполняются целиком на стороне клиента без сервера.

---

## Стек

| Слой | Библиотека |
|---|---|
| UI | React 18, Vite, Tailwind CSS, shadcn/ui |
| LLM (инференс) | `@mlc-ai/web-llm` ^0.2.82 |
| Эмбеддинги | `@huggingface/transformers` ^4.0.0 |
| Парсинг PDF | `pdfjs-dist` ^5.6.205 |
| Хранилище векторов | IndexedDB (browser-native) |
| Хранилище документов | localStorage |

---

## Архитектура

```
Пользователь загружает PDF
        │
        ▼
  [AddDocument.tsx]
  extractTextFromPDF()      ← pdfjs-dist
  cleanMedicalText()        ← нормализация текста
        │
        ▼
  [ViewDocument.tsx]
  detectSemanticChunks()    ← разбивка через LLM
  embedTexts()              ← HuggingFace MiniLM
  vectorStore.addChunks()   ← сохранение в IndexedDB
        │
        ▼
  [Chat.tsx]
  answerWithRAG(query)      ← RAG-пайплайн
  ├─ retrieveContext()      ← поиск по косинусному сходству
  ├─ buildContext()         ← сборка промпта
  └─ webLLMService.generateWithMessages()  ← LLM-генерация
```

---

## Загрузка и хранение документов

### Извлечение текста из PDF

**`src/lib/pdfExtractor.ts` — `extractTextFromPDF(file: File): Promise<string>`**

Использует `pdfjs-dist`. Итерирует все страницы документа:

```typescript
const page = await pdf.getPage(pageNum);
const content = await page.getTextContent();
```

Из каждого элемента `TextItem` восстанавливает пробелы с учётом координат. Страницы объединяются через `\n\n`.

### Очистка медицинского текста

**`cleanMedicalText(rawText: string): string`**

Последовательность преобразований над сырым текстом из PDF:

1. **Исправление переносов** — `hyper-\ntension` → `hypertension`
2. **Удаление повторяющихся header-ов/footer-ов** — строки, встречающиеся 3 и более раз, удаляются
3. **Удаление артефактов** — номера страниц, `Page N`, DOI-ссылки, email-адреса, копирайты, вертикальный текст из рисунков
4. **Умное объединение строк**:
   - Короткие строки (1–7 слов) становятся заголовками разделов
   - Строки, заканчивающиеся знаком препинания, формируют разрывы абзацев
   - Остальные переносы строк схлопываются в пробелы
5. **Удаление списка литературы** — обрезка по паттерну `References[\s\S]*`
6. **Нормализация пробелов**

---

## Семантическая разбивка на чанки

**`detectSemanticChunks(text: string, onProgress?: callback): Promise<Chunk[]>`**

Ключевой этап подготовки базы знаний. Разбивка выполняется в четыре фазы.

### Фаза 1 — Разбивка на абзацы

Текст делится по `\n\n+`. Абзацы короче 30 символов отфильтровываются. Для каждого абзаца сохраняется позиция символа в исходном тексте.

### Фаза 2 — Определение семантических границ через LLM

Абзацы обрабатываются скользящими окнами размером **8 абзацев** с перекрытием **2 абзаца**. Для каждого окна в `webLLMService.generateRaw()` отправляется запрос:

```
Numbered paragraphs from a medical text:
[0] <first 220 chars of paragraph 0>
[1] <first 220 chars of paragraph 1>
...

Which paragraph numbers start a NEW topic or section?
Always include 0. Only mark clear topic shifts.
Return JSON only: {"boundaries": [0, 3, 7]}
```

LLM возвращает JSON с индексами абзацев, с которых начинается новая тема. Параметры инференса: `temperature: 0.1`, `max_tokens: 512` — для детерминированного структурированного вывода.

Функция `parseBoundaryIndices()` парсит ответ, извлекая числа из JSON. Индексы абзацев конвертируются в символьные смещения в исходном тексте.

### Фаза 3 — Сборка чанков

- Дедупликация близких границ (допуск 60 символов)
- Привязка границ к началу ближайшего слова
- Нарезка текста по символьным смещениям

### Фаза 4 — Постобработка

- **Слияние коротких чанков** — чанки < 50 слов объединяются с предыдущим
- **Разбивка длинных чанков** — чанки > 300 слов делятся по границам предложений
- **Переиндексация** — чанкам присваиваются последовательные идентификаторы `chunk-0`, `chunk-1`, …

```typescript
interface Chunk {
  id: string;         // "chunk-0", "chunk-1", ...
  text: string;       // Текст чанка
  startIndex: number; // Смещение начала в оригинале
  endIndex: number;   // Смещение конца в оригинале
}
```

---

## Эмбеддинги

**`src/lib/embeddings.ts`**

Модель: `Xenova/all-MiniLM-L6-v2` (Transformers.js, ONNX Runtime в браузере).  
Размерность вектора: **384**.

```typescript
// Батчевая векторизация (для чанков документа)
embedTexts(texts: string[]): Promise<number[][]>

// Одиночная векторизация (для запроса пользователя)
embedText(text: string): Promise<number[]>
```

Применяется mean pooling по токенам и L2-нормализация. Все операции выполняются в браузере через WebAssembly.

---

## Векторное хранилище

**`src/lib/vectorStore.ts`**

Данные хранятся в **IndexedDB** (база `vector_store`, хранилище `chunks`). Схема:

```typescript
interface VectorChunk {
  id: string;          // "{docId}::{chunkId}"
  content: string;     // Текст чанка
  embedding: number[]; // 384-мерный вектор
  metadata: {
    source: string;    // docId
    chunkIndex: number;
  };
}
```

Методы `VectorStore`:

| Метод | Описание |
|---|---|
| `addChunks(chunks)` | Батчевая вставка чанков с эмбеддингами |
| `search(queryEmbedding, topK)` | Поиск top-K ближайших чанков |
| `deleteBySource(source)` | Удаление всех чанков документа |
| `getBySource(source)` | Получение чанков по документу |
| `totalCount()` | Общее число чанков |
| `clear()` | Полная очистка |

Метрика близости — **косинусное сходство**:

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  // dot(a, b) / (norm(a) * norm(b))
}
```

Поиск линейный — перебор всех чанков в памяти после загрузки из IndexedDB.

---

## WebLLM — Инференс LLM в браузере

**`src/lib/webllm.ts`**

Модель: `Qwen2.5-7B-Instruct-q4f16_1-MLC` — квантизация 4-бит (q4f16), скомпилированная для WebGPU через MLC (Machine Learning Compilation).

### Инициализация

**`webLLMService.initialize(onProgress?): Promise<void>`**

```typescript
const engine = new webllm.MLCEngine({ initProgressCallback });
await engine.reload(MODEL_ID);
```

При первом запуске происходит загрузка весов и компиляция шейдеров WebGPU — этот процесс занимает несколько минут. Прогресс передаётся через `onProgress` callback и отображается в UI. При повторном запуске браузер использует кэш.

Объект `webLLMService` является **синглтоном** с флагами состояния:

```typescript
isInitialized: boolean
isInitializing: boolean
```

### Методы генерации

**`generateWithMessages(messages, onChunk?): Promise<string>`** — используется RAG-пайплайном. Принимает готовый массив сообщений, не добавляя системный промпт. Поддерживает стриминг через `onChunk(delta)`.

**`generateResponse(messages, onChunk?): Promise<string>`** — пользовательский метод. Автоматически добавляет системный промпт:

```
Ты — медицинский ИИ-ассистент. Отвечай ТОЛЬКО на русском языке.
Никогда не используй английский, латиницу или любые другие языки и символы.
Отвечай кратко и по существу. Давай конкретные советы.
Всегда напоминай, что твои ответы носят информационный характер и не заменяют консультацию врача.
```

**`generateRaw(messages): Promise<string>`** — используется при семантической разбивке. Параметры: `temperature: 0.1`, `max_tokens: 512`. Возвращает структурированный JSON-ответ для парсинга границ чанков.

---

## RAG-пайплайн

**`src/lib/rag.ts`**

### Основная функция

**`answerWithRAG(query: string, onChunk?: (delta: string) => void): Promise<RAGResult>`**

```typescript
interface RAGResult {
  answer: string;
  sources: RAGSource[];
  contextUsed: string; // Полный контекст, переданный в LLM
}

interface RAGSource {
  docId: string;
  chunkIndex: number;
  preview: string; // Первые 160 символов чанка
}
```

### Шаг 1 — Retrieval

**`retrieveContext(query: string): Promise<RetrievedChunk[]>`** (`src/lib/retrieval.ts`)

1. `embedText(query)` — векторизация запроса моделью MiniLM
2. `vectorStore.search(embedding, topK=5)` — поиск 5 ближайших чанков по косинусному сходству
3. Возвращает массив `RetrievedChunk[]` с полями `docId`, `chunkIndex`, `text`, `score`

### Шаг 2 — Context Building

**`buildContext(chunks: Chunk[]): string`** (`src/lib/context.ts`)

Собирает чанки в строку с метками источников:

```
[Source 1]
<текст чанка 1>

[Source 2]
<текст чанка 2>
...
```

Максимальный размер контекста — **6000 символов** (~1500 токенов). Последний чанк обрезается, если превышает лимит.

### Шаг 3 — Generation

**`webLLMService.generateWithMessages(messages, onChunk)`**

Массив сообщений:

```typescript
[
  {
    role: "system",
    content:
      "Ты — медицинский ИИ-ассистент.\n" +
      "Отвечай ТОЛЬКО на основе предоставленного контекста.\n" +
      "Не придумывай информацию, которой нет в контексте.\n" +
      "При цитировании указывай источник [Source X].\n" +
      "Будь точен и клиничен.",
  },
  {
    role: "user",
    content: `Контекст:\n${context}\n\nВопрос: ${query}`,
  },
]
```

Ответ стримится через `onChunk(delta)` — каждый токен вызывает обновление состояния React.

---

## Интеграция в Chat

**`src/pages/Chat.tsx` — `handleSendMessage()`**

Полный цикл от запроса до ответа:

```
1. Сохранить сообщение пользователя в localStorage
2. Создать плейсхолдер ответа ассистента
3. answerWithRAG(query, onChunk)
   ├─ retrieveContext(query)
   │   ├─ embedText(query)
   │   └─ vectorStore.search(embedding, 5)
   ├─ buildContext(chunks)
   └─ webLLMService.generateWithMessages([system, user], onChunk)
       └─ for await (chunk of stream) → onChunk(delta)
           └─ setMessages() → ре-рендер → эффект печатания
4. Сохранить финальное сообщение с sources в localStorage
5. Обновить метаданные чата
```

Источники отображаются под ответом — для каждого источника показываются название документа и 160-символьный превью чанка.

---

## Хранение данных

| Хранилище | Что хранится | Ключ |
|---|---|---|
| localStorage | Документы (текст + метаданные) | `medical_documents` |
| localStorage | Чаты и история сообщений | `medical_chats`, `medical_messages` |
| IndexedDB | Векторные эмбеддинги чанков | `vector_store.chunks` |

Весь пайплайн работает офлайн после первой загрузки модели. Модель WebLLM и ONNX-модель эмбеддингов кэшируются браузером.

---

## Запуск

```bash
npm install
npm run dev      # Vite dev server
npm run build    # Production build
npm run preview  # Предпросмотр production-сборки
```

При первом открытии чата браузер загрузит:
- `Xenova/all-MiniLM-L6-v2` (~23 МБ) для эмбеддингов
- `Qwen2.5-7B-Instruct-q4f16_1-MLC` (~4 ГБ) для генерации

Требуется браузер с поддержкой **WebGPU** (Chrome 113+, Edge 113+).
