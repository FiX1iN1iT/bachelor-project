import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "@/lib/auth";
import { apiService, SharedDocument } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, FileText, Trash2, Eye, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SharedDocuments = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = authService.getCurrentUser();
  const isAdmin = authService.isAdmin(user);

  const [documents, setDocuments] = useState<SharedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const docs = await apiService.listDocuments();
      setDocuments(docs.sort((a, b) =>
        new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
      ));
    } catch {
      toast({
        title: "Ошибка загрузки",
        description: "Не удалось получить список общих документов.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await apiService.deleteDocument(id);
      setDocuments(prev => prev.filter(d => d.id !== id));
      toast({ title: "Документ удалён", description: "Документ успешно удалён с сервера." });
    } catch {
      toast({
        title: "Ошибка удаления",
        description: "Не удалось удалить документ.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("ru-RU", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Общие документы</h1>
          <p className="text-muted-foreground mt-1">
            Документы, опубликованные администратором для всех пользователей
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => navigate("/shared-documents/publish")}>
            <Plus className="h-4 w-4 mr-2" />
            Опубликовать документ
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : documents.length === 0 ? (
        <Card>
          <CardHeader className="flex flex-col items-center py-12">
            <FileText className="h-16 w-16 text-muted-foreground mb-4" />
            <CardTitle className="text-xl mb-2">Пока нет документов</CardTitle>
            <CardDescription>
              {isAdmin
                ? "Опубликуйте первый общий документ"
                : "Администратор ещё не опубликовал ни одного документа"}
            </CardDescription>
            {isAdmin && (
              <Button className="mt-4" onClick={() => navigate("/shared-documents/publish")}>
                <Plus className="h-4 w-4 mr-2" />
                Опубликовать документ
              </Button>
            )}
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => (
            <Card key={doc.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      {doc.filename}
                    </CardTitle>
                    <CardDescription>
                      PDF • Опубликовано {formatDate(doc.uploaded_at)} • {doc.uploaded_by}
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => navigate(`/shared-documents/${doc.id}`)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deletingId === doc.id}
                        onClick={(e) => handleDelete(doc.id, e)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {deletingId === doc.id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <Trash2 className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SharedDocuments;
