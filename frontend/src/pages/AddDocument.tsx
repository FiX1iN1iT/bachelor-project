import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "@/lib/auth";
import { storageService, Document } from "@/lib/storage";
import { extractTextFromPDF, cleanMedicalText } from "@/lib/pdfExtractor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AddDocumentProps {
  isAdmin?: boolean;
}

const AddDocument = ({ isAdmin = false }: AddDocumentProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = authService.getCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleFile = (file: File) => {
    if (file.type !== "application/pdf") {
      toast({
        title: "Неверный формат",
        description: "Пожалуйста, загрузите файл в формате PDF.",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
    if (!title) {
      setTitle(file.name.replace(/\.pdf$/i, ""));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedFile) return;

    setIsExtracting(true);
    let content: string;

    try {
      content = cleanMedicalText(await extractTextFromPDF(selectedFile));
    } catch {
      toast({
        title: "Ошибка извлечения",
        description: "Не удалось извлечь текст из PDF.",
        variant: "destructive",
      });
      setIsExtracting(false);
      return;
    }

    setIsExtracting(false);
    setIsSaving(true);

    try {
      const newDoc: Document = {
        id: crypto.randomUUID(),
        userId: user.id,
        title: title.trim(),
        content,
        fileType: "PDF",
        uploadedAt: new Date().toISOString(),
        isGeneral: isAdmin,
      };

      storageService.saveDocument(newDoc);

      toast({
        title: "Документ загружен",
        description: "Ваш документ был успешно сохранён.",
      });

      navigate(isAdmin ? "/admin/documents" : "/documents");
    } catch {
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить документ.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = isExtracting || isSaving;
  const loadingLabel = isExtracting ? "Извлечение текста..." : "Сохранение...";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(isAdmin ? "/admin/documents" : "/documents")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            {isAdmin ? "Добавить общий медицинский документ" : "Загрузить документ"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin
              ? "Добавьте документ в общую медицинскую базу знаний"
              : "Добавьте новый медицинский документ в вашу коллекцию"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Загрузка PDF</CardTitle>
          <CardDescription>Выберите PDF-файл для извлечения текста</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="title">Название документа</Label>
              <Input
                id="title"
                placeholder="например, Результаты анализов — Январь 2024"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>PDF-файл</Label>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors
                  ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"}`}
              >
                {selectedFile ? (
                  <>
                    <FileText className="h-10 w-10 text-primary" />
                    <p className="text-sm font-medium">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} КБ · нажмите, чтобы заменить
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm font-medium">Перетащите PDF сюда или нажмите для выбора</p>
                    <p className="text-xs text-muted-foreground">Поддерживается только формат PDF</p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={handleFileInputChange}
              />
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={isLoading || !selectedFile}>
                <Upload className="h-4 w-4 mr-2" />
                {isLoading ? loadingLabel : "Загрузить документ"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(isAdmin ? "/admin/documents" : "/documents")}
              >
                Отмена
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default AddDocument;
