import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authService } from "@/lib/auth";
import { storageService } from "@/lib/storage";
import { apiService } from "@/lib/api";
import { extractTextFromPDF, cleanMedicalText, detectSemanticChunks, Chunk } from "@/lib/pdfExtractor";
import { embedTexts } from "@/lib/embeddings";
import { vectorStore, VectorChunk } from "@/lib/vectorStore";
import { webLLMService } from "@/lib/webllm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, Download, FileText, Layers, Loader2, ScanText, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SHARED_TITLE_KEY = (id: string) => `shared_title_${id}`;
const SHARED_PARSED_KEY = (id: string) => `shared_doc_parsed_${id}`;

type DocSource = "personal" | "shared";
type ParseState = "idle" | "fetching" | "extracting" | "done" | "error";
type ChunkingState = "idle" | "llm-init" | "chunking" | "embedding" | "done" | "error";

function vectorChunksToDisplay(vchunks: VectorChunk[]): Chunk[] {
  return vchunks.map((c, i) => ({
    id: c.id,
    text: c.content,
    startIndex: i,
    endIndex: i + c.content.length,
  }));
}

const ViewDocument = () => {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = authService.getCurrentUser();
  const isAdmin = authService.isAdmin(user);

  const [loadState, setLoadState] = useState<"loading" | "ready">("loading");
  const [docSource, setDocSource] = useState<DocSource | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [docMeta, setDocMeta] = useState("");
  const [sharedFilename, setSharedFilename] = useState("");

  const [parsedText, setParsedText] = useState("");
  const [parsingState, setParsingState] = useState<ParseState>("idle");

  const [chunkingState, setChunkingState] = useState<ChunkingState>("idle");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [progressMsg, setProgressMsg] = useState("");
  const [progressValue, setProgressValue] = useState(0);

  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!documentId) return;

    const load = async () => {
      setLoadState("loading");

      // Try personal docs first
      const allLocal = storageService.getAllDocuments();
      const localDoc = allLocal.find(d => d.id === documentId);

      if (localDoc) {
        setDocSource("personal");
        setDocTitle(localDoc.title);
        setDocMeta(`${localDoc.fileType} • Загружено ${formatDate(localDoc.uploadedAt)}`);
        const cleaned = cleanMedicalText(localDoc.content);
        setParsedText(cleaned);
        setParsingState("done");

        const cached = await vectorStore.getBySource(documentId);
        if (cached.length > 0) {
          setChunks(vectorChunksToDisplay(cached));
          setChunkingState("done");
        }

        setLoadState("ready");
        return;
      }

      // Try shared docs via API
      try {
        const docs = await apiService.listDocuments();
        const sharedDoc = docs.find(d => d.id === documentId);

        if (!sharedDoc) {
          toast({ title: "Документ не найден", description: "Перенаправление к документам", variant: "destructive" });
          navigate("/documents");
          return;
        }

        setDocSource("shared");
        const title = localStorage.getItem(SHARED_TITLE_KEY(documentId)) || sharedDoc.filename;
        setDocTitle(title);
        setSharedFilename(sharedDoc.filename);
        setDocMeta(`PDF • Опубликовано ${formatDate(sharedDoc.uploaded_at)} • ${sharedDoc.uploaded_by}`);

        const cachedText = localStorage.getItem(SHARED_PARSED_KEY(documentId));
        if (cachedText) {
          setParsedText(cachedText);
          setParsingState("done");
        }

        const cachedChunks = await vectorStore.getBySource(documentId);
        if (cachedChunks.length > 0) {
          setChunks(vectorChunksToDisplay(cachedChunks));
          setChunkingState("done");
        }

        setLoadState("ready");
      } catch {
        toast({ title: "Ошибка загрузки", description: "Не удалось загрузить документ.", variant: "destructive" });
        navigate("/documents");
      }
    };

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, user?.id]);

  const handleParse = async () => {
    if (!documentId || docSource !== "shared") return;
    setParsingState("fetching");
    try {
      const url = await apiService.getDocumentUrl(documentId);
      setParsingState("extracting");
      const response = await fetch(url);
      const blob = await response.blob();
      const file = new File([blob], sharedFilename, { type: "application/pdf" });
      const rawText = await extractTextFromPDF(file);
      const cleaned = cleanMedicalText(rawText);
      localStorage.setItem(SHARED_PARSED_KEY(documentId), cleaned);
      setParsedText(cleaned);
      setParsingState("done");
      toast({ title: "Парсинг завершён", description: "Текст успешно извлечён из PDF." });
    } catch (err) {
      console.error("[ViewDocument] parse error:", err);
      setParsingState("error");
      toast({ title: "Ошибка парсинга", description: "Не удалось извлечь текст из PDF.", variant: "destructive" });
    }
  };

  const handleAnalyze = async () => {
    if (!parsedText || !documentId) return;
    try {
      if (!webLLMService.isInitialized) {
        setChunkingState("llm-init");
        setProgressMsg("Загрузка модели…");
        setProgressValue(0);
        await webLLMService.initialize((report) => {
          setProgressMsg(report.text);
          setProgressValue(Math.round(report.progress * 100));
        });
      }

      setChunkingState("chunking");
      setProgressValue(0);

      const result = await detectSemanticChunks(parsedText, (msg, current, total) => {
        setProgressMsg(msg);
        setProgressValue(Math.round((current / total) * 100));
      });

      setChunkingState("embedding");
      setProgressMsg("Векторизация чанков…");
      setProgressValue(0);

      await vectorStore.deleteBySource(documentId);

      const embeddings = await embedTexts(result.map(c => c.text));

      const vectorChunks: VectorChunk[] = result.map((c, i) => ({
        id: `${documentId}::${c.id}`,
        content: c.text,
        embedding: embeddings[i],
        metadata: { source: documentId, chunkIndex: i, docTitle },
      }));

      await vectorStore.addChunks(vectorChunks);

      setChunks(result);
      setChunkingState("done");
    } catch (err) {
      console.error("[ViewDocument] analysis error:", err);
      setChunkingState("error");
      toast({ title: "Ошибка анализа", description: "Не удалось выполнить семантическую разбивку.", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!documentId || docSource !== "shared") return;
    setIsDeleting(true);
    try {
      await apiService.deleteDocument(documentId);
      localStorage.removeItem(SHARED_PARSED_KEY(documentId));
      localStorage.removeItem(SHARED_TITLE_KEY(documentId));
      await vectorStore.deleteBySource(documentId);
      toast({ title: "Документ удалён", description: "Документ успешно удалён." });
      navigate("/documents?tab=shared");
    } catch {
      toast({ title: "Ошибка удаления", variant: "destructive" });
      setIsDeleting(false);
    }
  };

  const downloadText = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("ru-RU", {
      month: "long", day: "numeric", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const backUrl = docSource === "shared" ? "/documents?tab=shared" : "/documents?tab=personal";

  const parsingRunning = parsingState === "fetching" || parsingState === "extracting";
  const chunkingRunning = chunkingState === "llm-init" || chunkingState === "chunking" || chunkingState === "embedding";

  const parsingLabel = parsingState === "fetching" ? "Получение ссылки…" : "Извлечение текста из PDF…";
  const chunkingLabel =
    chunkingState === "llm-init" ? "Инициализация модели" :
    chunkingState === "chunking" ? "Анализ текста" : "Векторизация";

  const baseFilename = (sharedFilename || docTitle).replace(/\.pdf$/i, "");

  if (loadState === "loading") {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(backUrl)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{docTitle}</h1>
            <p className="text-muted-foreground mt-1">{docMeta}</p>
          </div>
        </div>
        {docSource === "shared" && isAdmin && (
          <Button
            variant="destructive"
            size="sm"
            disabled={isDeleting}
            onClick={handleDelete}
            className="shrink-0"
          >
            {isDeleting
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Trash2 className="h-4 w-4 mr-2" />}
            Удалить
          </Button>
        )}
      </div>

      {/* Parsing card — shown for shared docs until parsed */}
      {docSource === "shared" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle>Извлечённый текст</CardTitle>
              </div>
              {parsingState === "done" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => downloadText(parsedText, `${baseFilename}_parsed.txt`)}
                >
                  <Download className="h-4 w-4" />
                  Скачать текст
                </Button>
              )}
            </div>
            <CardDescription>
              {parsingState === "done"
                ? "Текст успешно извлечён из PDF"
                : "Нажмите кнопку, чтобы скачать PDF с сервера и извлечь текст"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(parsingState === "idle" || parsingState === "error") && (
              <Button onClick={handleParse} className="gap-2">
                <FileText className="h-4 w-4" />
                {parsingState === "error" ? "Повторить парсинг" : "Запустить парсинг"}
              </Button>
            )}
            {parsingRunning && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{parsingLabel}</span>
              </div>
            )}
            {parsingState === "done" && parsedText && (
              <pre className="whitespace-pre-wrap font-sans text-sm text-foreground bg-muted p-4 rounded-lg max-h-96 overflow-y-auto">
                {parsedText}
              </pre>
            )}
          </CardContent>
        </Card>
      )}

      {/* Content card — shown for personal docs (text already available) */}
      {docSource === "personal" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                <CardTitle>Содержимое документа</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => downloadText(parsedText, `${docTitle}_parsed.txt`)}
              >
                <Download className="h-4 w-4" />
                Скачать текст
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap font-sans text-sm text-foreground bg-muted p-4 rounded-lg">
              {parsedText}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Semantic chunking panel */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Семантические чанки
          </CardTitle>
          <CardDescription>
            {chunkingState === "done"
              ? `Текст разбит на ${chunks.length} смысловых блоков (сохранено в IndexedDB)`
              : parsingState !== "done"
              ? "Сначала запустите парсинг документа"
              : "Разбивка текста на смысловые блоки с помощью LLM"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(chunkingState === "idle" || chunkingState === "error") && (
            <Button onClick={handleAnalyze} disabled={parsingState !== "done"} className="gap-2">
              <ScanText className="h-4 w-4" />
              {chunkingState === "error" ? "Повторить анализ" : "Запустить семантический анализ"}
            </Button>
          )}

          {chunkingRunning && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{chunkingLabel} — {progressMsg}</span>
              </div>
              <Progress value={progressValue} className="h-2" />
            </div>
          )}

          {chunkingState === "done" && chunks.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  const content = chunks
                    .map((c, i) =>
                      `=== Чанк ${i + 1} (${c.text.split(/\s+/).filter(Boolean).length} слов, символы ${c.startIndex}–${c.endIndex}) ===\n${c.text}`
                    )
                    .join("\n\n");
                  downloadText(content, `${baseFilename}_chunks.txt`);
                }}
              >
                <Download className="h-4 w-4" />
                Скачать чанки
              </Button>
              <ScrollArea className="h-[520px] pr-3">
                <Accordion type="multiple" className="space-y-2">
                  {chunks.map((chunk, i) => (
                    <AccordionItem key={chunk.id} value={chunk.id} className="border rounded-lg px-3">
                      <AccordionTrigger className="hover:no-underline py-3">
                        <div className="flex items-center gap-3 text-left w-full min-w-0">
                          <span className="text-xs text-muted-foreground w-7 shrink-0">#{i + 1}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {chunk.text.split(/\s+/).filter(Boolean).length} слов
                          </span>
                          <span className="text-sm text-muted-foreground truncate">
                            {chunk.text.slice(0, 90)}…
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="pb-3">
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{chunk.text}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                          Символы {chunk.startIndex}–{chunk.endIndex}
                        </p>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ViewDocument;
