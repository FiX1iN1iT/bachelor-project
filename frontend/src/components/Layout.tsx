import { useEffect, useState } from "react";
import { useNavigate, Outlet } from "react-router-dom";
import { authService, User } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Brain, MessageSquare, FileText, FolderOpen, User as UserIcon, Settings, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const Layout = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    if (!currentUser) {
      navigate('/auth');
    } else {
      setUser(currentUser);
    }
  }, [navigate]);

  const handleLogout = () => {
    authService.logout();
    navigate('/');
  };

  if (!user) return null;

  const isAdmin = authService.isAdmin(user);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-bold text-card-foreground">МедЧат ИИ</h1>
            {isAdmin && (
              <span className="ml-2 px-2 py-1 bg-primary text-primary-foreground text-xs rounded-full">
                Админ
              </span>
            )}
          </div>
          
          <nav className="flex items-center gap-1">
            <NavLink
              to="/chats"
              className="flex items-center gap-2 px-4 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              activeClassName="bg-muted text-foreground"
            >
              <MessageSquare className="h-4 w-4" />
              <span>Чаты</span>
            </NavLink>
            
            <NavLink
              to="/documents"
              className="flex items-center gap-2 px-4 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              activeClassName="bg-muted text-foreground"
            >
              <FileText className="h-4 w-4" />
              <span>Мои документы</span>
            </NavLink>

            <NavLink
              to="/shared-documents"
              className="flex items-center gap-2 px-4 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              activeClassName="bg-muted text-foreground"
            >
              <FolderOpen className="h-4 w-4" />
              <span>Общие документы</span>
            </NavLink>

            {isAdmin && (
              <NavLink
                to="/admin"
                className="flex items-center gap-2 px-4 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                activeClassName="bg-muted text-foreground"
              >
                <Settings className="h-4 w-4" />
                <span>Админ</span>
              </NavLink>
            )}
            
            <NavLink
              to="/profile"
              className="flex items-center gap-2 px-4 py-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              activeClassName="bg-muted text-foreground"
            >
              <UserIcon className="h-4 w-4" />
              <span>Профиль</span>
            </NavLink>

            <Button variant="ghost" size="sm" onClick={handleLogout} className="ml-2">
              <LogOut className="h-4 w-4" />
            </Button>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;