import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFiles, deleteFile, getProjects, listMedia, deleteMedia, createTranscriptionJob, uploadMedia } from '@/services/api';
import type { UploadedFile, MediaFile } from '@/types';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { useJobPolling } from '@/hooks/useJobPolling';
import { FileUpload } from '@/components/FileUpload';
import { MediaUpload } from '@/components/MediaUpload';
import { FileText, Music, Download } from 'lucide-react';
import { useOptimisticMutation } from '@/hooks/useOptimisticMutation';
import { toast } from 'sonner';

type DocumentItem = (UploadedFile & { type: 'document' }) | (MediaFile & { type: 'media' });

function formatEta(seconds?: number) {
  if (seconds == null || seconds < 0) return '';
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  const m = Math.floor((seconds / 60) % 60).toString().padStart(2, '0');
  const h = Math.floor(seconds / 3600);
  return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

function DocumentRow({ item }: { item: DocumentItem }) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const handleDownloadVTT = async (mediaItem: MediaFile) => {
    try {
      // VITE_API_URL does not include /api suffix
      const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5001';
      const baseFilename = mediaItem.originalFilename.replace(/\.[^/.]+$/, '');

      // Download VTT transcript
      const vttResponse = await fetch(`${API_BASE}/api/export/media/${mediaItem.id}/transcript/vtt`);
      if (!vttResponse.ok) {
        const error = await vttResponse.json();
        throw new Error(error.error || 'VTT download failed');
      }
      const vttBlob = await vttResponse.blob();
      const vttUrl = window.URL.createObjectURL(vttBlob);
      const vttLink = document.createElement('a');
      vttLink.href = vttUrl;
      vttLink.download = `${baseFilename}.vtt`;
      document.body.appendChild(vttLink);
      vttLink.click();
      window.URL.revokeObjectURL(vttUrl);
      document.body.removeChild(vttLink);

      // Download audio file
      const audioResponse = await fetch(`${API_BASE}/api/media/${mediaItem.id}/download`);
      if (!audioResponse.ok) {
        throw new Error('Audio download failed');
      }
      const audioBlob = await audioResponse.blob();
      const audioUrl = window.URL.createObjectURL(audioBlob);
      const audioLink = document.createElement('a');
      audioLink.href = audioUrl;
      audioLink.download = mediaItem.originalFilename;
      document.body.appendChild(audioLink);
      audioLink.click();
      window.URL.revokeObjectURL(audioUrl);
      document.body.removeChild(audioLink);

      toast.success('Transcript and audio downloaded');
    } catch (error) {
      console.error('Download error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to download files');
    }
  };

  const deleteDocMut = useMutation({
    mutationFn: (id: string) => deleteFile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });

  const deleteMediaMut = useMutation({
    mutationFn: ({ id, force }: { id: string; force?: boolean }) => deleteMedia(id, { force }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media'] }),
  });

  // Always call hooks - conditionally use the result
  const { job } = useJobPolling(
    item.type === 'media' ? item.id : '',
    item.type === 'media' ? item.status : 'done'
  );

  if (item.type === 'document') {
    return (
      <TableRow
        className="cursor-pointer hover:bg-indigo-50"
        onClick={() => navigate(`/documents/${item.id}`)}
      >
        <TableCell>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-neutral-600" />
            <span className="font-medium">{item.filename}</span>
          </div>
        </TableCell>
        <TableCell className="text-xs text-neutral-600">
          {new Date(item.createdAt).toLocaleString()}
        </TableCell>
        <TableCell>
          <span className="text-xs text-neutral-600">Document</span>
        </TableCell>
        <TableCell>
          <Button
            size="sm"
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('Delete this document? This cannot be undone.')) {
                deleteDocMut.mutate(item.id);
              }
            }}
          >
            Delete
          </Button>
        </TableCell>
      </TableRow>
    );
  }

  // Media/Audio file
  let statusDisplay: string = item.status;
  let pct: number | undefined;

  if (item.status === 'processing') {
    const processedMs = job?.processedMs;
    const totalMs = job?.totalMs;
    const etaSeconds = job?.etaSeconds;

    if (processedMs != null && totalMs != null && totalMs > 0) {
      pct = Math.min(100, Math.round((processedMs / totalMs) * 100));
      statusDisplay = `Transcribing ${pct}%`;
      if (etaSeconds != null && etaSeconds >= 0) {
        statusDisplay += ` (ETA ${formatEta(etaSeconds)})`;
      }
    } else {
      statusDisplay = 'Transcribing…';
    }
  } else if (item.status === 'done') {
    statusDisplay = 'Ready';
  } else if (item.status === 'uploaded') {
    statusDisplay = 'Waiting';
  }

  return (
    <TableRow
      className="cursor-pointer hover:bg-indigo-50"
      onClick={() => {
        if (item.status === 'done') {
          navigate(`/documents/${item.id}`);
        }
      }}
    >
      <TableCell>
        <div className="flex items-center gap-2">
          <Music className="w-4 h-4 text-neutral-600" />
          <span className="font-medium">{item.originalFilename}</span>
        </div>
      </TableCell>
      <TableCell className="text-xs text-neutral-600">
        {new Date(item.createdAt).toLocaleString()}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1">
          {item.status === 'processing' && pct != null && (
            <Progress value={pct} className="w-32" />
          )}
          <span className="text-xs text-neutral-600">{statusDisplay}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          {item.status === 'done' && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                handleDownloadVTT(item);
              }}
            >
              <Download className="w-3 h-3 mr-1" />
              VTT
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              const isProcessing = item.status === 'processing';
              const msg = isProcessing
                ? 'This audio is currently being transcribed. Force delete?'
                : 'Delete this audio file and its transcript? This cannot be undone.';
              if (confirm(msg)) {
                deleteMediaMut.mutate({ id: item.id, force: isProcessing });
              }
            }}
          >
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function Documents() {
  const qc = useQueryClient();
  const [projectId] = useSelectedProject();
  const { data: files } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId), enabled: !!projectId });
  const { data: media } = useQuery({
    queryKey: ['media', projectId],
    queryFn: () => listMedia(projectId),
    enabled: !!projectId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Poll every 3 seconds if any media is uploaded (queued) or processing
      return data?.some((m: any) => m.status === 'uploaded' || m.status === 'processing') ? 3000 : false;
    }
  });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const projectName = projects.find(p => p.id === projectId)?.name || 'Project';

  // Combine and sort all documents
  const allDocs: DocumentItem[] = [
    ...(files || []).map(f => ({ ...f, type: 'document' as const })),
    ...(media || []).map(m => ({ ...m, type: 'media' as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="container mx-auto p-6 space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/projects">Projects</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{projectName}</BreadcrumbPage>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Documents</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex items-center gap-3">
        <h1 className="text-xl font-extrabold uppercase tracking-wide">Documents</h1>
        <div className="ml-auto flex gap-2">
          <FileUpload
            renderAs="button"
            projectId={projectId}
            onFileUploaded={() => qc.invalidateQueries({ queryKey: ['files'] })}
          />
          <MediaUpload
            projectId={projectId}
            onUploaded={() => {
              qc.invalidateQueries({ queryKey: ['media'] });
            }}
          />
        </div>
      </div>

      {projectId ? (
        <div className="border-2 border-black bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allDocs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-neutral-600 py-8">
                    No documents yet. Upload a text file or audio file to get started.
                  </TableCell>
                </TableRow>
              ) : (
                allDocs.map(item => (
                  <DocumentRow
                    key={`${item.type}-${item.id}`}
                    item={item}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-sm text-neutral-600">You must select a project first.</div>
      )}
    </div>
  );
}
