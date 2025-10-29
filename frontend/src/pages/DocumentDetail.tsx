import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFile, getHighlights } from '@/services/api';
import type { Highlight } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TextViewer } from '@/components/TextViewer';
import { FileUpload } from '@/components/FileUpload';

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: file, isLoading: fileLoading } = useQuery({ queryKey: ['file', id], queryFn: () => getFile(id!), enabled: !!id });
  const { data: highlights = [], refetch: refetchHighlights } = useQuery<Highlight[]>({ queryKey: ['highlights', id], queryFn: getHighlights });

  useEffect(() => {
    // If needed, request backend to support /highlights?fileId=
  }, [id]);

  if (!id) return null;
  if (fileLoading) return null;
  if (!file) return (
    <div className="p-6">
      <Button variant="outline" className="rounded-none" onClick={() => navigate(-1)}>Back</Button>
      <div className="mt-4">Document not found.</div>
    </div>
  );

  const docHighlights = highlights.filter(h => h.fileId === file.id);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="outline" className="rounded-none" onClick={() => navigate(-1)}>Back</Button>
        <h1 className="text-xl font-extrabold uppercase tracking-wide">{file.filename}</h1>
      </div>

      <Card className="brutal-card">
        <CardHeader><CardTitle>Upload new version (.txt)</CardTitle></CardHeader>
        <CardContent>
          <FileUpload projectId={file.projectId} onFileUploaded={() => qc.invalidateQueries({ queryKey: ['file', id] })} />
        </CardContent>
      </Card>

      <Card className="brutal-card">
        <CardHeader><CardTitle>Transcript</CardTitle></CardHeader>
        <CardContent>
          <TextViewer fileId={file.id} content={file.content} highlights={docHighlights} onHighlightCreated={() => refetchHighlights()} />
        </CardContent>
      </Card>
    </div>
  );
}
