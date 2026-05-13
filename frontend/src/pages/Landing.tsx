import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { MessageSquare, Shield, FileText, Brain } from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Brain className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-bold text-foreground">МедЧат ИИ</h1>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => navigate('/auth')}>
            Войти
          </Button>
          <Button onClick={() => navigate('/auth?mode=register')}>
            Начать
          </Button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <h2 className="text-5xl font-bold text-foreground leading-tight">
            Ваш медицинский ИИ-ассистент
          </h2>
          <p className="text-xl text-muted-foreground">
            Получайте мгновенные ответы на медицинские вопросы с помощью передовых технологий ИИ.
            Безопасно, конфиденциально и всегда доступно.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-6">
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-card p-8 rounded-lg border border-border space-y-4">
            <MessageSquare className="h-12 w-12 text-primary" />
            <h3 className="text-xl font-semibold text-card-foreground">Умные разговоры</h3>
            <p className="text-muted-foreground">
              Общайтесь естественно с нашим ИИ, который понимает медицинский контекст и предоставляет полезную информацию.
            </p>
          </div>
          
          <div className="bg-card p-8 rounded-lg border border-border space-y-4">
            <Shield className="h-12 w-12 text-primary" />
            <h3 className="text-xl font-semibold text-card-foreground">Безопасность и приватность</h3>
            <p className="text-muted-foreground">
              Ваши разговоры и документы хранятся только локально.
            </p>
          </div>
          
          <div className="bg-card p-8 rounded-lg border border-border space-y-4">
            <FileText className="h-12 w-12 text-primary" />
            <h3 className="text-xl font-semibold text-card-foreground">Анализ документов</h3>
            <p className="text-muted-foreground">
              Загружайте медицинские документы и получайте аналитику и объяснения на основе ИИ.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-20">
        <div className="container mx-auto px-4 py-8 text-center text-muted-foreground">
          <p>© 2026 МедЧат ИИ. Это прототип приложения.</p>
          <p className="text-sm mt-2">Не заменяет профессиональную медицинскую консультацию.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;