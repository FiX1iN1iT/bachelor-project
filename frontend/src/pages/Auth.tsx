import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { authService } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Brain } from "lucide-react";

const Auth = () => {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode') || 'login';
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(mode === 'register');

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isRegister) {
        authService.register(formData.email, formData.password, formData.name);
        toast({
          title: "Аккаунт создан!",
          description: "Пожалуйста, войдите с вашими данными.",
        });
        setIsRegister(false);
      } else {
        const user = authService.login(formData.email, formData.password);
        toast({
          title: "С возвращением!",
          description: `Вы вошли как ${user.name}`,
        });
        navigate('/chats');
      }
    } catch (error) {
      toast({
        title: "Ошибка",
        description: error instanceof Error ? error.message : "Ошибка аутентификации",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <Brain className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl">
            {isRegister ? 'Создать аккаунт' : 'Добро пожаловать'}
          </CardTitle>
          <CardDescription>
            {isRegister
              ? 'Зарегистрируйтесь, чтобы начать использовать МедЧат ИИ'
              : 'Войдите в свой аккаунт'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div className="space-y-2">
                <Label htmlFor="name">Полное имя</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Иван Иванов"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email">Электронная почта</Label>
              <Input
                id="email"
                type="email"
                placeholder="example@mail.ru"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Загрузка...' : isRegister ? 'Зарегистрироваться' : 'Войти'}
            </Button>

            <div className="text-center text-sm">
              {isRegister ? (
                <p>
                  Уже есть аккаунт?{' '}
                  <button
                    type="button"
                    onClick={() => setIsRegister(false)}
                    className="text-primary hover:underline"
                  >
                    Войти
                  </button>
                </p>
              ) : (
                <p>
                  Нет аккаунта?{' '}
                  <button
                    type="button"
                    onClick={() => setIsRegister(true)}
                    className="text-primary hover:underline"
                  >
                    Зарегистрироваться
                  </button>
                </p>
              )}
            </div>

            <div className="bg-muted p-3 rounded text-xs text-muted-foreground text-center">
              Демо данные: admin@medical.com / admin123 или user@medical.com / user123
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;