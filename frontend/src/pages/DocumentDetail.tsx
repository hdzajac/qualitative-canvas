import { useRef, useMemo, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { getFile, getHighlights, getProjects, getMedia, listSegments, listParticipants, updateSegment, getMediaDownloadUrl, createParticipant, updateParticipant, deleteParticipantApi, getParticipantSegmentCounts, mergeParticipants } from '@/services/api';
import type { Highlight, TranscriptSegment, Participant } from '@/types';
import { useOptimisticMutation } from '@/hooks/useOptimisticMutation';
import { DocumentViewer, type DocumentViewerHandle } from '@/components/DocumentViewer';
import { TranscriptViewer } from '@/components/transcript/TranscriptViewer';
import { AudioProvider, useAudio } from '@/hooks/useAudio';
import AudioBar from '@/components/AudioBar';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';

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
    const [panelHeight, setPanelHeight] = useState<number>(0);
    const [marks, setMarks] = useState<Array<{ id: string; codeName: string; text: string; top: number; startOffset: number; endOffset: number }>>([]);
    const docHighlights = highlights;
    const sortedByOffset = useMemo(() => [...docHighlights].sort((a, b) => a.startOffset - b.startOffset), [docHighlights]);

    // Recompute panel height and code positions to align with document
    useEffect(() => {
        const update = () => {
            const viewer = viewerRef.current;
            if (!viewer) return;
            const crect = viewer.getContainerRect();
            if (!crect) return;
            const containerTop = window.scrollY + crect.top;
            const height = Math.max(0, Math.round(crect.height));
            setPanelHeight(height);
            const next: Array<{ id: string; codeName: string; text: string; top: number; startOffset: number; endOffset: number }> = [];
            docHighlights.forEach(h => {
                const topAbs = viewer.getTopForOffset(h.startOffset);
                if (topAbs == null) return;
                const topRel = Math.max(0, Math.min(height, Math.round(topAbs - containerTop)));
                next.push({ id: h.id, codeName: h.codeName || 'Code', text: h.text || '', top: topRel, startOffset: h.startOffset, endOffset: h.endOffset });
            });
            next.sort((a, b) => a.top - b.top);
            setMarks(next);
        };
        update();
        const onScroll = () => update();
        const onResize = () => update();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onResize);
        const containerEl = document.getElementById('transcript-container');
        const ro = containerEl ? new ResizeObserver(() => update()) : null;
        if (containerEl && ro) ro.observe(containerEl);
        return () => {
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onResize);
            if (ro && containerEl) ro.disconnect();
        };
    }, [docHighlights]);

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
                    highlights={docHighlights}
                    onHighlightCreated={() => refetchHighlights()}
                    isVtt={/\.(vtt|transcript\.txt)$/i.test(file.filename)}
                    framed={false}
                    readOnly={false}
                    enableSelectionActions={true}
                    rightPanel={(
                        <div className="pl-4 border-l-2 border-black">
                            <div className="text-xs font-semibold uppercase text-neutral-600 tracking-wide mb-2">Codes</div>
                            <div className="space-y-1 relative" style={{ height: panelHeight > 0 ? `${panelHeight}px` : 'auto' }}>
                                {marks.map(m => (
                                    <div
                                        key={m.id}
                                        className="absolute left-0 right-0 text-[11px] leading-tight px-2 py-1 bg-primary/10 border border-primary/30 rounded cursor-pointer hover:bg-primary/20"
                                        style={{ top: `${m.top}px` }}
                                        onClick={() => viewerRef.current?.scrollToOffset(m.startOffset)}
                                        title={m.text}
                                    >
                                        <div className="font-semibold text-primary truncate">{m.codeName}</div>
                                        <div className="text-neutral-700 truncate">{m.text}</div>
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
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
                        <AudioProvider>
                            <TranscriptWithAudio
                                mediaId={mediaId}
                                audioUrl={audioUrl}
                                segments={segments}
                                participants={participants}
                            />
                        </AudioProvider>
                        <ParticipantPanel
                            participants={participants}
                            counts={counts}
                            newPart={newPart}
                            onNewPartChange={(v) => setNewPart(v)}
                            onCreate={() => createPartMut.mutate()}
                            merging={{
                                source: mergeSource,
                                target: mergeTarget,
                                setSource: setMergeSource,
                                setTarget: setMergeTarget,
                                onMerge: () => mergeMut.mutate(),
                                isMerging: mergeMut.isPending
                            }}
                            onDelete={(id) => deletePartMut.mutate(id)}
                            onSave={(id, name) => updatePartMut.mutate({ partId: id, name })}
                            isSaving={updatePartMut.isPending}
                        />
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

    useEffect(() => {
        setSrc(audioUrl);
    }, [audioUrl, setSrc]);

    return (
        <div className="space-y-3">
            <TranscriptViewer
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
                onUpdateSegmentText={async (segmentId, newText) => {
                    // Optimistic update
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
                        // Revert on error
                        qc.setQueryData<TranscriptSegment[]>(['segments', mediaId], prev);
                        throw error;
                    } finally {
                        qc.invalidateQueries({ queryKey: ['segments', mediaId] });
                    }
                }}
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
