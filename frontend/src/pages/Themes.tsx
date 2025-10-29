import { useMemo, useState, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFiles, getThemes, getHighlights, deleteTheme } from '@/services/api';
import type { Theme, Highlight } from '@/types';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { useNavigate } from 'react-router-dom';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';

export default function Themes() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [projectId] = useSelectedProject();
    const { data: files = [] } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId), enabled: !!projectId });
    const { data: themes = [] } = useQuery<Theme[]>({ queryKey: ['themes', projectId], queryFn: () => getThemes(projectId), enabled: !!projectId });
    const { data: highlights = [] } = useQuery<Highlight[]>({ queryKey: ['highlights', projectId], queryFn: () => getHighlights({ projectId }), enabled: !!projectId });

    const fileIds = useMemo(() => new Set(files.map(f => f.id)), [files]);
    const projectHighlights = useMemo(() => highlights.filter(h => fileIds.has(h.fileId)), [highlights, fileIds]);
    const highlightById = useMemo(() => new Map(projectHighlights.map(h => [h.id, h] as const)), [projectHighlights]);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    return (
        <div className="container mx-auto p-6 space-y-4">
            <h1 className="text-xl font-extrabold uppercase tracking-wide">Themes</h1>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-8"> </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Codes</TableHead>
                        <TableHead>Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {themes.map(t => (
                        <Fragment key={t.id}>
                            <TableRow className="cursor-pointer" onClick={() => toggle(t.id)}>
                                <TableCell>{expanded[t.id] ? '-' : '+'}</TableCell>
                                <TableCell className="font-semibold">{t.name}</TableCell>
                                <TableCell>{t.highlightIds.length}</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2 justify-end">
                                        {t.highlightIds.length > 0 && (() => {
                                            const first = highlightById.get(t.highlightIds[0]);
                                            if (!first) return null;
                                            return (
                                                <Button size="sm" variant="outline" className="rounded-none h-7 px-2" onClick={(e) => { e.stopPropagation(); navigate(`/documents/${first.fileId}`); }}>
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
                                                        if (!confirm('Delete this theme?')) return;
                                                        await deleteTheme(t.id);
                                                        qc.invalidateQueries({ queryKey: ['themes', projectId] });
                                                    }}
                                                >
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </TableCell>
                            </TableRow>
                            {expanded[t.id] && t.highlightIds.map((hid, idx) => {
                                const h = highlightById.get(hid);
                                if (!h) return null;
                                return (
                                    <TableRow key={`${t.id}-${hid}-${idx}`} className="bg-neutral-50">
                                        <TableCell />
                                        <TableCell colSpan={3}>
                                            <div className="text-xs text-neutral-500">{h.codeName}</div>
                                            <div className="text-sm">{h.text}</div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </Fragment>
                    ))}
                    {themes.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={4} className="text-sm text-neutral-600">No themes yet.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    );
}
