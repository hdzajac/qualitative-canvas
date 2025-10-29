import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFiles, getHighlights, getThemes, getInsights, getAnnotations } from '@/services/api';
import type { Highlight, Theme, Insight, Annotation } from '@/types';
import { Canvas } from '@/components/Canvas';
import { useSelectedProject } from '@/hooks/useSelectedProject';

export default function CanvasPage() {
    const qc = useQueryClient();
    const [projectId] = useSelectedProject();

    useQuery({
        queryKey: ['files', projectId],
        queryFn: () => getFiles(projectId),
        enabled: !!projectId,
        refetchOnWindowFocus: false,
    });
    const { data: highlights = [] } = useQuery<Highlight[]>({
        queryKey: ['highlights', projectId],
        queryFn: () => getHighlights({ projectId }),
        enabled: !!projectId,
        refetchOnWindowFocus: false,
    });
    const { data: themes = [] } = useQuery<Theme[]>({
        queryKey: ['themes', projectId],
        queryFn: () => getThemes(projectId),
        enabled: !!projectId,
        refetchOnWindowFocus: false,
    });
    const { data: insights = [] } = useQuery<Insight[]>({
        queryKey: ['insights', projectId],
        queryFn: () => getInsights(projectId),
        enabled: !!projectId,
        refetchOnWindowFocus: false,
    });
    const { data: annotations = [] } = useQuery<Annotation[]>({
        queryKey: ['annotations', projectId],
        queryFn: () => getAnnotations(projectId),
        enabled: !!projectId,
        refetchOnWindowFocus: false,
    });

    const handleUpdate = useCallback(() => {
        qc.invalidateQueries({ queryKey: ['highlights', projectId] });
        qc.invalidateQueries({ queryKey: ['themes', projectId] });
        qc.invalidateQueries({ queryKey: ['insights', projectId] });
        qc.invalidateQueries({ queryKey: ['annotations', projectId] });
    }, [qc, projectId]);

    return (
        <div className="container mx-auto p-6 space-y-4">
            <div className="flex items-center gap-3">
                <h1 className="text-xl font-extrabold uppercase tracking-wide">Canvas</h1>
            </div>

            <div className="h-[78vh] brutal-card relative overflow-hidden">
                <Canvas
                    highlights={highlights}
                    themes={themes}
                    insights={insights}
                    annotations={annotations}
                    onUpdate={handleUpdate}
                />
            </div>
        </div>
    );
}
