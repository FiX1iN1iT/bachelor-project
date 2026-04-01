import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authService } from "@/lib/auth";
import { storageService, Chat as ChatType, Message } from "@/lib/storage";
import { webLLMService } from "@/lib/webllm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
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

    if (messages.length === 0) {
      const updatedChat = {
        ...chat,
        title: inputValue.slice(0, 50) + (inputValue.length > 50 ? '...' : ''),
        updatedAt: new Date().toISOString(),
      };
      storageService.saveChat(updatedChat);
      setChat(updatedChat);
    }

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      chatId: chat.id,
      role: 'assistant',
      content: "",
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      const history = updatedMessages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      let fullContent = "";
      await webLLMService.generateResponse(history, (chunk) => {
        fullContent += chunk;
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessage.id ? { ...m, content: fullContent } : m
          )
        );
      });

      const finalMessage = { ...assistantMessage, content: fullContent };
      storageService.saveMessage(finalMessage);

      const updatedChat = { ...chat, updatedAt: new Date().toISOString() };
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
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
        <div>
          <h1 className="text-2xl font-bold text-foreground">{chat.title}</h1>
          <p className="text-sm text-muted-foreground">Медицинский ИИ-ассистент</p>
        </div>
      </div>

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
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  {message.content ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  )}
                  <p className="text-xs opacity-70 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString('ru-RU')}
                  </p>
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
          onKeyPress={handleKeyPress}
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