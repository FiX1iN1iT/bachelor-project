import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "@/lib/auth";
import { apiService } from "@/lib/api";
import { storageService, MLParams } from "@/lib/storage";
import { vectorStore } from "@/lib/vectorStore";
import { webLLMService } from "@/lib/webllm";
import { resetExtractor } from "@/lib/embeddings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [fullName, setFullName] = useState(user?.fullName ?? '');

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  const handleSaveMLParams = () => {
    const prev = storageService.getMLParams();
    storageService.saveMLParams(mlParams);

    if (mlParams.generatorModel !== prev.generatorModel) {
      webLLMService.reset();
    }
    if (mlParams.retrieverModel !== prev.retrieverModel) {
      resetExtractor();
    }

    toast({
      title: "Настройки сохранены",
      description: "Параметры ML моделей были обновлены.",
    });
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiService.updateProfile(fullName);
      const updated = { ...user!, fullName };
      localStorage.setItem('auth_user', JSON.stringify(updated));
      toast({ title: "Профиль обновлён", description: "Ваша информация была успешно сохранена." });
    } catch {
      toast({ title: "Ошибка", description: "Не удалось сохранить профиль.", variant: "destructive" });
    }
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
                  <CardTitle>{fullName || user.id}</CardTitle>
                  <CardDescription>{user.id}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Имя пользователя</Label>
                  <Input
                    id="username"
                    value={user.id}
                    disabled
                    className="opacity-60 cursor-not-allowed"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fullName">Полное имя</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Иван Иванов"
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
              <div className="flex justify-between py-2">
                <span className="text-muted-foreground">Дата регистрации</span>
                <span className="font-medium">
                  {new Date(user.createdAt).toLocaleDateString('ru-RU', {
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
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
                        disabled
                        className="opacity-60 cursor-not-allowed"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Top K результатов</Label>
                        <span className="text-sm font-semibold tabular-nums">{mlParams.retrieverTopK}</span>
                      </div>
                      <Slider
                        min={1}
                        max={10}
                        step={1}
                        value={[mlParams.retrieverTopK]}
                        onValueChange={([v]) => setMLParams({ ...mlParams, retrieverTopK: v })}
                      />
                      <p className="text-sm text-muted-foreground">
                        Количество релевантных фрагментов для извлечения (1–10)
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-border">
                    <h3 className="text-lg font-semibold text-foreground">Настройки Generator</h3>

                    <div className="space-y-2">
                      <Label>Название модели</Label>
                      <Select
                        value={mlParams.generatorModel}
                        onValueChange={(v) => setMLParams({ ...mlParams, generatorModel: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Llama-3.2-1B-Instruct-q4f16_1-MLC">Llama 3.2 1B Instruct</SelectItem>
                          <SelectItem value="Llama-3.2-3B-Instruct-q4f16_1-MLC">Llama 3.2 3B Instruct</SelectItem>
                          <SelectItem value="Llama-3.2-8B-Instruct-q4f16_1-MLC">Llama 3.2 8B Instruct</SelectItem>
                          <SelectItem value="Qwen3-4B-q4f16_1-MLC">Qwen3 4B</SelectItem>
                          <SelectItem value="Qwen3-8B-q4f16_1-MLC">Qwen3 8B</SelectItem>
                          <SelectItem value="Qwen2.5-3B-Instruct-q4f16_1-MLC">Qwen2.5 3B Instruct</SelectItem>
                          <SelectItem value="Qwen2.5-7B-Instruct-q4f16_1-MLC">Qwen2.5 7B Instruct</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Температура</Label>
                        <span className="text-sm font-semibold tabular-nums">{mlParams.generatorTemperature.toFixed(1)}</span>
                      </div>
                      <Slider
                        min={0}
                        max={1}
                        step={0.1}
                        value={[mlParams.generatorTemperature]}
                        onValueChange={([v]) => setMLParams({ ...mlParams, generatorTemperature: v })}
                      />
                      <p className="text-sm text-muted-foreground">
                        Контролирует случайность (0.0 = точнее, 1.0 = креативнее)
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
                        Максимальная длина ответа (100–4000)
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
