import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Layout from "./components/Layout";
import ChatList from "./pages/ChatList";
import Chat from "./pages/Chat";
import Documents from "./pages/Documents";
import AddDocument from "./pages/AddDocument";
import ViewDocument from "./pages/ViewDocument";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          
          <Route element={<Layout />}>
            <Route path="/chats" element={<ChatList />} />
            <Route path="/chat/:chatId" element={<Chat />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/documents/add" element={<AddDocument />} />
            <Route path="/documents/:documentId" element={<ViewDocument />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/admin/documents/add" element={<AddDocument isAdmin />} />
          </Route>
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
