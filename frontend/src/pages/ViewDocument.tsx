import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authService } from "@/lib/auth";
import { storageService, Document } from "@/lib/storage";
import { cleanMedicalText, detectSemanticChunks, Chunk } from "@/lib/pdfExtractor";
import { embedTexts } from "@/lib/embeddings";
import { vectorStore, VectorChunk } from "@/lib/vectorStore";
import { webLLMService } from "@/lib/webllm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, FileText, Layers, Loader2, ScanText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

  const [document, setDocument] = useState<Document | null>(null);
  const [cleanedText, setCleanedText] = useState("");

  const [chunkingState, setChunkingState] = useState<ChunkingState>("idle");
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [progressMsg, setProgressMsg] = useState("");
  const [progressValue, setProgressValue] = useState(0);

  useEffect(() => {
    if (!user || !documentId) return;

    const allDocs = [
      ...storageService.getDocuments(user.id),
      ...storageService.getGeneralDocuments(),
    ];

    const doc = allDocs.find(d => d.id === documentId);

    if (!doc) {
      toast({
        title: "Документ не найден",
        description: "Перенаправление к списку документов",
        variant: "destructive",
      });
      navigate("/documents");
      return;
    }

    setDocument(doc);
    setCleanedText(cleanMedicalText(doc.content));

    // Restore from IndexedDB if already indexed — no re-analysis needed
    vectorStore.getBySource(doc.id).then(cached => {
      if (cached.length > 0) {
        setChunks(vectorChunksToDisplay(cached));
        setProgressMsg(`Загружено ${cached.length} чанков из кэша`);
        setChunkingState("done");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, user?.id]);

  const handleAnalyze = async () => {
    if (!cleanedText || !document) return;

    try {
      // Step 1: ensure LLM is ready
      if (!webLLMService.isInitialized) {
        setChunkingState("llm-init");
        setProgressMsg("Загрузка модели…");
        setProgressValue(0);
        await webLLMService.initialize((report) => {
          setProgressMsg(report.text);
          setProgressValue(Math.round(report.progress * 100));
        });
      }

      // Step 2: semantic chunking
      setChunkingState("chunking");
      setProgressValue(0);

      const result = await detectSemanticChunks(cleanedText, (msg, current, total) => {
        setProgressMsg(msg);
        setProgressValue(Math.round((current / total) * 100));
      });

      // Step 3: embed + persist to IndexedDB
      setChunkingState("embedding");
      setProgressMsg("Векторизация чанков…");
      setProgressValue(0);

      await vectorStore.deleteBySource(document.id);

      const embeddings = await embedTexts(result.map(c => c.text));

      const vectorChunks: VectorChunk[] = result.map((c, i) => ({
        id: `${document.id}::${c.id}`,
        content: c.text,
        embedding: embeddings[i],
        metadata: { source: document.id, chunkIndex: i },
      }));

      await vectorStore.addChunks(vectorChunks);

      setChunks(result);
      setChunkingState("done");
    } catch (err) {
      console.error("[ViewDocument] analysis error:", err);
      setChunkingState("error");
      toast({
        title: "Ошибка анализа",
        description: "Не удалось выполнить семантическую разбивку.",
        variant: "destructive",
      });
    }
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("ru-RU", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  if (!document) return null;

  const isRunning =
    chunkingState === "llm-init" ||
    chunkingState === "chunking" ||
    chunkingState === "embedding";

  const progressLabel =
    chunkingState === "llm-init" ? "Инициализация модели" :
    chunkingState === "chunking"  ? "Анализ текста" :
                                    "Векторизация";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">{document.title}</h1>
          <p className="text-muted-foreground mt-1">
            {document.fileType} • Загружено {formatDate(document.uploadedAt)}
          </p>
        </div>
      </div>

      {/* Document content */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <CardTitle>Содержимое документа</CardTitle>
          </div>
          {document.isGeneral && (
            <CardDescription>
              Это общий медицинский документ, доступный всем пользователям
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap font-sans text-sm text-foreground bg-muted p-4 rounded-lg">
            {document.content}
          </pre>
        </CardContent>
      </Card>

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
              : "Разбивка текста на смысловые блоки с помощью LLM"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(chunkingState === "idle" || chunkingState === "error") && (
            <Button onClick={handleAnalyze} className="gap-2">
              <ScanText className="h-4 w-4" />
              {chunkingState === "error" ? "Повторить анализ" : "Запустить семантический анализ"}
            </Button>
          )}

          {isRunning && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{progressLabel} — {progressMsg}</span>
              </div>
              <Progress value={progressValue} className="h-2" />
            </div>
          )}

          {chunkingState === "done" && chunks.length > 0 && (
            <ScrollArea className="h-[520px] pr-3">
              <Accordion type="multiple" className="space-y-2">
                {chunks.map((chunk, i) => (
                  <AccordionItem
                    key={chunk.id}
                    value={chunk.id}
                    className="border rounded-lg px-3"
                  >
                    <AccordionTrigger className="hover:no-underline py-3">
                      <div className="flex items-center gap-3 text-left w-full min-w-0">
                        <span className="text-xs text-muted-foreground w-7 shrink-0">
                          #{i + 1}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {chunk.text.split(/\s+/).filter(Boolean).length} слов
                        </span>
                        <span className="text-sm text-muted-foreground truncate">
                          {chunk.text.slice(0, 90)}…
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pb-3">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">
                        {chunk.text}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Символы {chunk.startIndex}–{chunk.endIndex}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ViewDocument;