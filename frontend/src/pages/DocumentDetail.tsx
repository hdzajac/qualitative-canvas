import { useRef, useMemo, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getFile, getHighlights, getProjects } from '@/services/api';
import type { Highlight } from '@/types';
import { TextViewer, TextViewerHandle } from '@/components/TextViewer';
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

export default function DocumentDetail() {
    const { id } = useParams<{ id: string }>();

    const { data: file } = useQuery({ queryKey: ['file', id], queryFn: () => getFile(id!), enabled: !!id });
    const { data: highlights = [], refetch: refetchHighlights } = useQuery<Highlight[]>({ queryKey: ['highlights', id], queryFn: () => getHighlights({ fileId: id! }), enabled: !!id });
    const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });

    const viewerRef = useRef<TextViewerHandle>(null);
    const [panelHeight, setPanelHeight] = useState<number>(0);
    const [marks, setMarks] = useState<Array<{ id: string; codeName: string; text: string; top: number; startOffset: number; endOffset: number }>>([]);
    const docHighlights = highlights; // already filtered by server
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
                        <BreadcrumbPage>Documents</BreadcrumbPage>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                        <BreadcrumbPage>{file.filename}</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            <div className="border-2 border-black p-4">
                <div className="grid grid-cols-[3fr_1fr] gap-6">
                    <div>
                        <h2 className="text-base md:text-lg font-bold uppercase tracking-wide mb-2">Document</h2>
                        <div id="transcript-container">
                            <TextViewer
                                ref={viewerRef}
                                fileId={file.id}
                                content={file.content}
                                highlights={docHighlights}
                                onHighlightCreated={() => refetchHighlights()}
                                // Treat finalized transcripts (*.transcript.txt) as VTT-like for nicer rendering
                                isVtt={/\.(vtt|transcript\.txt)$/i.test(file.filename)}
                                framed={false}
                            />
                        </div>
                    </div>
                    <div>
                        <h2 className="text-base md:text-lg font-bold uppercase tracking-wide mb-2">Codes</h2>
                        <div className="pl-4 border-l-2 border-black">
                            {sortedByOffset.length === 0 ? (
                                <div className="text-sm text-neutral-600">No codes yet.</div>
                            ) : panelHeight > 0 ? (
                                <div className="relative" style={{ height: `${panelHeight}px` }} aria-label="Codes Rail">
                                    {marks.map(m => (
                                        <button
                                            key={m.id}
                                            className="absolute left-0 -translate-y-1/2 brutal-card shadow-none border-2 border-neutral-800 bg-white px-2 py-1 text-xs text-neutral-900 hover:bg-indigo-50"
                                            style={{ top: `${m.top}px` }}
                                            title={m.codeName}
                                            onClick={() => { viewerRef.current?.scrollToOffset(m.startOffset); viewerRef.current?.flashAtRange(m.startOffset, m.endOffset); }}
                                        >
                                            {m.codeName}
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {sortedByOffset.map(h => (
                                        <button
                                            key={h.id}
                                            className="block text-left brutal-card shadow-none border-2 border-neutral-800 bg-white px-2 py-1 text-xs text-neutral-900 hover:bg-indigo-50"
                                            title={h.codeName}
                                            onClick={() => { viewerRef.current?.scrollToOffset(h.startOffset); viewerRef.current?.flashAtRange(h.startOffset, h.endOffset); }}
                                        >
                                            {h.codeName}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
