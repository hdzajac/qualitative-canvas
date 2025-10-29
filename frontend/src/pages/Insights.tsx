import { useMemo, useState, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFiles, getThemes, getInsights, getHighlights, deleteInsight } from '@/services/api';
import type { Theme, Insight, Highlight } from '@/types';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

export default function Insights() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [projectId] = useSelectedProject();
    const { data: files = [] } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId), enabled: !!projectId });
    const { data: themes = [] } = useQuery<Theme[]>({ queryKey: ['themes', projectId], queryFn: () => getThemes(projectId), enabled: !!projectId });
    const { data: highlights = [] } = useQuery<Highlight[]>({ queryKey: ['highlights', projectId], queryFn: () => getHighlights({ projectId }), enabled: !!projectId });
    const { data: insights = [] } = useQuery<Insight[]>({ queryKey: ['insights', projectId], queryFn: () => getInsights(projectId), enabled: !!projectId });

    const fileIds = useMemo(() => new Set(files.map(f => f.id)), [files]);
    const projectHighlights = useMemo(() => highlights.filter(h => fileIds.has(h.fileId)), [highlights, fileIds]);
    const highlightById = useMemo(() => new Map(projectHighlights.map(h => [h.id, h] as const)), [projectHighlights]);
    const themeById = useMemo(() => new Map(themes.map(t => [t.id, t] as const)), [themes]);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    return (
        <div className="container mx-auto p-6 space-y-4">
            <h1 className="text-xl font-extrabold uppercase tracking-wide">Insights</h1>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-8"> </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Themes</TableHead>
                        <TableHead>Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {insights.map(i => (
                        <Fragment key={i.id}>
                            <TableRow className="cursor-pointer" onClick={() => toggle(i.id)}>
                                <TableCell>{expanded[i.id] ? '-' : '+'}</TableCell>
                                <TableCell className="font-semibold">{i.name}</TableCell>
                                <TableCell>{i.themeIds.length}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2 justify-end">
                                        {(() => {
                                            const firstTheme = themeById.get(i.themeIds[0]);
                                            const firstHighlightId = firstTheme?.highlightIds[0];
                                            const firstHighlight = firstHighlightId ? highlightById.get(firstHighlightId) : undefined;
                                            if (!firstHighlight) return null;
                                            return (
                                                <Button size="sm" variant="outline" className="rounded-none h-7 px-2" onClick={(e) => { e.stopPropagation(); navigate(`/documents/${firstHighlight.fileId}`); }}>
                                                    Open source
                                                </Button>
                                            );
                                        })()}
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button size="icon" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => e.stopPropagation()}>
                                                    <MoreHorizontal className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    className="text-red-600"
                                                    onClick={async (e) => {
                                                        e.stopPropagation();
                                                        if (!confirm('Delete this insight?')) return;
                                                        await deleteInsight(i.id);
                                                        qc.invalidateQueries({ queryKey: ['insights', projectId] });
                                                    }}
                                                >
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </TableCell>
                            </TableRow>
                            {expanded[i.id] && i.themeIds.map((tid, idx) => {
                                const t = themeById.get(tid);
                                if (!t) return null;
                                return (
                                    <TableRow key={`${i.id}-${tid}-${idx}`} className="bg-neutral-50">
                                        <TableCell />
                                        <TableCell colSpan={3}>
                                            <div className="font-semibold uppercase tracking-wide">{t.name}</div>
                                            <div className="mt-2 space-y-1">
                                                {t.highlightIds.map((hid, hidx) => {
                                                    const h = highlightById.get(hid);
                                                    if (!h) return null;
                                                    return (
                                                        <div key={`${tid}-${hid}-${hidx}`} className="text-sm">
                                                            <span className="text-xs text-neutral-500">{h.codeName}: </span>
                                                            {h.text}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </Fragment>
                    ))}
                    {insights.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={4} className="text-sm text-neutral-600">No insights yet.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
