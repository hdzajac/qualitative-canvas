import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFiles, getThemes, getHighlights } from '@/services/api';
import type { Theme, Highlight } from '@/types';
import { Card } from '@/components/ui/card';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function Themes() {
  const navigate = useNavigate();
  const [projectId] = useSelectedProject();
  const { data: files = [] } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId), enabled: !!projectId });
  const { data: themes = [] } = useQuery<Theme[]>({ queryKey: ['themes', projectId], queryFn: getThemes, enabled: !!projectId });
  const { data: highlights = [] } = useQuery<Highlight[]>({ queryKey: ['highlights', projectId], queryFn: getHighlights, enabled: !!projectId });

  const fileIds = useMemo(() => new Set(files.map(f => f.id)), [files]);
  const projectHighlightIds = useMemo(() => new Set(highlights.filter(h => fileIds.has(h.fileId)).map(h => h.id)), [highlights, fileIds]);
  const highlightToFile = useMemo(() => {
    const m = new Map<string, string>();
    highlights.forEach(h => m.set(h.id, h.fileId));
    return m;
  }, [highlights]);

  const filteredThemes = useMemo(() => themes.filter(t => t.highlightIds.some(hid => projectHighlightIds.has(hid))), [themes, projectHighlightIds]);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <h1 className="text-xl font-extrabold uppercase tracking-wide">Themes</h1>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filteredThemes.map(t => {
          const firstH = t.highlightIds.find(hid => projectHighlightIds.has(hid));
          const fileId = firstH ? highlightToFile.get(firstH) : undefined;
          return (
            <Card key={t.id} className="brutal-card p-3">
              <div className="font-bold uppercase tracking-wide">{t.name}</div>
              <div className="text-xs text-neutral-600 mt-1">Codes: {t.highlightIds.length}</div>
              {fileId && (
                <div className="mt-2">
                  <Button size="sm" variant="outline" className="rounded-none h-7 px-2" onClick={() => navigate(`/documents/${fileId}`)}>
                    Open source document
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
        {filteredThemes.length === 0 && <div className="text-sm text-neutral-600">No themes yet.</div>}
      </div>
    </div>
  );
}
