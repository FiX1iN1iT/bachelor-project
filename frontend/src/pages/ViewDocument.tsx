import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authService } from "@/lib/auth";
import { storageService, Document } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const ViewDocument = () => {
  const { documentId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = authService.getCurrentUser();
  const [document, setDocument] = useState<Document | null>(null);

  useEffect(() => {
    if (!user || !documentId) return;

    const allDocs = [
      ...storageService.getDocuments(user.id),
      ...storageService.getGeneralDocuments(),
    ];
    
    const doc = allDocs.find(d => d.id === documentId);
    
    if (doc) {
      setDocument(doc);
    } else {
      toast({
        title: "Документ не найден",
        description: "Перенаправление к списку документов",
        variant: "destructive",
      });
      navigate('/documents');
    }
  }, [documentId, user, navigate, toast]);

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!document) return null;

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
          <div className="prose max-w-none">
            <pre className="whitespace-pre-wrap font-sans text-foreground bg-muted p-4 rounded-lg">
              {document.content}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ViewDocument;