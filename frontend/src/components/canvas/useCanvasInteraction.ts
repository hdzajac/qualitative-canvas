import { useRef, useState, useEffect, useCallback } from 'react';
import type { NodeView, NodeKind } from './CanvasTypes';
import type { Theme, Insight } from '@/types';
import { hitTestNode, isInOpenIcon, isInConnectHandle } from './CanvasUtils';
import { drawNode, drawOrthogonal, drawGrid } from './CanvasDrawing';

export type ResizeCorner = 'se' | 'sw' | 'ne' | 'nw';
type EdgeHit = { kind: 'code-theme' | 'theme-insight'; fromId: string; toId: string };

type DragState =
  | {
      mode: 'node';
      nodeIdx: number;
      startWorld: { x: number; y: number };
      startNode: { x: number; y: number };
      moved: boolean;
      group: Array<{ idx: number; startX: number; startY: number }>;
    }
  | {
      mode: 'pan';
      startOffset: { x: number; y: number };
      startClient: { x: number; y: number };
    }
  | {
      mode: 'select';
      startClient: { x: number; y: number };
      rect: { x: number; y: number; w: number; h: number };
    }
  | {
      mode: 'resize';
      nodeIdx: number;
      corner: ResizeCorner;
      startWorld: { x: number; y: number };
      startRect: { x: number; y: number; w: number; h: number };
      moved: boolean;
    }
  | {
      mode: 'connect';
      fromKind: NodeKind;
      fromId: string;
      start: { x: number; y: number };
      last: { x: number; y: number };
      anchor: { x: number; y: number };
    }
  | null;

interface UseCanvasInteractionProps {
  tool: 'select' | 'hand' | 'text';
  projectId: string;
  nodes: NodeView[];
  themes: Theme[];
  insights: Insight[];
  selectedCodeIds: string[];
  selectedThemeIds: string[];
  isPanning: boolean;
  zoom: number;
  offset: { x: number; y: number };
  size: { w: number; h: number };
  canvasRef: React.RefObject<HTMLCanvasElement>;
  dprRef: React.RefObject<number>;
  screenToWorld: (sx: number, sy: number) => { x: number; y: number };
  setOffset: (offset: { x: number; y: number }) => void;
  setNodes: React.Dispatch<React.SetStateAction<NodeView[]>>;
  setSelectedCodeIds: (ids: string[]) => void;
  setSelectedThemeIds: (ids: string[]) => void;
  clearSelection: () => void;
  draw: () => void;
  getFontSize: (n: NodeView) => number;
  getBottomRightLabel: (n: NodeView) => string;
  getLabelScroll: (nodeId: string, kind: NodeKind) => number;
  onNodeClick: (n: NodeView) => void;
  onEdgeDelete: (edge: EdgeHit) => void;
  onConnectComplete: (fromKind: NodeKind, fromId: string, targetId: string, targetKind: NodeKind) => void;
  onNodeMoveComplete: (movedNodes: NodeView[]) => void;
  onMarqueeSelect: (codes: string[], themes: string[], additive: boolean) => void;
  deleteSelection: () => void;
  onAnnotationCreate: (wx: number, wy: number) => void;
}

