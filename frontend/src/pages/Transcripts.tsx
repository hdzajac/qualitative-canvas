import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listMedia, uploadMedia, createTranscriptionJob, listSegments } from '@/services/api';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export default function Transcripts() {
    const [selectedProjectId] = useSelectedProject();
    const qc = useQueryClient();
    const { data: media, isLoading } = useQuery({ queryKey: ['media', selectedProjectId], queryFn: () => listMedia(selectedProjectId) });
    const [expanded, setExpanded] = useState<string | null>(null);
    const segQuery = useQuery({
        queryKey: ['segments', expanded],
        queryFn: () => expanded ? listSegments(expanded) : Promise.resolve([]),
        enabled: Boolean(expanded),
    });

    const uploadMut = useMutation({
        mutationFn: ({ file }: { file: File }) => uploadMedia(file, selectedProjectId || undefined),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['media', selectedProjectId] }),
    });

    const transcribeMut = useMutation({
        mutationFn: ({ id }: { id: string }) => createTranscriptionJob(id, {}),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['media', selectedProjectId] }),
    });

    return (
        <div className="p-6 flex flex-col gap-6">
            <div className="flex items-center gap-4">
                <input type="file" onChange={(e) => {
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
                                <tr key={m.id} className="border-b">
                                    <td className="p-2 border">{m.originalFilename}</td>
                                    <td className="p-2 border">{m.status}{m.errorMessage ? ` (${m.errorMessage})` : ''}</td>
                                    <td className="p-2 border">{m.sizeBytes ?? 0}</td>
                                    <td className="p-2 border flex gap-2">
                                        <Button size="sm" variant="outline" onClick={() => transcribeMut.mutate({ id: m.id })} disabled={m.status === 'processing'}>
                                            Transcribe
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                                            {expanded === m.id ? 'Hide segments' : 'Show segments'}
                                        </Button>
                                    </td>
                                </tr>
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
