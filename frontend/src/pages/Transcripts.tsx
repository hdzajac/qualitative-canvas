import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listMedia, uploadMedia, createTranscriptionJob, listSegments, getLatestJobForMedia, deleteMedia as deleteMediaApi, getFinalizedTranscript, finalizeTranscript, getSegmentCount, resetTranscription, listParticipants, createParticipant, updateParticipant, deleteParticipantApi, getParticipantSegmentCounts, assignParticipantToSegments } from '@/services/api';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { Button } from '@/components/ui/button';
import { useMemo, useState } from 'react';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { getProjects } from '@/services/api';
import { MediaUpload } from '@/components/MediaUpload';
import { useNavigate } from 'react-router-dom';

function formatEta(seconds?: number) {
    if (seconds == null || seconds < 0) return '';
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const m = Math.floor((seconds / 60) % 60).toString().padStart(2, '0');
    const h = Math.floor(seconds / 3600);
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

import type { MediaFile, TranscriptionJob, Participant } from '@/types';

interface MediaRowProps { m: MediaFile; expanded: string | null; onToggleExpand: (id: string) => void; onTranscribe: (id: string) => void; shouldPoll: boolean; disabled?: boolean; onStopPolling: (id: string) => void; transcribingId?: string | null }

function MediaRow({ m, expanded, onToggleExpand, onTranscribe, shouldPoll, onStopPolling, transcribingId }: MediaRowProps) {
    const qc = useQueryClient();
    const deleteMut = useMutation({
        mutationFn: ({ id, force }: { id: string; force?: boolean }) => deleteMediaApi(id, { force }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['media'] });
        },
    });
    // Inline delete button component (declared before use to satisfy linter)
    const DeleteMediaButton = ({ mediaId, disabled }: { mediaId: string; disabled?: boolean }) => {
        const isProcessing = m.status === 'processing';
        const label = deleteMut.isPending ? 'Deleting…' : (isProcessing ? 'Force delete' : 'Delete');
        return (
            <Button
                size="sm"
                variant="destructive"
                disabled={deleteMut.isPending}
                onClick={() => {
                    const msg = isProcessing
                        ? 'This media is currently marked processing and may have a stuck job. Force delete will cancel the job and remove the file. Continue?'
                        : 'Delete this media file? This cannot be undone.';
                    if (confirm(msg)) {
                        deleteMut.mutate({ id: mediaId, force: isProcessing });
                    }
                }}
            >
                {label}
            </Button>
        );
    };
    // Poll latest job progress every 5s if processing
    const { data: job } = useQuery({
        queryKey: ['latestJob', m.id],
        queryFn: () => getLatestJobForMedia(m.id),
        enabled: m.status === 'processing' && shouldPoll,
        refetchInterval: m.status === 'processing' && shouldPoll ? 5000 : false,
    });
    // Fetch finalized mapping if media is done
    const { data: finalized } = useQuery({
        queryKey: ['finalized', m.id],
        queryFn: () => getFinalizedTranscript(m.id),
        enabled: m.status === 'done',
        refetchOnWindowFocus: false,
    });
    // Lightweight seg count to gate Finalize/Reset buttons (avoid fetching full list per row)
    const { data: segCountData } = useQuery({
        queryKey: ['segmentCount', m.id],
        queryFn: () => getSegmentCount(m.id),
        enabled: m.status === 'done' || m.status === 'error',
        refetchOnWindowFocus: false,
    });
    const segCount = segCountData?.count ?? 0;
    let progressDisplay: string = m.status;
    let pct: number | undefined;
    if (m.status === 'processing') {
        const processedMs = job?.processedMs;
        const totalMs = job?.totalMs;
        const etaSeconds = job?.etaSeconds;
        const jobStatus = job?.status;
        if (processedMs != null && totalMs != null && totalMs > 0) {
            pct = Math.min(100, Math.round((processedMs / totalMs) * 100));
            progressDisplay = `processing ${pct}%`;
            if (etaSeconds != null && etaSeconds >= 0) {
                progressDisplay += ` ETA ${formatEta(etaSeconds)}`;
            }
        } else {
            progressDisplay = 'processing…';
        }
        if (jobStatus === 'error' && job) {
            progressDisplay = `error${job.errorMessage ? ' ' + job.errorMessage : ''}`;
        }
    } else if (m.status === 'done') {
        progressDisplay = finalized ? 'done (finalized)' : 'done';
    }

    // Stop polling once job is done or error
    if (m.status !== 'processing' && shouldPoll) {
        onStopPolling(m.id);
    }
    const navigate = useNavigate();
    return (
        <TableRow>
            <TableCell className="font-medium">{m.originalFilename}</TableCell>
            <TableCell className="w-[320px]">
                <div className="flex flex-col gap-1">
                    {/* Always show a progress bar placeholder while processing */}
                    {m.status === 'processing' && (
                        pct != null ? <Progress value={pct} /> : <Progress value={undefined} />
                    )}
                    <div className="text-xs text-neutral-700 truncate">{progressDisplay}{m.errorMessage ? ` (${m.errorMessage})` : ''}</div>
                </div>
            </TableCell>
            <TableCell className="text-xs text-neutral-600">{m.sizeBytes ?? 0}</TableCell>
            <TableCell className="flex gap-2 items-center">
                <Button size="sm" variant="outline" onClick={() => onTranscribe(m.id)} disabled={m.status === 'processing' || transcribingId === m.id}>
                    {transcribingId === m.id ? 'Starting…' : 'Transcribe'}
                </Button>
                {m.status === 'done' && (
                    <Button size="sm" variant="outline" onClick={() => navigate(`/transcripts/${m.id}`)}>
                        View
                    </Button>
                )}
                {m.status === 'done' && !finalized && segCount > 0 && (
                    <FinalizeButton mediaId={m.id} />
                )}
                {(m.status === 'done' || m.status === 'error') && !finalized && segCount > 0 && (
                    <ResetButton mediaId={m.id} />
                )}
                {m.status === 'done' && finalized && (
                    <Button size="sm" variant="secondary" onClick={() => window.location.assign(`/documents/${finalized.fileId}`)}>
                        Open Document
                    </Button>
                )}
                <DeleteMediaButton mediaId={m.id} disabled={m.status === 'processing'} />
            </TableCell>
        </TableRow>
    );
}

