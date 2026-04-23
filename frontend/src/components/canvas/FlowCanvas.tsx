import { useCallback, useEffect, useRef } from 'react';
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    Controls,
    useNodesState,
    type Node,
    type OnNodesChange,
    type OnNodeDrag,
    type NodeTypes,
    type OnSelectionChangeFunc,
    type NodePositionChange,
    applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Highlight, Theme, Insight, Annotation, UploadedFile } from '@/types';
import {
    updateHighlight,
    updateTheme,
    updateInsight,
    updateAnnotation,
    deleteAnnotation as apiDeleteAnnotation,
    deleteTheme,
    deleteInsight,
} from '@/services/api';
import { toast } from 'sonner';

import CodeCard, { type CodeCardData, type CodeCardParent } from './nodes/CodeCard';
import ThemeCard, { type ThemeCardData } from './nodes/ThemeCard';
import InsightCard, { type InsightCardData } from './nodes/InsightCard';
import AnnotationNode, { type AnnotationNodeData } from './nodes/AnnotationNode';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_W = 200;
const DEFAULT_H = 60;
const DEFAULT_ANNOTATION_W = 160;
const DEFAULT_ANNOTATION_H = 60;

/** World-space pixel radius within which the field is visible */
const FIELD_RADIUS = 300;
/** Closer threshold at which the drop commits the group */
const SNAP_THRESHOLD = 140;

/** Base field ring radius (px) when parent has no children */
const BASE_FIELD_RADIUS = 180;
/** Padding beyond outermost child edge */
const FIELD_PADDING = 60;

const NODE_TYPES: NodeTypes = {
    code: CodeCard,
    theme: ThemeCard,
    insight: InsightCard,
    annotation: AnnotationNode,
};

// Theme accent colours — must stay in sync with ThemeCard.tsx
const THEME_COLOR = '#10b981';

// ─── Layout helpers ────────────────────────────────────────────────────────────

/**
 * Compute the minimum field ring radius that encloses all children.
 * Returns BASE_FIELD_RADIUS when there are no children.
 */
function computeFieldRadius(
    childOffsets: { dx: number; dy: number }[],
    childSize: { w: number; h: number } = { w: DEFAULT_W, h: DEFAULT_H },
): number {
    if (childOffsets.length === 0) return BASE_FIELD_RADIUS;
    const maxDist = Math.max(
        ...childOffsets.map((o) =>
            Math.hypot(o.dx, o.dy) + Math.max(childSize.w, childSize.h) / 2,
        ),
    );
    return Math.max(BASE_FIELD_RADIUS, maxDist + FIELD_PADDING);
}

/**
 * Place a new child so it doesn't overlap existing siblings.
 * Spirals outward in rings of N_ANGLES candidates each.
 * Returns { dx, dy } offset from parent centre.
 */
function placeNewChild(
    existingOffsets: { dx: number; dy: number }[],
    childW: number = DEFAULT_W,
    childH: number = DEFAULT_H,
): { dx: number; dy: number } {
    const STEP_R = Math.max(childW, childH) + 20;
    const N_ANGLES = 12;

    for (let ring = 1; ring <= 8; ring++) {
        const r = ring * STEP_R;
        for (let a = 0; a < N_ANGLES; a++) {
            const angle = (2 * Math.PI * a) / N_ANGLES - Math.PI / 2;
            const candidate = { dx: Math.cos(angle) * r, dy: Math.sin(angle) * r };
            const overlaps = existingOffsets.some((o) => {
                const ddx = Math.abs(o.dx - candidate.dx);
                const ddy = Math.abs(o.dy - candidate.dy);
                return ddx < childW + 16 && ddy < childH + 16;
            });
            if (!overlaps) return candidate;
        }
    }
    // Fallback — stack horizontally
    return { dx: existingOffsets.length * (childW + 16), dy: 0 };
}

// ─── buildNodes ────────────────────────────────────────────────────────────────

