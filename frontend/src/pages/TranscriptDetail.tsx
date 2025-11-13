import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { listSegments, getMedia, getFinalizedTranscript, finalizeTranscript, listParticipants, createParticipant, updateParticipant, deleteParticipantApi, getParticipantSegmentCounts, mergeParticipants, getFile, updateSegment, getMediaDownloadUrl } from '@/services/api';
import type { Participant, TranscriptSegment } from '@/types';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { DocumentViewer } from '@/components/DocumentViewer';
import { AudioProvider, useAudio } from '@/hooks/useAudio';
import AudioBar from '@/components/AudioBar';
import { Progress } from '@/components/ui/progress';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { getProjects } from '@/services/api';
import { useJobPolling } from '@/hooks/useJobPolling';
import { useOptimisticMutation } from '@/hooks/useOptimisticMutation';

function formatEta(seconds?: number) {
    if (seconds == null || seconds < 0) return '';
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const m = Math.floor((seconds / 60) % 60).toString().padStart(2, '0');
    const h = Math.floor(seconds / 3600);
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export default function TranscriptDetail() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [projectId] = useSelectedProject();
    const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
    const projectName = projects.find(p => p.id === projectId)?.name || 'Project';
    const { data: media } = useQuery({ queryKey: ['mediaItem', id], queryFn: () => getMedia(id!), enabled: !!id });

    // Use centralized job polling hook
    const { job } = useJobPolling(id, media?.status);

    const { data: segments = [] } = useQuery({ queryKey: ['segments', id], queryFn: () => listSegments(id!), enabled: !!id });
    const { data: participants = [] } = useQuery({ queryKey: ['participants', id], queryFn: () => listParticipants(id!), enabled: !!id });
    const { data: counts = [] } = useQuery({ queryKey: ['participantCounts', id], queryFn: () => getParticipantSegmentCounts(id!), enabled: !!id });
    // Bulk and range assignment removed per request. Segment list is now read-only aside from participant merge operations.
    const [newPart, setNewPart] = useState({ name: '' });
    const createPartMut = useMutation({
        mutationFn: () => createParticipant(id!, newPart),
        onSuccess: () => { setNewPart({ name: '' }); qc.invalidateQueries({ queryKey: ['participants', id] }); },
    });
    const updatePartMut = useOptimisticMutation<Participant[], Error, { partId: string; name: string }>({
        queryKey: ['participants', id],
        mutationFn: async ({ partId, name }) => {
            await updateParticipant(id!, partId, { name });
            // Return the updated list for type safety
            return qc.getQueryData<Participant[]>(['participants', id]) ?? [];
        },
        optimisticUpdate: (oldParts, { partId, name }) => {
            return oldParts?.map((p) => p.id === partId ? { ...p, name } : p) ?? [];
        },
        onSuccess: () => {
            // Also update related queries
            qc.invalidateQueries({ queryKey: ['participantCounts', id] });
            qc.invalidateQueries({ queryKey: ['segments', id] });
        },
    });
    const deletePartMut = useMutation({
        mutationFn: (partId: string) => deleteParticipantApi(id!, partId),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['participants', id] }); qc.invalidateQueries({ queryKey: ['participantCounts', id] }); },
    });
    // Merge participants
    const [mergeSource, setMergeSource] = useState<string>('');
    const [mergeTarget, setMergeTarget] = useState<string>('');
    const mergeMut = useMutation({
        mutationFn: () => mergeParticipants(id!, mergeSource, mergeTarget),
        onSuccess: () => {
            setMergeSource('');
            setMergeTarget('');
            qc.invalidateQueries({ queryKey: ['participants', id] });
            qc.invalidateQueries({ queryKey: ['participantCounts', id] });
            qc.invalidateQueries({ queryKey: ['segments', id] });
        },
    });
    const { data: finalized } = useQuery({ queryKey: ['finalized', id], queryFn: () => getFinalizedTranscript(id!), enabled: !!id && media?.status === 'done', retry: false, refetchOnWindowFocus: false });
    const { data: finalizedFile } = useQuery({
        queryKey: ['finalizedFile', id, finalized?.fileId],
        queryFn: () => getFile(finalized!.fileId),
        enabled: !!finalized?.fileId,
        retry: false,
        refetchOnWindowFocus: false,
    });
    const finalizeMut = useMutation({
        mutationFn: () => finalizeTranscript(id!),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['finalized', id] });
        },
    });

    let pct: number | undefined;
    // Display string separate from strict status enum to avoid type conflicts
    let statusLabelDisplay: string | undefined = media?.status;
    if (media?.status === 'processing' && job) {
        if (job.totalMs && job.processedMs) {
            pct = Math.min(100, Math.round((job.processedMs / job.totalMs) * 100));
        }
        statusLabelDisplay = pct != null ? `Processing ${pct}%` : 'Processing…';
        if (job.etaSeconds != null && job.etaSeconds >= 0) statusLabelDisplay += ` ETA ${formatEta(job.etaSeconds)}`;
    }
    if (media?.status === 'done') {
        statusLabelDisplay = finalized ? 'Done (finalized)' : 'Done';
    }

    // Build VTT content + metadata once per segments change
    const built = buildTranscriptContentAndMeta(segments);
    const audioUrl = media?.status === 'done' && id ? getMediaDownloadUrl(id) : null;

    return (
        <div className="container mx-auto p-6 space-y-4">
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem><BreadcrumbLink href="/projects">Projects</BreadcrumbLink></BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem><BreadcrumbPage>{projectName}</BreadcrumbPage></BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem><BreadcrumbLink href="/transcripts">Transcripts</BreadcrumbLink></BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem><BreadcrumbPage>{media?.originalFilename || 'Transcript'}</BreadcrumbPage></BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            <div className="flex items-center gap-3">
                <h1 className="text-xl font-extrabold uppercase tracking-wide">Transcript Viewer</h1>
                <div className="ml-auto flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => navigate('/transcripts')}>Back</Button>
                    {media?.status === 'done' && !finalized && (
                        <Button variant="outline" size="sm" disabled={finalizeMut.isPending} onClick={() => finalizeMut.mutate()}>
                            {finalizeMut.isPending ? 'Finalizing…' : 'Finalize'}
                        </Button>
                    )}
                    {finalized && (
                        <Button variant="secondary" size="sm" onClick={() => navigate(`/documents/${finalized.fileId}`)}>Open Document</Button>
                    )}
                </div>
            </div>

            {media ? (
                <div className="border-2 border-black divide-y-2 divide-black bg-white">
                    <div className="p-3 space-y-2">
                        <div className="flex items-center gap-3">
                            <div className="font-semibold truncate">{media.originalFilename}</div>
                            {pct != null && <div className="w-48"><Progress value={pct} /></div>}
                            <div className="text-xs text-neutral-700">{statusLabelDisplay}</div>
                        </div>
                        <div className="text-[11px] text-neutral-500">Uploaded {new Date(media.createdAt).toLocaleString()}</div>
                    </div>
                    <div className="p-3 space-y-3">
                        {/* Center document viewer with transcript content (finalized file if available, otherwise synthetic from segments) */}
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
                            <div>
                                {segments.length > 0 || finalizedFile ? (
                                    <AudioProvider>
                                        <InnerTranscriptViewer
                                            mediaId={id!}
                                            audioUrl={audioUrl}
                                            built={built}
                                            finalizedFile={finalizedFile}
                                            segments={segments}
                                            participants={participants}
                                            id={id!}
                                            canPlay={media?.status === 'done'}
                                            qc={qc}
                                        />
                                    </AudioProvider>
                                ) : (
                                    <div className="text-sm text-neutral-600">{media.status === 'processing' ? 'Transcription in progress… segments will appear here.' : 'No segments.'}</div>
                                )}
                            </div>
                            <div className="space-y-3">
                                <ParticipantPanel
                                    participants={participants}
                                    counts={counts}
                                    newPart={newPart}
                                    onNewPartChange={(v) => setNewPart(v)}
                                    onCreate={() => createPartMut.mutate()}
                                    merging={{ source: mergeSource, target: mergeTarget, setSource: setMergeSource, setTarget: setMergeTarget, onMerge: () => mergeMut.mutate(), isMerging: mergeMut.isPending }}
                                    onDelete={(id) => deletePartMut.mutate(id)}
                                    onSave={(id, name) => updatePartMut.mutate({ partId: id, name })}
                                    isSaving={updatePartMut.isPending}
                                />
                            </div>
                        </div>
                        {/* Removed duplicated participants section below to keep layout compact */}
                    </div>
                </div>
            ) : (
                <div className="text-sm text-neutral-600">Loading media…</div>
            )}
        </div>
    );
}

