import { useRef, useMemo, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getFile, getHighlights, getProjects, getMedia, listSegments, listParticipants, updateSegment, deleteSegment, getMediaDownloadUrl, createParticipant, updateParticipant, deleteParticipantApi, getParticipantSegmentCounts, mergeParticipants, deleteHighlight } from '@/services/api';
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
    const sortedHighlights = useMemo(() => [...highlights].sort((a, b) => a.startOffset - b.startOffset), [highlights]);

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
                <h2 className="text-base md:text-lg font-bold uppercase tracking-wide mb-2">Document</h2>
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
                    rightPanel={(
                        <div className="pl-4 border-l-2 border-black">
                            <div className="text-xs font-semibold uppercase text-neutral-600 tracking-wide mb-2">Codes</div>
                            <div className="space-y-2">
                                {sortedHighlights.map((h) => (
                                    <div
                                        key={h.id}
                                        className="text-[11px] leading-tight px-2 py-1 bg-primary/10 border border-primary/30 rounded cursor-pointer hover:bg-primary/20 group relative"
                                        onClick={() => viewerRef.current?.scrollToOffset(h.startOffset)}
                                        title={h.text}
                                    >
                                        <div className="font-semibold text-primary truncate pr-6">{h.codeName || 'Code'}</div>
                                        <div className="text-neutral-700 truncate">{h.text || ''}</div>
                                        <button
                                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-100 rounded"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (!confirm('Delete this code?')) return;
                                                try {
                                                    await deleteHighlight(h.id);
                                                    refetchHighlights();
                                                } catch {
                                                    toast.error('Failed to delete code');
                                                }
                                            }}
                                            title="Delete code"
                                        >
                                            <svg className="w-3 h-3 text-neutral-600 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                />
            </div>
        </>
    );
}

// Component for media files (audio with transcripts)
function MediaView({ mediaId }: { mediaId: string }) {
    const qc = useQueryClient();
    const { data: media } = useQuery({ queryKey: ['mediaItem', mediaId], queryFn: () => getMedia(mediaId) });
    const { data: segments = [] } = useQuery({
        queryKey: ['segments', mediaId],
        queryFn: () => listSegments(mediaId),
        enabled: !!mediaId
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
                <h2 className="text-base md:text-lg font-bold uppercase tracking-wide mb-2">{media.originalFilename}</h2>
                {media.status === 'done' && segments.length > 0 ? (
                    <div className="grid grid-cols-1 gap-6 items-start">
                        <AudioProvider>
                            <TranscriptWithAudio
                                mediaId={mediaId}
                                audioUrl={audioUrl}
                                segments={segments}
                                participants={participants}
                            />
                        </AudioProvider>
                    </div>
                ) : (
                    <div className="text-sm text-neutral-600">
                        {media.status === 'processing' ? 'Transcription in progress...' : 'No transcript available yet.'}
                    </div>
                )}
            </div>
        </>
    );
}

function TranscriptWithAudio({
    mediaId,
    audioUrl,
    segments,
    participants
}: {
    mediaId: string;
    audioUrl: string | null;
    segments: TranscriptSegment[];
    participants: Participant[];
}) {
    const qc = useQueryClient();
    const { src, setSrc, currentTimeMs, playSegment } = useAudio();
    const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
    const [autoScrollMode, setAutoScrollMode] = useState<'center' | 'pin'>('pin');
    const [deletedSegmentIds, setDeletedSegmentIds] = useState<Set<string>>(new Set());
    const deleteQueueRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        setSrc(audioUrl);
    }, [audioUrl, setSrc]);

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
    };

    // Sidepanel state
    const [participantsPanelOpen, setParticipantsPanelOpen] = useState(false);

    // Fetch real codes/highlights for this transcript (mediaId)
    const { data: codes = [] } = useQuery({
        queryKey: ['highlights', mediaId],
        queryFn: () => getHighlights({ fileId: mediaId }),
        enabled: !!mediaId
    });

    const transcriptContainerRef = useRef<HTMLDivElement>(null);

    // Build a map of character offset to segment index
    const offsetToSegmentMap = useMemo(() => {
        const map: Array<{ startOffset: number; endOffset: number; segmentId: string; idx: number }> = [];
        let currentOffset = 0;
        segments.forEach((seg, idx) => {
            // Each segment includes participant name prefix if present
            const prefix = seg.participantName ? `${seg.participantName}: ` : '';
            const fullText = prefix + seg.text + '\n'; // Add newline between segments
            const startOffset = currentOffset;
            const endOffset = currentOffset + fullText.length;
            map.push({ startOffset, endOffset, segmentId: seg.id, idx });
            currentOffset = endOffset;
        });
        return map;
    }, [segments]);

    // Sort codes by their position in the transcript (by segment index, then by offset within segment)
    const sortedCodes = useMemo(() => {
        return [...codes].sort((a, b) => {
            // Find which segment each code belongs to
            const segA = offsetToSegmentMap.find(seg => a.startOffset >= seg.startOffset && a.startOffset < seg.endOffset);
            const segB = offsetToSegmentMap.find(seg => b.startOffset >= seg.startOffset && b.startOffset < seg.endOffset);

            if (!segA) return 1;  // Put codes without segments at the end
            if (!segB) return -1;

            // First sort by segment index (order in transcript)
            if (segA.idx !== segB.idx) {
                return segA.idx - segB.idx;
            }

            // If in same segment, sort by offset
            return a.startOffset - b.startOffset;
        });
    }, [codes, offsetToSegmentMap]);

    // Determine which segments have codes (for highlighting)
    const highlightedSegmentIds = useMemo(() => {
        const ids = new Set<string>();
        codes.forEach(code => {
            // Find which segment(s) this code overlaps with
            offsetToSegmentMap.forEach(seg => {
                const codeStart = code.startOffset;
                const codeEnd = code.endOffset;
                const segStart = seg.startOffset;
                const segEnd = seg.endOffset;
                // Check if code overlaps with this segment
                if (codeStart < segEnd && codeEnd > segStart) {
                    ids.add(seg.segmentId);
                }
            });
        });
        return ids;
    }, [codes, offsetToSegmentMap]);

    return (
        <div className="relative space-y-3 pb-24">
            {/* Top right controls */}
            <div className="absolute right-0 top-0 flex gap-2 z-20">
                <button className="brutal-button px-3 py-1 text-xs" onClick={() => setParticipantsPanelOpen(true)}>
                    Participants
                </button>
            </div>
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
                rightPanel={(
                    <div className="pl-4 border-l-2 border-black">
                        <div className="text-xs font-semibold uppercase text-neutral-600 tracking-wide mb-2">Codes</div>
                        <div className="space-y-2">
                            {sortedCodes.map((code) => {
                                // Find which segment this code belongs to
                                const startSegmentInfo = offsetToSegmentMap.find(seg =>
                                    code.startOffset >= seg.startOffset && code.startOffset < seg.endOffset
                                );

                                return (
                                    <div
                                        key={code.id}
                                        className="text-[11px] leading-tight px-2 py-1 bg-primary/10 border border-primary/30 rounded cursor-pointer hover:bg-primary/20 group relative"
                                        onClick={() => {
                                            if (startSegmentInfo) {
                                                const segElement = document.querySelector(`[data-segment-id="${startSegmentInfo.segmentId}"]`);
                                                if (segElement) {
                                                    segElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                                }
                                            }
                                        }}
                                        title={code.text}
                                    >
                                        <div className="font-semibold text-primary truncate pr-6">{code.codeName || 'Code'}</div>
                                        <div className="text-neutral-700 truncate">{code.text || ''}</div>
                                        <button
                                            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-100 rounded"
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (!confirm('Delete this code?')) return;
                                                try {
                                                    await deleteHighlight(code.id);
                                                    qc.invalidateQueries({ queryKey: ['highlights', mediaId] });
                                                } catch {
                                                    toast.error('Failed to delete code');
                                                }
                                            }}
                                            title="Delete code"
                                        >
                                            <svg className="w-3 h-3 text-neutral-600 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
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
            />
            {audioUrl && (
                <AudioBar
                    autoScrollEnabled={autoScrollEnabled}
                    autoScrollMode={autoScrollMode}
                    onToggleAutoScroll={() => setAutoScrollEnabled(v => !v)}
                    onCycleAutoScrollMode={() => setAutoScrollMode(m => (m === 'pin' ? 'center' : 'pin'))}
                />
            )}
            {/* Participants popup */}
            <Sheet open={participantsPanelOpen} onOpenChange={setParticipantsPanelOpen}>
                <SheetContent side="right" className="rounded-none border-l-4 border-black sm:max-w-sm">
                    <SheetHeader>
                        <SheetTitle className="uppercase tracking-wide">Participants</SheetTitle>
                    </SheetHeader>
                    <div className="mt-4">
                        <ParticipantPanel
                            participants={participants}
                            counts={[]}
                            newPart={{ name: '' }}
                            onNewPartChange={() => { }}
                            onCreate={() => { }}
                            merging={{ source: '', target: '', setSource: () => { }, setTarget: () => { }, onMerge: () => { }, isMerging: false }}
                            onDelete={() => { }}
                            onSave={() => { }}
                            isSaving={false}
                        />
                    </div>
                </SheetContent>
            </Sheet>
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
    return (
        <div className="w-full lg:w-[260px] sticky lg:top-24 overflow-hidden">
            <div className="font-semibold mb-2">Participants</div>
            <div className="max-h-[68vh] overflow-auto pr-1 space-y-3 text-[13px]">
                <ul className="space-y-1">
                    {participants.map(p => (
                        <li key={p.id} className="flex items-center gap-2">
                            <input className="border px-2 py-1 flex-1 min-w-0" value={valueFor(p)} onChange={(e) => setValue(p.id, e.target.value)} />
                            <span className="text-[11px] text-neutral-600 whitespace-nowrap">({counts.find(c => c.participantId === p.id)?.count ?? 0})</span>
                            <Button size="sm" disabled={!dirty(p) || empty(p) || isSaving} onClick={() => onSave(p.id, valueFor(p).trim())}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => onDelete(p.id)}>Delete</Button>
                        </li>
                    ))}
                    {participants.length === 0 && <li className="text-sm text-neutral-600">No participants yet.</li>}
                </ul>
                <div className="pt-2 border-t border-neutral-200">
                    <div className="text-xs text-neutral-600 mb-1">Create</div>
                    <div className="flex items-center gap-2">
                        <input className="border px-2 py-1 flex-1" placeholder="Name" value={newPart.name} onChange={(e) => onNewPartChange({ name: e.target.value })} />
                        <Button size="sm" disabled={!newPart.name} onClick={onCreate}>Add</Button>
                    </div>
                </div>
                <div className="pt-2 border-t border-neutral-200">
                    <div className="text-xs text-neutral-600 mb-1">Merge</div>
                    <div className="flex items-center gap-2">
                        <select className="border px-2 py-1 flex-1" value={merging.source} onChange={(e) => merging.setSource(e.target.value)}>
                            <option value="">Source…</option>
                            {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <span className="text-xs text-neutral-600">→</span>
                        <select className="border px-2 py-1 flex-1" value={merging.target} onChange={(e) => merging.setTarget(e.target.value)}>
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
