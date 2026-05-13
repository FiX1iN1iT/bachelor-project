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

## Быстрый старт

```bash
npm install
npm run dev      # Vite dev server на порту 8080
npm run build    # Production-сборка
npm run preview  # Предпросмотр production-сборки
```

При первом открытии чата браузер загрузит:
- `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (~400 МБ) для эмбеддингов
- `Qwen2.5-7B-Instruct-q4f16_1-MLC` (~4 ГБ) для генерации

Требуется браузер с поддержкой **WebGPU** (Chrome 113+, Edge 113+).

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

### Библиотеки (`src/lib/`)

1. **`api.ts`** — HTTP-вызовы бэкенда (загрузка/скачивание документов, presigned URLs)
2. **`auth.ts`** — управление JWT (localStorage, декодирование, login/register/logout)
3. **`storage.ts`** — localStorage CRUD (документы, чаты, сообщения, ML-параметры)
4. **`pdfExtractor.ts`** — извлечение текста из PDF, очистка медицинского текста, семантическая разбивка через LLM
5. **`embeddings.ts`** — Xenova/all-MiniLM-L6-v2 (384-мерные векторы, ONNX)
6. **`vectorStore.ts`** — векторное хранилище на IndexedDB, поиск по косинусному сходству top-K
7. **`webllm.ts`** — синглтон MLCEngine для Qwen2.5-7B; `generateWithMessages()`, `generateResponse()`, `generateRaw()`
8. **`context.ts`** — форматирование чанков в контекст промпта (лимит 6000 символов)
9. **`retrieval.ts`** — векторный поиск и ранжирование
10. **`rag.ts`** — оркестрация: `retrieveContext()` → `buildContext()` → `generateWithMessages()`
11. **`utils.ts`** — общие утилиты

### Страницы (`src/pages/`)

| Страница | Используемые библиотеки |
|---|---|
| `Landing.tsx` | — |
| `Auth.tsx` | `auth.ts`, `api.ts` |
| `Documents.tsx` | `api.ts`, `storage.ts`, `vectorStore.ts`, `embeddings.ts` |
| `AddDocument.tsx` | `api.ts` |
| `ViewDocument.tsx` | `pdfExtractor.ts`, `embeddings.ts`, `vectorStore.ts` |
| `Chat.tsx` | `rag.ts`, `webllm.ts`, `storage.ts` |
| `ChatList.tsx` | `storage.ts` |
| `Admin.tsx` | `storage.ts` (ML-параметры: temperature, top-K и др.) |

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

Модель: `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (Transformers.js, ONNX Runtime в браузере).  
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

Метрика близости — **косинусное сходство**. Поиск линейный — перебор всех чанков в памяти после загрузки из IndexedDB.

---

## WebLLM — Инференс LLM в браузере

**`src/lib/webllm.ts`**

Модель: `Qwen2.5-7B-Instruct-q4f16_1-MLC` — квантизация 4-бит (q4f16), скомпилированная для WebGPU через MLC (Machine Learning Compilation).

### Инициализация

**`webLLMService.initialize(onProgress?): Promise<void>`**

При первом запуске происходит загрузка весов и компиляция шейдеров WebGPU (несколько минут). Прогресс передаётся через `onProgress` callback. При повторных запусках браузер использует кэш.

Объект `webLLMService` является **синглтоном** с флагами `isInitialized` и `isInitializing`.

### Методы генерации

**`generateWithMessages(messages, onChunk?): Promise<string>`** — используется RAG-пайплайном. Принимает готовый массив сообщений, поддерживает стриминг через `onChunk(delta)`.

**`generateResponse(messages, onChunk?): Promise<string>`** — пользовательский метод. Автоматически добавляет системный промпт (медицинский ИИ-ассистент, только русский язык).

**`generateRaw(messages): Promise<string>`** — используется при семантической разбивке. Параметры: `temperature: 0.1`, `max_tokens: 512`. Возвращает JSON-ответ для парсинга границ чанков.

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

Собирает чанки в строку с метками источников (`[Source 1]`, `[Source 2]`, …). Максимальный размер контекста — **6000 символов** (~1500 токенов). Последний чанк обрезается, если превышает лимит.

### Шаг 3 — Generation

**`webLLMService.generateWithMessages(messages, onChunk)`**

Системный промпт: отвечать только на основе контекста, не придумывать информацию, указывать источники `[Source X]`. Ответ стримится через `onChunk(delta)`.

---

## Интеграция в Chat

**`src/pages/Chat.tsx` — `handleSendMessage()`**

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