function InnerTranscriptViewer({ mediaId, audioUrl, built, finalizedFile, segments, participants, id, canPlay, qc }: { mediaId: string; audioUrl: string | null; built: { content: string; meta: Array<{ segmentId: string; startMs?: number; endMs?: number; participantId?: string | null; participantName?: string | null }> }; finalizedFile: { id: string; content: string } | undefined; segments: TranscriptSegment[]; participants: Participant[]; id: string; canPlay: boolean; qc: ReturnType<typeof useQueryClient> }) {
    const { src, setSrc, currentTimeMs, playSegment } = useAudio();
    const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
    const [autoScrollMode, setAutoScrollMode] = useState<'center' | 'pin'>('pin');

    // Load or clear audio source when URL changes
    useEffect(() => {
        setSrc(audioUrl);
    }, [audioUrl, setSrc]);
    return (
        <div className="space-y-3">
            <DocumentViewer
                fileId={finalizedFile?.id || `media-${id}-virtual`}
                content={finalizedFile?.content || built.content}
                highlights={[]}
                onHighlightCreated={() => { /* no-op in transcript view */ }}
                isVtt={true}
                framed={false}
                readOnly={true}
                enableSelectionActions={false}
                vttMeta={segments.length > 0 ? built.meta : undefined}
                participants={participants.map(p => ({ id: p.id, name: p.name }))}
                onAssignParticipant={async (segmentId, participantId) => {
                    // optimistic update of segments list
                    await qc.cancelQueries({ queryKey: ['segments', id] });
                    const prev = qc.getQueryData<TranscriptSegment[]>(['segments', id]);
                    if (prev) {
                        qc.setQueryData<TranscriptSegment[]>(['segments', id], prev.map(s => s.id === segmentId ? { ...s, participantId, participantName: participants.find(p => p.id === participantId)?.name || null } : s));
                    }
                    try {
                        const seg = (prev || []).find(s => s.id === segmentId);
                        if (seg) await updateSegment(id!, segmentId, { participantId });
                    } finally {
                        qc.invalidateQueries({ queryKey: ['segments', id] });
                        qc.invalidateQueries({ queryKey: ['participantCounts', id] });
                    }
                }}
                canPlay={canPlay}
                currentTimeMs={currentTimeMs}
                autoScrollEnabled={autoScrollEnabled}
                autoScrollMode={autoScrollMode}
                onPlaySegment={(startMs, _endMs) => {
                    if (startMs == null) return;
                    // Ensure the audio source is set before attempting to play a segment.
                    if (!src && audioUrl) {
                        setSrc(audioUrl);
                    }
                    playSegment(startMs, null);
                }}
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

function ParticipantListForm({
    participants,
    counts,
    onSave,
    onDelete,
    isSaving,
}: {
    participants: Participant[];
    counts: Array<{ participantId: string | null; name: string | null; color: string | null; count: number }>;
    onSave: (participantId: string, name: string) => void;
    onDelete: (participantId: string) => void;
    isSaving: (participantId: string) => boolean;
}) {
    const [names, setNames] = useState<Record<string, string>>({});
    const valueFor = (p: Participant) => (names[p.id] ?? p.name ?? '');
    const setValue = (id: string, v: string) => setNames(prev => ({ ...prev, [id]: v }));
    const isDirty = (p: Participant) => valueFor(p) !== (p.name ?? '');
    const isEmpty = (p: Participant) => valueFor(p).trim().length === 0;
    return (
        <ul className="space-y-1">
            {participants.map(p => (
                <li key={p.id} className="flex items-center gap-2">
                    <input
                        className="border px-2 py-1 flex-1 min-w-0"
                        value={valueFor(p)}
                        onChange={(e) => setValue(p.id, e.target.value)}
                    />
                    <span className="text-xs text-neutral-600 whitespace-nowrap">({counts.find(c => c.participantId === p.id)?.count ?? 0})</span>
                    <Button
                        size="sm"
                        disabled={!isDirty(p) || isEmpty(p) || isSaving(p.id)}
                        onClick={() => onSave(p.id, valueFor(p).trim())}
                    >
                        {isSaving(p.id) ? 'Saving…' : 'Save'}
                    </Button>
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDelete(p.id)}
                    >
                        Delete
                    </Button>
                </li>
            ))}
            {participants.length === 0 && <li className="text-sm text-neutral-600">No participants yet.</li>}
        </ul>
    );
}

// Compact participant panel with sticky layout and scroll, designed to avoid overflow
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

function msToHms(ms?: number) {
    if (ms == null) return '0:00:00';
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return `${h}:${mm}:${ss}`;
}

function hmsToMs(hms: string): number | undefined {
    const m = hms.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
    if (!m) return undefined;
    const h = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    const ss = parseInt(m[3], 10);
    if (Number.isNaN(h) || Number.isNaN(mm) || Number.isNaN(ss)) return undefined;
    return ((h * 3600) + (mm * 60) + ss) * 1000;
}

// Build a synthetic VTT-like content string from segments for unified viewing
function buildTranscriptContentAndMeta(segments: TranscriptSegment[]): { content: string; meta: Array<{ segmentId: string; startMs?: number; endMs?: number; participantId?: string | null; participantName?: string | null }> } {
    const sorted = [...segments].sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
    const meta: Array<{ segmentId: string; startMs?: number; endMs?: number; participantId?: string | null; participantName?: string | null }> = [];
    const lines = sorted.map(s => {
        const start = msToHms(s.startMs);
        const end = msToHms(s.endMs);
        const speaker = s.participantName ? `${s.participantName}:` : '';
        // Timestamp and speaker on their own then speech on new line to match viewer formatting
        meta.push({ segmentId: s.id, startMs: s.startMs, endMs: s.endMs, participantId: s.participantId ?? null, participantName: s.participantName ?? null });
        return `[${start} - ${end}] ${speaker}${speaker ? '\n' : ''}${s.text}`;
    });
    return { content: lines.join('\n'), meta };
}
