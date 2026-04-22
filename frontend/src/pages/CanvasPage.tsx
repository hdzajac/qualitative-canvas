import { useCallback } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getFiles, getHighlights, getThemes, getInsights, getAnnotations } from '@/services/api';
import type { Highlight, Theme, Insight, Annotation } from '@/types';import { Canvas } from '@/components/Canvas';
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
                files={files}
                onUpdate={handleUpdate}
            />
        </div>
    );
}
