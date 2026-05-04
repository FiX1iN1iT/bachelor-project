import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authService } from "@/lib/auth";
import { storageService, Document } from "@/lib/storage";
import { apiService, SharedDocument } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Trash2, Eye, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SHARED_TITLE_KEY = (id: string) => `shared_title_${id}`;
const SHARED_PARSED_KEY = (id: string) => `shared_doc_parsed_${id}`;

const Documents = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const user = authService.getCurrentUser();
  const isAdmin = authService.isAdmin(user);

  const defaultTab = searchParams.get("tab") === "shared" ? "shared" : "personal";
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Personal docs
  const [documents, setDocuments] = useState<Document[]>([]);

  // Shared docs
  const [sharedDocs, setSharedDocs] = useState<SharedDocument[]>([]);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const hasLoadedShared = useRef(false);

  useEffect(() => {
    if (user) loadPersonalDocs();
  }, [user]);

  useEffect(() => {
    if (defaultTab === "shared" && !hasLoadedShared.current) {
      hasLoadedShared.current = true;
      loadSharedDocs();
    }
  }, []);

  const loadPersonalDocs = () => {
    if (!user) return;
    const userDocs = storageService.getDocuments(user.id);
    setDocuments(userDocs.sort((a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    ));
  };

  const loadSharedDocs = async () => {
    setSharedLoading(true);
    try {
      const docs = await apiService.listDocuments();
      setSharedDocs(docs.sort((a, b) =>
        new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
      ));
    } catch {
      toast({
        title: "Ошибка загрузки",
        description: "Не удалось получить список общих документов.",
        variant: "destructive",
      });
    } finally {
      setSharedLoading(false);
    }
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    if (value === "shared" && !hasLoadedShared.current) {
      hasLoadedShared.current = true;
      loadSharedDocs();
    }
  };

  const handleDeletePersonal = (docId: string) => {
    storageService.deleteDocument(docId);
    loadPersonalDocs();
    toast({ title: "Документ удалён", description: "Документ был успешно удалён." });
  };

  const handleDeleteShared = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await apiService.deleteDocument(id);
      localStorage.removeItem(SHARED_TITLE_KEY(id));
      localStorage.removeItem(SHARED_PARSED_KEY(id));
      setSharedDocs(prev => prev.filter(d => d.id !== id));
      toast({ title: "Документ удалён", description: "Документ успешно удалён с сервера." });
    } catch {
      toast({ title: "Ошибка удаления", description: "Не удалось удалить документ.", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("ru-RU", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Документы</h1>
          <p className="text-muted-foreground mt-1">Управление личными и общими медицинскими документами</p>
        </div>
        {activeTab === "personal" ? (
          <Button onClick={() => navigate("/documents/add?type=personal")}>
            <Plus className="h-4 w-4 mr-2" />
            Загрузить документ
          </Button>
        ) : isAdmin ? (
          <Button onClick={() => navigate("/documents/add?type=shared")}>
            <Plus className="h-4 w-4 mr-2" />
            Опубликовать документ
          </Button>
        ) : null}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="personal">Мои документы</TabsTrigger>
          <TabsTrigger value="shared">Общие документы</TabsTrigger>
        </TabsList>

        {/* Personal docs tab */}
        <TabsContent value="personal" className="mt-4">
          {documents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">Пока нет документов</h3>
                <p className="text-muted-foreground mb-4">Загрузите ваши медицинские документы, чтобы начать</p>
                <Button onClick={() => navigate("/documents/add?type=personal")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Загрузить первый документ
                </Button>
              </CardContent>
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
                          {doc.title}
                        </CardTitle>
                        <CardDescription>
                          {doc.fileType} • Загружено {formatDate(doc.uploadedAt)}
                        </CardDescription>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => navigate(`/documents/${doc.id}`)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeletePersonal(doc.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Shared docs tab */}
        <TabsContent value="shared" className="mt-4">
          {sharedLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sharedDocs.length === 0 ? (
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
                  <Button className="mt-4" onClick={() => navigate("/documents/add?type=shared")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Опубликовать документ
                  </Button>
                )}
              </CardHeader>
            </Card>
          ) : (
            <div className="grid gap-4">
              {sharedDocs.map((doc) => {
                const displayTitle = localStorage.getItem(SHARED_TITLE_KEY(doc.id)) || doc.filename;
                return (
                  <Card key={doc.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <FileText className="h-5 w-5 text-primary" />
                            {displayTitle}
                          </CardTitle>
                          <CardDescription>
                            PDF • Опубликовано {formatDate(doc.uploaded_at)} • {doc.uploaded_by}
                          </CardDescription>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/documents/${doc.id}`)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={deletingId === doc.id}
                              onClick={(e) => handleDeleteShared(doc.id, e)}
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
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Documents;
