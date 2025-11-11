import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { listSegments, getMedia, getFinalizedTranscript, finalizeTranscript, listParticipants, createParticipant, updateParticipant, deleteParticipantApi, getParticipantSegmentCounts, mergeParticipants } from '@/services/api';
import type { Participant, TranscriptSegment } from '@/types';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { getLatestJobForMedia } from '@/services/api';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { getProjects } from '@/services/api';

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
    const { data: job } = useQuery({ queryKey: ['latestJob', id], queryFn: () => getLatestJobForMedia(id!), enabled: !!id && media?.status === 'processing', refetchInterval: media?.status === 'processing' ? 5000 : false });
    // Light polling fallback: if we have no job yet but status is processing locally (optimistic), start short-lived polling until first job appears
    const shouldBootstrapPoll = !!id && media?.status === 'processing' && !job;
    const { data: bootstrapJob } = useQuery({ queryKey: ['latestJobBootstrap', id], queryFn: () => getLatestJobForMedia(id!), enabled: shouldBootstrapPoll, refetchInterval: shouldBootstrapPoll ? 3000 : false });
    const { data: segments = [] } = useQuery({ queryKey: ['segments', id], queryFn: () => listSegments(id!), enabled: !!id });
    const { data: participants = [] } = useQuery({ queryKey: ['participants', id], queryFn: () => listParticipants(id!), enabled: !!id });
    const { data: counts = [] } = useQuery({ queryKey: ['participantCounts', id], queryFn: () => getParticipantSegmentCounts(id!), enabled: !!id });
    // Bulk and range assignment removed per request. Segment list is now read-only aside from participant merge operations.
    const [newPart, setNewPart] = useState({ name: '' });
    const createPartMut = useMutation({
        mutationFn: () => createParticipant(id!, newPart),
        onSuccess: () => { setNewPart({ name: '' }); qc.invalidateQueries({ queryKey: ['participants', id] }); },
    });
    const updatePartMut = useMutation({
        mutationFn: ({ partId, name }: { partId: string; name: string }) => updateParticipant(id!, partId, { name }),
        onMutate: async ({ partId, name }) => {
            await qc.cancelQueries({ queryKey: ['participants', id] });
            await qc.cancelQueries({ queryKey: ['segments', id] });
            const prevParts = qc.getQueryData<Participant[]>(['participants', id]);
            const prevSegs = qc.getQueryData<TranscriptSegment[]>(['segments', id]);
            if (prevParts) {
                qc.setQueryData<Participant[]>(['participants', id], (old) => (old || []).map((p) => p.id === partId ? { ...p, name } : p));
            }
            if (prevSegs) {
                qc.setQueryData<TranscriptSegment[]>(['segments', id], (old) => (old || []).map((s) => s.participantId === partId ? { ...s, participantName: name } : s));
            }
            return { prevParts, prevSegs };
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.prevParts) qc.setQueryData(['participants', id], ctx.prevParts);
            if (ctx?.prevSegs) qc.setQueryData(['segments', id], ctx.prevSegs);
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: ['participants', id] });
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
    const { data: finalized } = useQuery({ queryKey: ['finalized', id], queryFn: () => getFinalizedTranscript(id!), enabled: !!id && media?.status === 'done' });
    const finalizeMut = useMutation({
        mutationFn: () => finalizeTranscript(id!),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['finalized', id] });
        },
    });

    let pct: number | undefined;
    // Display string separate from strict status enum to avoid type conflicts
    let statusLabelDisplay: string | undefined = media?.status;
    const activeJob = job || bootstrapJob;
    if (media?.status === 'processing' && activeJob) {
        if (activeJob.totalMs && activeJob.processedMs) {
            pct = Math.min(100, Math.round((activeJob.processedMs / activeJob.totalMs) * 100));
        }
        statusLabelDisplay = pct != null ? `Processing ${pct}%` : 'Processing…';
        if (activeJob.etaSeconds != null && activeJob.etaSeconds >= 0) statusLabelDisplay += ` ETA ${formatEta(activeJob.etaSeconds)}`;
    }
    if (media?.status === 'done') {
        statusLabelDisplay = finalized ? 'Done (finalized)' : 'Done';
    }

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
                        {/* Bulk assign and range assign removed */}
                        {segments.length > 0 ? (
                            <ol className="list-decimal pl-6 space-y-1">
                                {segments.map(s => (
                                    <li key={s.id} className="text-sm">
                                        <span className="text-gray-500 mr-2">[{msToHms(s.startMs)}–{msToHms(s.endMs)}]</span>
                                        {s.participantName ? <span className="text-blue-700 mr-2">({s.participantName})</span> : null}
                                        {s.text}
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <div className="text-sm text-neutral-600">{media.status === 'processing' ? 'Transcription in progress… segments will appear here.' : 'No segments.'}</div>
                        )}
                        <div className="border-t border-black pt-3">
                            <div className="font-semibold mb-2">Participants</div>
                            <div className="grid md:grid-cols-2 gap-3">
                                <div>
                                    <div className="text-xs text-neutral-600 mb-1">List</div>
                                    <ParticipantListForm
                                        participants={participants}
                                        counts={counts}
                                        onSave={(partId, name) => updatePartMut.mutate({ partId, name })}
                                        onDelete={(partId) => deletePartMut.mutate(partId)}
                                        isSaving={(partId) => updatePartMut.isPending}
                                    />
                                </div>
                                <div>
                                    <div className="text-xs text-neutral-600 mb-1">Create</div>
                                    <div className="flex items-center gap-2">
                                        <input className="border px-2 py-1" placeholder="Name" value={newPart.name} onChange={(e) => setNewPart({ name: e.target.value })} />
                                        <Button size="sm" disabled={!newPart.name || createPartMut.isPending} onClick={() => createPartMut.mutate()}>Add</Button>
                                    </div>
                                    <div className="mt-4">
                                        <div className="text-xs text-neutral-600 mb-1">Merge participants</div>
                                        <div className="flex items-center gap-2">
                                            <select className="border px-2 py-1" value={mergeSource} onChange={(e) => setMergeSource(e.target.value)}>
                                                <option value="">Source…</option>
                                                {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                            <span className="text-xs text-neutral-600">into</span>
                                            <select className="border px-2 py-1" value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)}>
                                                <option value="">Target…</option>
                                                {participants.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                            <Button size="sm" disabled={!mergeSource || !mergeTarget || mergeSource === mergeTarget || mergeMut.isPending} onClick={() => mergeMut.mutate()}>
                                                {mergeMut.isPending ? 'Merging…' : 'Merge'}
                                            </Button>
                                        </div>
                                        <div className="text-[11px] text-neutral-500 mt-1">Moves all segments from source to target and deletes the source participant.</div>
                                    </div>
                                    <div className="mt-3 text-xs text-neutral-600">Counts: {counts.map(c => (<span key={c.participantId ?? 'none'} className="mr-2">{c.name || 'Unassigned'}: {c.count}</span>))}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="text-sm text-neutral-600">Loading media…</div>
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
