import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "@/lib/auth";
import { storageService, MLParams } from "@/lib/storage";
import { vectorStore } from "@/lib/vectorStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Settings, Bug, User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Admin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = authService.getCurrentUser();
  const isAdmin = !!user && authService.isAdmin(user);
  const [mlParams, setMLParams] = useState<MLParams>(storageService.getMLParams());
  const [vectorCount, setVectorCount] = useState<number | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  const handleSaveMLParams = () => {
    storageService.saveMLParams(mlParams);
    toast({
      title: "Настройки сохранены",
      description: "Параметры ML моделей были обновлены.",
    });
  };

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Профиль обновлён",
      description: "Ваша информация была успешно сохранена.",
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

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Настройки</h1>
        <p className="text-muted-foreground mt-1">Управление аккаунтом и параметрами системы</p>
      </div>

      <Tabs defaultValue="profile" className="w-full" onValueChange={(v) => { if (v === "debug") loadVectorCount(); }}>
        <TabsList>
          <TabsTrigger value="profile">
            <UserIcon className="h-4 w-4 mr-2" />
            Профиль
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

        <TabsContent value="profile" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
                  <UserIcon className="h-6 w-6 text-primary-foreground" />
                </div>
                <div>
                  <CardTitle>{user.name}</CardTitle>
                  <CardDescription>{user.email}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Полное имя</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Ваше имя"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Электронная почта</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="ваш@email.ru"
                  />
                </div>

                <div className="pt-4">
                  <Button type="submit">Сохранить изменения</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Информация об аккаунте</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Тип аккаунта</span>
                <span className="font-medium">
                  {isAdmin ? 'Администратор' : 'Обычный пользователь'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Дата регистрации</span>
                <span className="font-medium">
                  {new Date(user.createdAt).toLocaleDateString('ru-RU', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">ID пользователя</span>
                <span className="font-mono text-sm">{user.id}</span>
              </div>
            </CardContent>
          </Card>
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
