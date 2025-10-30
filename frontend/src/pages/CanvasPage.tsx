import { useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFiles, getHighlights, getThemes, getInsights, getAnnotations } from '@/services/api';
import type { Highlight, Theme, Insight, Annotation } from '@/types';
import { Canvas } from '@/components/Canvas';
import { useSelectedProject } from '@/hooks/useSelectedProject';

export default function CanvasPage() {
  const qc = useQueryClient();
  const [projectId] = useSelectedProject();

  // Queries (project-scoped)
  const filesQ = useQuery({
    queryKey: ['files', projectId],
    queryFn: () => getFiles(projectId),
    enabled: !!projectId,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  const highlightsQ = useQuery<Highlight[]>({
    queryKey: ['highlights', projectId],
    queryFn: () => getHighlights({ projectId }),
    enabled: !!projectId,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  const themesQ = useQuery<Theme[]>({
    queryKey: ['themes', projectId],
    queryFn: () => getThemes(projectId),
    enabled: !!projectId,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  const insightsQ = useQuery<Insight[]>({
    queryKey: ['insights', projectId],
    queryFn: () => getInsights(projectId),
    enabled: !!projectId,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });
  const annotationsQ = useQuery<Annotation[]>({
    queryKey: ['annotations', projectId],
    queryFn: () => getAnnotations(projectId),
    enabled: !!projectId,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  // Cache last non-empty data per project to avoid transient empty renders
  const lastProjectRef = useRef<string | undefined>(undefined);
  const lastHighlights = useRef<Highlight[] | undefined>(undefined);
  const lastThemes = useRef<Theme[] | undefined>(undefined);
  const lastInsights = useRef<Insight[] | undefined>(undefined);
  const lastAnnotations = useRef<Annotation[] | undefined>(undefined);

  // Reset caches when project changes
  useEffect(() => {
    if (lastProjectRef.current !== projectId) {
      lastProjectRef.current = projectId;
      lastHighlights.current = undefined;
      lastThemes.current = undefined;
      lastInsights.current = undefined;
      lastAnnotations.current = undefined;
    }
  }, [projectId]);

  // Update caches when new non-empty data arrives
  useEffect(() => {
    if (highlightsQ.data && highlightsQ.data.length > 0) lastHighlights.current = highlightsQ.data;
  }, [highlightsQ.data]);
  useEffect(() => {
    if (themesQ.data && themesQ.data.length > 0) lastThemes.current = themesQ.data;
  }, [themesQ.data]);
  useEffect(() => {
    if (insightsQ.data && insightsQ.data.length > 0) lastInsights.current = insightsQ.data;
  }, [insightsQ.data]);
  useEffect(() => {
    if (annotationsQ.data && annotationsQ.data.length > 0) lastAnnotations.current = annotationsQ.data;
  }, [annotationsQ.data]);

  const highlights = highlightsQ.data ?? lastHighlights.current ?? [];
  const themes = themesQ.data ?? lastThemes.current ?? [];
  const insights = insightsQ.data ?? lastInsights.current ?? [];
  const annotations = annotationsQ.data ?? lastAnnotations.current ?? [];

  const handleUpdate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['highlights', projectId] });
    qc.invalidateQueries({ queryKey: ['themes', projectId] });
    qc.invalidateQueries({ queryKey: ['insights', projectId] });
    qc.invalidateQueries({ queryKey: ['annotations', projectId] });
  }, [qc, projectId]);

  return (
    <div className="fixed inset-0 top-[56px]">{/* below top bar */}
      <Canvas
        highlights={highlights}
        themes={themes}
        insights={insights}
        annotations={annotations}
        onUpdate={handleUpdate}
      />
    </div>
  );
}
