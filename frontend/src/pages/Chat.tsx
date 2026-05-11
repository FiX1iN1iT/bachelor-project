import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { authService } from "@/lib/auth";
import { storageService, Chat as ChatType, Message } from "@/lib/storage";
import { webLLMService } from "@/lib/webllm";
import { answerWithRAG } from "@/lib/rag";
import { vectorStore } from "@/lib/vectorStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Send, Loader2, BookOpen, Bug, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Chat = () => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = authService.getCurrentUser();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [chat, setChat] = useState<ChatType | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [llmReady, setLlmReady] = useState(webLLMService.isInitialized);
  const [initProgress, setInitProgress] = useState(0);
  const [initText, setInitText] = useState("Загрузка модели...");

  // Document title cache: docId → title
  const [docTitles, setDocTitles] = useState<Record<string, string>>({});

  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Debug panel
  const [debugOpen, setDebugOpen] = useState(false);
  const [dbCount, setDbCount] = useState<number | null>(null);
  const [lastContext, setLastContext] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const map: Record<string, string> = {};
    for (const d of storageService.getAllDocuments()) map[d.id] = d.title;
    setDocTitles(map);
  }, [user?.id]);

  useEffect(() => {
    if (webLLMService.isInitialized) {
      setLlmReady(true);
      return;
    }
    webLLMService.initialize((report) => {
      setInitText(report.text);
      setInitProgress(Math.round(report.progress * 100));
    }).then(() => {
      setLlmReady(true);
    }).catch(() => {
      toast({
        title: "Ошибка загрузки модели",
        description: "Не удалось инициализировать ИИ-модель",
        variant: "destructive",
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;

    if (chatId === 'new') {
      const newChat: ChatType = {
        id: crypto.randomUUID(),
        userId: user.id,
        title: 'Новый разговор',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      storageService.saveChat(newChat);
      navigate(`/chat/${newChat.id}`, { replace: true });
    } else if (chatId) {
      const userChats = storageService.getChats(user.id);
      const existingChat = userChats.find(c => c.id === chatId);

      if (existingChat) {
        setChat(existingChat);
        const chatMessages = storageService.getMessages(chatId);
        setMessages(chatMessages);
      } else {
        toast({
          title: "Чат не найден",
          description: "Перенаправление к списку чатов",
          variant: "destructive",
        });
        navigate('/chats');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || !chat || !user || isLoading || !llmReady) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      chatId: chat.id,
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString(),
    };

    storageService.saveMessage(userMessage);
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputValue("");
    setIsLoading(true);

    const newTitle = messages.length === 0
      ? inputValue.slice(0, 50) + (inputValue.length > 50 ? '...' : '')
      : chat.title;

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      chatId: chat.id,
      role: 'assistant',
      content: "",
      timestamp: "",
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      let fullContent = "";
      const { answer, sources, contextUsed } = await answerWithRAG(userMessage.content, (chunk) => {
        fullContent += chunk;
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessage.id ? { ...m, content: fullContent } : m
          )
        );
      });

      setLastContext(contextUsed);

      const finalMessage: Message = {
        ...assistantMessage,
        content: answer,
        sources: sources.length > 0 ? sources : undefined,
        timestamp: new Date().toISOString(),
      };
      storageService.saveMessage(finalMessage);
      setMessages(prev =>
        prev.map(m => m.id === assistantMessage.id ? finalMessage : m)
      );

      const updatedChat = { ...chat, title: newTitle, updatedAt: new Date().toISOString() };
      storageService.saveChat(updatedChat);
      setChat(updatedChat);
    } catch {
      toast({
        title: "Ошибка",
        description: "Не удалось получить ответ от ИИ",
        variant: "destructive",
      });
      setMessages(prev => prev.filter(m => m.id !== assistantMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (!chat) return null;

  return (
    <div className="max-w-4xl mx-auto h-[calc(100vh-140px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/chats')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">{chat.title}</h1>
          <p className="text-sm text-muted-foreground">Медицинский ИИ-ассистент</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          title="Debug panel"
          onClick={() => {
            setDebugOpen(o => !o);
            vectorStore.totalCount().then(setDbCount);
          }}
        >
          <Bug className="h-5 w-5 text-muted-foreground" />
        </Button>
      </div>

      {/* Debug panel */}
      {debugOpen && (
        <Card className="mb-4 p-4 space-y-3 border-dashed border-yellow-500/50 bg-yellow-500/5 text-xs font-mono">
          <p className="font-semibold text-sm font-sans">Отладка</p>
          <p>
            <span className="text-muted-foreground">Всего чанков в IndexedDB: </span>
            <span className="font-bold">{dbCount ?? '…'}</span>
          </p>
          <div>
            <p className="text-muted-foreground mb-1">Последний RAG-контекст, переданный в WebLLM:</p>
            {lastContext ? (
              <ScrollArea className="h-48 rounded border border-border bg-muted p-2">
                <pre className="whitespace-pre-wrap text-xs">{lastContext}</pre>
              </ScrollArea>
            ) : (
              <p className="text-muted-foreground italic">Запросов ещё не было</p>
            )}
          </div>
        </Card>
      )}

      {/* Model loading banner */}
      {!llmReady && (
        <Card className="p-4 mb-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-muted-foreground min-w-0">
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              <span className="truncate">{initText || "Инициализация модели..."}</span>
            </div>
            <span className="text-muted-foreground font-mono shrink-0 ml-2">{initProgress}%</span>
          </div>
          <Progress value={initProgress} />
          <p className="text-xs text-muted-foreground">
            Модель загружается в браузер. При первом запуске это может занять несколько минут.
          </p>
        </Card>
      )}

      {/* Messages */}
      <Card className="flex-1 overflow-y-auto p-4 mb-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center">
            <div>
              <p className="text-muted-foreground mb-2">Начните разговор</p>
              <p className="text-sm text-muted-foreground">Задайте мне любой вопрос на медицинскую тему</p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 space-y-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {/* Answer text */}
                  {message.content ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</p>
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  )}

                  {/* Sources */}
                  {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                    <div className="border-t border-border/40 pt-2 space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground font-medium">
                        <BookOpen className="h-3 w-3" />
                        <span>Источники</span>
                      </div>
                      <ol className="space-y-1">
                        {message.sources.map((src, i) => (
                          <li key={i} className="text-xs text-muted-foreground">
                            <Link
                              to={`/documents/${src.docId}`}
                              className="font-medium text-foreground hover:underline hover:text-primary"
                            >
                              {i + 1}. {src.docTitle ?? docTitles[src.docId] ?? src.docId}
                            </Link>
                            <span className="ml-1 opacity-60">
                              — {src.preview}{src.preview.length >= 160 ? '…' : ''}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {(message.timestamp || message.content) && (
                    <div className="flex items-center justify-between">
                      <p className="text-xs opacity-50">
                        {message.timestamp ? new Date(message.timestamp).toLocaleTimeString('ru-RU') : ''}
                      </p>
                      {message.content && (
                        <button
                          onClick={() => handleCopy(message.id, message.content)}
                          className="text-xs opacity-50 hover:opacity-100 transition-opacity"
                          title="Копировать"
                        >
                          {copiedId === message.id
                            ? <Check className="h-3.5 w-3.5" />
                            : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </Card>

      {/* Input */}
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={llmReady ? "Введите ваше сообщение..." : "Дождитесь загрузки модели..."}
          disabled={isLoading || !llmReady}
          className="flex-1"
        />
        <Button onClick={handleSendMessage} disabled={isLoading || !inputValue.trim() || !llmReady}>
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </Button>
      </div>
    </div>
  );
};

export default Chat;