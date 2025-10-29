import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProjects, getFiles, uploadFile, updateFile, deleteFile } from '@/services/api';
import type { UploadedFile } from '@/types';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function Documents() {
  const qc = useQueryClient();
  const { data: projects } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
  const [projectId, setProjectId] = useState<string | undefined>(undefined);
  const { data: files } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId), enabled: !!projectId });

  useEffect(() => {
    // Default to first project if available
    if (!projectId && projects && projects.length > 0) setProjectId(projects[0].id);
  }, [projects, projectId]);

  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');

  const add = useMutation({
    mutationFn: () => uploadFile(filename, content, projectId),
    onSuccess: () => { setFilename(''); setContent(''); qc.invalidateQueries({ queryKey: ['files'] }); },
  });
  const save = useMutation({
    mutationFn: (payload: { id: string, updates: Partial<UploadedFile> }) => updateFile(payload.id, payload.updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFile(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['files'] }),
  });

  const selectedProjectName = useMemo(() => projects?.find(p => p.id === projectId)?.name ?? '', [projects, projectId]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Card>
        <CardHeader><CardTitle>Documents</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap items-center">
          <select className="border rounded p-2" value={projectId || ''} onChange={(e) => setProjectId(e.target.value || undefined)}>
            <option value="" disabled>Choose a project...</option>
            {projects?.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="text-sm text-muted-foreground">Selected: {selectedProjectName || 'None'}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Add document</CardTitle></CardHeader>
        <CardContent className="flex gap-2 flex-wrap items-center">
          <Input placeholder="Filename" value={filename} onChange={(e) => setFilename(e.target.value)} disabled={!projectId} />
          <Input placeholder="Content" value={content} onChange={(e) => setContent(e.target.value)} disabled={!projectId} />
          <Button onClick={() => add.mutate()} disabled={!projectId || !filename || !content}>Add</Button>
        </CardContent>
      </Card>

      {projectId ? (
        <div className="space-y-2">
          {files?.map((f: UploadedFile) => (
            <div key={f.id} className="border rounded p-3 space-y-2">
              <div className="flex gap-2 items-center">
                <Input value={f.filename} onChange={(e) => save.mutate({ id: f.id, updates: { filename: e.target.value } })} />
                <Button variant="destructive" onClick={() => remove.mutate(f.id)}>Delete</Button>
              </div>
              <Input value={f.content} onChange={(e) => save.mutate({ id: f.id, updates: { content: e.target.value } })} />
              <div className="text-xs text-muted-foreground flex justify-between">
                <span>Project: {f.projectId}</span>
                <span>{new Date(f.createdAt).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">Choose a project to view and manage documents.</div>
      )}
    </div>
  );
}
