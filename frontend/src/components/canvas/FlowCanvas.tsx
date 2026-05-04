import { useCallback, useEffect, useRef } from 'react';
import {
    ReactFlow,
    Background,
    BackgroundVariant,
    Controls,
    useNodesState,
    useViewport,
    useReactFlow,
    type Node,
    type OnNodesChange,
    type OnNodeDrag,
    type NodeTypes,
    type OnSelectionChangeFunc,
    type NodePositionChange,
    applyNodeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCollaboration, type PeerInfo, type NodeLock } from '@/hooks/useCollaboration';

import type { Highlight, Theme, Insight, Annotation, UploadedFile } from '@/types';
import {
    updateHighlight,
    updateTheme,
    updateInsight,
    updateAnnotation,
    deleteAnnotation as apiDeleteAnnotation,
    deleteTheme,
    deleteInsight,
    deleteHighlight,
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
    onAnnotationResize: (id: string, w: number, h: number) => void,
    /** Nodes currently being dragged by the local user — keep their live posMap position */
    localDraggingIds: Set<string>,
    /** Positions pinned after drag-end — override stale server data until the PATCH confirms */
    pinnedPositions: Map<string, { x: number; y: number }>,
    /** Live positions received from remote peers — synchronous ref, always current */
    remotePositions: Map<string, { x: number; y: number }>,
    /** Nodes locked by a remote peer — rendered with a ring and not interactable */
    lockedBy: Map<string, NodeLock>,
    currentUserId: string | undefined,
    prevNodes: Node[],
): Node[] {
    const fileById = new Map(files.map((f) => [f.id, f.filename ?? f.id]));
    const posMap = new Map(prevNodes.map((n) => [n.id, n.position]));
    const styleMap = new Map(prevNodes.map((n) => [n.id, n.style]));
    const selectedMap = new Map(prevNodes.map((n) => [n.id, n.selected ?? false]));

    /** Returns extra node props when a remote peer holds the lock. */
    function lockOverride(nodeId: string): Partial<Node> {
        const lock = lockedBy.get(nodeId);
        if (!lock || lock.userId === currentUserId) return {};
        // Do NOT inject style.outline here — it gets stored in styleMap (built from prevNodes)
        // and bleeds through on the next buildNodes call after the lock is released.
        // Card components (CodeCard, ParentCard, AnnotationNode) already render the colored
        // border and name badge directly from data.lockedBy.
        return {
            draggable: false,
            selectable: false,
            data: { lockedBy: lock } as Record<string, unknown>,
        };
    }

    /**
     * Resolve a node's position. Priority:
     *  1. posMap — if the local user is actively dragging this node (smooth animation).
     *  2. Server entity position — source of truth after any remote mutation/refetch.
     *  3. posMap — preserves position when server has no stored value yet.
     *  4. Layout default — first-render fallback.
     */
    function resolvePos(
        nodeId: string,
        serverPos: { x: number; y: number } | null | undefined,
        layoutDefault: { x: number; y: number },
    ): { x: number; y: number } {
        if (localDraggingIds.has(nodeId)) return posMap.get(nodeId) ?? serverPos ?? layoutDefault;
        const pinned = pinnedPositions.get(nodeId);
        if (pinned) return pinned;
        // Synchronous ref — always has the latest remote position regardless of React batch order
        const remote = remotePositions.get(nodeId);
        if (remote) return remote;
        if (serverPos) return serverPos;
        return posMap.get(nodeId) ?? layoutDefault;
    }

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

    // Build a map of themeId → resolved position (used to compute child offsets)
    const themePositionMap = new Map<string, { x: number; y: number }>();
    themes.forEach((t, idx) => {
        const nodeId = `theme:${t.id}`;
        themePositionMap.set(
            t.id,
            resolvePos(nodeId, t.position as { x: number; y: number } | null, { x: 100 + (idx % 4) * 320, y: 420 }),
        );
    });

    const nodes: Node[] = [];

    highlights.forEach((h, idx) => {
        const nodeId = `code:${h.id}`;
        const parentThemes = parentThemesMap.get(h.id) ?? [];

        // Compute absolute position and relative offset from parent
        let relOffset: { dx: number; dy: number } = { dx: 0, dy: 0 };
        let parentNodeId: string | undefined;
        let resolvedPos: { x: number; y: number };

        if (localDraggingIds.has(nodeId) && posMap.has(nodeId)) {
            resolvedPos = posMap.get(nodeId)!;
        } else if (pinnedPositions.has(nodeId)) {
            resolvedPos = pinnedPositions.get(nodeId)!;
        } else if (remotePositions.has(nodeId)) {
            // Remote peer is dragging — synchronous ref, always current
            resolvedPos = remotePositions.get(nodeId)!;
        } else if (h.position) {
            resolvedPos = { x: h.position.x, y: h.position.y };
        } else if (posMap.has(nodeId)) {
            resolvedPos = posMap.get(nodeId)!;
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

        // Compute relative offset for group-drag
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
            fileName: (h.fileId ? fileById.get(h.fileId) : undefined) ?? h.fileName,
            onOpen: (id) => onOpen('code', id),
            parentThemes,
            onRemoveFromTheme: (themeId) => onRemoveFromTheme(h.id, themeId),
        };
        const codeLock = lockOverride(nodeId);
        nodes.push({
            id: nodeId,
            type: 'code',
            selected: selectedMap.get(nodeId) ?? false,
            position: resolvedPos,
            ...(codeLock.draggable !== undefined ? { draggable: codeLock.draggable, selectable: codeLock.selectable } : {}),
            style: { width: DEFAULT_W, ...codeLock.style },
            data: { ...data, _relOffset: relOffset, _parentNodeId: parentNodeId, ...codeLock.data } as unknown as Record<string, unknown>,
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
        const themeLock = lockOverride(nodeId);
        // Destructure to strip any `outline`/`outlineOffset` that an older build may have
        // written into styleMap via the now-removed lockOverride style injection.
        const { outline: _tO, outlineOffset: _tOO, ...themeBaseStyle } =
            (styleMap.get(nodeId) ?? { width: t.size?.w ?? DEFAULT_W, height: t.size?.h ?? DEFAULT_H }) as Record<string, unknown>;
        nodes.push({
            id: nodeId,
            type: 'theme',
            selected: selectedMap.get(nodeId) ?? false,
            position: themePos,
            ...(themeLock.draggable !== undefined ? { draggable: themeLock.draggable, selectable: themeLock.selectable } : {}),
            style: { ...themeBaseStyle, ...themeLock.style },
            data: { ...data, _relOffset: relOffset, _parentNodeId: parentNodeId, ...themeLock.data } as unknown as Record<string, unknown>,
        });
    });

    insights.forEach((i, idx) => {
        const nodeId = `insight:${i.id}`;
        const insightPos = resolvePos(
            nodeId,
            i.position as { x: number; y: number } | null,
            { x: 100 + (idx % 3) * 380, y: 760 },
        );

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
        const insightLock = lockOverride(nodeId);
        const { outline: _iO, outlineOffset: _iOO, ...insightBaseStyle } =
            (styleMap.get(nodeId) ?? { width: i.size?.w ?? DEFAULT_W, height: i.size?.h ?? DEFAULT_H }) as Record<string, unknown>;
        nodes.push({
            id: nodeId,
            type: 'insight',
            selected: selectedMap.get(nodeId) ?? false,
            position: insightPos,
            ...(insightLock.draggable !== undefined ? { draggable: insightLock.draggable, selectable: insightLock.selectable } : {}),
            style: { ...insightBaseStyle, ...insightLock.style },
            data: { ...data, ...insightLock.data } as unknown as Record<string, unknown>,
        });
    });

    annotations.forEach((a, idx) => {
        const nodeId = `annotation:${a.id}`;
        const data: AnnotationNodeData = {
            annotation: a,
            onCommit: onAnnotationCommit,
            onDelete: onAnnotationDelete,
            onColorChange: onAnnotationColorChange,
            onResize: onAnnotationResize,
        };
        const annotationLock = lockOverride(nodeId);
        const { outline: _aO, outlineOffset: _aOO, ...annotationBaseStyle } =
            (styleMap.get(nodeId) ?? { width: a.size?.w ?? DEFAULT_ANNOTATION_W, height: a.size?.h ?? DEFAULT_ANNOTATION_H }) as Record<string, unknown>;
        nodes.push({
            id: nodeId,
            type: 'annotation',
            selected: selectedMap.get(nodeId) ?? false,
            position: resolvePos(nodeId, a.position as { x: number; y: number } | null, { x: 60 + (idx % 6) * 190, y: 60 }),
            ...(annotationLock.draggable !== undefined ? { draggable: annotationLock.draggable, selectable: annotationLock.selectable } : {}),
            style: { ...annotationBaseStyle, ...annotationLock.style },
            data: { ...data, ...annotationLock.data } as unknown as Record<string, unknown>,
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
    /** Current project ID — used to join the collab room. */
    projectId?: string;
    /** Current user ID — used to distinguish own locks from peer locks. */
    userId?: string;
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
    projectId,
    userId,
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

    // Track which nodes the LOCAL user is actively dragging so buildNodes keeps their live position
    // rather than overwriting with server data mid-drag.
    const localDraggingIdsRef = useRef<Set<string>>(new Set());
    // Pin the final dropped position until the server confirms it, preventing a visible
    // jump when a stale GET refetch arrives before the PATCH round-trip completes.
    const pinnedPositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
    // Live positions received from remote peers via nodes-moved. Updated synchronously
    // (ref, not state) so buildNodes always sees the latest value even when React batches
    // a concurrent setNodes update from a query refetch.
    const remotePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

    // ─── Collaboration ────────────────────────────────────────────────────────
    const containerRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef({ x: 0, y: 0, zoom: 1 });

    const onRemoteNodeMoves = useCallback(
        (moves: Array<{ nodeId: string; position: { x: number; y: number } }>) => {
            // Update ref first (synchronous) so buildNodes sees the latest positions
            // even if its setNodes updater runs before this one in React's queue.
            moves.forEach(({ nodeId, position }) => remotePositionsRef.current.set(nodeId, position));
            setNodes((nds) =>
                nds.map((n) => {
                    const move = moves.find((m) => m.nodeId === n.id);
                    return move ? { ...n, position: move.position } : n;
                })
            );
        },
        [setNodes]
    );

    // Directly clear data.lockedBy and restore draggability when a peer releases their lock.
    // This runs synchronously with the socket event, before the buildNodes effect cycle,
    // guaranteeing the visual disappears immediately on drop.
    const onNodesReleased = useCallback(
        (nodeIds: string[]) => {
            const idSet = new Set(nodeIds);
            setNodes((nds) =>
                nds.map((n) => {
                    if (!idSet.has(n.id)) return n;
                    const { lockedBy: _removed, ...restData } = n.data as Record<string, unknown>;
                    return { ...n, draggable: true, selectable: true, data: restData };
                })
            );
        },
        [setNodes]
    );

    const { peers, lockedBy, emitCursorMove, emitDragStart, emitDragMove, emitDragEnd } =
        useCollaboration({ projectId, userId, onRemoteNodeMoves, onNodesReleased });

    // When a node is no longer locked by a remote peer, delay clearing its remote position.
    // The dragging peer's PATCH fires ~500ms after drag-end; the server then emits an SSE
    // entity-changed event; the observer needs that refetch to land before we stop overriding
    // the server value — otherwise buildNodes falls back to the pre-drag stale position.
    useEffect(() => {
        const released: string[] = [];
        remotePositionsRef.current.forEach((_, nodeId) => {
            if (!lockedBy.has(nodeId)) released.push(nodeId);
        });
        if (released.length === 0) return;
        const timer = setTimeout(() => {
            released.forEach((nodeId) => remotePositionsRef.current.delete(nodeId));
        }, 3000);
        return () => clearTimeout(timer);
    }, [lockedBy]);

    const handleCanvasMouseMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement>) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const { x: vpX, y: vpY, zoom } = viewportRef.current;
            const worldX = (e.clientX - rect.left - vpX) / zoom;
            const worldY = (e.clientY - rect.top - vpY) / zoom;
            emitCursorMove(worldX, worldY);
        },
        [emitCursorMove]
    );

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

    const handleAnnotationResize = useCallback(
        async (id: string, w: number, h: number) => {
            try {
                await persistSize('annotation', id, { w, h });
                setNodes((nds) =>
                    nds.map((n) =>
                        n.id === `annotation:${id}`
                            ? { ...n, style: { ...n.style, width: w, height: h } }
                            : n
                    )
                );
            } catch {
                toast.error('Failed to save size');
            }
        },
        [setNodes]
    );

    useEffect(() => {
        setNodes((prev) => {
            const next = buildNodes(highlights, themes, insights, annotations, files, handleOpen, handleAnnotationCommit, handleAnnotationDelete, handleAnnotationColorChange, handleRemoveFromTheme, handleAnnotationResize, localDraggingIdsRef.current, pinnedPositionsRef.current, remotePositionsRef.current, lockedBy, userId, prev);
            nodesRef.current = next;
            return next;
        });
    }, [highlights, themes, insights, annotations, files, handleOpen, handleAnnotationCommit, handleAnnotationDelete, handleAnnotationColorChange, handleRemoveFromTheme, handleAnnotationResize, lockedBy, userId, setNodes]);

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

            // Persist position after drag ends.
            // NOTE: do NOT handle 'dimensions' changes here — ReactFlow fires those on
            // every render when it measures nodes. Annotation resize is persisted via
            // onResizeEnd on the NodeResizer inside AnnotationNode instead.
            const positionCommits = changes.filter(
                (c) => c.type === 'position' && !c.dragging
            );

            if (positionCommits.length === 0) return;

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

            // Mark this node (and any children) as locally dragging so buildNodes
            // preserves their live positions during any concurrent SSE refetch.
            localDraggingIdsRef.current.add(draggedNode.id);
            emitDragStart([draggedNode.id]);

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

            // Also mark all children as locally dragging and acquire their locks
            childNodeIds.forEach((id) => localDraggingIdsRef.current.add(id));
            emitDragStart(childNodeIds);

            // Light up the parent's own aura to signal the group is in motion
            setNodes((nds) =>
                nds.map((n) =>
                    n.id === draggedNode.id ? { ...n, data: { ...n.data, proximity: 0.9 } } : n
                )
            );
        },
        [themes, insights, setNodes, emitDragStart]
    );

    const onNodeDrag: OnNodeDrag = useCallback(
        (event, draggedNode) => {
            // Emit cursor position during drag — React Flow captures pointer events so
            // the container's onMouseMove stops firing while a node is being dragged.
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const { x: vpX, y: vpY, zoom } = viewportRef.current;
                const worldX = (event.clientX - rect.left - vpX) / zoom;
                const worldY = (event.clientY - rect.top - vpY) / zoom;
                emitCursorMove(worldX, worldY);
            }

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

                // Relay group live positions to peers
                const groupMoves = [
                    { nodeId: draggedNode.id, position: draggedNode.position },
                    ...childNodeIds.map((id) => {
                        const rel = childRelOffsets.get(id) ?? { dx: 0, dy: 0 };
                        return { nodeId: id, position: { x: draggedNode.position.x + rel.dx, y: draggedNode.position.y + rel.dy } };
                    }),
                ];
                emitDragMove(groupMoves);

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

            // Relay individual node live position to peers
            emitDragMove([{ nodeId: draggedNode.id, position: draggedNode.position }]);

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
        [setNodes, emitDragMove, emitCursorMove]
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

            // Clear active-drag guard immediately — pinnedPositionsRef holds the final
            // position for 3 s so stale GET refetches cannot cause a visible jump.
            localDraggingIdsRef.current.delete(draggedNode.id);
            pinnedPositionsRef.current.set(draggedNode.id, draggedNode.position);
            setTimeout(() => pinnedPositionsRef.current.delete(draggedNode.id), 3000);
            if (groupDragRef.current?.parentId === draggedNode.id) {
                const childIds = groupDragRef.current.childNodeIds;
                childIds.forEach((id) => {
                    localDraggingIdsRef.current.delete(id);
                    const child = nodesRef.current.find((n) => n.id === id);
                    if (child) {
                        pinnedPositionsRef.current.set(id, child.position);
                        setTimeout(() => pinnedPositionsRef.current.delete(id), 3000);
                    }
                });
                // Release peer locks for the whole group
                emitDragEnd([draggedNode.id, ...childIds]);
            } else {
                emitDragEnd([draggedNode.id]);
            }

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
                // emitDragEnd for the group was already called above
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

    const handleNodesDelete = useCallback(
        async (deletedNodes: Node[]) => {
            const promises = deletedNodes.map((n) => {
                const colonIdx = n.id.indexOf(':');
                const kind = n.id.slice(0, colonIdx);
                const id = n.id.slice(colonIdx + 1);
                if (kind === 'code') return deleteHighlight(id);
                if (kind === 'theme') return deleteTheme(id);
                if (kind === 'insight') return deleteInsight(id);
                if (kind === 'annotation') return apiDeleteAnnotation(id);
                return Promise.resolve();
            });
            try {
                await Promise.all(promises);
                onUpdate();
            } catch {
                toast.error('Failed to delete one or more cards');
                onUpdate(); // re-sync state
            }
        },
        [onUpdate, emitDragEnd]
    );

    return (
        <div ref={containerRef} className="w-full h-full" onMouseMove={handleCanvasMouseMove}>
            {/* Peer presence strip — top-right, outside ReactFlow to avoid viewport transforms */}
            {peers.size > 0 && (
                <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5 pointer-events-none">
                    {Array.from(peers.values()).map((peer) => (
                        <div
                            key={peer.userId}
                            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow"
                            style={{ backgroundColor: peer.color, border: '2px solid white' }}
                            title={peer.displayName}
                        >
                            {peer.displayName.slice(0, 2).toUpperCase()}
                        </div>
                    ))}
                </div>
            )}
            <ReactFlow
                nodes={nodes}
                edges={[]}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onNodeDragStart={onNodeDragStart}
                onNodeDrag={onNodeDrag}
                onNodeDragStop={onNodeDragStop}
                onSelectionChange={handleSelectionChange}
                onNodesDelete={handleNodesDelete}
                fitView
                minZoom={0.1}
                maxZoom={2}
                panOnDrag={[1, 2]}
                selectionOnDrag={true}
                multiSelectionKeyCode="Shift"
                deleteKeyCode={['Delete', 'Backspace']}
                proOptions={{ hideAttribution: true }}
            >
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e5e7eb" />
                <Controls showInteractive={false} />
                {/* Collab: keep viewportRef in sync + render peer cursors */}
                <ViewportTracker viewportRef={viewportRef} />
                <PeerCursors peers={peers} />
            </ReactFlow>
        </div>
    );
}

// ─── Collaboration inner components (must be inside ReactFlow to use its context) ─

function ViewportTracker({
    viewportRef,
}: {
    viewportRef: React.MutableRefObject<{ x: number; y: number; zoom: number }>;
}) {
    const vp = useViewport();
    viewportRef.current = vp;
    return null;
}

function PeerCursors({ peers }: { peers: Map<string, PeerInfo> }) {
    const { x: vpX, y: vpY, zoom } = useViewport();
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {Array.from(peers.values()).map((peer) => {
                if (!peer.cursor) return null;
                const sx = peer.cursor.x * zoom + vpX;
                const sy = peer.cursor.y * zoom + vpY;
                return (
                    <div
                        key={peer.userId}
                        className="absolute flex items-start gap-0.5 pointer-events-none"
                        style={{ left: sx, top: sy, zIndex: 9999 }}
                    >
                        <svg
                            width="14"
                            height="18"
                            viewBox="0 0 14 18"
                            fill={peer.color}
                            style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.35))' }}
                        >
                            <path d="M0 0 L0 14 L3.5 10.5 L6 16 L8 15 L5.5 9.5 L10.5 9.5 Z" />
                        </svg>
                        <span
                            className="text-white text-[9px] font-medium leading-none px-1 py-0.5 rounded-sm whitespace-nowrap"
                            style={{ backgroundColor: peer.color, marginTop: '2px' }}
                        >
                            {peer.displayName}
                        </span>
                    </div>
                );
            })}
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
