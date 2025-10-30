import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Highlight, Theme, Insight, Annotation, CardStyle } from '@/types';
import { Button } from './ui/button';
import { MousePointer2, Hand, Type as TypeIcon, X as CloseIcon, Text as TextSizeIcon, Trash2 } from 'lucide-react';
import { createAnnotation, createTheme, createInsight, updateHighlight, updateTheme, updateInsight, updateAnnotation, deleteHighlight, deleteTheme, deleteInsight, deleteAnnotation } from '@/services/api';
import { toast } from 'sonner';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { NodeKind, Tool, NodeView, DEFAULTS, ResizeCorner } from './canvas/CanvasTypes';
import { clamp, toggleInArray, union, hitTestNode, intersects } from './canvas/CanvasUtils';
import { drawGrid, drawOrthogonal, roundRect, drawNode } from './canvas/CanvasDrawing';

interface CanvasProps {
  highlights: Highlight[];
  themes: Theme[];
  insights: Insight[];
  annotations: Annotation[];
  onUpdate: () => void;
}

export const Canvas = ({ highlights, themes, insights, annotations, onUpdate }: CanvasProps) => {
  // Canvas and size
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const dprRef = useRef<number>(1);

  // Viewport transform
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // screen-space offset
  const firstFitDone = useRef(false);

  // Tools and interaction
  const [tool, setTool] = useState<Tool>('select');
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const isPanning = tool === 'hand' || isSpacePanning;

  // Selection
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([]);
  const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>([]);

  // Dragging
  const dragState = useRef<
    | {
      mode: 'node';
      nodeIdx: number;
      startWorld: { x: number; y: number };
      startNode: { x: number; y: number };
      moved: boolean;
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
    | null
  >(null);

  // Cursor hint when hovering
  const [hoverCursor, setHoverCursor] = useState<string>('default');

  const [projectId] = useSelectedProject();

  // Build node views from data; keep local state so we can move nodes immediately
  const [nodes, setNodes] = useState<NodeView[]>([]);
  const nodeIndexByKey = useMemo(() => {
    const m = new Map<string, number>();
    nodes.forEach((n, i) => m.set(`${n.kind}:${n.id}`, i));
    return m;
  }, [nodes]);

  // Fit to content helper
  const fitToContent = useCallback(() => {
    if (!nodes.length || !size.w || !size.h) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) return;
    const pad = 40;
    const worldW = Math.max(1, maxX - minX);
    const worldH = Math.max(1, maxY - minY);
    const scaleX = (size.w - pad * 2) / worldW;
    const scaleY = (size.h - pad * 2) / worldH;
    const newZoom = clamp(Math.min(scaleX, scaleY), 0.2, 2.5);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const newOffset = { x: size.w / 2 - cx * newZoom, y: size.h / 2 - cy * newZoom };
    setZoom(newZoom);
    setOffset(newOffset);
  }, [nodes, size.w, size.h]);

  useEffect(() => {
    const newNodes: NodeView[] = [];

    // Code nodes
    highlights.forEach((h, idx) => {
      newNodes.push({
        id: h.id,
        kind: 'code',
        x: h.position?.x ?? 100 + (idx % 5) * 260,
        y: h.position?.y ?? 100 + Math.floor(idx / 5) * 180,
        w: (h.size?.w) ?? DEFAULTS.code.w,
        h: (h.size?.h) ?? DEFAULTS.code.h,
        highlight: h,
      });
    });

    // Theme nodes
    themes.forEach((t, idx) => {
      newNodes.push({
        id: t.id,
        kind: 'theme',
        x: t.position?.x ?? 100 + (idx % 4) * 320,
        y: t.position?.y ?? 420,
        w: (t.size?.w) ?? DEFAULTS.theme.w,
        h: (t.size?.h) ?? DEFAULTS.theme.h,
        theme: t,
      });
    });

    // Insight nodes
    insights.forEach((i, idx) => {
      newNodes.push({
        id: i.id,
        kind: 'insight',
        x: i.position?.x ?? 100 + (idx % 3) * 380,
        y: i.position?.y ?? 760,
        w: (i.size?.w) ?? DEFAULTS.insight.w,
        h: (i.size?.h) ?? DEFAULTS.insight.h,
        insight: i,
      });
    });

    // Annotation nodes
    annotations.forEach((a, idx) => {
      newNodes.push({
        id: a.id,
        kind: 'annotation',
        x: a.position?.x ?? 60 + (idx % 6) * 190,
        y: a.position?.y ?? 60,
        w: (a.size?.w) ?? DEFAULTS.annotation.w,
        h: (a.size?.h) ?? DEFAULTS.annotation.h,
        annotation: a,
      });
    });

    setNodes((prev) => {
      // Try to keep user-adjusted positions if already in state
      type Key = `${NodeKind}:${string}`;
      const prevMap = new Map<Key, NodeView>(prev.map((p) => [`${p.kind}:${p.id}` as Key, p]));
      return newNodes.map((n) => {
        const key = `${n.kind}:${n.id}` as Key;
        const prevN = prevMap.get(key);
        return prevN ? { ...n, x: prevN.x, y: prevN.y, w: prevN.w, h: prevN.h } : n;
      });
    });
  }, [highlights, themes, insights, annotations]);

  // Auto-fit lifecycle: reset on project change, then fit once when ready
  useEffect(() => { firstFitDone.current = false; }, [projectId]);
  useEffect(() => {
    if (!firstFitDone.current && nodes.length > 0 && size.w > 0 && size.h > 0) {
      fitToContent();
      firstFitDone.current = true;
    }
  }, [nodes.length, size.w, size.h, fitToContent]);

  // Resize handling with DPR scaling
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      dprRef.current = dpr;
      setSize({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = dprRef.current;
    canvas.width = Math.max(1, Math.floor(size.w * dpr));
    canvas.height = Math.max(1, Math.floor(size.h * dpr));
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

  // Keyboard for tools and space-panning
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePanning(true);
      if (e.code === 'KeyV') setTool('select');
      if (e.code === 'KeyH') setTool('hand');
      if (e.code === 'KeyT') setTool('text');
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePanning(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Draw function stable
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = dprRef.current;
    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear
    ctx.clearRect(0, 0, size.w, size.h);

    // Background grid (dots)
    drawGrid(ctx, size.w, size.h, 16, '#e5e7eb');

    // Apply transform
    ctx.translate(offset.x, offset.y);
    ctx.scale(zoom, zoom);

    // Edges under nodes
    // Re-implement drawEdges using extracted helpers
    const byKey = new Map(nodes.map((n) => [`${n.kind}:${n.id}`, n] as const));
    ctx.save();
    ctx.strokeStyle = '#b1b1b7';
    ctx.lineWidth = 1;
    themes.forEach((t) => {
      t.highlightIds.forEach((hid) => {
        const a = byKey.get(`code:${hid}`);
        const b = byKey.get(`theme:${t.id}`);
        if (!a || !b) return;
        const ax = a.x + a.w / 2;
        const ay = a.y + a.h;
        const bx = b.x + b.w / 2;
        const by = b.y;
        drawOrthogonal(ctx, ax, ay, bx, by);
      });
    });
    insights.forEach((i) => {
      i.themeIds.forEach((tid) => {
        const a = byKey.get(`theme:${tid}`);
        const b = byKey.get(`insight:${i.id}`);
        if (!a || !b) return;
        const ax = a.x + a.w / 2;
        const ay = a.y + a.h;
        const bx = b.x + b.w / 2;
        const by = b.y;
        drawOrthogonal(ctx, ax, ay, bx, by);
      });
    });
    ctx.restore();

    // Nodes
    nodes.forEach((n) => drawNode(ctx, n, selectedCodeIds, selectedThemeIds, getFontSize));

    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, offset.x, offset.y, zoom, nodes, selectedCodeIds, selectedThemeIds]);

  // Redraw when state changes
  useEffect(() => { draw(); }, [draw]);

  // Compute contextual popup visibility
  const showPopup = selectedCodeIds.length >= 2 || selectedThemeIds.length >= 1;

  // Helper transforms first
  const worldToScreen = useCallback(
    (wx: number, wy: number) => ({ x: wx * zoom + offset.x, y: wy * zoom + offset.y }),
    [zoom, offset.x, offset.y]
  );
  const screenToWorld = useCallback(
    (sx: number, sy: number) => ({ x: (sx - offset.x) / zoom, y: (sy - offset.y) / zoom }),
    [zoom, offset.x, offset.y]
  );

  // Helpers to position new nodes
  const viewportCenterWorld = useCallback(() => screenToWorld(size.w / 2, size.h / 2), [screenToWorld, size.w, size.h]);
  const selectionBBox = useCallback((kinds: NodeKind[]) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      const ok = (kinds.includes('code') && selectedCodeIds.includes(n.id) && n.kind === 'code') || (kinds.includes('theme') && selectedThemeIds.includes(n.id) && n.kind === 'theme');
      if (!ok) continue;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.w);
      maxY = Math.max(maxY, n.y + n.h);
    }
    if (!isFinite(minX)) return null;
    return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }, [nodes, selectedCodeIds, selectedThemeIds]);

  const placeRightOf = useCallback((bbox: { maxX: number; cy: number }, w: number, h: number) => {
    const margin = 40;
    return { x: bbox.maxX + margin, y: bbox.cy - h / 2 };
  }, []);

  // onWheel handler bound to current state
  const onWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
    const worldBefore = screenToWorld(mx, my);
    const delta = -e.deltaY; const factor = Math.exp(delta * 0.001);
    const newZoom = clamp(zoom * factor, 0.2, 2.5); setZoom(newZoom);
    const newOffsetX = mx - worldBefore.x * newZoom; const newOffsetY = my - worldBefore.y * newZoom;
    setOffset({ x: newOffsetX, y: newOffsetY });
  }, [screenToWorld, zoom]);

  // Draw wrapped so it's stable
  // const draw = useCallback(() => {
  //   const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; const dpr = dprRef.current;
  //   ctx.save(); ctx.scale(dpr, dpr);
  //   ctx.clearRect(0, 0, size.w, size.h);
  //   drawGrid(ctx, size.w, size.h, 16, '#e5e7eb');
  //   ctx.translate(offset.x, offset.y); ctx.scale(zoom, zoom);
  //   drawEdges(ctx, nodes);
  //   nodes.forEach((n) => drawNode(ctx, n, selectedCodeIds, selectedThemeIds));
  //   ctx.restore();
  // }, [size.w, size.h, offset.x, offset.y, zoom, nodes, selectedCodeIds, selectedThemeIds]);

  // useEffect(() => { draw(); }, [draw]);

  // function draw() {
  //   const canvas = canvasRef.current;
  //   if (!canvas) return;
  //   const ctx = canvas.getContext('2d');
  //   if (!ctx) return;
  //   const dpr = dprRef.current;
  //   ctx.save();
  //   ctx.scale(dpr, dpr);
  //
  //   // Clear
  //   ctx.clearRect(0, 0, size.w, size.h);
  //
  //   // Background grid (dots)
  //   drawGrid(ctx, size.w, size.h, 16, '#e5e7eb');
  //
  //   // Apply transform
  //   ctx.translate(offset.x, offset.y);
  //   ctx.scale(zoom, zoom);
  //
  //   // Edges under nodes
  //   drawEdges(ctx, nodes);
  //
  //   // Nodes
  //   nodes.forEach((n) => drawNode(ctx, n, selectedCodeIds, selectedThemeIds));
  //
  //   ctx.restore();
  // }

  // hitTest for top-right open icon
  function isInOpenIcon(n: NodeView, wx: number, wy: number) {
    return wx >= n.x + n.w - 28 && wx <= n.x + n.w - 8 && wy >= n.y + 6 && wy <= n.y + 20;
  }

  const onMouseDown: React.MouseEventHandler<HTMLCanvasElement> = (e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = screenToWorld(sx, sy);

    if (isPanning) { dragState.current = { mode: 'pan', startOffset: { ...offset }, startClient: { x: sx, y: sy } }; return; }

    const idx = hitTestNode(world.x, world.y, nodes);
    if (idx !== -1) {
      const n = nodes[idx];
      if (isInOpenIcon(n, world.x, world.y)) { openPopupFor(n); return; }
      dragState.current = { mode: 'node', nodeIdx: idx, startWorld: world, startNode: { x: n.x, y: n.y }, moved: false };
      if (n.kind === 'code') setSelectedCodeIds((prev) => toggleInArray(prev, n.id, !e.shiftKey));
      if (n.kind === 'theme') setSelectedThemeIds((prev) => toggleInArray(prev, n.id, !e.shiftKey));
    } else {
      dragState.current = { mode: 'select', startClient: { x: sx, y: sy }, rect: { x: sx, y: sy, w: 0, h: 0 } };
      if (!e.shiftKey) { setSelectedCodeIds([]); setSelectedThemeIds([]); }
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
      if (isPanning) { setHoverCursor('grab'); return; }
      const idx = hitTestNode(world.x, world.y, nodes);
      if (idx !== -1) {
        const n = nodes[idx];
        if (isInOpenIcon(n, world.x, world.y)) { setHoverCursor('pointer'); return; }
        setHoverCursor('move');
      } else {
        setHoverCursor('default');
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
      setOffset({ x: dragState.current.startOffset.x + dx, y: dragState.current.startOffset.y + dy });
      draw();
      setHoverCursor('grabbing');
    } else if (dragState.current.mode === 'node') {
      const world = screenToWorld(sx, sy);
      const dx = world.x - dragState.current.startWorld.x;
      const dy = world.y - dragState.current.startWorld.y;
      const dsNode = dragState.current; // mode is 'node' here
      setNodes((prev) => {
        const copy = prev.slice();
        const i = dsNode.nodeIdx;
        if (i >= 0) { copy[i] = { ...copy[i], x: dsNode.startNode.x + dx, y: dsNode.startNode.y + dy }; }
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
      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      const dpr = dprRef.current;
      ctx.save();
      ctx.scale(dpr, dpr);
      // redraw scene
      ctx.clearRect(0, 0, size.w, size.h);
      drawGrid(ctx, size.w, size.h, 16, '#e5e7eb');
      ctx.translate(offset.x, offset.y); ctx.scale(zoom, zoom);
      const byKey = new Map(nodes.map((n) => [`${n.kind}:${n.id}`, n] as const));
      ctx.save(); ctx.strokeStyle = '#b1b1b7'; ctx.lineWidth = 1;
      themes.forEach((t) => { t.highlightIds.forEach((hid) => { const a = byKey.get(`code:${hid}`); const b = byKey.get(`theme:${t.id}`); if (!a || !b) return; drawOrthogonal(ctx, a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y); }); });
      insights.forEach((i) => { i.themeIds.forEach((tid) => { const a = byKey.get(`theme:${tid}`); const b = byKey.get(`insight:${i.id}`); if (!a || !b) return; drawOrthogonal(ctx, a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y); }); });
      ctx.restore();
      nodes.forEach((n) => drawNode(ctx, n, selectedCodeIds, selectedThemeIds, getFontSize));
      ctx.restore();
      // draw marquee in screen space
      const x = Math.min(dragState.current.startClient.x, sx);
      const y = Math.min(dragState.current.startClient.y, sy);
      const w = Math.abs(dragState.current.startClient.x - sx);
      const h = Math.abs(dragState.current.startClient.y - sy);
      const ctx2 = canvas.getContext('2d'); if (!ctx2) return;
      ctx2.save();
      ctx2.scale(dpr, dpr);
      ctx2.strokeStyle = '#111827';
      ctx2.setLineDash([5, 5]);
      ctx2.lineWidth = 1.5;
      ctx2.strokeRect(x, y, w, h);
      ctx2.restore();
    }
  };

  const onMouseUp: React.MouseEventHandler<HTMLCanvasElement> = async (e) => {
    const ds = dragState.current; dragState.current = null; setHoverCursor('default');
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Text tool: create annotation at click
    if (tool === 'text') {
      const world = screenToWorld(sx, sy);
      await createAnnotation({ content: 'New text', position: { x: world.x, y: world.y }, projectId, size: DEFAULTS.annotation, style: { fontSize } });
      toast.success('Text added');
      onUpdate();
      return;
    }

    if (!ds) return;

    // Persist node move
    if (ds.mode === 'node' && ds.moved) {
      const n = nodes[ds.nodeIdx];
      try {
        if (n.kind === 'code' && n.highlight) await updateHighlight(n.id, { position: { x: n.x, y: n.y }, size: { w: n.w, h: n.h } });
        if (n.kind === 'theme' && n.theme) await updateTheme(n.id, { position: { x: n.x, y: n.y }, size: { w: n.w, h: n.h } });
        if (n.kind === 'insight' && n.insight) await updateInsight(n.id, { position: { x: n.x, y: n.y }, size: { w: n.w, h: n.h } });
        if (n.kind === 'annotation' && n.annotation) await updateAnnotation(n.id, { position: { x: n.x, y: n.y }, size: { w: n.w, h: n.h } });
        onUpdate();
      } catch (err) { console.error(err); toast.error('Failed to save'); }
    }

    // Finish marquee selection
    if (ds.mode === 'select') {
      const x1 = Math.min(ds.startClient.x, sx);
      const y1 = Math.min(ds.startClient.y, sy);
      const x2 = Math.max(ds.startClient.x, sx);
      const y2 = Math.max(ds.startClient.y, sy);
      const w1 = screenToWorld(x1, y1);
      const w2 = screenToWorld(x2, y2);
      const rectW = { x: Math.min(w1.x, w2.x), y: Math.min(w1.y, w2.y), w: Math.abs(w1.x - w2.x), h: Math.abs(w1.y - w2.y) };
      const codes: string[] = [];
      const ths: string[] = [];
      nodes.forEach((n) => {
        if (intersects(rectW, { x: n.x, y: n.y, w: n.w, h: n.h })) {
          if (n.kind === 'code') codes.push(n.id);
          if (n.kind === 'theme') ths.push(n.id);
        }
      });
      setSelectedCodeIds((prev) => (e.shiftKey ? union(prev, codes) : codes));
      setSelectedThemeIds((prev) => (e.shiftKey ? union(prev, ths) : ths));
      draw();
    }
  };

  // Popup editing for all kinds
  const [openEntity, setOpenEntity] = useState<{ kind: NodeKind; id: string } | null>(null);
  function openPopupFor(n: NodeView) { setOpenEntity({ kind: n.kind, id: n.id }); }

  const [fontSize, setFontSize] = useState(12);
  useEffect(() => { /* no-op; value applied when drawing via getFontSize */ }, [fontSize]);
  const getFontSize = (n: NodeView) => {
    const style: CardStyle | undefined = n.kind === 'code' ? n.highlight?.style : n.kind === 'theme' ? n.theme?.style : n.kind === 'insight' ? n.insight?.style : n.annotation?.style;
    return style?.fontSize ?? fontSize;
  };

  async function persistFontSize(n: NodeView, size: number) {
    try {
      if (n.kind === 'code') await updateHighlight(n.id, { style: { ...(n.highlight?.style || {}), fontSize: size } });
      if (n.kind === 'theme') await updateTheme(n.id, { style: { ...(n.theme?.style || {}), fontSize: size } });
      if (n.kind === 'insight') await updateInsight(n.id, { style: { ...(n.insight?.style || {}), fontSize: size } });
      if (n.kind === 'annotation') await updateAnnotation(n.id, { style: { ...(n.annotation?.style || {}), fontSize: size } });
      onUpdate();
    } catch { toast.error('Failed to save font size'); }
  }

  // Toolbar additions: text size selector
  // ...left toolbar remains, append a small control on top center

  return (
    <div ref={wrapperRef} className="relative w-full h-full select-none">
      {/* Canvas layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
        style={{ cursor: hoverCursor }}
      />

      <div className="absolute left-3 top-20 z-20 flex flex-col gap-2">
        <Button size="icon" variant={tool === 'select' ? 'default' : 'outline'} className="rounded-none" onClick={() => setTool('select')} title="Select (V)">
          <MousePointer2 className="w-4 h-4" />
        </Button>
        <Button size="icon" variant={tool === 'hand' ? 'default' : 'outline'} className="rounded-none" onClick={() => setTool('hand')} title="Pan (Space)">
          <Hand className="w-4 h-4" />
        </Button>
        <Button size="icon" variant={tool === 'text' ? 'default' : 'outline'} className="rounded-none" onClick={() => setTool('text')} title="Text (T)">
          <TypeIcon className="w-4 h-4" />
        </Button>
        {/* Fit to content */}
        <Button size="sm" variant="outline" className="rounded-none" onClick={fitToContent} title="Fit to content">
          Fit
        </Button>
      </div>

      <div className="absolute z-20 top-3 left-1/2 -translate-x-1/2 bg-white border-2 border-black px-2 py-1 flex items-center gap-2">
        <TextSizeIcon className="w-4 h-4" />
        <select className="text-sm outline-none" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value) || 12)}>
          {[10, 12, 14, 16, 18, 20, 24].map(sz => <option key={sz} value={sz}>{sz}px</option>)}
        </select>
        {(() => {
          const idx = selectedCodeIds.length === 1 ? nodes.findIndex(n => n.kind === 'code' && n.id === selectedCodeIds[0]) : selectedThemeIds.length === 1 ? nodes.findIndex(n => n.kind === 'theme' && n.id === selectedThemeIds[0]) : -1;
          const n = idx >= 0 ? nodes[idx] : null;
          return n ? <Button size="sm" className="brutal-button" onClick={() => persistFontSize(n, fontSize)}>Apply</Button> : null;
        })()}
      </div>

      {/* Contextual popup */}
      {showPopup && (
        <div className="absolute z-20 bg-white border-2 border-black p-2 left-3 top-3 space-y-2">
          {selectedCodeIds.length >= 2 && (
            <div>
              <div className="text-xs mb-2">{selectedCodeIds.length} codes selected</div>
              <Button
                size="sm"
                className="brutal-button"
                onClick={async () => {
                  const name = prompt('Theme name');
                  if (!name) return;
                  // compute desired position: to the right of selected codes, else viewport center
                  const bbox = selectionBBox(['code']);
                  const defaultW = DEFAULTS.theme.w; const defaultH = DEFAULTS.theme.h;
                  const pos = bbox ? placeRightOf(bbox, defaultW, defaultH) : viewportCenterWorld();
                  await createTheme({ name, highlightIds: selectedCodeIds, size: DEFAULTS.theme, position: pos });
                  toast.success('Theme created');
                  setSelectedCodeIds([]);
                  onUpdate();
                }}
              >
                Create Theme
              </Button>
            </div>
          )}
          {selectedThemeIds.length >= 1 && (
            <div>
              <div className="text-xs mb-2">{selectedThemeIds.length} themes selected</div>
              <Button
                size="sm"
                className="brutal-button"
                onClick={async () => {
                  const name = prompt('Insight name');
                  if (!name) return;
                  const bbox = selectionBBox(['theme']);
                  const defaultW = DEFAULTS.insight.w; const defaultH = DEFAULTS.insight.h;
                  const pos = bbox ? placeRightOf(bbox, defaultW, defaultH) : viewportCenterWorld();
                  await createInsight({ name, themeIds: selectedThemeIds, size: DEFAULTS.insight, position: pos });
                  toast.success('Insight created');
                  setSelectedThemeIds([]);
                  onUpdate();
                }}
              >
                Create Insight
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Size controls for single selection (width presets + font size per-card) */}
      {(() => {
        const singleCode = selectedCodeIds.length === 1 ? nodes.find(n => n.kind === 'code' && n.id === selectedCodeIds[0]) : undefined;
        const singleTheme = (!singleCode && selectedThemeIds.length === 1) ? nodes.find(n => n.kind === 'theme' && n.id === selectedThemeIds[0]) : undefined;
        const n = singleCode || singleTheme;
        if (!n) return null;
        const fs = getFontSize(n);
        return (
          <div className="absolute right-3 top-3 z-20 bg-white border-2 border-black p-2 flex items-center gap-2">
            <span className="text-xs">Width</span>
            <Button size="sm" variant={n.w <= 210 ? 'default' : 'outline'} className="rounded-none h-6 px-2" onClick={() => { setNodes(prev => prev.map(nn => nn === n ? { ...nn, w: 200 } : nn)); draw(); }}>200</Button>
            <Button size="sm" variant={n.w >= 290 ? 'default' : 'outline'} className="rounded-none h-6 px-2" onClick={() => { setNodes(prev => prev.map(nn => nn === n ? { ...nn, w: 300 } : nn)); draw(); }}>300</Button>
            <span className="text-xs ml-2">Text</span>
            <select className="text-xs border border-black px-1 py-0.5" value={fs} onChange={(e) => {
              const val = parseInt(e.target.value) || 12;
              setNodes(prev => prev.map(nn => nn === n ? (n.kind === 'code' ? { ...nn, highlight: { ...nn.highlight!, style: { ...(nn.highlight?.style || {}), fontSize: val } } } : n.kind === 'theme' ? { ...nn, theme: { ...nn.theme!, style: { ...(nn.theme?.style || {}), fontSize: val } } } : n.kind === 'insight' ? { ...nn, insight: { ...nn.insight!, style: { ...(nn.insight?.style || {}), fontSize: val } } } : { ...nn, annotation: { ...nn.annotation!, style: { ...(nn.annotation?.style || {}), fontSize: val } } }) : nn));
              draw();
            }}>
              {[10, 12, 14, 16, 18, 20, 24].map(s => <option key={s} value={s}>{s}px</option>)}
            </select>
            <Button size="sm" className="brutal-button" onClick={async () => {
              try {
                if (n.kind === 'code') await updateHighlight(n.id, { size: { w: n.w, h: n.h }, style: { ...(n.highlight?.style || {}), fontSize: getFontSize(n) } });
                if (n.kind === 'theme') await updateTheme(n.id, { size: { w: n.w, h: n.h }, style: { ...(n.theme?.style || {}), fontSize: getFontSize(n) } });
                if (n.kind === 'insight') await updateInsight(n.id, { size: { w: n.w, h: n.h }, style: { ...(n.insight?.style || {}), fontSize: getFontSize(n) } });
                if (n.kind === 'annotation') await updateAnnotation(n.id, { size: { w: n.w, h: n.h }, style: { ...(n.annotation?.style || {}), fontSize: getFontSize(n) } });
                toast.success('Saved');
                onUpdate();
              } catch { toast.error('Save failed'); }
            }}>Save</Button>
          </div>
        );
      })()}

      {/* Side Panel for open entity */}
      {openEntity && (
        <div className="absolute inset-y-0 right-0 z-30 w-[420px] bg-white border-l-4 border-black p-4 flex flex-col" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 mb-3">
            <Button size="icon" variant="outline" className="rounded-none" onClick={() => setOpenEntity(null)} aria-label="Close"><CloseIcon className="w-4 h-4" /></Button>
            <input className="border-2 border-black px-2 py-1 flex-1" defaultValue={(() => {
              const n = nodes.find(nn => nn.kind === openEntity.kind && nn.id === openEntity.id);
              if (!n) return '';
              return n.kind === 'code' ? (n.highlight?.codeName || 'Untitled') : n.kind === 'theme' ? (n.theme?.name || '') : n.kind === 'insight' ? (n.insight?.name || '') : (n.annotation?.content || '');
            })()} onBlur={async (e) => {
              const val = e.target.value.trim();
              const n = nodes.find(nn => nn.kind === openEntity.kind && nn.id === openEntity.id);
              if (!n) return;
              try {
                if (n.kind === 'code') await updateHighlight(n.id, { codeName: val });
                if (n.kind === 'theme') await updateTheme(n.id, { name: val });
                if (n.kind === 'insight') await updateInsight(n.id, { name: val });
                if (n.kind === 'annotation') await updateAnnotation(n.id, { content: val });
                onUpdate();
              } catch { toast.error('Save failed'); }
            }} />
            <Button size="sm" variant="destructive" className="rounded-none" onClick={async () => {
              if (!confirm('Delete this item?')) return;
              try {
                if (openEntity.kind === 'code') await deleteHighlight(openEntity.id);
                if (openEntity.kind === 'theme') await deleteTheme(openEntity.id);
                if (openEntity.kind === 'insight') await deleteInsight(openEntity.id);
                if (openEntity.kind === 'annotation') await deleteAnnotation(openEntity.id);
                setOpenEntity(null);
                onUpdate();
              } catch { toast.error('Delete failed'); }
            }}>Delete</Button>
          </div>
          <div className="overflow-auto pr-2">
            {(() => {
              const n = nodes.find(nn => nn.kind === openEntity.kind && nn.id === openEntity.id);
              if (!n) return null;
              const body = n.kind === 'code' ? (n.highlight?.text || '') : n.kind === 'annotation' ? (n.annotation?.content || '') : '';
              return body ? <pre className="whitespace-pre-wrap text-sm leading-relaxed">{body}</pre> : <div className="text-sm text-neutral-500">No content.</div>;
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
