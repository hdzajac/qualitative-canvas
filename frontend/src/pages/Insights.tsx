import { useMemo, useState, Fragment } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getFiles, getInsights, getHighlights, deleteInsight, getProjects, getThemes } from '@/services/api';
import type { Insight, Highlight, Theme } from '@/types';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { useNavigate } from 'react-router-dom';
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';

export default function Insights() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [projectId] = useSelectedProject();

    const { data: files = [] } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId), enabled: !!projectId });
    const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });
    const { data: insights = [] } = useQuery<Insight[]>({ queryKey: ['insights', projectId], queryFn: () => getInsights(projectId), enabled: !!projectId });
    const { data: themes = [] } = useQuery<Theme[]>({ queryKey: ['themes', projectId], queryFn: () => getThemes(projectId), enabled: !!projectId });
    const { data: highlights = [] } = useQuery<Highlight[]>({ queryKey: ['highlights', projectId], queryFn: () => getHighlights({ projectId }), enabled: !!projectId });

    const projectName = projects.find(p => p.id === projectId)?.name || 'Project';

    const themeMap = useMemo(() => new Map(themes.map(t => [t.id, t] as const)), [themes]);
    const highlightMap = useMemo(() => new Map(highlights.map(h => [h.id, h] as const)), [highlights]);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});

    const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

    const resolveHighlightIds = (ins: Insight) => {
        const set = new Set<string>();
        for (const tid of ins.themeIds) {
            const t = themeMap.get(tid);
            if (t) for (const hid of t.highlightIds) set.add(hid);
        }
        return Array.from(set);
    };

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
                        <BreadcrumbPage>Insights</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            <h1 className="text-xl font-extrabold uppercase tracking-wide">Insights</h1>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-8"> </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>From Codes</TableHead>
                        <TableHead>Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {insights.map(ins => {
                        const resolvedHighlightIds = resolveHighlightIds(ins);
                        return (
                            <Fragment key={ins.id}>
                                <TableRow className="cursor-pointer" onClick={() => toggle(ins.id)}>
                                    <TableCell>{expanded[ins.id] ? '-' : '+'}</TableCell>
                                    <TableCell className="font-semibold">{ins.name}</TableCell>
                                    <TableCell>{resolvedHighlightIds.length}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-2 justify-end">
                                            {resolvedHighlightIds.length > 0 && (() => {
                                                const first = highlightMap.get(resolvedHighlightIds[0]);
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
                                                            if (!confirm('Delete this insight?')) return;
                                                            await deleteInsight(ins.id);
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
                                {expanded[ins.id] && resolvedHighlightIds.map((hid, idx) => {
                                    const h = highlightMap.get(hid);
                                    if (!h) return null;
                                    return (
                                        <TableRow key={`${ins.id}-${hid}-${idx}`} className="bg-neutral-50">
                                            <TableCell />
                                            <TableCell colSpan={3}>
                                                <div className="text-xs text-neutral-500">{h.codeName}</div>
                                                <div className="text-sm">{h.text}</div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </Fragment>
                        );
                    })}
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
