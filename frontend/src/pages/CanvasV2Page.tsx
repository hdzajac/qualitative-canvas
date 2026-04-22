import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getFiles, getHighlights, getThemes, getInsights, getAnnotations } from '@/services/api';
import type { Highlight, Theme, Insight, Annotation } from '@/types';
import { FlowCanvas } from '@/components/canvas/FlowCanvas';
import { CanvasEntityPanel } from '@/components/canvas/CanvasEntityPanel';
import type { NodeKind, NodeView } from '@/components/canvas/CanvasTypes';
import { useSelectedProject } from '@/hooks/useSelectedProject';

export default function CanvasV2Page() {
  const qc = useQueryClient();
  const [projectId] = useSelectedProject();

  const filesQ = useQuery({
    queryKey: ['files', projectId],
    queryFn: () => getFiles(projectId),
    enabled: !!projectId,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const highlightsQ = useQuery<Highlight[]>({
    queryKey: ['highlights', projectId],
    queryFn: () => getHighlights({ projectId }),
    enabled: !!projectId,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const themesQ = useQuery<Theme[]>({
    queryKey: ['themes', projectId],
    queryFn: () => getThemes(projectId),
    enabled: !!projectId,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const insightsQ = useQuery<Insight[]>({
    queryKey: ['insights', projectId],
    queryFn: () => getInsights(projectId),
    enabled: !!projectId,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
  const annotationsQ = useQuery<Annotation[]>({
    queryKey: ['annotations', projectId],
    queryFn: () => getAnnotations(projectId),
    enabled: !!projectId,
    refetchOnWindowFocus: false,
    refetchOnMount: 'always',
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const highlights = highlightsQ.data ?? [];
  const themes = themesQ.data ?? [];
  const insights = insightsQ.data ?? [];
  const annotations = annotationsQ.data ?? [];
  const files = filesQ.data ?? [];

  const [openEntity, setOpenEntity] = useState<{ kind: NodeKind; id: string } | null>(null);

  const fileNameById = useMemo(() => {
    const m = new Map<string, string>();
    files.forEach((f) => m.set(f.id, f.filename));
    return m;
  }, [files]);

  const codeFileNameById = useMemo(() => {
    const m = new Map<string, string>();
    highlights.forEach((h) => {
      const name = h.fileId ? (fileNameById.get(h.fileId) ?? '') : '';
      if (name) m.set(h.id, name);
    });
    return m;
  }, [highlights, fileNameById]);

  const highlightById = useMemo(() => {
    const m = new Map<string, Highlight>();
    highlights.forEach((h) => m.set(h.id, h));
    return m;
  }, [highlights]);

  const themeById = useMemo(() => {
    const m = new Map<string, Theme>();
    themes.forEach((t) => m.set(t.id, t));
    return m;
  }, [themes]);

  const fileNames = useMemo(
    () => Object.fromEntries(files.map((f) => [f.id, f.filename])),
    [files]
  );

  const panelNodes = useMemo<NodeView[]>(() => {
    const nodes: NodeView[] = [];
    highlights.forEach((h) => nodes.push({ id: h.id, kind: 'code', x: 0, y: 0, w: 0, h: 0, highlight: h }));
    themes.forEach((t) => nodes.push({ id: t.id, kind: 'theme', x: 0, y: 0, w: 0, h: 0, theme: t }));
    insights.forEach((i) => nodes.push({ id: i.id, kind: 'insight', x: 0, y: 0, w: 0, h: 0, insight: i }));
    annotations.forEach((a) => nodes.push({ id: a.id, kind: 'annotation', x: 0, y: 0, w: 0, h: 0, annotation: a }));
    return nodes;
  }, [highlights, themes, insights, annotations]);

  const handleUpdate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['highlights', projectId] });
    qc.invalidateQueries({ queryKey: ['themes', projectId] });
    qc.invalidateQueries({ queryKey: ['insights', projectId] });
    qc.invalidateQueries({ queryKey: ['annotations', projectId] });
  }, [qc, projectId]);

  return (
    <div className="fixed inset-0 top-[56px]">
      <FlowCanvas
        highlights={highlights}
        themes={themes}
        insights={insights}
        annotations={annotations}
        files={files}
        onUpdate={handleUpdate}
        onOpenEntity={(kind, id) => setOpenEntity({ kind: kind as NodeKind, id })}
      />
      <CanvasEntityPanel
        entity={openEntity}
        nodes={panelNodes}
        themes={themes}
        fileNames={fileNames}
        fileNameById={fileNameById}
        codeFileNameById={codeFileNameById}
        highlightById={highlightById}
        themeById={themeById}
        onClose={() => setOpenEntity(null)}
        onUpdate={handleUpdate}
        onNodeUpdate={() => {}}
      />
    </div>
  );
}