function buildNodes(
    highlights: Highlight[],
    themes: Theme[],
    insights: Insight[],
    annotations: Annotation[],
    files: UploadedFile[],
    onOpen: (kind: string, id: string) => void,
    onAnnotationCommit: (id: string, text: string) => void,
    onAnnotationDelete: (id: string) => void,
    onAnnotationColorChange: (id: string, color: string) => void,
    onRemoveFromTheme: (highlightId: string, themeId: string) => void,
    prevNodes: Node[],
): Node[] {
    const fileById = new Map(files.map((f) => [f.id, f.filename ?? f.id]));
    const posMap = new Map(prevNodes.map((n) => [n.id, n.position]));
    const styleMap = new Map(prevNodes.map((n) => [n.id, n.style]));

    // Build a reverse map: highlightId → [{ themeId, themeName, color }]
    const parentThemesMap = new Map<string, CodeCardParent[]>();
    const themeChildIndex = new Map<string, number>(); // themeId → running child count
    themes.forEach((t) => {
        (t.highlightIds ?? []).forEach((hId) => {
            const existing = parentThemesMap.get(hId) ?? [];
            existing.push({ themeId: t.id, themeName: t.name ?? 'Untitled', color: THEME_COLOR });
            parentThemesMap.set(hId, existing);
        });
    });

    // Build a map of themeId → resolved position
    const themePositionMap = new Map<string, { x: number; y: number }>();
    themes.forEach((t, idx) => {
        const nodeId = `theme:${t.id}`;
        themePositionMap.set(
            t.id,
            posMap.get(nodeId) ?? { x: t.position?.x ?? 100 + (idx % 4) * 320, y: t.position?.y ?? 420 },
        );
    });

    const nodes: Node[] = [];

    highlights.forEach((h, idx) => {
        const nodeId = `code:${h.id}`;
        const parentThemes = parentThemesMap.get(h.id) ?? [];

        // Compute absolute position and relative offset from parent
        let resolvedPos: { x: number; y: number };
        let relOffset: { dx: number; dy: number } = { dx: 0, dy: 0 };
        let parentNodeId: string | undefined;

        if (posMap.has(nodeId)) {
            resolvedPos = posMap.get(nodeId)!;
        } else if (h.position) {
            resolvedPos = { x: h.position.x, y: h.position.y };
        } else if (parentThemes.length > 0) {
            const firstParentId = parentThemes[0].themeId;
            const parentPos = themePositionMap.get(firstParentId)!;
            const siblingIds = themes.find((t) => t.id === firstParentId)?.highlightIds ?? [];
            const childIdx = themeChildIndex.get(firstParentId) ?? 0;
            themeChildIndex.set(firstParentId, childIdx + 1);
            const angle = (2 * Math.PI * childIdx) / Math.max(siblingIds.length, 1) - Math.PI / 2;
            const r = BASE_FIELD_RADIUS * 0.75;
            resolvedPos = parentPos
                ? { x: parentPos.x + Math.cos(angle) * r, y: parentPos.y + Math.sin(angle) * r }
                : { x: 100 + (idx % 5) * 260, y: 100 + Math.floor(idx / 5) * 180 };
        } else {
            resolvedPos = { x: 100 + (idx % 5) * 260, y: 100 + Math.floor(idx / 5) * 180 };
        }

        // Compute relative offset for group-drag (Phase 1)
        if (parentThemes.length > 0) {
            const firstParentId = parentThemes[0].themeId;
            parentNodeId = `theme:${firstParentId}`;
            const parentPos = themePositionMap.get(firstParentId);
            if (parentPos) {
                relOffset = { dx: resolvedPos.x - parentPos.x, dy: resolvedPos.y - parentPos.y };
            }
        }

        const data: CodeCardData = {
            highlight: h,
            fileName: h.fileId ? fileById.get(h.fileId) : undefined,
            onOpen: (id) => onOpen('code', id),
            parentThemes,
            onRemoveFromTheme: (themeId) => onRemoveFromTheme(h.id, themeId),
        };
        nodes.push({
            id: nodeId,
            type: 'code',
            position: resolvedPos,
            style: styleMap.get(nodeId) ?? { width: h.size?.w ?? DEFAULT_W, height: h.size?.h ?? DEFAULT_H },
            data: { ...data, _relOffset: relOffset, _parentNodeId: parentNodeId } as unknown as Record<string, unknown>,
        });
    });

    themes.forEach((t, idx) => {
        const nodeId = `theme:${t.id}`;
        const themePos = themePositionMap.get(t.id)!;

        // Compute child offsets for field radius
        const childOffsets = (t.highlightIds ?? []).map((hId) => {
            const childPos = posMap.get(`code:${hId}`);
            return childPos
                ? { dx: childPos.x - themePos.x, dy: childPos.y - themePos.y }
                : { dx: 0, dy: 0 };
        });
        const fieldRadius = computeFieldRadius(childOffsets);

        // Compute insight parent offset if theme belongs to an insight
        let relOffset: { dx: number; dy: number } = { dx: 0, dy: 0 };
        let parentNodeId: string | undefined;
        for (const insight of insights) {
            if ((insight.themeIds ?? []).includes(t.id)) {
                const insightPos = posMap.get(`insight:${insight.id}`) ??
                    { x: insight.position?.x ?? 0, y: insight.position?.y ?? 0 };
                relOffset = { dx: themePos.x - insightPos.x, dy: themePos.y - insightPos.y };
                parentNodeId = `insight:${insight.id}`;
                break;
            }
        }

        const data: ThemeCardData = {
            theme: t,
            onOpen: (id) => onOpen('theme', id),
            fieldRadius,
        };
        nodes.push({
            id: nodeId,
            type: 'theme',
            position: themePos,
            style: styleMap.get(nodeId) ?? { width: t.size?.w ?? DEFAULT_W, height: t.size?.h ?? DEFAULT_H },
            data: { ...data, _relOffset: relOffset, _parentNodeId: parentNodeId } as unknown as Record<string, unknown>,
        });
    });

    insights.forEach((i, idx) => {
        const nodeId = `insight:${i.id}`;
        const insightPos = posMap.get(nodeId) ?? { x: i.position?.x ?? 100 + (idx % 3) * 380, y: i.position?.y ?? 760 };

        // Compute child offsets for field radius
        const childOffsets = (i.themeIds ?? []).map((tId) => {
            const childPos = themePositionMap.get(tId);
            return childPos
                ? { dx: childPos.x - insightPos.x, dy: childPos.y - insightPos.y }
                : { dx: 0, dy: 0 };
        });
        const fieldRadius = computeFieldRadius(childOffsets);

        const data: InsightCardData = {
            insight: i,
            onOpen: (id) => onOpen('insight', id),
            fieldRadius,
        };
        nodes.push({
            id: nodeId,
            type: 'insight',
            position: insightPos,
            style: styleMap.get(nodeId) ?? { width: i.size?.w ?? DEFAULT_W, height: i.size?.h ?? DEFAULT_H },
            data: data as unknown as Record<string, unknown>,
        });
    });

    annotations.forEach((a, idx) => {
        const nodeId = `annotation:${a.id}`;
        const data: AnnotationNodeData = {
            annotation: a,
            onCommit: onAnnotationCommit,
            onDelete: onAnnotationDelete,
            onColorChange: onAnnotationColorChange,
        };
        nodes.push({
            id: nodeId,
            type: 'annotation',
            position: posMap.get(nodeId) ?? { x: a.position?.x ?? 60 + (idx % 6) * 190, y: a.position?.y ?? 60 },
            style: styleMap.get(nodeId) ?? { width: a.size?.w ?? DEFAULT_ANNOTATION_W, height: a.size?.h ?? DEFAULT_ANNOTATION_H },
            data: data as unknown as Record<string, unknown>,
        });
    });

    return nodes;
}

