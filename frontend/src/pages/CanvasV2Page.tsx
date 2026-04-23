import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getFiles, getHighlights, getThemes, getInsights, getAnnotations, createAnnotation } from '@/services/api';
import type { Highlight, Theme, Insight, Annotation } from '@/types';
import { FlowCanvas } from '@/components/canvas/FlowCanvas';
import { CanvasEntityPanel } from '@/components/canvas/CanvasEntityPanel';
import type { NodeKind, NodeView } from '@/components/canvas/CanvasTypes';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ThemeCreator } from '@/components/ThemeCreator';
import { InsightCreator } from '@/components/InsightCreator';

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

    // Memoize data arrays to avoid dependency churn in useMemo hooks
    const highlights = useMemo(() => highlightsQ.data ?? [], [highlightsQ.data]);
    const themes = useMemo(() => themesQ.data ?? [], [themesQ.data]);
    const insights = useMemo(() => insightsQ.data ?? [], [insightsQ.data]);
    const annotations = useMemo(() => annotationsQ.data ?? [], [annotationsQ.data]);
    const files = useMemo(() => filesQ.data ?? [], [filesQ.data]);

    const [openEntity, setOpenEntity] = useState<{ kind: NodeKind; id: string } | null>(null);
    const [showThemeDialog, setShowThemeDialog] = useState(false);
    const [showInsightDialog, setShowInsightDialog] = useState(false);
    const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([]);
    const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>([]);

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

    const handleAddNote = useCallback(async () => {
        if (!projectId) return;
        try {
            await createAnnotation({
                content: '',
                position: { x: 200, y: 200 },
                projectId,
            });
            handleUpdate();
        } catch {
            // silently fail — user will see no note appear
        }
    }, [projectId, handleUpdate]);

    // Stable selection handler to avoid React Flow prop churn
    const handleSelectionChange = useCallback((codeIds: string[], themeIds: string[]) => {
        setSelectedCodeIds(codeIds);
        setSelectedThemeIds(themeIds);
    }, []);

    // Stable open entity handler
    const handleOpenEntity = useCallback((kind: string, id: string) => {
        setOpenEntity({ kind: kind as NodeKind, id });
    }, []);

    return (
        <div className="fixed inset-0 top-[56px]">
            {/* Floating toolbar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 flex-wrap justify-center">
                <Button
                    variant="outline"
                    className="border-2 border-black rounded-none bg-white uppercase tracking-wide text-xs px-3 py-1"
                    onClick={() => setShowThemeDialog(true)}
                >
                    + New Theme
                </Button>
                <Button
                    variant="outline"
                    className="border-2 border-black rounded-none bg-white uppercase tracking-wide text-xs px-3 py-1"
                    onClick={() => setShowInsightDialog(true)}
                >
                    + New Insight
                </Button>
                <Button
                    variant="outline"
                    className="border-2 border-black rounded-none bg-white uppercase tracking-wide text-xs px-3 py-1"
                    onClick={handleAddNote}
                >
                    + Add Note
                </Button>
                {selectedCodeIds.length >= 2 && (
                    <Button
                        variant="outline"
                        className="border-2 border-emerald-600 rounded-none bg-emerald-50 uppercase tracking-wide text-xs px-3 py-1 text-emerald-700"
                        onClick={() => setShowThemeDialog(true)}
                    >
                        + Theme from {selectedCodeIds.length} Codes
                    </Button>
                )}
                {selectedThemeIds.length >= 2 && (
                    <Button
                        variant="outline"
                        className="border-2 border-amber-500 rounded-none bg-amber-50 uppercase tracking-wide text-xs px-3 py-1 text-amber-700"
                        onClick={() => setShowInsightDialog(true)}
                    >
                        + Insight from {selectedThemeIds.length} Themes
                    </Button>
                )}
            </div>

            <Dialog open={showThemeDialog} onOpenChange={(open) => {
                setShowThemeDialog(open);
                if (!open) setSelectedCodeIds([]);
            }}>
                <DialogContent className="max-w-lg rounded-none border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-wide">New Theme</DialogTitle>
                    </DialogHeader>
                    <ThemeCreator
                        highlights={highlights}
                        projectId={projectId ?? undefined}
                        preSelectedIds={selectedCodeIds}
                        onThemeCreated={() => {
                            setShowThemeDialog(false);
                            setSelectedCodeIds([]);
                            handleUpdate();
                        }}
                    />
                </DialogContent>
            </Dialog>

            <Dialog open={showInsightDialog} onOpenChange={(open) => {
                setShowInsightDialog(open);
                if (!open) setSelectedThemeIds([]);
            }}>
                <DialogContent className="max-w-lg rounded-none border-4 border-black">
                    <DialogHeader>
                        <DialogTitle className="uppercase tracking-wide">New Insight</DialogTitle>
                    </DialogHeader>
                    <InsightCreator
                        themes={themes}
                        projectId={projectId ?? undefined}
                        preSelectedIds={selectedThemeIds}
                        onInsightCreated={() => {
                            setShowInsightDialog(false);
                            setSelectedThemeIds([]);
                            handleUpdate();
                        }}
                    />
                </DialogContent>
            </Dialog>

            <FlowCanvas
                highlights={highlights}
                themes={themes}
                insights={insights}
                annotations={annotations}
                files={files}
                onUpdate={handleUpdate}
                onOpenEntity={handleOpenEntity}
                onSelectionChange={handleSelectionChange}
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
                onNodeUpdate={() => { }}
            />
        </div>
    );
}
