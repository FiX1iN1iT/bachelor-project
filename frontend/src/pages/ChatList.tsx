import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "@/lib/auth";
import { storageService, Chat } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ChatList = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [chats, setChats] = useState<Chat[]>([]);
  const user = authService.getCurrentUser();

  useEffect(() => {
    if (user) {
      loadChats();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const loadChats = () => {
    if (user) {
      const userChats = storageService.getChats(user.id);
      setChats(userChats.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ));
    }
  };

  const handleCreateChat = () => {
    navigate('/chat/new');
  };

  const handleDeleteChat = (chatId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    storageService.deleteChat(chatId);
    loadChats();
    toast({
      title: "Чат удалён",
      description: "Чат был успешно удалён.",
    });
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Ваши чаты</h1>
          <p className="text-muted-foreground mt-1">Просматривайте и управляйте вашими разговорами</p>
        </div>
        <Button onClick={handleCreateChat}>
          <Plus className="h-4 w-4 mr-2" />
          Новый чат
        </Button>
      </div>

      {chats.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MessageSquare className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-2">Пока нет чатов</h3>
            <p className="text-muted-foreground mb-4">Начните новый разговор с нашим ИИ-ассистентом</p>
            <Button onClick={handleCreateChat}>
              <Plus className="h-4 w-4 mr-2" />
              Создать первый чат
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {chats.map((chat) => (
            <Card
              key={chat.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/chat/${chat.id}`)}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{chat.title}</CardTitle>
                    <CardDescription>
                      Обновлено {formatDate(chat.updatedAt)}
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => handleDeleteChat(chat.id, e)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default ChatList;