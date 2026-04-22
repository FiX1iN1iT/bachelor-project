import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "@/lib/auth";
import { storageService, Document, MLParams } from "@/lib/storage";
import { vectorStore } from "@/lib/vectorStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Trash2, Settings, Bug } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = authService.getCurrentUser();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [mlParams, setMLParams] = useState<MLParams>(storageService.getMLParams());
  const [vectorCount, setVectorCount] = useState<number | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (!user || !authService.isAdmin(user)) {
      toast({
        title: "Доступ запрещён",
        description: "Эта страница доступна только администраторам",
        variant: "destructive",
      });
      navigate('/chats');
      return;
    }
    loadDocuments();
  }, [user, navigate, toast]);

  const loadDocuments = () => {
    const docs = storageService.getGeneralDocuments();
    setDocuments(docs.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    ));
  };

  const handleDeleteDocument = (docId: string) => {
    storageService.deleteDocument(docId);
    loadDocuments();
    toast({
      title: "Документ удалён",
      description: "Общий медицинский документ был удалён.",
    });
  };

  const handleSaveMLParams = () => {
    storageService.saveMLParams(mlParams);
    toast({
      title: "Настройки сохранены",
      description: "Параметры ML моделей были обновлены.",
    });
  };

  const loadVectorCount = async () => {
    const count = await vectorStore.totalCount();
    setVectorCount(count);
  };

  const handleClearVectorStore = async () => {
    setIsClearing(true);
    try {
      await vectorStore.clear();
      setVectorCount(0);
      toast({ title: "IndexedDB очищена", description: "Все векторные embeddings удалены." });
    } catch (e) {
      toast({ title: "Ошибка", description: "Не удалось очистить IndexedDB.", variant: "destructive" });
    } finally {
      setIsClearing(false);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (!user || !authService.isAdmin(user)) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Панель администратора</h1>
        <p className="text-muted-foreground mt-1">Управление медицинскими документами и параметрами ML</p>
      </div>

      <Tabs defaultValue="documents" className="w-full" onValueChange={(v) => { if (v === "debug") loadVectorCount(); }}>
        <TabsList>
          <TabsTrigger value="documents">
            <FileText className="h-4 w-4 mr-2" />
            Общие документы
          </TabsTrigger>
          <TabsTrigger value="ml-params">
            <Settings className="h-4 w-4 mr-2" />
            Параметры ML
          </TabsTrigger>
          <TabsTrigger value="debug">
            <Bug className="h-4 w-4 mr-2" />
            Отладка
          </TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => navigate('/admin/documents/add')}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить документ
            </Button>
          </div>

          {documents.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-2">Нет общих документов</h3>
                <p className="text-muted-foreground mb-4">Добавьте медицинские документы в базу знаний</p>
                <Button onClick={() => navigate('/admin/documents/add')}>
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить первый документ
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {documents.map((doc) => (
                <Card key={doc.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                          <FileText className="h-5 w-5 text-primary" />
                          {doc.title}
                        </CardTitle>
                        <CardDescription>
                          {doc.fileType} • Добавлено {formatDate(doc.uploadedAt)}
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteDocument(doc.id)}
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
        </TabsContent>

        <TabsContent value="ml-params">
          <Card>
            <CardHeader>
              <CardTitle>Конфигурация ML моделей</CardTitle>
              <CardDescription>
                Настройте параметры моделей поиска и генерации для системы ИИ
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-foreground">Настройки Retriever</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="retriever-model">Название модели</Label>
                  <Input
                    id="retriever-model"
                    value={mlParams.retrieverModel}
                    onChange={(e) => setMLParams({ ...mlParams, retrieverModel: e.target.value })}
                    placeholder="например, all-MiniLM-L6-v2"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="retriever-topk">Top K результатов</Label>
                  <Input
                    id="retriever-topk"
                    type="number"
                    value={mlParams.retrieverTopK}
                    onChange={(e) => setMLParams({ ...mlParams, retrieverTopK: parseInt(e.target.value) })}
                    min="1"
                    max="20"
                  />
                  <p className="text-sm text-muted-foreground">
                    Количество релевантных документов для извлечения (1-20)
                  </p>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="text-lg font-semibold text-foreground">Настройки Generator</h3>
                
                <div className="space-y-2">
                  <Label htmlFor="generator-model">Название модели</Label>
                  <Input
                    id="generator-model"
                    value={mlParams.generatorModel}
                    onChange={(e) => setMLParams({ ...mlParams, generatorModel: e.target.value })}
                    placeholder="например, gpt-3.5-turbo"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="generator-temp">Температура</Label>
                  <Input
                    id="generator-temp"
                    type="number"
                    step="0.1"
                    value={mlParams.generatorTemperature}
                    onChange={(e) => setMLParams({ ...mlParams, generatorTemperature: parseFloat(e.target.value) })}
                    min="0"
                    max="2"
                  />
                  <p className="text-sm text-muted-foreground">
                    Контролирует случайность (0-2, меньше = более точно)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="generator-tokens">Максимум токенов</Label>
                  <Input
                    id="generator-tokens"
                    type="number"
                    value={mlParams.generatorMaxTokens}
                    onChange={(e) => setMLParams({ ...mlParams, generatorMaxTokens: parseInt(e.target.value) })}
                    min="100"
                    max="4000"
                  />
                  <p className="text-sm text-muted-foreground">
                    Максимальная длина ответа (100-4000)
                  </p>
                </div>
              </div>

              <div className="pt-4">
                <Button onClick={handleSaveMLParams}>
                  Сохранить конфигурацию
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="debug">
          <Card>
            <CardHeader>
              <CardTitle>IndexedDB</CardTitle>
              <CardDescription>
                Управление локальным хранилищем векторных embeddings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Чанков в хранилище:{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {vectorCount === null ? "—" : vectorCount}
                  </span>
                </span>
                <Button variant="outline" size="sm" onClick={loadVectorCount}>
                  Обновить
                </Button>
              </div>
              <div className="pt-2 border-t border-border">
                <Button
                  variant="destructive"
                  disabled={isClearing}
                  onClick={handleClearVectorStore}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {isClearing ? "Очистка..." : "Очистить IndexedDB"}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Удаляет все векторные embeddings. Документы в localStorage не затрагиваются.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Admin;