import { useCallback, useMemo, useState, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { getFiles, getHighlights, getThemes, getInsights, getAnnotations, createAnnotation, updateTheme, updateInsight } from '@/services/api';
import type { Highlight, Theme, Insight, Annotation } from '@/types';
import { FlowCanvas } from '@/components/canvas/FlowCanvas';
import { CanvasEntityPanel } from '@/components/canvas/CanvasEntityPanel';
import type { NodeKind, NodeView } from '@/components/canvas/CanvasTypes';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { useProjectEvents } from '@/hooks/useSelectedProject';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ThemeCreator } from '@/components/ThemeCreator';
import { InsightCreator } from '@/components/InsightCreator';

export default function CanvasV2Page() {
    const qc = useQueryClient();
    const [projectId] = useSelectedProject();
    const { user } = useAuth();

    // Real-time: invalidate TanStack Query caches when peers mutate entities
    useProjectEvents(projectId);

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
    const [hiddenKinds, setHiddenKinds] = useState<Set<string>>(new Set());

    const toggleKindVisibility = useCallback((kind: string) => {
        setHiddenKinds((prev) => {
            const next = new Set(prev);
            if (next.has(kind)) next.delete(kind);
            else next.add(kind);
            return next;
        });
    }, []);
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

    // Ref populated by FlowCanvas with a function that returns world coords of the viewport centre.
    // Used to place newly created theme/insight cards in the visible area.
    const getNewCardPositionRef = useRef<(() => { x: number; y: number }) | null>(null);

    return (
        <div className="fixed inset-0 top-[56px]">
            {/* Floating toolbar */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex gap-2 flex-wrap justify-center">
                <Button
                    variant="outline"
                    className="border-2 border-emerald-600 rounded-none bg-emerald-50 uppercase tracking-wide text-xs px-3 py-1 text-emerald-700"
                    onClick={() => setShowThemeDialog(true)}
                >
                    {selectedCodeIds.length >= 1
                        ? `+ Theme from ${selectedCodeIds.length} Code${selectedCodeIds.length !== 1 ? 's' : ''}`
                        : '+ New Theme'}
                </Button>
                <Button
                    variant="outline"
                    className="border-2 border-amber-500 rounded-none bg-amber-50 uppercase tracking-wide text-xs px-3 py-1 text-amber-700"
                    onClick={() => setShowInsightDialog(true)}
                >
                    {selectedThemeIds.length >= 1
                        ? `+ Insight from ${selectedThemeIds.length} Theme${selectedThemeIds.length !== 1 ? 's' : ''}`
                        : '+ New Insight'}
                </Button>
                <Button
                    variant="outline"
                    className="border-2 border-black rounded-none bg-white uppercase tracking-wide text-xs px-3 py-1"
                    onClick={handleAddNote}
                >
                    + Add Note
                </Button>

                {/* Divider */}
                <div className="w-px bg-gray-300 self-stretch" />

                {/* Visibility toggles */}
                {(
                    [
                        { kind: 'code', label: 'Codes', color: 'text-blue-700' },
                        { kind: 'theme', label: 'Themes', color: 'text-emerald-700' },
                        { kind: 'insight', label: 'Insights', color: 'text-amber-700' },
                        { kind: 'annotation', label: 'Notes', color: 'text-gray-700' },
                    ] as const
                ).map(({ kind, label, color }) => {
                    const hidden = hiddenKinds.has(kind);
                    return (
                        <button
                            key={kind}
                            title={hidden ? `Show ${label}` : `Hide ${label}`}
                            aria-pressed={!hidden}
                            onClick={() => toggleKindVisibility(kind)}
                            className={`flex items-center gap-1 px-2 py-1 border rounded-none text-xs uppercase tracking-wide transition-colors ${hidden
                                    ? 'border-gray-300 bg-gray-100 text-gray-400 line-through'
                                    : `border-gray-400 bg-white ${color}`
                                }`}
                        >
                            {hidden ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" /><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                            )}
                            {label}
                        </button>
                    );
                })}
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
                        onThemeCreated={async (themeName) => {
                            setShowThemeDialog(false);
                            setSelectedCodeIds([]);
                            const pos = getNewCardPositionRef.current?.();
                            if (pos) {
                                // Fetch fresh list to find the just-created theme by name
                                const freshThemes = await qc.fetchQuery<Theme[]>({
                                    queryKey: ['themes', projectId],
                                    queryFn: () => getThemes(projectId),
                                });
                                const newTheme = freshThemes.find(t => t.name?.trim() === themeName.trim());
                                if (newTheme) await updateTheme(newTheme.id, { position: pos });
                            }
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
                        onInsightCreated={async () => {
                            setShowInsightDialog(false);
                            setSelectedThemeIds([]);
                            const pos = getNewCardPositionRef.current?.();
                            if (pos) {
                                const freshInsights = await qc.fetchQuery<Insight[]>({
                                    queryKey: ['insights', projectId],
                                    queryFn: () => getInsights(projectId),
                                });
                                // Most recently created insight is last in the list
                                const newInsight = freshInsights[freshInsights.length - 1];
                                if (newInsight) await updateInsight(newInsight.id, { position: pos });
                            }
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
                projectId={projectId ?? undefined}
                userId={user?.id}
                getNewCardPositionRef={getNewCardPositionRef}
                hiddenKinds={hiddenKinds}
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