function FinalizeButton({ mediaId }: { mediaId: string }) {
    const qc = useQueryClient();
    const mut = useMutation({
        mutationFn: () => finalizeTranscript(mediaId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['finalized', mediaId] });
            qc.invalidateQueries({ queryKey: ['media'] });
        },
        onError: (err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Failed to finalize';
            // Show a simple alert; could be replaced with toast if desired
            alert(`Finalize failed: ${msg}`);
        }
    });
    return (
        <Button size="sm" variant="outline" disabled={mut.isPending} onClick={() => mut.mutate()}>
            {mut.isPending ? 'Finalizing…' : 'Finalize'}
        </Button>
    );
}

function ResetButton({ mediaId }: { mediaId: string }) {
    const qc = useQueryClient();
    const mut = useMutation({
        mutationFn: () => resetTranscription(mediaId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['media'] });
            qc.invalidateQueries({ queryKey: ['segmentCount', mediaId] });
            qc.invalidateQueries({ queryKey: ['segments', mediaId] });
            qc.invalidateQueries({ queryKey: ['finalized', mediaId] });
        },
        onError: (err: unknown) => {
            const msg = err instanceof Error ? err.message : 'Failed to reset';
            alert(`Reset failed: ${msg}`);
        }
    });
    return (
        <Button
            size="sm"
            variant="outline"
            disabled={mut.isPending}
            onClick={() => {
                if (confirm('Reset transcription? This deletes all segments and reverts status to uploaded.')) {
                    mut.mutate();
                }
            }}
        >
            {mut.isPending ? 'Resetting…' : 'Reset'}
        </Button>
    );
}