export function useCanvasInteraction({
  tool,
  projectId,
  nodes,
  themes,
  insights,
  selectedCodeIds,
  selectedThemeIds,
  isPanning,
  zoom,
  offset,
  size,
  canvasRef,
  dprRef,
  screenToWorld,
  setOffset,
  setNodes,
  setSelectedCodeIds,
  setSelectedThemeIds,
  clearSelection,
  draw,
  getFontSize,
  getBottomRightLabel,
  getLabelScroll,
  onNodeClick,
  onEdgeDelete,
  onConnectComplete,
  onNodeMoveComplete,
  onMarqueeSelect,
  deleteSelection,
  onAnnotationCreate,
}: UseCanvasInteractionProps) {
  const dragState = useRef<DragState>(null);
  const [hoverCursor, setHoverCursor] = useState<string>('default');
  const hoveredEdgeRef = useRef<EdgeHit | null>(null);
  const [hoveredEdgeVersion, setHoveredEdgeVersion] = useState(0);
  const hoverInfo = useRef<{ kind: 'node'; id: string } | null>(null);
  const connectTargetRef = useRef<{ id: string; kind: 'theme' | 'insight' } | null>(null);

  // Helper to test if mouse is near an edge
  const hitTestEdge = useCallback(
    (wx: number, wy: number): EdgeHit | null => {
      const tol = 8 / zoom;
      // Check code-theme edges
      for (const t of themes) {
        const tn = nodes.find((n) => n.kind === 'theme' && n.id === t.id);
        if (!tn) continue;
        for (const hid of t.highlightIds || []) {
          const hn = nodes.find((n) => n.kind === 'code' && n.id === hid);
          if (!hn) continue;
          const ax = hn.x + hn.w / 2;
          const ay = hn.y + hn.h;
          const bx = tn.x + tn.w / 2;
          const by = tn.y;
          const mx = (ax + bx) / 2;
          const my = (ay + by) / 2;
          const d = Math.sqrt((wx - mx) ** 2 + (wy - my) ** 2);
          if (d <= tol) return { kind: 'code-theme', fromId: hid, toId: t.id };
        }
      }
      // Check theme-insight edges
      for (const i of insights) {
        const inode = nodes.find((n) => n.kind === 'insight' && n.id === i.id);
        if (!inode) continue;
        for (const tid of i.themeIds || []) {
          const tnode = nodes.find((n) => n.kind === 'theme' && n.id === tid);
          if (!tnode) continue;
          const ax = tnode.x + tnode.w / 2;
          const ay = tnode.y + tnode.h;
          const bx = inode.x + inode.w / 2;
          const by = inode.y;
          const mx = (ax + bx) / 2;
          const my = (ay + by) / 2;
          const d = Math.sqrt((wx - mx) ** 2 + (wy - my) ** 2);
          if (d <= tol) return { kind: 'theme-insight', fromId: tid, toId: i.id };
        }
      }
      return null;
    },
    [nodes, themes, insights, zoom]
  );

  // Helper to toggle array membership
  const toggleInArray = (arr: string[], id: string, remove: boolean) => {
    if (remove) return arr.filter((x) => x !== id);
    return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
  };

  // Helper for rect intersection
  const intersects = (
    r1: { x: number; y: number; w: number; h: number },
    r2: { x: number; y: number; w: number; h: number }
  ) => {
    return r1.x < r2.x + r2.w && r1.x + r1.w > r2.x && r1.y < r2.y + r2.h && r1.y + r1.h > r2.y;
  };

  const union = (a: string[], b: string[]) => Array.from(new Set([...a, ...b]));

  const onMouseDown: React.MouseEventHandler<HTMLCanvasElement> = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    if (isPanning) {
      dragState.current = { mode: 'pan', startOffset: { ...offset }, startClient: { x: sx, y: sy } };
      return;
    }

    // Text tool: create annotation on click
    if (tool === 'text') {
      onAnnotationCreate(world.x, world.y);
      return;
    }

    const idx = hitTestNode(world.x, world.y, nodes);
    if (idx !== -1) {
      const n = nodes[idx];
      
      // Handle annotation inline edit
      if (n.kind === 'annotation') {
        if (isInOpenIcon(n, world.x, world.y)) {
          onNodeClick(n);
          return;
        }
        onNodeClick(n); // triggers editing
        return;
      }

      if (isInOpenIcon(n, world.x, world.y)) {
        onNodeClick(n);
        return;
      }

      // Start connect gesture if hitting handle
      if (isInConnectHandle(n, world.x, world.y, zoom)) {
        if (n.kind === 'code' || n.kind === 'theme') {
          e.preventDefault();
          e.stopPropagation();
          const ax = n.x + n.w - 8;
          const ay = n.y + n.h / 2;
          dragState.current = {
            mode: 'connect',
            fromKind: n.kind,
            fromId: n.id,
            start: world,
            last: world,
            anchor: { x: ax, y: ay },
          };
          setHoverCursor('crosshair');
          return;
        }
      }

      // Determine updated selection based on click
      const alreadySelected =
        (n.kind === 'code' && selectedCodeIds.includes(n.id)) ||
        (n.kind === 'theme' && selectedThemeIds.includes(n.id));
      let nextCodes = selectedCodeIds.slice();
      let nextThemes = selectedThemeIds.slice();
      if (n.kind === 'code') {
        if (e.shiftKey) {
          nextCodes = toggleInArray(nextCodes, n.id, false);
        } else if (!alreadySelected) {
          nextCodes = [n.id];
          nextThemes = [];
        }
      } else if (n.kind === 'theme') {
        if (e.shiftKey) {
          nextThemes = toggleInArray(nextThemes, n.id, false);
        } else if (!alreadySelected) {
          nextThemes = [n.id];
          nextCodes = [];
        }
      }
      // Apply selection state
      setSelectedCodeIds(nextCodes);
      setSelectedThemeIds(nextThemes);

      // Build drag group from the updated selection
      const groupIdxs: number[] = [];
      for (let i = 0; i < nodes.length; i++) {
        const nn = nodes[i];
        if (
          (nn.kind === 'code' && nextCodes.includes(nn.id)) ||
          (nn.kind === 'theme' && nextThemes.includes(nn.id))
        ) {
          groupIdxs.push(i);
        }
      }
      if (!groupIdxs.includes(idx)) groupIdxs.push(idx);
      const group = groupIdxs.map((i) => ({ idx: i, startX: nodes[i].x, startY: nodes[i].y }));

      dragState.current = {
        mode: 'node',
        nodeIdx: idx,
        startWorld: world,
        startNode: { x: n.x, y: n.y },
        moved: false,
        group,
      };
    } else {
      // Edge click? If close to an edge, prompt deletion
      const edge = hitTestEdge(world.x, world.y);
      if (edge) {
        onEdgeDelete(edge);
        return;
      }
      dragState.current = {
        mode: 'select',
        startClient: { x: sx, y: sy },
        rect: { x: sx, y: sy, w: 0, h: 0 },
      };
      if (!e.shiftKey) {
        clearSelection();
      }
    }
  };

  const onMouseMove: React.MouseEventHandler<HTMLCanvasElement> = (e) => {
    if (!dragState.current) {
      // hover cursor logic when idle
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy);
      if (isPanning) {
        setHoverCursor('grab');
        return;
      }
      const idx = hitTestNode(world.x, world.y, nodes);
      if (idx !== -1) {
        const n = nodes[idx];
        hoverInfo.current = { kind: 'node', id: n.id };
        if (isInOpenIcon(n, world.x, world.y)) {
          setHoverCursor('pointer');
          draw();
          return;
        }
        if (isInConnectHandle(n, world.x, world.y, zoom)) {
          setHoverCursor('crosshair');
          draw();
          return;
        }
        // If previously hovering an edge, clear it
        if (hoveredEdgeRef.current) {
          hoveredEdgeRef.current = null;
          setHoveredEdgeVersion((v) => v + 1);
        }
        setHoverCursor('move');
        draw();
      } else {
        hoverInfo.current = null;
        // edge hover?
        const edge = hitTestEdge(world.x, world.y);
        if (edge) {
          hoveredEdgeRef.current = edge;
          setHoveredEdgeVersion((v) => v + 1);
          setHoverCursor('x-delete');
        } else {
          if (hoveredEdgeRef.current) {
            hoveredEdgeRef.current = null;
            setHoveredEdgeVersion((v) => v + 1);
          }
          setHoverCursor('default');
        }
        draw();
      }
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (dragState.current.mode === 'pan') {
      const dx = sx - dragState.current.startClient.x;
      const dy = sy - dragState.current.startClient.y;
      setOffset({
        x: dragState.current.startOffset.x + dx,
        y: dragState.current.startOffset.y + dy,
      });
      draw();
      setHoverCursor('grabbing');
    } else if (dragState.current.mode === 'node') {
      const world = screenToWorld(sx, sy);
      const dx = world.x - dragState.current.startWorld.x;
      const dy = world.y - dragState.current.startWorld.y;
      const dsNode = dragState.current; // mode is 'node' here
      setNodes((prev) => {
        const copy = prev.slice();
        // Move all nodes in the group together
        dsNode.group.forEach((g) => {
          if (g.idx >= 0 && g.idx < copy.length) {
            copy[g.idx] = { ...copy[g.idx], x: g.startX + dx, y: g.startY + dy };
          }
        });
        return copy;
      });
      dragState.current.moved = true;
      draw();
      setHoverCursor('grabbing');
    } else if (dragState.current.mode === 'select') {
      const r = dragState.current.rect;
      r.w = sx - dragState.current.startClient.x;
      r.h = sy - dragState.current.startClient.y;
      // draw selection rectangle overlay
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = dprRef.current ?? 1;
      ctx.save();
      ctx.scale(dpr, dpr);
      // redraw scene
      ctx.clearRect(0, 0, size.w, size.h);
      drawGrid(ctx, size.w, size.h, 16, '#e5e7eb');
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);
      const byKey = new Map(nodes.map((n) => [`${n.kind}:${n.id}`, n] as const));
      ctx.save();
      ctx.strokeStyle = '#b1b1b7';
      ctx.lineWidth = 1;
      themes.forEach((t) => {
        t.highlightIds.forEach((hid: string) => {
          const a = byKey.get(`code:${hid}`);
          const b = byKey.get(`theme:${t.id}`);
          if (!a || !b) return;
          drawOrthogonal(ctx, a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y);
        });
      });
      insights.forEach((i) => {
        i.themeIds.forEach((tid: string) => {
          const a = byKey.get(`theme:${tid}`);
          const b = byKey.get(`insight:${i.id}`);
          if (!a || !b) return;
          drawOrthogonal(ctx, a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y);
        });
      });
      ctx.restore();
      nodes.forEach((n) =>
        drawNode(ctx, n, selectedCodeIds, selectedThemeIds, getFontSize, getBottomRightLabel)
      );
      ctx.restore();
      // draw marquee in screen space
      const x = Math.min(dragState.current.startClient.x, sx);
      const y = Math.min(dragState.current.startClient.y, sy);
      const w = Math.abs(dragState.current.startClient.x - sx);
      const h = Math.abs(dragState.current.startClient.y - sy);
      const ctx2 = canvas.getContext('2d');
      if (!ctx2) return;
      ctx2.save();
      ctx2.scale(dpr, dpr);
      ctx2.strokeStyle = '#111827';
      ctx2.setLineDash([5, 5]);
      ctx2.lineWidth = 1.5;
      ctx2.strokeRect(x, y, w, h);
      ctx2.restore();
    } else if (dragState.current.mode === 'connect') {
      const world = screenToWorld(sx, sy);
      dragState.current.last = world;

      // Update hovered connect target indicator
      const fromKind = dragState.current.fromKind; // 'code' | 'theme'
      const idx = hitTestNode(world.x, world.y, nodes);
      let nextTarget: null | { id: string; kind: 'theme' | 'insight' } = null;
      if (idx !== -1) {
        const tgt = nodes[idx];
        const ok =
          (fromKind === 'code' && tgt.kind === 'theme') ||
          (fromKind === 'theme' && tgt.kind === 'insight');
        if (ok) nextTarget = { id: tgt.id, kind: tgt.kind } as { id: string; kind: 'theme' | 'insight' };
      }
      connectTargetRef.current = nextTarget;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = dprRef.current ?? 1;
      // Reset transform and clear entire canvas in device pixels
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      // Draw base scene
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size.w, size.h);
      drawGrid(ctx, size.w, size.h, 16, '#e5e7eb');
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);
      // Edges
      const byKey = new Map(nodes.map((n) => [`${n.kind}:${n.id}`, n] as const));
      ctx.save();
      ctx.strokeStyle = '#b1b1b7';
      ctx.lineWidth = 1;
      themes.forEach((t) => {
        t.highlightIds.forEach((hid: string) => {
          const a = byKey.get(`code:${hid}`);
          const b = byKey.get(`theme:${t.id}`);
          if (!a || !b) return;
          drawOrthogonal(ctx, a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y);
        });
      });
      insights.forEach((i) => {
        i.themeIds.forEach((tid: string) => {
          const a = byKey.get(`theme:${tid}`);
          const b = byKey.get(`insight:${i.id}`);
          if (!a || !b) return;
          drawOrthogonal(ctx, a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y);
        });
      });
      ctx.restore();
      // Nodes with potential highlight
      nodes.forEach((n) => {
        const isConnectingFromThis =
          dragState.current && dragState.current.mode === 'connect' && dragState.current.fromId === n.id;
        const showHandle =
          isConnectingFromThis ||
          (hoverInfo.current && hoverInfo.current.kind === 'node' && hoverInfo.current.id === n.id
            ? n.kind === 'code' || n.kind === 'theme'
            : false);
        const isConnectTarget = Boolean(connectTargetRef.current && connectTargetRef.current.id === n.id);
        drawNode(ctx, n, selectedCodeIds, selectedThemeIds, getFontSize, getBottomRightLabel, undefined, {
          showHandle,
          highlightAsTarget: isConnectTarget,
        });
      });
      ctx.restore();

      // Draw overlay wire using same world transform
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);
      ctx.strokeStyle = '#111827';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      const dsConn = dragState.current; // narrowed to 'connect'
      if (dsConn && dsConn.mode === 'connect') {
        const ax = dsConn.anchor.x;
        const ay = dsConn.anchor.y;
        const bx = world.x;
        const by = world.y;
        drawOrthogonal(ctx, ax, ay, bx, by);
      }
      ctx.restore();
      setHoverCursor('crosshair');
    }
  };

  const onMouseLeave: React.MouseEventHandler<HTMLCanvasElement> = () => {
    setHoverCursor('default');
    if (hoveredEdgeRef.current) {
      hoveredEdgeRef.current = null;
      setHoveredEdgeVersion((v) => v + 1);
    }
    // clear any transient connect target highlight
    connectTargetRef.current = null;
    draw();
  };

  const onMouseUp: React.MouseEventHandler<HTMLCanvasElement> = (e) => {
    const ds = dragState.current;
    dragState.current = null;
    setHoverCursor('default');
    if (hoveredEdgeRef.current) {
      hoveredEdgeRef.current = null;
      setHoveredEdgeVersion((v) => v + 1);
    }
    // reset potential target highlight
    connectTargetRef.current = null;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (!ds) return;

    // Finish connect: if released over a valid target, update model
    if (ds.mode === 'connect') {
      const world = screenToWorld(sx, sy);
      const idx = hitTestNode(world.x, world.y, nodes);
      if (idx !== -1) {
        const target = nodes[idx];
        onConnectComplete(ds.fromKind, ds.fromId, target.id, target.kind);
      }
      return;
    }

    // Persist node move
    if (ds.mode === 'node' && ds.moved) {
      const uniqueIdxs = Array.from(new Set(ds.group.map((g) => g.idx)));
      const movedNodes = uniqueIdxs.map((i) => nodes[i]).filter(Boolean);
      onNodeMoveComplete(movedNodes);
    }

    // Finish marquee selection
    if (ds.mode === 'select') {
      const x1 = Math.min(ds.startClient.x, sx);
      const y1 = Math.min(ds.startClient.y, sy);
      const x2 = Math.max(ds.startClient.x, sx);
      const y2 = Math.max(ds.startClient.y, sy);
      const w1 = screenToWorld(x1, y1);
      const w2 = screenToWorld(x2, y2);
      const rectW = {
        x: Math.min(w1.x, w2.x),
        y: Math.min(w1.y, w2.y),
        w: Math.abs(w1.x - w2.x),
        h: Math.abs(w1.y - w2.y),
      };
      const codes: string[] = [];
      const ths: string[] = [];
      nodes.forEach((n) => {
        if (intersects(rectW, { x: n.x, y: n.y, w: n.w, h: n.h })) {
          if (n.kind === 'code') codes.push(n.id);
          if (n.kind === 'theme') ths.push(n.id);
        }
      });
      onMarqueeSelect(codes, ths, e.shiftKey);
    }
  };

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (dragState.current) {
        e.preventDefault();
        return;
      }
      // Wheel zoom handled by viewport hook, nothing to do here
    },
    []
  );

  // Keyboard handlers
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        // Space panning trigger handled by parent
      }
      if ((e.key === 'Delete' || e.key === 'Backspace')) {
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
          e.preventDefault();
          deleteSelection();
        }
      }
    };
    window.addEventListener('keydown', down);
    return () => {
      window.removeEventListener('keydown', down);
    };
  }, [deleteSelection]);

  return {
    dragState,
    hoverCursor,
    hoveredEdge: hoveredEdgeRef.current,
    hoveredEdgeRef, // Export the ref itself for Canvas.tsx draw function
    hoveredEdgeVersion,
    hoverInfo: hoverInfo.current,
    onMouseDown,
    onMouseMove,
    onMouseLeave,
    onMouseUp,
    onWheel,
  };
}
