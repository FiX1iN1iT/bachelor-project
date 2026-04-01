import { useState } from "react";
import { authService } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User as UserIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const Profile = () => {
  const { toast } = useToast();
  const user = authService.getCurrentUser();
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast({
      title: "Профиль обновлён",
      description: "Ваша информация была успешно сохранена.",
    });
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Настройки профиля</h1>
        <p className="text-muted-foreground mt-1">Управляйте информацией вашего аккаунта</p>
      </div>

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
          <form onSubmit={handleSubmit} className="space-y-4">
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
              {authService.isAdmin(user) ? 'Администратор' : 'Обычный пользователь'}
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
    </div>
  );
};

export default Profile;