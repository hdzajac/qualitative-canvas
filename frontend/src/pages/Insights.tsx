import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFiles, getThemes, getInsights, getHighlights } from '@/services/api';
import type { Theme, Insight, Highlight } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useSelectedProject } from '@/hooks/useSelectedProject';

export default function Insights() {
  const navigate = useNavigate();
  const [projectId] = useSelectedProject();
  const { data: files = [] } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId), enabled: !!projectId });
  const { data: themes = [] } = useQuery<Theme[]>({ queryKey: ['themes', projectId], queryFn: getThemes, enabled: !!projectId });
  const { data: highlights = [] } = useQuery<Highlight[]>({ queryKey: ['highlights', projectId], queryFn: getHighlights, enabled: !!projectId });
  const { data: insights = [] } = useQuery<Insight[]>({ queryKey: ['insights', projectId], queryFn: getInsights, enabled: !!projectId });

  const fileIds = useMemo(() => new Set(files.map(f => f.id)), [files]);
  const projectHighlightIds = useMemo(() => new Set(highlights.filter(h => fileIds.has(h.fileId)).map(h => h.id)), [highlights, fileIds]);
  const highlightToFile = useMemo(() => {
    const m = new Map<string, string>();
    highlights.forEach(h => m.set(h.id, h.fileId));
    return m;
  }, [highlights]);

  const projectThemeIds = useMemo(
    () => new Set(themes.filter(t => t.highlightIds.some(hid => projectHighlightIds.has(hid))).map(t => t.id)),
    [themes, projectHighlightIds]
  );

  const filteredInsights = useMemo(
    () => insights.filter(i => i.themeIds.some(tid => projectThemeIds.has(tid))),
    [insights, projectThemeIds]
  );

  return (
    <div className="container mx-auto p-6 space-y-4">
      <h1 className="text-xl font-extrabold uppercase tracking-wide">Insights</h1>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {filteredInsights.map(i => {
          // Find first source document via first theme -> first highlight
          const theme = themes.find(t => i.themeIds.includes(t.id));
          const firstH = theme?.highlightIds.find(hid => projectHighlightIds.has(hid));
          const fileId = firstH ? highlightToFile.get(firstH) : undefined;
          return (
            <Card key={i.id} className="brutal-card p-3">
              <div className="font-bold uppercase tracking-wide">{i.name}</div>
              <div className="text-xs text-neutral-600 mt-1">Themes: {i.themeIds.length}</div>
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
        {filteredInsights.length === 0 && <div className="text-sm text-neutral-600">No insights yet.</div>}
      </div>
    </div>
  );
}
