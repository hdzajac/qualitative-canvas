import { useState, useEffect } from 'react';
import { FileUpload } from '@/components/FileUpload';
import { TextViewer } from '@/components/TextViewer';
import { Canvas } from '@/components/Canvas';
import { ThemeCreator } from '@/components/ThemeCreator';
import { InsightCreator } from '@/components/InsightCreator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { getFile, getFiles, getHighlights, getThemes, getInsights, getAnnotations } from '@/services/api';
import type { UploadedFile, Highlight, Theme, Insight, Annotation } from '@/types';
import { FileText, Network, Loader2 } from 'lucide-react';

const Index = () => {
  const [currentFile, setCurrentFile] = useState<UploadedFile | null>(null);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [f, h, t, i, a] = await Promise.all([
        getFiles(),
        getHighlights(),
        getThemes(),
        getInsights(),
        getAnnotations(),
      ]);
      setFiles(f);
      setHighlights(h);
      setThemes(t);
      setInsights(i);
      setAnnotations(a);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleFileUploaded = async (fileId: string) => {
    const file = await getFile(fileId);
    if (file) {
      setCurrentFile(file);
      // Keep files list in sync so Canvas has all filenames
      setFiles((prev) => (prev.some((ff) => ff.id === file.id) ? prev : [file, ...prev]));
    }
  };

  const fileHighlights = currentFile
    ? highlights.filter((h) => h.fileId === currentFile.id)
    : [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-foreground">Qualitative Data Analysis</h1>
          <p className="text-sm text-muted-foreground">
            Upload transcripts, create codes, build themes, and discover insights
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {!currentFile ? (
          <div className="max-w-2xl mx-auto">
            <FileUpload onFileUploaded={handleFileUploaded} />
          </div>
        ) : (
          <Tabs defaultValue="text" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="text" className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Text & Coding
              </TabsTrigger>
              <TabsTrigger value="canvas" className="flex items-center gap-2">
                <Network className="w-4 h-4" />
                Canvas View
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text" className="space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">{currentFile.filename}</h2>
                    <Button variant="outline" onClick={() => setCurrentFile(null)}>
                      Change File
                    </Button>
                  </div>

                  {loading ? (
                    <div className="flex items-center justify-center p-12">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : (
                    <TextViewer
                      fileId={currentFile.id}
                      content={currentFile.content}
                      highlights={fileHighlights}
                      onHighlightCreated={loadData}
                      isVtt={/\.vtt$/i.test(currentFile.filename)}
                    />
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="canvas" className="h-[calc(100vh-200px)]">
              <Canvas
                highlights={highlights}
                themes={themes}
                insights={insights}
                annotations={annotations}
                files={files}
                onUpdate={loadData}
              />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

export default Index;
