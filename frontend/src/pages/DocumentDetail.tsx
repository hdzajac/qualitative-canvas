import { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getFile, getHighlights, getProjects, getMedia, listSegments, listParticipants, updateSegment, deleteSegment, getMediaDownloadUrl, createParticipant, updateParticipant, deleteParticipantApi, getParticipantSegmentCounts, mergeParticipants, mergeSpeakerRuns, deleteHighlight } from '@/services/api';
import { toast } from 'sonner';
import type { Highlight, TranscriptSegment, Participant } from '@/types';
import { useOptimisticMutation } from '@/hooks/useOptimisticMutation';
import { DocumentViewer, type DocumentViewerHandle } from '@/components/DocumentViewer';
import { TranscriptViewer } from '@/components/transcript/TranscriptViewer';
import { AudioProvider, useAudio } from '@/hooks/useAudio';
import AudioBar from '@/components/AudioBar';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// Component for document files (text)
function DocumentView({ fileId }: { fileId: string }) {
    const { data: file } = useQuery({ queryKey: ['file', fileId], queryFn: () => getFile(fileId) });
    const { data: highlights = [], refetch: refetchHighlights } = useQuery<Highlight[]>({
        queryKey: ['highlights', fileId],
        queryFn: () => getHighlights({ fileId }),
        enabled: !!fileId
    });
    const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });

    const viewerRef = useRef<DocumentViewerHandle>(null);
    const gutterRef = useRef<HTMLDivElement>(null);
    const sortedHighlights = useMemo(() => [...highlights].sort((a, b) => a.startOffset - b.startOffset), [highlights]);
    const [pendingDeleteHighlightId, setPendingDeleteHighlightId] = useState<string | null>(null);
    const [chipTops, setChipTops] = useState<Map<string, number>>(new Map());

    useEffect(() => {
        const CHIP_H = 44;
        const GAP = 4;
        const compute = () => {
            if (!viewerRef.current || !gutterRef.current) return;
            const gutterAbsTop = gutterRef.current.getBoundingClientRect().top + window.scrollY;
            let cursor = 0;
            const next = new Map<string, number>();
            for (const h of sortedHighlights) {
                const absY = viewerRef.current.getTopForOffset(h.startOffset);
                if (absY === null) continue;
                const natural = absY - gutterAbsTop;
                const top = Math.max(natural, cursor);
                next.set(h.id, top);
                cursor = top + CHIP_H + GAP;
            }
            setChipTops(next);
        };
        const t = window.setTimeout(compute, 150);
        window.addEventListener('resize', compute);
        return () => { window.clearTimeout(t); window.removeEventListener('resize', compute); };
    }, [sortedHighlights]);

    const gutterMinHeight = useMemo(() => {
        const CHIP_H = 44;
        if (chipTops.size === 0) return sortedHighlights.length * 52;
        const tops = Array.from(chipTops.values());
        return tops.length === 0 ? 0 : Math.max(...tops) + CHIP_H + 20;
    }, [chipTops, sortedHighlights.length]);

    if (!file) return <div className="text-sm text-neutral-600">Loading document...</div>;

    const projectName = projects.find(p => p.id === file.projectId)?.name || 'Project';

    return (
        <>
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/">Home</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/projects">Projects</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>{projectName}</BreadcrumbPage>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/documents">Documents</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>{file.filename}</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            <div className="border-2 border-black p-4">
                <h2 className="text-base md:text-lg font-bold uppercase tracking-wide mb-4">Document</h2>
                <div className="flex gap-4 items-start">
                    <div className="flex-1 min-w-0">
                        <DocumentViewer
                            ref={viewerRef}
                            fileId={file.id}
                            content={file.content}
                            highlights={highlights}
                            onHighlightCreated={() => refetchHighlights()}
                            isVtt={/\.(vtt|transcript\.txt)$/i.test(file.filename)}
                            framed={false}
                            readOnly={false}
                            enableSelectionActions={true}
                        />
                    </div>
                    <div
                        ref={gutterRef}
                        className="relative flex-shrink-0 w-48"
                        style={{ minHeight: gutterMinHeight }}
                    >
                        {sortedHighlights.map((h) => {
                            const top = chipTops.get(h.id);
                            if (top === undefined) return null;
                            return (
                                <div key={h.id} className="absolute left-0 right-0" style={{ top }}>
                                    <div
                                        className="text-[11px] leading-tight px-2 py-1 bg-primary/10 border-l-2 border-primary/60 cursor-pointer hover:bg-primary/20 group relative"
                                        onClick={() => viewerRef.current?.scrollToOffset(h.startOffset)}
                                        title={h.text}
                                    >
                                        <div className="font-semibold text-primary truncate pr-5">{h.codeName || 'Code'}</div>
                                        <div className="text-neutral-500 truncate text-[10px]">{h.text || ''}</div>
                                        <button
                                            className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-100 rounded"
                                            onClick={(e) => { e.stopPropagation(); setPendingDeleteHighlightId(h.id); }}
                                            title="Delete code"
                                        >
                                            <svg className="w-3 h-3 text-neutral-400 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            <ConfirmDialog
                open={!!pendingDeleteHighlightId}
                title="Delete this code?"
                onConfirm={async () => {
                    if (!pendingDeleteHighlightId) return;
                    try {
                        await deleteHighlight(pendingDeleteHighlightId);
                        refetchHighlights();
                    } catch {
                        toast.error('Failed to delete code');
                    } finally {
                        setPendingDeleteHighlightId(null);
                    }
                }}
                onCancel={() => setPendingDeleteHighlightId(null)}
            />
        </>
    );
}

// Component for media files (audio with transcripts)
function MediaView({ mediaId }: { mediaId: string }) {
    const qc = useQueryClient();
    const { data: media } = useQuery({
        queryKey: ['mediaItem', mediaId],
        queryFn: () => getMedia(mediaId),
        refetchInterval: (query) => {
            const data = query.state.data;
            // Poll every 3 seconds while uploaded (queued) or processing
            return data?.status === 'uploaded' || data?.status === 'processing' ? 3000 : false;
        }
    });
    const { data: segments = [] } = useQuery({
        queryKey: ['segments', mediaId],
        queryFn: () => listSegments(mediaId),
        enabled: !!mediaId,
        refetchInterval: (query) => {
            const mediaQuery = qc.getQueryData<{ status: string }>(['mediaItem', mediaId]);
            // Poll segments while media is uploaded (queued) or processing
            return mediaQuery?.status === 'uploaded' || mediaQuery?.status === 'processing' ? 3000 : false;
        }
    });
    const { data: participants = [] } = useQuery({
        queryKey: ['participants', mediaId],
        queryFn: () => listParticipants(mediaId),
        enabled: !!mediaId
    });
    const { data: counts = [] } = useQuery({
        queryKey: ['participantCounts', mediaId],
        queryFn: () => getParticipantSegmentCounts(mediaId),
        enabled: !!mediaId
    });
    const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });

    const audioUrl = media?.status === 'done' && mediaId ? getMediaDownloadUrl(mediaId) : null;

    // Participant management
    const [newPart, setNewPart] = useState({ name: '' });
    const createPartMut = useMutation({
        mutationFn: () => createParticipant(mediaId, newPart),
        onSuccess: () => {
            setNewPart({ name: '' });
            qc.invalidateQueries({ queryKey: ['participants', mediaId] });
        },
    });
    const updatePartMut = useOptimisticMutation<Participant[], Error, { partId: string; name: string }>({
        queryKey: ['participants', mediaId],
        mutationFn: async ({ partId, name }) => {
            await updateParticipant(mediaId, partId, { name });
            return qc.getQueryData<Participant[]>(['participants', mediaId]) ?? [];
        },
        optimisticUpdate: (oldParts, { partId, name }) => {
            return oldParts?.map((p) => p.id === partId ? { ...p, name } : p) ?? [];
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['participantCounts', mediaId] });
            qc.invalidateQueries({ queryKey: ['segments', mediaId] });
        },
    });
    const deletePartMut = useMutation({
        mutationFn: (partId: string) => deleteParticipantApi(mediaId, partId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['participants', mediaId] });
            qc.invalidateQueries({ queryKey: ['participantCounts', mediaId] });
        },
    });
    const [mergeSource, setMergeSource] = useState<string>('');
    const [mergeTarget, setMergeTarget] = useState<string>('');
    const mergeMut = useMutation({
        mutationFn: () => mergeParticipants(mediaId, mergeSource, mergeTarget),
        onSuccess: () => {
            setMergeSource('');
            setMergeTarget('');
            qc.invalidateQueries({ queryKey: ['participants', mediaId] });
            qc.invalidateQueries({ queryKey: ['participantCounts', mediaId] });
            qc.invalidateQueries({ queryKey: ['segments', mediaId] });
        },
    });
    const mergeRunsMut = useMutation({
        mutationFn: () => mergeSpeakerRuns(mediaId, { gapThresholdMs: 800, maxDurationMs: 30000 }),
        onSuccess: (result) => {
            qc.invalidateQueries({ queryKey: ['segments', mediaId] });
            qc.invalidateQueries({ queryKey: ['participantCounts', mediaId] });
            toast.success(`Merged ${result.before} segments → ${result.merged}`);
        },
        onError: () => toast.error('Failed to merge segments'),
    });

    const [participantsPanelOpen, setParticipantsPanelOpen] = useState(false);

    if (!media) return <div className="text-sm text-neutral-600">Loading transcript...</div>;

    const projectName = projects.find(p => p.id === media.projectId)?.name || 'Project';

    return (
        <>
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/">Home</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/projects">Projects</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>{projectName}</BreadcrumbPage>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbLink href="/documents">Documents</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>{media.originalFilename}</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            <div className="border-2 border-black p-4">
                <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-base md:text-lg font-bold uppercase tracking-wide flex-1 min-w-0 truncate">{media.originalFilename}</h2>
                    {media.status === 'done' && segments.length > 0 && (
                        <div className="flex gap-2 flex-shrink-0">
                            <button
                                className="brutal-button px-3 py-1 text-xs disabled:opacity-50"
                                onClick={() => mergeRunsMut.mutate()}
                                disabled={mergeRunsMut.isPending}
                                title="Merge consecutive same-speaker lines (≤800ms gap, ≤30s max)"
                            >
                                {mergeRunsMut.isPending ? 'Merging…' : 'Merge segments'}
                            </button>
                            <button className="brutal-button px-3 py-1 text-xs" onClick={() => setParticipantsPanelOpen(true)}>
                                Participants
                            </button>
                        </div>
                    )}
                </div>
                {media.status === 'done' && segments.length > 0 ? (
                    <AudioProvider>
                        <TranscriptWithAudio
                            mediaId={mediaId}
                            audioUrl={audioUrl}
                            segments={segments}
                            participants={participants}
                            counts={counts}
                            newPart={newPart}
                            onNewPartChange={setNewPart}
                            onCreateParticipant={() => createPartMut.mutate()}
                            onUpdateParticipant={(partId, name) => updatePartMut.mutate({ partId, name })}
                            onDeleteParticipant={(partId) => deletePartMut.mutate(partId)}
                            mergeSource={mergeSource}
                            mergeTarget={mergeTarget}
                            onMergeSourceChange={setMergeSource}
                            onMergeTargetChange={setMergeTarget}
                            onMergeParticipants={() => mergeMut.mutate()}
                            isMergingParticipants={mergeMut.isPending}
                            isSavingParticipant={updatePartMut.isPending}
                            onMergeSegmentRuns={() => mergeRunsMut.mutate()}
                            isMergingSegmentRuns={mergeRunsMut.isPending}
                        />
                    </AudioProvider>
                ) : (
                    <div className="text-sm text-neutral-600">
                        {media.status === 'processing' ? 'Transcription in progress...' : 'No transcript available yet.'}
                    </div>
                )}
            </div>

            <Sheet open={participantsPanelOpen} onOpenChange={setParticipantsPanelOpen}>
                <SheetContent side="right" className="rounded-none border-l-4 border-black sm:max-w-sm">
                    <SheetHeader>
                        <SheetTitle className="uppercase tracking-wide">Participants</SheetTitle>
                    </SheetHeader>
                    <div className="mt-4">
                        <ParticipantPanel
                            participants={participants}
                            counts={counts}
                            newPart={newPart}
                            onNewPartChange={setNewPart}
                            onCreate={() => createPartMut.mutate()}
                            merging={{
                                source: mergeSource,
                                target: mergeTarget,
                                setSource: setMergeSource,
                                setTarget: setMergeTarget,
                                onMerge: () => mergeMut.mutate(),
                                isMerging: mergeMut.isPending
                            }}
                            onDelete={(partId) => deletePartMut.mutate(partId)}
                            onSave={(partId, name) => updatePartMut.mutate({ partId, name })}
                            isSaving={updatePartMut.isPending}
                        />
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
}

