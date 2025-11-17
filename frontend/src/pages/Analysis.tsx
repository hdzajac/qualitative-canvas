import { useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
    getFiles,
    getThemes,
    getInsights,
    getHighlights,
    getProjects,
    deleteHighlight,
    deleteTheme,
    deleteInsight,
    createTheme,
    createInsight,
    updateTheme,
    updateInsight
} from '@/services/api';
import type { Theme, Insight, Highlight } from '@/types';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { ChevronRight, ChevronDown, MoreVertical, Plus, Download } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ExportDialog } from '@/components/ExportDialog';

type RowType = 'code' | 'theme' | 'insight';

interface AnalysisRow {
    id: string;
    type: RowType;
    level: number; // 0 = insight, 1 = theme, 2 = code
    name: string;
    parentId?: string; // theme ID for codes, insight ID for themes
    data: Highlight | Theme | Insight;
    children?: string[]; // IDs of child items
    selected?: boolean;
}

export default function AnalysisPage() {
    const navigate = useNavigate();
    const qc = useQueryClient();
    const [projectId] = useSelectedProject();

    const { data: files = [] } = useQuery({ queryKey: ['files', projectId], queryFn: () => getFiles(projectId), enabled: !!projectId });
    const { data: highlights = [] } = useQuery<Highlight[]>({ queryKey: ['highlights', projectId], queryFn: () => getHighlights({ projectId }), enabled: !!projectId });
    const { data: themes = [] } = useQuery<Theme[]>({ queryKey: ['themes', projectId], queryFn: () => getThemes(projectId), enabled: !!projectId });
    const { data: insights = [] } = useQuery<Insight[]>({ queryKey: ['insights', projectId], queryFn: () => getInsights(projectId), enabled: !!projectId });
    const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: getProjects });

    const projectName = projects.find(p => p.id === projectId)?.name || 'Project';

    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [expandedCodes, setExpandedCodes] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [draggedType, setDraggedType] = useState<RowType | null>(null);
    const [showCreateTheme, setShowCreateTheme] = useState(false);
    const [showCreateInsight, setShowCreateInsight] = useState(false);
    const [showExport, setShowExport] = useState(false);
    const [newName, setNewName] = useState('');

    // Build maps for quick lookups
    const highlightMap = useMemo(() => new Map(highlights.map(h => [h.id, h])), [highlights]);
    const themeMap = useMemo(() => new Map(themes.map(t => [t.id, t])), [themes]);
    const insightMap = useMemo(() => new Map(insights.map(i => [i.id, i])), [insights]);

    // Build hierarchy
    const rows = useMemo(() => {
        const result: AnalysisRow[] = [];
        const usedCodeIds = new Set<string>();
        const usedThemeIds = new Set<string>();

        // Add insights with their themes and codes
        insights.forEach(insight => {
            result.push({
                id: insight.id,
                type: 'insight',
                level: 0,
                name: insight.name,
                data: insight,
                children: insight.themeIds,
                selected: selectedIds.has(insight.id)
            });

            if (expanded[insight.id]) {
                insight.themeIds.forEach(themeId => {
                    const theme = themeMap.get(themeId);
                    if (!theme) return;
                    usedThemeIds.add(themeId);

                    result.push({
                        id: theme.id,
                        type: 'theme',
                        level: 1,
                        name: theme.name,
                        parentId: insight.id,
                        data: theme,
                        children: theme.highlightIds,
                        selected: selectedIds.has(theme.id)
                    });

                    if (expanded[theme.id]) {
                        theme.highlightIds.forEach(highlightId => {
                            const code = highlightMap.get(highlightId);
                            if (!code) return;
                            usedCodeIds.add(highlightId);

                            result.push({
                                id: code.id,
                                type: 'code',
                                level: 2,
                                name: code.codeName || 'Untitled Code',
                                parentId: theme.id,
                                data: code,
                                selected: selectedIds.has(code.id)
                            });
                        });
                    }
                });
            }
        });

        // Add unassigned themes with their codes
        themes.forEach(theme => {
            if (usedThemeIds.has(theme.id)) return;

            result.push({
                id: theme.id,
                type: 'theme',
                level: 0,
                name: theme.name,
                data: theme,
                children: theme.highlightIds,
                selected: selectedIds.has(theme.id)
            });

            if (expanded[theme.id]) {
                theme.highlightIds.forEach(highlightId => {
                    const code = highlightMap.get(highlightId);
                    if (!code) return;
                    usedCodeIds.add(highlightId);

                    result.push({
                        id: code.id,
                        type: 'code',
                        level: 1,
                        name: code.codeName || 'Untitled Code',
                        parentId: theme.id,
                        data: code,
                        selected: selectedIds.has(code.id)
                    });
                });
            }
        });

        // Add unassigned codes
        highlights.forEach(code => {
            if (usedCodeIds.has(code.id)) return;

            result.push({
                id: code.id,
                type: 'code',
                level: 0,
                name: code.codeName || 'Untitled Code',
                data: code,
                selected: selectedIds.has(code.id)
            });
        });

        return result;
    }, [insights, themes, highlights, expanded, highlightMap, themeMap, selectedIds]);

    const toggleExpanded = (id: string) => {
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const toggleCodeExpanded = (id: string) => {
        setExpandedCodes(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleSelected = (id: string, event: React.MouseEvent) => {
        event.stopPropagation();
        if (event.metaKey || event.ctrlKey || event.shiftKey) {
            setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) {
                    next.delete(id);
                } else {
                    next.add(id);
                }
                return next;
            });
        } else {
            setSelectedIds(new Set([id]));
        }
    };

    const handleClickOutside = useCallback(() => {
        setSelectedIds(new Set());
    }, []);

    // Mutations
    const createThemeMut = useMutation({
        mutationFn: async (data: { name: string; highlightIds: string[] }) => {
            if (!projectId) throw new Error('No project selected');
            return createTheme({ ...data, projectId });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['themes', projectId] });
            setSelectedIds(new Set());
            setShowCreateTheme(false);
            setNewName('');
            toast.success('Theme created');
        }
    });

    const createInsightMut = useMutation({
        mutationFn: async (data: { name: string; themeIds: string[] }) => {
            if (!projectId) throw new Error('No project selected');
            return createInsight({ ...data, projectId });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['insights', projectId] });
            setSelectedIds(new Set());
            setShowCreateInsight(false);
            setNewName('');
            toast.success('Insight created');
        }
    });

    const updateThemeMut = useMutation({
        mutationFn: async (data: { id: string; highlightIds: string[] }) => {
            return updateTheme(data.id, { highlightIds: data.highlightIds });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['themes', projectId] });
            toast.success('Theme updated');
        }
    });

    const updateInsightMut = useMutation({
        mutationFn: async (data: { id: string; themeIds: string[] }) => {
            return updateInsight(data.id, { themeIds: data.themeIds });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['insights', projectId] });
            toast.success('Insight updated');
        }
    });

    // Drag and drop handlers
    const handleDragStart = (row: AnalysisRow, event: React.DragEvent) => {
        setDraggedId(row.id);
        setDraggedType(row.type);
        event.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (targetRow: AnalysisRow, event: React.DragEvent) => {
        event.preventDefault();
        if (!draggedId || !draggedType) return;

        // Can drop codes onto themes
        if (draggedType === 'code' && targetRow.type === 'theme') {
            const theme = targetRow.data as Theme;
            if (!theme.highlightIds.includes(draggedId)) {
                await updateThemeMut.mutateAsync({
                    id: theme.id,
                    highlightIds: [...theme.highlightIds, draggedId]
                });
            }
        }
        // Can drop themes onto insights
        else if (draggedType === 'theme' && targetRow.type === 'insight') {
            const insight = targetRow.data as Insight;
            if (!insight.themeIds.includes(draggedId)) {
                await updateInsightMut.mutateAsync({
                    id: insight.id,
                    themeIds: [...insight.themeIds, draggedId]
                });
            }
        }
        // Can drop multiple codes from selection
        else if (selectedIds.size > 0 && targetRow.type === 'theme') {
            const theme = targetRow.data as Theme;
            const selectedCodes = Array.from(selectedIds).filter(id => highlightMap.has(id));
            const newIds = [...new Set([...theme.highlightIds, ...selectedCodes])];
            await updateThemeMut.mutateAsync({
                id: theme.id,
                highlightIds: newIds
            });
        }
        // Can drop multiple themes from selection
        else if (selectedIds.size > 0 && targetRow.type === 'insight') {
            const insight = targetRow.data as Insight;
            const selectedThemes = Array.from(selectedIds).filter(id => themeMap.has(id));
            const newIds = [...new Set([...insight.themeIds, ...selectedThemes])];
            await updateInsightMut.mutateAsync({
                id: insight.id,
                themeIds: newIds
            });
        }

        setDraggedId(null);
        setDraggedType(null);
    };

    const handleCreateThemeFromSelection = () => {
        const selectedCodes = Array.from(selectedIds).filter(id => highlightMap.has(id));
        if (selectedCodes.length === 0) {
            toast.error('Select at least one code');
            return;
        }
        setShowCreateTheme(true);
    };

    const handleCreateInsightFromSelection = () => {
        const selectedThemes = Array.from(selectedIds).filter(id => themeMap.has(id));
        if (selectedThemes.length === 0) {
            toast.error('Select at least one theme');
            return;
        }
        setShowCreateInsight(true);
    };

    const handleConfirmCreateTheme = () => {
        const selectedCodes = Array.from(selectedIds).filter(id => highlightMap.has(id));
        if (!newName.trim() || selectedCodes.length === 0) {
            toast.error('Enter a name and select codes');
            return;
        }
        createThemeMut.mutate({ name: newName.trim(), highlightIds: selectedCodes });
    };

    const handleConfirmCreateInsight = () => {
        const selectedThemes = Array.from(selectedIds).filter(id => themeMap.has(id));
        if (!newName.trim() || selectedThemes.length === 0) {
            toast.error('Enter a name and select themes');
            return;
        }
        createInsightMut.mutate({ name: newName.trim(), themeIds: selectedThemes });
    };

    const handleDelete = async (row: AnalysisRow) => {
        if (!confirm(`Delete this ${row.type}?`)) return;

        try {
            if (row.type === 'code') {
                await deleteHighlight(row.id);
                qc.invalidateQueries({ queryKey: ['highlights', projectId] });
            } else if (row.type === 'theme') {
                await deleteTheme(row.id);
                qc.invalidateQueries({ queryKey: ['themes', projectId] });
            } else if (row.type === 'insight') {
                await deleteInsight(row.id);
                qc.invalidateQueries({ queryKey: ['insights', projectId] });
            }
            toast.success('Deleted');
        } catch (error) {
            toast.error('Failed to delete');
        }
    };

    const selectedCodes = Array.from(selectedIds).filter(id => highlightMap.has(id));
    const selectedThemes = Array.from(selectedIds).filter(id => themeMap.has(id));

    return (
        <div className="container mx-auto p-6 space-y-4" onClick={handleClickOutside}>
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
                        <BreadcrumbPage>Analysis</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            <div className="flex items-center justify-between">
                <h1 className="text-xl font-extrabold uppercase tracking-wide">Analysis</h1>
                <div className="flex gap-2">
                    {selectedCodes.length > 0 && (
                        <Button size="sm" onClick={handleCreateThemeFromSelection}>
                            <Plus className="w-4 h-4 mr-1" />
                            Create Theme ({selectedCodes.length})
                        </Button>
                    )}
                    {selectedThemes.length > 0 && (
                        <Button size="sm" onClick={handleCreateInsightFromSelection}>
                            <Plus className="w-4 h-4 mr-1" />
                            Create Insight ({selectedThemes.length})
                        </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setShowExport(true)}>
                        <Download className="w-4 h-4 mr-1" />
                        Export
                    </Button>
                </div>
            </div>

            <div className="border-2 border-black" onClick={(e) => e.stopPropagation()}>
                <div className="grid grid-cols-[auto_1fr_auto_auto] border-b-2 border-black bg-secondary/50 font-semibold text-xs uppercase tracking-wide">
                    <div className="p-2 border-r-2 border-black w-8"></div>
                    <div className="p-2 border-r-2 border-black">Name</div>
                    <div className="p-2 border-r-2 border-black w-24 text-center">Children</div>
                    <div className="p-2 w-16"></div>
                </div>

                {rows.length === 0 ? (
                    <div className="p-8 text-center text-neutral-600">
                        No codes, themes, or insights yet.
                    </div>
                ) : (
                    <div>
                        {rows.map(row => (
                            <div key={row.id}>
                                <div
                                    draggable
                                    onDragStart={(e) => handleDragStart(row, e)}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(row, e)}
                                    className={`
                                        grid grid-cols-[auto_1fr_auto_auto] border-b border-neutral-200 
                                        transition-colors
                                        ${row.selected ? 'bg-primary/10 hover:bg-primary/15' : 'hover:bg-neutral-50'}
                                        ${row.type === 'insight' ? 'font-semibold bg-primary/5' : ''}
                                        ${row.type === 'theme' ? 'bg-accent/5' : ''}
                                    `}
                                >
                                    <div
                                        className="p-2 flex items-center cursor-pointer border-r border-neutral-200"
                                        style={{ paddingLeft: `${row.level * 1.5 + 0.5}rem` }}
                                        onClick={() => row.children && row.children.length > 0 && toggleExpanded(row.id)}
                                    >
                                        {row.children && row.children.length > 0 && (
                                            expanded[row.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                                        )}
                                    </div>

                                    <div
                                        className="p-2 flex items-start gap-2 border-r border-neutral-200"
                                    >
                                        <div className="flex items-center gap-2 cursor-pointer flex-1 min-w-0" onClick={(e) => toggleSelected(row.id, e)}>
                                            <span className={`
                                                inline-flex px-2 py-0.5 rounded text-[10px] uppercase font-semibold tracking-wide shrink-0
                                                ${row.type === 'insight' ? 'bg-[#f59e0b] text-white' : ''}
                                                ${row.type === 'theme' ? 'bg-[#10b981] text-white' : ''}
                                                ${row.type === 'code' ? 'bg-[#2563eb] text-white' : ''}
                                            `}>
                                                {row.type}
                                            </span>
                                            <span className="truncate">{row.name}</span>
                                        </div>
                                        {row.type === 'code' && (
                                            <div className="flex items-center gap-1 ml-auto shrink-0">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); toggleCodeExpanded(row.id); }}
                                                    className="text-xs text-neutral-500 hover:text-neutral-700 px-2 py-0.5 hover:bg-neutral-100 rounded transition-colors"
                                                    title={expandedCodes.has(row.id) ? "Collapse highlight" : "Expand highlight"}
                                                >
                                                    {expandedCodes.has(row.id) ? 'Collapse' : 'Expand'}
                                                </button>
                                            </div>
                                        )}
                                    </div>                                    <div className="p-2 flex items-center justify-center border-r border-neutral-200 text-sm text-neutral-600">
                                        {row.children?.length || 0}
                                    </div>

                                    <div className="p-2 flex items-center justify-center">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button size="icon" variant="ghost" className="h-7 w-7">
                                                    <MoreVertical className="w-4 h-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                {row.type === 'code' && (
                                                    <DropdownMenuItem onClick={() => navigate(`/documents/${(row.data as Highlight).fileId}`)}>
                                                        Open in Document
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuItem onClick={() => handleDelete(row)} className="text-red-600">
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                                {row.type === 'code' && expandedCodes.has(row.id) && (
                                    <div className="bg-neutral-50 border-b border-neutral-200 px-4 py-3" style={{ marginLeft: `${(row.level * 1.5 + 0.5) * 16}px` }}>
                                        <div className="text-sm text-neutral-700 whitespace-pre-wrap font-mono">
                                            {(row.data as Highlight).text}
                                        </div>
                                        <div className="mt-2 text-xs text-neutral-500">
                                            From: {(row.data as Highlight).fileName || 'Unknown file'}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create Theme Dialog */}
            <Dialog open={showCreateTheme} onOpenChange={setShowCreateTheme}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Theme from {selectedCodes.length} Codes</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Theme Name</label>
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Enter theme name..."
                                autoFocus
                            />
                        </div>
                        <div className="text-sm text-neutral-600">
                            Selected codes: {selectedCodes.map(id => highlightMap.get(id)?.codeName || 'Untitled').join(', ')}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateTheme(false)}>Cancel</Button>
                        <Button onClick={handleConfirmCreateTheme} disabled={createThemeMut.isPending}>
                            {createThemeMut.isPending ? 'Creating...' : 'Create Theme'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Insight Dialog */}
            <Dialog open={showCreateInsight} onOpenChange={setShowCreateInsight}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Insight from {selectedThemes.length} Themes</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium mb-1 block">Insight Name</label>
                            <Input
                                value={newName}
                                onChange={(e) => setNewName(e.target.value)}
                                placeholder="Enter insight name..."
                                autoFocus
                            />
                        </div>
                        <div className="text-sm text-neutral-600">
                            Selected themes: {selectedThemes.map(id => themeMap.get(id)?.name || 'Untitled').join(', ')}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCreateInsight(false)}>Cancel</Button>
                        <Button onClick={handleConfirmCreateInsight} disabled={createInsightMut.isPending}>
                            {createInsightMut.isPending ? 'Creating...' : 'Create Insight'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Export Dialog */}
            {projectId && (
                <ExportDialog
                    projectId={projectId}
                    projectName={projectName}
                    open={showExport}
                    onOpenChange={setShowExport}
                />
            )}
        </div>
    );
}
