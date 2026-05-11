import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { authService } from "@/lib/auth";
import { storageService, Document } from "@/lib/storage";
import { apiService, SharedDocument } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, FileText, Trash2, Pencil, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

const SHARED_TITLE_KEY = (id: string) => `shared_title_${id}`;
const SHARED_PARSED_KEY = (id: string) => `shared_doc_parsed_${id}`;

const DocumentCard = ({
  title,
  description,
  onClick,
  onRename,
  onDelete,
  deleteLoading,
}: {
  title: string;
  description: string;
  onClick: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  deleteLoading?: boolean;
}) => (
  <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={onClick}>
    <CardHeader>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex gap-1">
          {onRename && (
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => { e.stopPropagation(); onRename(); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              disabled={deleteLoading}
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-muted-foreground hover:text-destructive"
            >
              {deleteLoading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Trash2 className="h-4 w-4" />}
            </Button>
          )}
        </div>
      </div>
    </CardHeader>
  </Card>
);

const EmptyState = ({
  message,
  hint,
  actionLabel,
  onAction,
}: {
  message: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <Card>
    <CardContent className="flex flex-col items-center justify-center py-12">
      <FileText className="h-16 w-16 text-muted-foreground mb-4" />
      <h3 className="text-xl font-semibold text-foreground mb-2">{message}</h3>
      <p className="text-muted-foreground mb-4">{hint}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>
          <Plus className="h-4 w-4 mr-2" />
          {actionLabel}
        </Button>
      )}
    </CardContent>
  </Card>
);

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

  // Rename
  const [renamingDoc, setRenamingDoc] = useState<{ id: string; title: string; type: "personal" | "shared" } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (user) loadPersonalDocs();
  }, [user?.id]);

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

  const handleDeleteShared = async (id: string) => {
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

  const handleRenameConfirm = async () => {
    if (!renamingDoc || !renameValue.trim()) return;
    const trimmed = renameValue.trim();
    if (renamingDoc.type === "personal") {
      const doc = documents.find(d => d.id === renamingDoc.id);
      if (doc) {
        storageService.saveDocument({ ...doc, title: trimmed });
        loadPersonalDocs();
      }
    } else {
      try {
        const updated = await apiService.updateDocumentTitle(renamingDoc.id, trimmed);
        localStorage.setItem(SHARED_TITLE_KEY(renamingDoc.id), trimmed);
        setSharedDocs(prev => prev.map(d => d.id === updated.id ? updated : d));
      } catch {
        toast({ title: "Ошибка переименования", description: "Не удалось обновить название документа.", variant: "destructive" });
      }
    }
    setRenamingDoc(null);
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

        <TabsContent value="personal" className="mt-4">
          {documents.length === 0 ? (
            <EmptyState
              message="Пока нет документов"
              hint="Загрузите ваши медицинские документы, чтобы начать"
              actionLabel="Загрузить первый документ"
              onAction={() => navigate("/documents/add?type=personal")}
            />
          ) : (
            <div className="grid gap-4">
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  title={doc.title}
                  description={`${doc.fileType} • Загружено ${formatDate(doc.uploadedAt)}`}
                  onClick={() => navigate(`/documents/${doc.id}`)}
                  onRename={() => { setRenamingDoc({ id: doc.id, title: doc.title, type: "personal" }); setRenameValue(doc.title); }}
                  onDelete={() => handleDeletePersonal(doc.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="shared" className="mt-4">
          {sharedLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : sharedDocs.length === 0 ? (
            <EmptyState
              message="Пока нет документов"
              hint={isAdmin ? "Опубликуйте первый общий документ" : "Администратор ещё не опубликовал ни одного документа"}
              actionLabel={isAdmin ? "Опубликовать документ" : undefined}
              onAction={isAdmin ? () => navigate("/documents/add?type=shared") : undefined}
            />
          ) : (
            <div className="grid gap-4">
              {sharedDocs.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  title={doc.title || doc.filename}
                  description={`PDF • Опубликовано ${formatDate(doc.uploaded_at)} • ${doc.uploaded_by_full_name || doc.uploaded_by}`}
                  onClick={() => navigate(`/documents/${doc.id}`)}
                  onRename={isAdmin ? () => { setRenamingDoc({ id: doc.id, title: doc.title || doc.filename, type: "shared" }); setRenameValue(doc.title || doc.filename); } : undefined}
                  onDelete={isAdmin ? () => handleDeleteShared(doc.id) : undefined}
                  deleteLoading={deletingId === doc.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!renamingDoc} onOpenChange={(open) => !open && setRenamingDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Переименовать документ</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRenameConfirm()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenamingDoc(null)}>Отмена</Button>
            <Button onClick={handleRenameConfirm} disabled={!renameValue.trim()}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Documents;
