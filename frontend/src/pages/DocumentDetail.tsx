import { useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getFile, getHighlights, getProjects } from '@/services/api';
import type { Highlight } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TextViewer, TextViewerHandle } from '@/components/TextViewer';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

export default function DocumentDetail() {
    const { id } = useParams<{ id: string }>();

    const { data: file } = useQuery({ queryKey: ['file', id], queryFn: () => getFile(id!), enabled: !!id });
    const { data: highlights = [], refetch: refetchHighlights } = useQuery<Highlight[]>({ queryKey: ['highlights', id], queryFn: () => getHighlights({ fileId: id! }), enabled: !!id });
    const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });

    const viewerRef = useRef<TextViewerHandle>(null);
    const docHighlights = highlights; // already filtered by server

    if (!id || !file) return null;

    const projectName = projects.find(p => p.id === file.projectId)?.name || 'Project';

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
                        <BreadcrumbLink href="/documents">Documents</BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>{file.filename}</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            <div className="flex gap-4">
                <div className="basis-3/4 min-w-0" id="transcript-container">
                    <Card className="brutal-card">
                        <CardHeader><CardTitle>Transcript</CardTitle></CardHeader>
                        <CardContent>
                            <TextViewer ref={viewerRef} fileId={file.id} content={file.content} highlights={docHighlights} onHighlightCreated={() => refetchHighlights()} />
                        </CardContent>
                    </Card>
                </div>

                <div className="basis-1/4 min-w-0">
                    <Card className="brutal-card">
                        <CardHeader><CardTitle>Codes</CardTitle></CardHeader>
                        <CardContent>
                            {docHighlights.length === 0 ? (
                                <div className="text-sm text-neutral-600">No codes yet.</div>
                            ) : (
                                <div className="space-y-2 max-h-[75vh] overflow-auto">
                                    {docHighlights.map(h => (
                                        <button
                                            key={h.id}
                                            className="w-full text-left p-2 border-2 border-black hover:bg-indigo-50"
                                            title={h.codeName}
                                            onClick={() => { viewerRef.current?.scrollToOffset(h.startOffset); viewerRef.current?.flashAtOffset(h.startOffset); }}
                                        >
                                            <div className="text-xs text-neutral-500">{h.codeName}</div>
                                            <div className="text-sm truncate">{h.text}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