export default function Transcripts() {
    const [selectedProjectId] = useSelectedProject();
    const qc = useQueryClient();
    const { data: media, isLoading } = useQuery({ queryKey: ['media', selectedProjectId], queryFn: () => listMedia(selectedProjectId) });
    const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
    const projectName = projects.find(p => p.id === selectedProjectId)?.name || 'Project';
    const [expanded, setExpanded] = useState<string | null>(null);
    const [pollingIds, setPollingIds] = useState<Set<string>>(() => new Set());
    const [transcribingId, setTranscribingId] = useState<string | null>(null);
    const segQuery = useQuery({
        queryKey: ['segments', expanded],
        queryFn: () => expanded ? listSegments(expanded) : Promise.resolve([]),
        enabled: Boolean(expanded),
    });
    const participantsQuery = useQuery({
        queryKey: ['participants', expanded],
        queryFn: () => expanded ? listParticipants(expanded) : Promise.resolve([] as Participant[]),
        enabled: Boolean(expanded),
    });
    const countsQuery = useQuery({
        queryKey: ['participantCounts', expanded],
        queryFn: () => expanded ? getParticipantSegmentCounts(expanded) : Promise.resolve([] as Array<{ participantId: string | null; name: string | null; color: string | null; count: number }>),
        enabled: Boolean(expanded),
    });

    const [selectedSegs, setSelectedSegs] = useState<Set<string>>(() => new Set());
    const toggleSeg = (id: string) => setSelectedSegs(prev => { const n = new Set(prev); if (n.has(id)) { n.delete(id); } else { n.add(id); } return n; });
    const clearSelection = () => setSelectedSegs(new Set());

    const [newPart, setNewPart] = useState<{ name: string; canonicalKey?: string; color?: string }>({ name: '' });
    const createPartMut = useMutation({
        mutationFn: (data: { name: string; canonicalKey?: string; color?: string }) => createParticipant(expanded!, data),
        onSuccess: () => { setNewPart({ name: '' }); clearSelection(); },
        onSettled: () => { participantsQuery.refetch(); countsQuery.refetch(); }
    });
    const updatePartMut = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<{ name: string; canonicalKey: string; color: string }> }) => updateParticipant(expanded!, id, data),
        onSettled: () => { participantsQuery.refetch(); countsQuery.refetch(); }
    });
    const deletePartMut = useMutation({
        mutationFn: (id: string) => deleteParticipantApi(expanded!, id),
        onSettled: () => { participantsQuery.refetch(); countsQuery.refetch(); }
    });

    const [assignTarget, setAssignTarget] = useState<string | 'none'>('none');
    const assignSelectedMut = useMutation({
        mutationFn: () => assignParticipantToSegments(expanded!, { participantId: assignTarget === 'none' ? null : assignTarget, segmentIds: Array.from(selectedSegs) }),
        onSuccess: () => clearSelection(),
        onSettled: () => { segQuery.refetch(); countsQuery.refetch(); }
    });

    // Assign by time-range state + mutation
    const [rangeStart, setRangeStart] = useState('');
    const [rangeEnd, setRangeEnd] = useState('');
    const [rangeTarget, setRangeTarget] = useState<string | 'none'>('none');
    const assignRangeMut = useMutation({
        mutationFn: () => assignParticipantToSegments(expanded!, { participantId: rangeTarget === 'none' ? null : rangeTarget, startMs: hmsToMs(rangeStart), endMs: hmsToMs(rangeEnd) }),
        onSettled: () => { segQuery.refetch(); countsQuery.refetch(); }
    });

    const transcribeMut = useMutation({
        mutationFn: ({ id }: { id: string }) => createTranscriptionJob(id, {}),
        onMutate: async ({ id }) => {
            setTranscribingId(id);
            // Optimistically mark media as processing
            await qc.cancelQueries({ queryKey: ['media', selectedProjectId] });
            const prev = qc.getQueryData<MediaFile[]>(['media', selectedProjectId]);
            if (prev) {
                qc.setQueryData<MediaFile[]>(['media', selectedProjectId], prev.map(m => m.id === id ? { ...m, status: 'processing' as const } : m));
            }
            return { prev };
        },
        onSuccess: (job) => {
            // Track that this media should poll for progress now that a job exists
            setPollingIds(prev => {
                const next = new Set(prev);
                next.add(job.mediaFileId);
                return next;
            });
            qc.invalidateQueries({ queryKey: ['media', selectedProjectId] });
        },
        onSettled: () => setTranscribingId(null),
    });

    const deleteMut = useMutation({
        mutationFn: ({ id }: { id: string }) => deleteMediaApi(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['media', selectedProjectId] }),
    });

    return (
        <div className="container mx-auto p-6 space-y-4">
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
                        <BreadcrumbPage>Transcripts</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            <div className="flex items-center gap-3">
                <h1 className="text-xl font-extrabold uppercase tracking-wide">Transcripts</h1>
                <div className="ml-auto">
                    <MediaUpload projectId={selectedProjectId} onUploaded={() => qc.invalidateQueries({ queryKey: ['media', selectedProjectId] })} />
                </div>
            </div>

            <div>
                {isLoading ? <div>Loading…</div> : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Filename</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {media?.map(m => (
                                <MediaRow
                                    key={m.id}
                                    m={m}
                                    expanded={expanded}
                                    onToggleExpand={(id) => setExpanded(expanded === id ? null : id)}
                                    onTranscribe={(id) => transcribeMut.mutate({ id })}
                                    shouldPoll={pollingIds.has(m.id)}
                                    onStopPolling={(id) => setPollingIds(prev => { const next = new Set(prev); next.delete(id); return next; })}
                                    transcribingId={transcribingId}
                                />
                            ))}
                            {media && media.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-sm text-neutral-600">No media uploaded yet.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Removed inline segments panel in favor of dedicated TranscriptDetail page */}
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
