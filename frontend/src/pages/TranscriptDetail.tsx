import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listSegments, getMedia, getFinalizedTranscript, finalizeTranscript } from '@/services/api';
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
    const { data: segments } = useQuery({ queryKey: ['segments', id], queryFn: () => listSegments(id!), enabled: !!id });
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
                    <div className="p-3">
                        {segments && segments.length > 0 ? (
                            <ol className="list-decimal pl-6 space-y-1">
                                {segments.map(s => (
                                    <li key={s.id} className="text-sm">
                                        <span className="text-gray-500 mr-2">[{(s.startMs / 1000).toFixed(2)}–{(s.endMs / 1000).toFixed(2)}]</span>
                                        {s.text}
                                    </li>
                                ))}
                            </ol>
                        ) : (
                            <div className="text-sm text-neutral-600">{media.status === 'processing' ? 'Transcription in progress… segments will appear here.' : 'No segments.'}</div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="text-sm text-neutral-600">Loading media…</div>
            )}
        </div>
    );
}
