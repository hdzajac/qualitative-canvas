import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listMedia, uploadMedia, createTranscriptionJob, listSegments, getLatestJobForMedia, deleteMedia as deleteMediaApi } from '@/services/api';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { Button } from '@/components/ui/button';
import { useMemo, useState } from 'react';

function formatEta(seconds?: number) {
    if (seconds == null || seconds < 0) return '';
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const m = Math.floor((seconds / 60) % 60).toString().padStart(2, '0');
    const h = Math.floor(seconds / 3600);
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
}

import type { MediaFile, TranscriptionJob } from '@/types';

interface MediaRowProps { m: MediaFile; expanded: string | null; onToggleExpand: (id: string) => void; onTranscribe: (id: string) => void; shouldPoll: boolean; disabled?: boolean }

function MediaRow({ m, expanded, onToggleExpand, onTranscribe, shouldPoll }: MediaRowProps) {
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
    let progressDisplay: string = m.status;
    if (m.status === 'processing') {
        const processedMs = job?.processedMs;
        const totalMs = job?.totalMs;
        const etaSeconds = job?.etaSeconds;
        const jobStatus = job?.status;
        if (processedMs != null && totalMs != null && totalMs > 0) {
            const pct = Math.min(100, Math.round((processedMs / totalMs) * 100));
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
    }
    return (
        <tr key={m.id} className="border-b">
            <td className="p-2 border">{m.originalFilename}</td>
            <td className="p-2 border whitespace-nowrap">{progressDisplay}{m.errorMessage ? ` (${m.errorMessage})` : ''}</td>
            <td className="p-2 border">{m.sizeBytes ?? 0}</td>
            <td className="p-2 border flex gap-2">
                <Button size="sm" variant="outline" onClick={() => onTranscribe(m.id)} disabled={m.status === 'processing'}>
                    Transcribe
                </Button>
                <Button size="sm" variant="outline" onClick={() => onToggleExpand(m.id)}>
                    {expanded === m.id ? 'Hide segments' : 'Show segments'}
                </Button>
                <DeleteMediaButton mediaId={m.id} disabled={m.status === 'processing'} />
            </td>
        </tr>
    );
}

export default function Transcripts() {
    const [selectedProjectId] = useSelectedProject();
    const qc = useQueryClient();
    const { data: media, isLoading } = useQuery({ queryKey: ['media', selectedProjectId], queryFn: () => listMedia(selectedProjectId) });
    const [expanded, setExpanded] = useState<string | null>(null);
    const [pollingIds, setPollingIds] = useState<Set<string>>(() => new Set());
    const segQuery = useQuery({
        queryKey: ['segments', expanded],
        queryFn: () => expanded ? listSegments(expanded) : Promise.resolve([]),
        enabled: Boolean(expanded),
    });

    const uploadMut = useMutation({
        mutationFn: ({ file }: { file: File }) => {
            if (!selectedProjectId) throw new Error('Select a project before uploading media');
            return uploadMedia(file, selectedProjectId);
        },
        onSuccess: () => qc.invalidateQueries({ queryKey: ['media', selectedProjectId] }),
    });

    const transcribeMut = useMutation({
        mutationFn: ({ id }: { id: string }) => createTranscriptionJob(id, {}),
        onSuccess: (job) => {
            // Track that this media should poll for progress now that a job exists
            setPollingIds(prev => {
                const next = new Set(prev);
                next.add(job.mediaFileId);
                return next;
            });
            qc.invalidateQueries({ queryKey: ['media', selectedProjectId] });
        },
    });

    const deleteMut = useMutation({
        mutationFn: ({ id }: { id: string }) => deleteMediaApi(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['media', selectedProjectId] }),
    });

    return (
        <div className="p-6 flex flex-col gap-6">
            <div className="flex items-center gap-4">
                <input type="file" disabled={!selectedProjectId} title={!selectedProjectId ? 'Select a project first' : ''} onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadMut.mutate({ file: f });
                }} />
                {uploadMut.isPending && <span>Uploading…</span>}
            </div>

            <div>
                <h2 className="font-bold text-lg mb-2">Media Files</h2>
                {isLoading ? <div>Loading…</div> : (
                    <table className="w-full text-sm border">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="text-left p-2 border">Filename</th>
                                <th className="text-left p-2 border">Status</th>
                                <th className="text-left p-2 border">Size</th>
                                <th className="text-left p-2 border">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {media?.map(m => (
                                <MediaRow
                                    key={m.id}
                                    m={m}
                                    expanded={expanded}
                                    onToggleExpand={(id) => setExpanded(expanded === id ? null : id)}
                                    onTranscribe={(id) => transcribeMut.mutate({ id })}
                                    shouldPoll={pollingIds.has(m.id)}
                                />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {expanded && segQuery.data && (
                <div>
                    <h3 className="font-semibold">Segments for media {expanded}</h3>
                    <ol className="list-decimal pl-6">
                        {segQuery.data.map(s => (
                            <li key={s.id} className="py-1">
                                <span className="text-gray-500 mr-2">[{(s.startMs / 1000).toFixed(2)}–{(s.endMs / 1000).toFixed(2)}]</span>
                                {s.text}
                            </li>
                        ))}
                    </ol>
                </div>
            )}
        </div>
    );
}
