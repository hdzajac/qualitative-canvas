import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getFiles, getHighlights, getThemes, getInsights, getAnnotations, createTheme, createInsight } from '@/services/api';
import type { Highlight, Theme, Insight, Annotation } from '@/types';
import { Canvas } from '@/components/Canvas';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSelectedProject } from '@/hooks/useSelectedProject';

export default function CanvasPage() {
  const qc = useQueryClient();
  const [projectId] = useSelectedProject();

  const { data: files = [] } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId), enabled: !!projectId });
  const { data: highlights = [] } = useQuery<Highlight[]>({ queryKey: ['highlights', projectId], queryFn: getHighlights });
  const { data: themes = [] } = useQuery<Theme[]>({ queryKey: ['themes', projectId], queryFn: getThemes });
  const { data: insights = [] } = useQuery<Insight[]>({ queryKey: ['insights', projectId], queryFn: getInsights });
  const { data: annotations = [] } = useQuery<Annotation[]>({ queryKey: ['annotations', projectId], queryFn: getAnnotations });

  const fileIds = useMemo(() => new Set(files.map(f => f.id)), [files]);
  const projectHighlights = useMemo(() => highlights.filter(h => fileIds.has(h.fileId)), [highlights, fileIds]);

  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([]);
  const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>([]);

  const createThemeMutation = useMutation({
    mutationFn: (name: string) => createTheme({ name, highlightIds: selectedCodeIds }),
    onSuccess: () => {
      setSelectedCodeIds([]);
      qc.invalidateQueries({ queryKey: ['themes'] });
    },
  });

  const createInsightMutation = useMutation({
    mutationFn: (name: string) => createInsight({ name, themeIds: selectedThemeIds }),
    onSuccess: () => {
      setSelectedThemeIds([]);
      qc.invalidateQueries({ queryKey: ['insights'] });
    },
  });

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-extrabold uppercase tracking-wide">Canvas</h1>
        <div className="ml-auto flex items-center gap-2">
          <Input placeholder="New theme name" className="h-8 w-56" id="new-theme-name" />
          <Button
            className="h-8 px-3 brutal-button"
            disabled={selectedCodeIds.length === 0}
            onClick={() => {
              const name = (document.getElementById('new-theme-name') as HTMLInputElement)?.value?.trim();
              if (!name) return;
              createThemeMutation.mutate(name);
            }}
          >
            Create Theme ({selectedCodeIds.length})
          </Button>

          <div className="w-px h-6 bg-black/20 mx-1" />

          <Input placeholder="New insight name" className="h-8 w-56" id="new-insight-name" />
          <Button
            className="h-8 px-3 brutal-button"
            disabled={selectedThemeIds.length === 0}
            onClick={() => {
              const name = (document.getElementById('new-insight-name') as HTMLInputElement)?.value?.trim();
              if (!name) return;
              createInsightMutation.mutate(name);
            }}
          >
            Create Insight ({selectedThemeIds.length})
          </Button>
        </div>
      </div>

      <div className="h-[78vh] brutal-card">
        <Canvas
          highlights={projectHighlights}
          themes={themes}
          insights={insights}
          annotations={annotations}
          onUpdate={() => {
            qc.invalidateQueries({ queryKey: ['highlights'] });
            qc.invalidateQueries({ queryKey: ['themes'] });
            qc.invalidateQueries({ queryKey: ['insights'] });
            qc.invalidateQueries({ queryKey: ['annotations'] });
          }}
          onSelectionChange={({ codeIds, themeIds }) => {
            setSelectedCodeIds(codeIds);
            setSelectedThemeIds(themeIds);
          }}
        />
      </div>
    </div>
  );
}