function TranscriptWithAudio({
    mediaId,
    audioUrl,
    segments,
    participants,
    counts,
    newPart,
    onNewPartChange,
    onCreateParticipant,
    onUpdateParticipant,
    onDeleteParticipant,
    mergeSource,
    mergeTarget,
    onMergeSourceChange,
    onMergeTargetChange,
    onMergeParticipants,
    isMergingParticipants,
    isSavingParticipant,
    onMergeSegmentRuns,
    isMergingSegmentRuns,
}: {
    mediaId: string;
    audioUrl: string | null;
    segments: TranscriptSegment[];
    participants: Participant[];
    counts: Array<{ participantId: string | null; name: string | null; color: string | null; count: number }>;
    newPart: { name: string };
    onNewPartChange: (v: { name: string }) => void;
    onCreateParticipant: () => void;
    onUpdateParticipant: (partId: string, name: string) => void;
    onDeleteParticipant: (partId: string) => void;
    mergeSource: string;
    mergeTarget: string;
    onMergeSourceChange: (v: string) => void;
    onMergeTargetChange: (v: string) => void;
    onMergeParticipants: () => void;
    isMergingParticipants: boolean;
    isSavingParticipant: boolean;
    onMergeSegmentRuns: () => void;
    isMergingSegmentRuns: boolean;
}) {
    const qc = useQueryClient();
    const { src, setSrc, currentTimeMs, playSegment } = useAudio();
    const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
    const [autoScrollMode, setAutoScrollMode] = useState<'center' | 'pin'>('pin');
    const [deletedSegmentIds, setDeletedSegmentIds] = useState<Set<string>>(new Set());
    const deleteQueueRef = useRef<Set<string>>(new Set());
    const [pendingDeleteCodeId, setPendingDeleteCodeId] = useState<string | null>(null);
    const [isFlushingDeleteQueue, setIsFlushingDeleteQueue] = useState(false);
    const [editModeEnabled, setEditModeEnabled] = useState(false);

    useEffect(() => {
        setSrc(audioUrl);
    }, [audioUrl, setSrc]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (target?.closest('input, textarea, [contenteditable="true"]')) return;
            if (e.key === 'e' || e.key === 'E') {
                e.preventDefault();
                setEditModeEnabled(v => !v);
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, []);

    // Cleanup: Actually delete segments when component unmounts or when user performs another action
    useEffect(() => {
        const deleteQueue = deleteQueueRef.current;
        return () => {
            // On unmount, delete all queued segments
            if (deleteQueue.size > 0) {
                Promise.all(
                    Array.from(deleteQueue).map(segmentId =>
                        deleteSegment(mediaId, segmentId).catch(console.error)
                    )
                ).then(() => {
                    qc.invalidateQueries({ queryKey: ['segments', mediaId] });
                    qc.invalidateQueries({ queryKey: ['participantCounts', mediaId] });
                });
            }
        };
    }, [mediaId, qc]);

    // Handle Cmd+Z / Ctrl+Z to undo last deletion
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Check for Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
            if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
                // If there are deleted segments, undo the last one
                if (deletedSegmentIds.size > 0) {
                    e.preventDefault();
                    // Get the last deleted segment ID
                    const lastDeletedId = Array.from(deletedSegmentIds).pop();
                    if (lastDeletedId) {
                        // Remove from deleted set (show in UI again)
                        setDeletedSegmentIds(prev => {
                            const next = new Set(prev);
                            next.delete(lastDeletedId);
                            return next;
                        });
                        // Remove from delete queue
                        deleteQueueRef.current.delete(lastDeletedId);
                        toast.success('Deletion undone');
                    }
                }
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [deletedSegmentIds]);

    const handleDeleteSegment = (segmentId: string) => {
        // Add to deleted set (hide from UI)
        setDeletedSegmentIds(prev => new Set(prev).add(segmentId));
        // Add to delete queue
        deleteQueueRef.current.add(segmentId);

        // Show toast with undo
        toast.success('Segment deleted', {
            action: {
                label: 'Undo',
                onClick: () => {
                    // Remove from deleted set (show in UI again)
                    setDeletedSegmentIds(prev => {
                        const next = new Set(prev);
                        next.delete(segmentId);
                        return next;
                    });
                    // Remove from delete queue
                    deleteQueueRef.current.delete(segmentId);
                },
            },
        });
    };

    // When user edits text, flush delete queue
    const handleUpdateSegmentText = async (segmentId: string, newText: string) => {
        // Prevent concurrent flushes
        if (isFlushingDeleteQueue) return;
        setIsFlushingDeleteQueue(true);
        try {
            // Flush delete queue first
            if (deleteQueueRef.current.size > 0) {
                await Promise.all(
                    Array.from(deleteQueueRef.current).map(id =>
                        deleteSegment(mediaId, id).catch(console.error)
                    )
                );
                deleteQueueRef.current.clear();
                setDeletedSegmentIds(new Set());
            }

            // Then perform the update
            await qc.cancelQueries({ queryKey: ['segments', mediaId] });
            const prev = qc.getQueryData<TranscriptSegment[]>(['segments', mediaId]);
            if (prev) {
                qc.setQueryData<TranscriptSegment[]>(['segments', mediaId],
                    prev.map(s => s.id === segmentId ? { ...s, text: newText } : s)
                );
            }
            try {
                await updateSegment(mediaId, segmentId, { text: newText });
            } catch (error) {
                qc.setQueryData<TranscriptSegment[]>(['segments', mediaId], prev);
                throw error;
            } finally {
                qc.invalidateQueries({ queryKey: ['segments', mediaId] });
            }
        } finally {
            setIsFlushingDeleteQueue(false);
        }
    };

    const gutterRef = useRef<HTMLDivElement>(null);
    const [codeChipTops, setCodeChipTops] = useState<Map<string, number>>(new Map());

    // Fetch real codes/highlights for this transcript (mediaId)
    const { data: codes = [] } = useQuery({
        queryKey: ['highlights', mediaId],
        queryFn: () => getHighlights({ fileId: mediaId }),
        enabled: !!mediaId
    });

    const transcriptContainerRef = useRef<HTMLDivElement>(null);

    // Global offset map — mirrors how TranscriptViewer computes offsets for multi-segment codes
    const globalOffsetMap = useMemo(() => {
        const map: Array<{ startGlobal: number; endGlobal: number; seg: TranscriptSegment }> = [];
        let cur = 0;
        for (const seg of segments) {
            const prefix = seg.participantName ? `${seg.participantName}: ` : '';
            const fullText = prefix + seg.text + '\n';
            map.push({ startGlobal: cur, endGlobal: cur + fullText.length, seg });
            cur += fullText.length;
        }
        return map;
    }, [segments]);

    // Returns the first segment a code touches.
    // Multi-segment codes (text contains \n) use global cumulative offsets.
    // Single-segment codes use local offsets within seg.text — matched by text content.
    const findSegmentForCode = useCallback((code: Highlight) => {
        if (code.text.includes('\n')) {
            // Multi-segment: startOffset is a global cumulative offset
            const entry = globalOffsetMap.find(
                ({ startGlobal, endGlobal }) => code.startOffset >= startGlobal && code.startOffset < endGlobal
            );
            return entry?.seg ?? null;
        }
        // Single-segment: startOffset is local to seg.text
        for (const seg of segments) {
            const prefix = seg.participantName ? `${seg.participantName}: ` : '';
            const codeBody = code.text.startsWith(prefix) ? code.text.slice(prefix.length) : code.text;
            const len = codeBody.length;
            if (len > 0 && seg.text.slice(code.startOffset, code.startOffset + len) === codeBody) return seg;
        }
        // Fallback: substring match
        for (const seg of segments) {
            const prefix = seg.participantName ? `${seg.participantName}: ` : '';
            const codeBody = code.text.startsWith(prefix) ? code.text.slice(prefix.length) : code.text;
            if (codeBody.length > 0 && seg.text.includes(codeBody)) return seg;
        }
        return null;
    }, [segments, globalOffsetMap]);

    const sortedCodes = useMemo(() => {
        return [...codes].sort((a, b) => {
            const segA = findSegmentForCode(a);
            const segB = findSegmentForCode(b);
            const idxA = segA ? segments.findIndex(s => s.id === segA.id) : Infinity;
            const idxB = segB ? segments.findIndex(s => s.id === segB.id) : Infinity;
            if (idxA !== idxB) return idxA - idxB;
            return a.startOffset - b.startOffset;
        });
    }, [codes, findSegmentForCode, segments]);

    const highlightedSegmentIds = useMemo(() => {
        const ids = new Set<string>();
        for (const code of codes) {
            if (code.text.includes('\n')) {
                // Multi-segment: mark every segment the code's global range overlaps
                for (const { startGlobal, endGlobal, seg } of globalOffsetMap) {
                    if (code.startOffset < endGlobal && code.endOffset > startGlobal) {
                        ids.add(seg.id);
                    }
                }
            } else {
                const seg = findSegmentForCode(code);
                if (seg) ids.add(seg.id);
            }
        }
        return ids;
    }, [codes, findSegmentForCode, globalOffsetMap]);

    useEffect(() => {
        const CHIP_H = 44;
        const GAP = 4;
        const compute = () => {
            if (!gutterRef.current) return;
            const gutterAbsTop = gutterRef.current.getBoundingClientRect().top + window.scrollY;
            let cursor = 0;
            const next = new Map<string, number>();
            for (const code of sortedCodes) {
                const seg = findSegmentForCode(code);
                if (!seg) continue;
                const segEl = document.querySelector(`[data-segment-id="${seg.id}"]`);
                if (!segEl) continue;
                const segAbsTop = segEl.getBoundingClientRect().top + window.scrollY;
                const natural = segAbsTop - gutterAbsTop;
                const top = Math.max(natural, cursor);
                next.set(code.id, top);
                cursor = top + CHIP_H + GAP;
            }
            setCodeChipTops(next);
        };
        const t = window.setTimeout(compute, 150);
        window.addEventListener('resize', compute);
        return () => { window.clearTimeout(t); window.removeEventListener('resize', compute); };
    }, [sortedCodes, findSegmentForCode]);

    const codeGutterMinHeight = useMemo(() => {
        const CHIP_H = 44;
        const tops = Array.from(codeChipTops.values());
        return tops.length === 0 ? sortedCodes.length * 52 : Math.max(...tops) + CHIP_H + 20;
    }, [codeChipTops, sortedCodes.length]);

    return (
        <div className="space-y-3 pb-24">
            <div className="flex justify-end mb-1">
                <button
                    onClick={() => setEditModeEnabled(v => !v)}
                    className={`flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide border-2 transition-colors ${editModeEnabled
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                        : 'border-neutral-300 bg-white text-neutral-400'
                        }`}
                    title="Toggle edit mode (E)"
                >
                    <span className={`w-1.5 h-1.5 rounded-full ${editModeEnabled ? 'bg-indigo-500' : 'bg-neutral-300'}`} />
                    {editModeEnabled ? 'Editing' : 'View only'}
                    <kbd className="opacity-50 text-[9px] ml-0.5">E</kbd>
                </button>
            </div>
            <div className="flex gap-4 items-start">
                <div className="flex-1 min-w-0">
                    <TranscriptViewer
                        fileId={mediaId}
                        segments={segments.map(s => ({
                            id: s.id,
                            startMs: s.startMs,
                            endMs: s.endMs,
                            text: s.text,
                            participantId: s.participantId,
                            participantName: s.participantName,
                        }))}
                        currentTimeMs={currentTimeMs}
                        canPlay={true}
                        readOnly={false}
                        framed={false}
                        containerRef={transcriptContainerRef}
                        highlightedSegments={highlightedSegmentIds}
                        onHighlightCreated={() => {
                            qc.invalidateQueries({ queryKey: ['highlights', mediaId] });
                        }}
                        onPlaySegment={(startMs, _endMs) => {
                            playSegment(startMs, null);
                        }}
                        participants={participants.map(p => ({ id: p.id, name: p.name }))}
                        onAssignParticipant={async (segmentId, participantId) => {
                            await qc.cancelQueries({ queryKey: ['segments', mediaId] });
                            const prev = qc.getQueryData<TranscriptSegment[]>(['segments', mediaId]);
                            if (prev) {
                                qc.setQueryData<TranscriptSegment[]>(['segments', mediaId],
                                    prev.map(s => s.id === segmentId
                                        ? { ...s, participantId, participantName: participants.find(p => p.id === participantId)?.name || null }
                                        : s
                                    )
                                );
                            }
                            try {
                                const seg = (prev || []).find(s => s.id === segmentId);
                                if (seg) await updateSegment(mediaId, segmentId, { participantId });
                            } finally {
                                qc.invalidateQueries({ queryKey: ['segments', mediaId] });
                                qc.invalidateQueries({ queryKey: ['participantCounts', mediaId] });
                            }
                        }}
                        onUpdateSegmentText={handleUpdateSegmentText}
                        onDeleteSegment={handleDeleteSegment}
                        deletedSegmentIds={deletedSegmentIds}
                        autoScrollEnabled={autoScrollEnabled}
                        autoScrollMode={autoScrollMode}
                        editModeEnabled={editModeEnabled}
                    />
                </div>
                <div
                    ref={gutterRef}
                    className="relative flex-shrink-0 w-48"
                    style={{ minHeight: codeGutterMinHeight }}
                >
                    {sortedCodes.map((code) => {
                        const top = codeChipTops.get(code.id);
                        if (top === undefined) return null;
                        const seg = findSegmentForCode(code);
                        return (
                            <div key={code.id} className="absolute left-0 right-0" style={{ top }}>
                                <div
                                    className="text-[11px] leading-tight px-2 py-1 bg-primary/10 border-l-2 border-primary/60 cursor-pointer hover:bg-primary/20 group relative"
                                    onClick={() => {
                                        if (seg) {
                                            const segEl = document.querySelector(`[data-segment-id="${seg.id}"]`) as HTMLElement;
                                            if (segEl) {
                                                segEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                segEl.classList.add('segment-blink');
                                                setTimeout(() => segEl.classList.remove('segment-blink'), 3000);
                                            }
                                        }
                                    }}
                                    title={code.text}
                                >
                                    <div className="font-semibold text-primary truncate pr-5">{code.codeName || 'Code'}</div>
                                    <div className="text-neutral-500 truncate text-[10px]">{code.text || ''}</div>
                                    <button
                                        className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity p-0.5 hover:bg-red-100 rounded"
                                        onClick={(e) => { e.stopPropagation(); setPendingDeleteCodeId(code.id); }}
                                        title="Delete code"
                                    >
                                        <svg className="w-3 h-3 text-neutral-400 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {audioUrl && (
                <AudioBar
                    autoScrollEnabled={autoScrollEnabled}
                    autoScrollMode={autoScrollMode}
                    onToggleAutoScroll={() => setAutoScrollEnabled(v => !v)}
                    onCycleAutoScrollMode={() => setAutoScrollMode(m => (m === 'pin' ? 'center' : 'pin'))}
                />
            )}
            <ConfirmDialog
                open={!!pendingDeleteCodeId}
                title="Delete this code?"
                onConfirm={async () => {
                    if (!pendingDeleteCodeId) return;
                    try {
                        await deleteHighlight(pendingDeleteCodeId);
                        qc.invalidateQueries({ queryKey: ['highlights', mediaId] });
                    } catch {
                        toast.error('Failed to delete code');
                    } finally {
                        setPendingDeleteCodeId(null);
                    }
                }}
                onCancel={() => setPendingDeleteCodeId(null)}
            />
        </div>
    );
}

// Participant management panel
function ParticipantPanel({
    participants,
    counts,
    newPart,
    onNewPartChange,
    onCreate,
    merging,
    onDelete,
    onSave,
    isSaving,
}: {
    participants: Participant[];
    counts: Array<{ participantId: string | null; name: string | null; color: string | null; count: number }>;
    newPart: { name: string };
    onNewPartChange: (v: { name: string }) => void;
    onCreate: () => void;
    merging: { source: string; target: string; setSource: (v: string) => void; setTarget: (v: string) => void; onMerge: () => void; isMerging: boolean };
    onDelete: (id: string) => void;
    onSave: (id: string, name: string) => void;
    isSaving: boolean;
}) {
    const [names, setNames] = useState<Record<string, string>>({});
    const valueFor = (p: Participant) => (names[p.id] ?? p.name ?? '');
    const setValue = (id: string, v: string) => setNames(prev => ({ ...prev, [id]: v }));
    const dirty = (p: Participant) => valueFor(p) !== (p.name ?? '');
    const empty = (p: Participant) => valueFor(p).trim().length === 0;

    // Extracted handlers for performance
    const handleInputChange = (id: string) => (e: React.ChangeEvent<HTMLInputElement>) => setValue(id, e.target.value);
    const handleSave = (id: string) => () => onSave(id, valueFor(participants.find(p => p.id === id)!).trim());
    const handleDelete = (id: string) => () => onDelete(id);
    const handleCreateChange = (e: React.ChangeEvent<HTMLInputElement>) => onNewPartChange({ name: e.target.value });
    const handleMergeSourceChange = (e: React.ChangeEvent<HTMLSelectElement>) => merging.setSource(e.target.value);
    const handleMergeTargetChange = (e: React.ChangeEvent<HTMLSelectElement>) => merging.setTarget(e.target.value);

    return (
        <div className="w-full lg:w-[260px] lg:top-24 overflow-hidden">
            <div className="font-semibold mb-2">Participants</div>
            <div className="max-h-[68vh] overflow-auto pr-1 space-y-3 text-[13px]">
                <ul className="space-y-1">
                    {participants.map(p => (
                        <li key={p.id} className="flex items-center gap-2">
                            <input className="border px-2 py-1 flex-1 min-w-0" value={valueFor(p)} onChange={handleInputChange(p.id)} />
                            <span className="text-[11px] text-neutral-600 whitespace-nowrap">({counts.find(c => c.participantId === p.id)?.count ?? 0})</span>
                            <Button size="sm" disabled={!dirty(p) || empty(p) || isSaving} onClick={handleSave(p.id)}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={handleDelete(p.id)}>Delete</Button>
                        </li>
                    ))}
                    {participants.length === 0 && <li className="text-sm text-neutral-600">No participants yet.</li>}
                </ul>
                <div className="pt-2 border-t border-neutral-200">
                    <div className="text-xs text-neutral-600 mb-1">Create</div>
                    <div className="flex items-center gap-2">
                        <input className="border px-2 py-1 flex-1" placeholder="Name" value={newPart.name} onChange={handleCreateChange} />
                        <Button size="sm" disabled={!newPart.name} onClick={onCreate}>Add</Button>
                    </div>
                </div>
                <div className="pt-2 border-t border-neutral-200">
                    <div className="text-xs text-neutral-600 mb-1">Merge</div>
                    <div className="flex items-center gap-2">
                        <select className="border px-2 py-1 flex-1" value={merging.source} onChange={handleMergeSourceChange}>
                            <option value="">Source…</option>
                            {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <span className="text-xs text-neutral-600">→</span>
                        <select className="border px-2 py-1 flex-1" value={merging.target} onChange={handleMergeTargetChange}>
                            <option value="">Target…</option>
                            {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <Button size="sm" disabled={!merging.source || !merging.target || merging.source === merging.target || merging.isMerging} onClick={merging.onMerge}>{merging.isMerging ? '…' : 'Merge'}</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Main component that detects type and renders appropriate view
export default function DocumentDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    // Try to fetch as file first
    const { data: file, isLoading: fileLoading, error: fileError } = useQuery({
        queryKey: ['file', id],
        queryFn: () => getFile(id!),
        enabled: !!id,
        retry: false,
    });

    // If file fetch fails, try as media
    const { data: media, isLoading: mediaLoading } = useQuery({
        queryKey: ['mediaItem', id],
        queryFn: () => getMedia(id!),
        enabled: !!id && !!fileError,
        retry: false,
    });

    if (!id) {
        return <div className="container mx-auto p-6 text-sm text-neutral-600">Invalid document ID</div>;
    }

    if (fileLoading || mediaLoading) {
        return <div className="container mx-auto p-6 text-sm text-neutral-600">Loading...</div>;
    }

    return (
        <div className="container mx-auto p-6 space-y-4">
            {file ? (
                <DocumentView fileId={id} />
            ) : media ? (
                <MediaView mediaId={id} />
            ) : (
                <div className="space-y-4">
                    <div className="text-sm text-neutral-600">Document not found</div>
                    <Button onClick={() => navigate('/documents')}>Back to Documents</Button>
                </div>
            )}
        </div>
    );
}