// ─── Auto-delete helper (Phase 3) ─────────────────────────────────────────────

/**
 * Remove a child from a parent, and delete the parent if it has no remaining children.
 * Recursively checks grandparents (e.g. theme deleted → check owning insight).
 */
async function removeChildAndMaybeDeleteParent(
    childId: string,
    parentKind: 'theme' | 'insight',
    parentId: string,
    themes: Theme[],
    insights: Insight[],
    setNodes: (updater: (nds: Node[]) => Node[]) => void,
    onUpdate: () => void,
): Promise<void> {
    if (parentKind === 'theme') {
        const theme = themes.find((t) => t.id === parentId);
        if (!theme) return;
        const newIds = (theme.highlightIds ?? []).filter((id) => id !== childId);
        if (newIds.length === 0) {
            // Last child — delete theme, then recursively check owning insight
            await deleteTheme(parentId);
            setNodes((nds) => nds.filter((n) => n.id !== `theme:${parentId}`));
            for (const insight of insights) {
                if ((insight.themeIds ?? []).includes(parentId)) {
                    await removeChildAndMaybeDeleteParent(
                        parentId, 'insight', insight.id, themes, insights, setNodes, onUpdate
                    );
                }
            }
        } else {
            await updateTheme(parentId, { highlightIds: newIds });
            // Optimistic patch
            setNodes((nds) =>
                nds.map((n) => {
                    if (n.id === `code:${childId}`) {
                        const cd = n.data as import('./nodes/CodeCard').CodeCardData;
                        return { ...n, data: { ...n.data, parentThemes: (cd.parentThemes ?? []).filter((p) => p.themeId !== parentId) } };
                    }
                    if (n.id === `theme:${parentId}`) {
                        const td = n.data as import('./nodes/ThemeCard').ThemeCardData;
                        return { ...n, data: { ...n.data, theme: { ...td.theme, highlightIds: newIds } } };
                    }
                    return n;
                })
            );
        }
    } else {
        const insight = insights.find((i) => i.id === parentId);
        if (!insight) return;
        const newIds = (insight.themeIds ?? []).filter((id) => id !== childId);
        if (newIds.length === 0) {
            await deleteInsight(parentId);
            setNodes((nds) => nds.filter((n) => n.id !== `insight:${parentId}`));
        } else {
            await updateInsight(parentId, { themeIds: newIds });
            setNodes((nds) =>
                nds.map((n) => {
                    if (n.id === `insight:${parentId}`) {
                        const id = n.data as import('./nodes/InsightCard').InsightCardData;
                        return { ...n, data: { ...n.data, insight: { ...id.insight, themeIds: newIds } } };
                    }
                    return n;
                })
            );
        }
    }
    onUpdate();
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface FlowCanvasProps {
    highlights: Highlight[];
    themes: Theme[];
    insights: Insight[];
    annotations: Annotation[];
    files: UploadedFile[];
    onUpdate: () => void;
    onOpenEntity: (kind: string, id: string) => void;
    /** Called whenever the React Flow selection changes; receives the IDs of selected code nodes and theme nodes */
    onSelectionChange?: (selectedCodeIds: string[], selectedThemeIds: string[]) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FlowCanvas({
    highlights,
    themes,
    insights,
    annotations,
    files,
    onUpdate,
    onOpenEntity,
    onSelectionChange,
}: FlowCanvasProps) {
    // Stable callbacks passed into node data — defined before node building
    const handleOpen = useCallback((kind: string, id: string) => {
        onOpenEntity(kind, id);
    }, [onOpenEntity]);

    const handleSelectionChange: OnSelectionChangeFunc = useCallback(
        ({ nodes: selectedNodes }) => {
            if (!onSelectionChange) return;
            const codeIds = selectedNodes
                .filter((n) => n.id.startsWith('code:'))
                .map((n) => n.id.slice('code:'.length));
            const themeIds = selectedNodes
                .filter((n) => n.id.startsWith('theme:'))
                .map((n) => n.id.slice('theme:'.length));
            onSelectionChange(codeIds, themeIds);
        },
        [onSelectionChange]
    );

    // Start empty; useEffect re-syncs whenever React Query data arrives or onUpdate fires
    const [nodes, setNodes] = useNodesState<Node>([]);

    // Ref to the full live node array — always up to date, safe to read inside drag callbacks.
    // React Flow's OnNodeDrag third param is only the *dragged* nodes (multi-select subset),
    // so we cannot use it to look up arbitrary nodes like theme or insight cards.
    const nodesRef = useRef<Node[]>([]);

    const handleAnnotationCommit = useCallback(
        async (id: string, text: string) => {
            try {
                if (!text.trim()) {
                    await apiDeleteAnnotation(id);
                    toast.success('Text removed');
                } else {
                    await updateAnnotation(id, { content: text.trim() });
                }
                onUpdate();
            } catch {
                toast.error('Save failed');
            }
        },
        [onUpdate]
    );

    const handleAnnotationDelete = useCallback(
        async (id: string) => {
            try {
                await apiDeleteAnnotation(id);
                setNodes((nds) => nds.filter((n) => n.id !== `annotation:${id}`));
                toast.success('Note deleted');
                onUpdate();
            } catch {
                toast.error('Failed to delete note');
            }
        },
        [onUpdate, setNodes]
    );

    const handleAnnotationColorChange = useCallback(
        async (id: string, color: string) => {
            try {
                await updateAnnotation(id, { style: { background: color } });
                setNodes((nds) =>
                    nds.map((n) => {
                        if (n.id === `annotation:${id}`) {
                            const d = n.data as unknown as AnnotationNodeData;
                            return { ...n, data: { ...n.data, annotation: { ...d.annotation, style: { ...d.annotation.style, background: color } } } as unknown as Record<string, unknown> };
                        }
                        return n;
                    })
                );
            } catch {
                toast.error('Failed to update color');
            }
        },
        [setNodes]
    );

    // Context-menu ungroup: called directly from CodeCard right-click menu
    const handleRemoveFromTheme = useCallback(
        async (highlightId: string, themeId: string) => {
            const theme = themes.find((t) => t.id === themeId);
            if (!theme) return;
            try {
                await removeChildAndMaybeDeleteParent(
                    highlightId, 'theme', themeId, themes, insights, setNodes, onUpdate
                );
                toast.success(`Removed from "${theme.name ?? 'theme'}"`);
            } catch {
                toast.error('Failed to remove from group');
            }
        },
        [themes, insights, setNodes, onUpdate]
    );

    useEffect(() => {
        setNodes((prev) => {
            const next = buildNodes(highlights, themes, insights, annotations, files, handleOpen, handleAnnotationCommit, handleAnnotationDelete, handleAnnotationColorChange, handleRemoveFromTheme, prev);
            nodesRef.current = next;
            return next;
        });
    }, [highlights, themes, insights, annotations, files, handleOpen, handleAnnotationCommit, handleAnnotationDelete, handleAnnotationColorChange, handleRemoveFromTheme, setNodes]);

    // Debounce timer ref for position persistence
    const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // FIX M1: clean up debounce timer on unmount
    useEffect(() => {
        return () => {
            if (persistTimer.current) clearTimeout(persistTimer.current);
        };
    }, []);

    // Tracks the aggregate being group-dragged and each child's relative offset from the parent
    const groupDragRef = useRef<{
        parentId: string;
        childNodeIds: string[];
        childRelOffsets: Map<string, { dx: number; dy: number }>;
    } | null>(null);

    const onNodesChange: OnNodesChange = useCallback(
        (changes) => {
            setNodes((nds) => {
                const updated = applyNodeChanges(changes, nds);
                nodesRef.current = updated;
                return updated;
            });

            // Persist position/size after drag ends or resize ends
            const positionCommits = changes.filter(
                (c) => c.type === 'position' && !c.dragging
            );
            const resizeCommits = changes.filter((c) => c.type === 'dimensions');

            if (positionCommits.length === 0 && resizeCommits.length === 0) return;

            if (persistTimer.current) clearTimeout(persistTimer.current);
            persistTimer.current = setTimeout(() => {
                setNodes((nds) => {
                    positionCommits.forEach((change) => {
                        if (change.type !== 'position') return;
                        const node = nds.find((n) => n.id === change.id);
                        if (!node) return;
                        const colonIdx = node.id.indexOf(':');
                        const kind = node.id.slice(0, colonIdx);
                        const id = node.id.slice(colonIdx + 1);
                        const pos = { x: node.position.x, y: node.position.y };
                        persistPosition(kind, id, pos).catch(() => toast.error('Failed to save position'));
                    });
                    resizeCommits.forEach((change) => {
                        if (change.type !== 'dimensions') return;
                        const node = nds.find((n) => n.id === change.id);
                        if (!node || !node.measured) return;
                        const colonIdx = node.id.indexOf(':');
                        const kind = node.id.slice(0, colonIdx);
                        const id = node.id.slice(colonIdx + 1);
                        const size = { w: node.measured.width ?? DEFAULT_W, h: node.measured.height ?? DEFAULT_H };
                        persistSize(kind, id, size).catch(() => toast.error('Failed to save size'));
                    });
                    return nds;
                });
                onUpdate();
            }, 500);
        },
        [setNodes, onUpdate]
    );

    // ─── Proximity engine ───────────────────────────────────────────────────────

    /**
     * While dragging a code or theme card, compute proximity (0–1) of that card
     * to every valid aggregate target and inject it into each target node’s data
     * so FieldAura can animate reactively.
     */
    const onNodeDragStart: OnNodeDrag = useCallback(
        (_, draggedNode) => {
            const allNodes = nodesRef.current;
            const colonIdx = draggedNode.id.indexOf(':');
            const draggedKind = draggedNode.id.slice(0, colonIdx);
            const draggedEntityId = draggedNode.id.slice(colonIdx + 1);

            if (draggedKind !== 'theme' && draggedKind !== 'insight') {
                groupDragRef.current = null;
                return;
            }

            let childNodeIds: string[] = [];
            if (draggedKind === 'theme') {
                const theme = themes.find((t) => t.id === draggedEntityId);
                if (theme) childNodeIds = (theme.highlightIds ?? []).map((id) => `code:${id}`);
            } else {
                const insight = insights.find((i) => i.id === draggedEntityId);
                if (insight) {
                    // Include direct children (themes) AND their code grandchildren
                    const themeIds = insight.themeIds ?? [];
                    childNodeIds = [
                        ...themeIds.map((id) => `theme:${id}`),
                        ...themeIds.flatMap((tId) => {
                            const t = themes.find((t) => t.id === tId);
                            return (t?.highlightIds ?? []).map((hId) => `code:${hId}`);
                        }),
                    ];
                }
            }

            if (childNodeIds.length === 0) {
                groupDragRef.current = null;
                return;
            }

            // Compute live relative offsets from actual current positions at drag-start.
            // Reading _relOffset from node.data is unreliable because buildNodes only runs
            // when server data changes — if the user moved child cards since then, _relOffset is stale.
            const childRelOffsets = new Map<string, { dx: number; dy: number }>();
            allNodes.forEach((n) => {
                if (childNodeIds.includes(n.id)) {
                    childRelOffsets.set(n.id, {
                        dx: n.position.x - draggedNode.position.x,
                        dy: n.position.y - draggedNode.position.y,
                    });
                }
            });

            groupDragRef.current = {
                parentId: draggedNode.id,
                childNodeIds,
                childRelOffsets,
            };

            // Light up the parent's own aura to signal the group is in motion
            setNodes((nds) =>
                nds.map((n) =>
                    n.id === draggedNode.id ? { ...n, data: { ...n.data, proximity: 0.9 } } : n
                )
            );
        },
        [themes, insights, setNodes]
    );

    const onNodeDrag: OnNodeDrag = useCallback(
        (_, draggedNode) => {
            const colonIdx = draggedNode.id.indexOf(':');
            const draggedKind = draggedNode.id.slice(0, colonIdx);

            const dw = draggedNode.measured?.width ?? DEFAULT_W;
            const dh = draggedNode.measured?.height ?? DEFAULT_H;
            const dragCx = draggedNode.position.x + dw / 2;
            const dragCy = draggedNode.position.y + dh / 2;

            // ── Group drag: move children with the parent ──────────────────────────
            if (groupDragRef.current?.parentId === draggedNode.id) {
                const { childNodeIds, childRelOffsets } = groupDragRef.current;

                // Phase 1: use pre-computed relative offsets — parent.pos + relOffset = child.pos
                const childChanges: NodePositionChange[] = childNodeIds.map((id) => {
                    const rel = childRelOffsets.get(id) ?? { dx: 0, dy: 0 };
                    return {
                        id,
                        type: 'position' as const,
                        dragging: true,
                        position: { x: draggedNode.position.x + rel.dx, y: draggedNode.position.y + rel.dy },
                    };
                });
                setNodes((nds) => applyNodeChanges(childChanges, nds));

                // Animate proximity on nearby insight targets
                if (draggedKind === 'theme') {
                    setNodes((nds) =>
                        nds.map((n) => {
                            const nColonIdx = n.id.indexOf(':');
                            if (n.id.slice(0, nColonIdx) !== 'insight') return n;
                            const nw = n.measured?.width ?? DEFAULT_W;
                            const nh = n.measured?.height ?? DEFAULT_H;
                            const dist = Math.hypot(
                                dragCx - (n.position.x + nw / 2),
                                dragCy - (n.position.y + nh / 2),
                            );
                            const proximity = Math.max(0, 1 - dist / FIELD_RADIUS);
                            const cur = (n.data as { proximity?: number }).proximity ?? 0;
                            if (Math.abs(proximity - cur) >= 0.01) {
                                return { ...n, data: { ...n.data, proximity } };
                            }
                            return n;
                        })
                    );
                }
                return;
            }

            // ── Proximity engine for non-group drags ──────────────────────────────
            if (draggedKind !== 'code' && draggedKind !== 'theme') return;

            setNodes((nds) =>
                nds.map((n) => {
                    const nColonIdx = n.id.indexOf(':');
                    const nKind = n.id.slice(0, nColonIdx);
                    const isTarget =
                        (draggedKind === 'code' && nKind === 'theme') ||
                        (draggedKind === 'theme' && nKind === 'insight');
                    if (!isTarget) return n;

                    const nw = n.measured?.width ?? DEFAULT_W;
                    const nh = n.measured?.height ?? DEFAULT_H;
                    const cx = n.position.x + nw / 2;
                    const cy = n.position.y + nh / 2;
                    const dist = Math.hypot(dragCx - cx, dragCy - cy);
                    const proximity = Math.max(0, 1 - dist / FIELD_RADIUS);
                    const currentProximity = (n.data as { proximity?: number }).proximity ?? 0;
                    if (Math.abs(proximity - currentProximity) < 0.01) return n;
                    return { ...n, data: { ...n.data, proximity } };
                })
            );
        },
        [setNodes]
    );

    /**
     * On drop:
     * - Group drag completion → persist all children positions to DB.
     * - Near an aggregate → add to group (non-overlap placement, DB persist).
     * - No snap target + currently grouped → check dynamic field radius; if outside, ungroup.
     * Always clears proximity scores.
     */
    const onNodeDragStop: OnNodeDrag = useCallback(
        async (_, draggedNode) => {
            // Use the ref — OnNodeDrag's third param is only the dragged subset, not all canvas nodes
            const allNodes = nodesRef.current;
            const colonIdx = draggedNode.id.indexOf(':');
            const draggedKind = draggedNode.id.slice(0, colonIdx);
            const draggedEntityId = draggedNode.id.slice(colonIdx + 1);

            // ── Group drag completion ────────────────────────────────────────────────
            if (groupDragRef.current?.parentId === draggedNode.id) {
                const { childNodeIds } = groupDragRef.current;
                allNodes.forEach((n) => {
                    if (!childNodeIds.includes(n.id)) return;
                    const cIdx = n.id.indexOf(':');
                    persistPosition(n.id.slice(0, cIdx), n.id.slice(cIdx + 1), n.position)
                        .catch(() => toast.error('Failed to save position'));
                });
                groupDragRef.current = null;
                // Clear the proximity boost injected at drag start
                setNodes((nds) =>
                    nds.map((n) => {
                        const p = (n.data as { proximity?: number }).proximity ?? 0;
                        return p === 0 ? n : { ...n, data: { ...n.data, proximity: 0 } };
                    })
                );
                return;
            }

            if (draggedKind !== 'code' && draggedKind !== 'theme') return;

            const dw = draggedNode.measured?.width ?? DEFAULT_W;
            const dh = draggedNode.measured?.height ?? DEFAULT_H;
            const dragCx = draggedNode.position.x + dw / 2;
            const dragCy = draggedNode.position.y + dh / 2;

            // Find closest valid aggregate target that the dragged card's centre falls inside.
            // Use each target's computed field radius (from node.data.fieldRadius) as the snap zone
            // so the visual ring and the snap zone are always the same boundary.
            let bestNode: Node | null = null;
            let bestDist = Infinity;
            allNodes.forEach((n) => {
                const nColonIdx = n.id.indexOf(':');
                const nKind = n.id.slice(0, nColonIdx);
                const isTarget =
                    (draggedKind === 'code' && nKind === 'theme') ||
                    (draggedKind === 'theme' && nKind === 'insight');
                if (!isTarget) return;
                const nw = n.measured?.width ?? DEFAULT_W;
                const nh = n.measured?.height ?? DEFAULT_H;
                const cx = n.position.x + nw / 2;
                const cy = n.position.y + nh / 2;
                const dist = Math.hypot(dragCx - cx, dragCy - cy);
                // Snap if the dragged card centre is inside this target's field ring
                const snapRadius = (n.data as { fieldRadius?: number }).fieldRadius ?? BASE_FIELD_RADIUS;
                if (dist < snapRadius && dist < bestDist) { bestDist = dist; bestNode = n; }
            });

            // Clear all proximity scores
            setNodes((nds) =>
                nds.map((n) => {
                    const p = (n.data as { proximity?: number }).proximity ?? 0;
                    return p === 0 ? n : { ...n, data: { ...n.data, proximity: 0 } };
                })
            );

            // ── Add to group (with conflict guard + non-overlap placement) ───────────
            if (bestNode) {
                const targetColonIdx = (bestNode as Node).id.indexOf(':');
                const targetKind = (bestNode as Node).id.slice(0, targetColonIdx);
                const targetId = (bestNode as Node).id.slice(targetColonIdx + 1);
                try {
                    if (draggedKind === 'code' && targetKind === 'theme') {
                        const theme = themes.find((t) => t.id === targetId);
                        if (!theme) return;
                        const newIds = Array.from(new Set([...(theme.highlightIds ?? []), draggedEntityId]));
                        if (newIds.length === (theme.highlightIds ?? []).length) return; // already a member

                        // If the code already belongs to a different theme, remove it first
                        const existingParent = themes.find(
                            (t) => t.id !== targetId && (t.highlightIds ?? []).includes(draggedEntityId)
                        );
                        if (existingParent) {
                            const cleanedIds = (existingParent.highlightIds ?? []).filter((id) => id !== draggedEntityId);
                            await updateTheme(existingParent.id, { highlightIds: cleanedIds });
                            toast.success(`Moved from "${existingParent.name ?? 'theme'}" to "${theme.name ?? 'theme'}"`);
                        }

                        await updateTheme(targetId, { highlightIds: newIds });

                        // Phase 4: Non-overlap placement — compute offset inside field ring
                        const parentNode = allNodes.find((n) => n.id === `theme:${targetId}`)!;
                        const existingOffsets = (theme.highlightIds ?? [])
                            .filter((id) => id !== draggedEntityId)
                            .map((id) => {
                                const cn = allNodes.find((n) => n.id === `code:${id}`);
                                return cn
                                    ? { dx: cn.position.x - parentNode.position.x, dy: cn.position.y - parentNode.position.y }
                                    : { dx: 0, dy: 0 };
                            });
                        const newOffset = placeNewChild(existingOffsets, dw, dh);
                        const snappedPos = {
                            x: parentNode.position.x + newOffset.dx,
                            y: parentNode.position.y + newOffset.dy,
                        };

                        // Optimistic: move code to snapped position, add badge, update theme member count
                        const newParent: CodeCardParent = { themeId: targetId, themeName: theme.name ?? 'Untitled', color: THEME_COLOR };
                        setNodes((nds) =>
                            nds.map((n) => {
                                if (n.id === `code:${draggedEntityId}`) {
                                    const cd = n.data as CodeCardData;
                                    const filtered = (cd.parentThemes ?? []).filter((p) => p.themeId !== targetId);
                                    return {
                                        ...n,
                                        position: snappedPos,
                                        data: {
                                            ...n.data,
                                            parentThemes: [...filtered, newParent],
                                            _relOffset: newOffset,
                                            _parentNodeId: `theme:${targetId}`,
                                        },
                                    };
                                }
                                if (n.id === `theme:${targetId}`) {
                                    const td = n.data as ThemeCardData;
                                    return { ...n, data: { ...n.data, theme: { ...td.theme, highlightIds: newIds } } };
                                }
                                if (existingParent && n.id === `theme:${existingParent.id}`) {
                                    const td = n.data as ThemeCardData;
                                    const cleanedIds = (td.theme.highlightIds ?? []).filter((id) => id !== draggedEntityId);
                                    return { ...n, data: { ...n.data, theme: { ...td.theme, highlightIds: cleanedIds } } };
                                }
                                return n;
                            })
                        );
                        // Persist the snapped position to DB
                        persistPosition('code', draggedEntityId, snappedPos).catch(() => toast.error('Failed to save position'));
                        if (!existingParent) toast.success(`Added to "${theme.name ?? 'theme'}"`);

                        onUpdate();
                    } else if (draggedKind === 'theme' && targetKind === 'insight') {
                        const insight = insights.find((i) => i.id === targetId);
                        if (!insight) return;
                        const newIds = Array.from(new Set([...(insight.themeIds ?? []), draggedEntityId]));
                        if (newIds.length === (insight.themeIds ?? []).length) return;
                        await updateInsight(targetId, { themeIds: newIds });

                        // Phase 4: Non-overlap placement for theme inside insight ring
                        const parentNode = allNodes.find((n) => n.id === `insight:${targetId}`)!;
                        const existingOffsets = (insight.themeIds ?? [])
                            .filter((id) => id !== draggedEntityId)
                            .map((id) => {
                                const tn = allNodes.find((n) => n.id === `theme:${id}`);
                                return tn
                                    ? { dx: tn.position.x - parentNode.position.x, dy: tn.position.y - parentNode.position.y }
                                    : { dx: 0, dy: 0 };
                            });
                        const newOffset = placeNewChild(existingOffsets, dw, dh);
                        const snappedPos = {
                            x: parentNode.position.x + newOffset.dx,
                            y: parentNode.position.y + newOffset.dy,
                        };

                        setNodes((nds) =>
                            nds.map((n) => {
                                if (n.id === `theme:${draggedEntityId}`) {
                                    return {
                                        ...n,
                                        position: snappedPos,
                                        data: { ...n.data, _relOffset: newOffset, _parentNodeId: `insight:${targetId}` },
                                    };
                                }
                                if (n.id === `insight:${targetId}`) {
                                    const id = n.data as InsightCardData;
                                    return { ...n, data: { ...n.data, insight: { ...id.insight, themeIds: newIds } } };
                                }
                                return n;
                            })
                        );
                        persistPosition('theme', draggedEntityId, snappedPos).catch(() => toast.error('Failed to save position'));
                        toast.success(`Added to "${insights.find(i => i.id === targetId)?.name ?? 'insight'}"`);

                        onUpdate();
                    }
                } catch {
                    toast.error('Failed to group cards');
                }
                return;
            }

            // ── Ungroup: check dynamic field radius (Phase 2) ─────────────────────────
            if (draggedKind === 'code') {
                for (const theme of themes) {
                    if (!(theme.highlightIds ?? []).includes(draggedEntityId)) continue;
                    const themeNode = allNodes.find((n) => n.id === `theme:${theme.id}`);
                    if (!themeNode) continue;
                    const tw = themeNode.measured?.width ?? DEFAULT_W;
                    const th = themeNode.measured?.height ?? DEFAULT_H;
                    const parentCx = themeNode.position.x + tw / 2;
                    const parentCy = themeNode.position.y + th / 2;

                    // Compute field radius from the OTHER children only — excluding the dragged one.
                    // Including the dragged child would make fieldRad = its far distance → ungroup never fires.
                    const childOffsets = (theme.highlightIds ?? [])
                        .filter((id) => id !== draggedEntityId)
                        .map((id) => {
                            const cn = allNodes.find((n) => n.id === `code:${id}`);
                            return cn
                                ? { dx: cn.position.x - themeNode.position.x, dy: cn.position.y - themeNode.position.y }
                                : { dx: 0, dy: 0 };
                        });
                    const fieldRad = computeFieldRadius(childOffsets);
                    const dist = Math.hypot(dragCx - parentCx, dragCy - parentCy);

                    if (dist > fieldRad) {
                        try {
                            await removeChildAndMaybeDeleteParent(
                                draggedEntityId, 'theme', theme.id, themes, insights, setNodes, onUpdate
                            );
                            toast.success('Removed from theme');
                        } catch {
                            toast.error('Failed to remove from group');
                        }
                    }
                }
            } else if (draggedKind === 'theme') {
                for (const insight of insights) {
                    if (!(insight.themeIds ?? []).includes(draggedEntityId)) continue;
                    const insightNode = allNodes.find((n) => n.id === `insight:${insight.id}`);
                    if (!insightNode) continue;
                    const iw = insightNode.measured?.width ?? DEFAULT_W;
                    const ih = insightNode.measured?.height ?? DEFAULT_H;
                    const parentCx = insightNode.position.x + iw / 2;
                    const parentCy = insightNode.position.y + ih / 2;

                    const childOffsets = (insight.themeIds ?? [])
                        .filter((id) => id !== draggedEntityId)
                        .map((id) => {
                            const tn = allNodes.find((n) => n.id === `theme:${id}`);
                            return tn
                                ? { dx: tn.position.x - insightNode.position.x, dy: tn.position.y - insightNode.position.y }
                                : { dx: 0, dy: 0 };
                        });
                    const fieldRad = computeFieldRadius(childOffsets);
                    const dist = Math.hypot(dragCx - parentCx, dragCy - parentCy);

                    if (dist > fieldRad) {
                        try {
                            await removeChildAndMaybeDeleteParent(
                                draggedEntityId, 'insight', insight.id, themes, insights, setNodes, onUpdate
                            );
                            toast.success('Removed from insight');
                        } catch {
                            toast.error('Failed to remove from group');
                        }
                    }
                }
            }
        },
        [themes, insights, setNodes, onUpdate]
    );

    return (
        <div className="w-full h-full">
            <ReactFlow
                nodes={nodes}
                edges={[]}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onNodeDragStart={onNodeDragStart}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onNodeDragStop}
                onSelectionChange={handleSelectionChange}
                fitView
                minZoom={0.1}
                maxZoom={2}
                panOnDrag={[1, 2]}
                selectionOnDrag={true}
                multiSelectionKeyCode="Shift"
                deleteKeyCode="Delete"
                proOptions={{ hideAttribution: true }}
            >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e5e7eb" />
                <Controls showInteractive={false} />
            </ReactFlow>
        </div>
    );
}

// ─── Position / size persistence helpers ──────────────────────────────────────

async function persistPosition(kind: string, id: string, position: { x: number; y: number }) {
    if (kind === 'code') return updateHighlight(id, { position });
    if (kind === 'theme') return updateTheme(id, { position });
    if (kind === 'insight') return updateInsight(id, { position });
    if (kind === 'annotation') return updateAnnotation(id, { position });
}

async function persistSize(kind: string, id: string, size: { w: number; h: number }) {
    if (kind === 'code') return updateHighlight(id, { size });
    if (kind === 'theme') return updateTheme(id, { size });
    if (kind === 'insight') return updateInsight(id, { size });
    if (kind === 'annotation') return updateAnnotation(id, { size });
}
