import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "@/lib/auth";
import { apiService } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PublishDocument = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const user = authService.getCurrentUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  if (!authService.isAdmin(user)) {
    navigate("/shared-documents");
    return null;
  }

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
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      await apiService.uploadDocument(selectedFile);
      toast({
        title: "Документ опубликован",
        description: "Документ успешно опубликован для всех пользователей.",
      });
      navigate("/shared-documents");
    } catch (err) {
      toast({
        title: "Ошибка публикации",
        description: err instanceof Error ? err.message : "Не удалось опубликовать документ.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/shared-documents")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-foreground">Опубликовать документ</h1>
          <p className="text-muted-foreground mt-1">
            Документ будет доступен всем пользователям системы
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Загрузка PDF</CardTitle>
          <CardDescription>Выберите PDF-файл для публикации</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
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
              <Button type="submit" disabled={isUploading || !selectedFile}>
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? "Публикация..." : "Опубликовать"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/shared-documents")}
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

export default PublishDocument;
