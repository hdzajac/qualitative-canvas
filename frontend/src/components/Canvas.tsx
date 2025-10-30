import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Highlight, Theme, Insight, Annotation, CardStyle } from '@/types';
import { Button } from './ui/button';
import { MousePointer2, Hand, Type as TypeIcon, X as CloseIcon, Text as TextSizeIcon, Trash2 } from 'lucide-react';
import { createAnnotation, createTheme, createInsight, updateHighlight, updateTheme, updateInsight, updateAnnotation, deleteHighlight, deleteTheme, deleteInsight, deleteAnnotation } from '@/services/api';
import { toast } from 'sonner';
import { useSelectedProject } from '@/hooks/useSelectedProject';

interface CanvasProps {
  highlights: Highlight[];
  themes: Theme[];
  insights: Insight[];
  annotations: Annotation[];
  onUpdate: () => void;
}

type Tool = 'select' | 'hand' | 'text';
type NodeKind = 'code' | 'theme' | 'insight' | 'annotation';
type ResizeCorner = 'nw' | 'ne' | 'se' | 'sw';

type NodeView = {
  id: string; // underlying id (e.g. highlight.id)
  kind: NodeKind;
  x: number;
  y: number;
  w: number;
  h: number;
  // attach original entity for context
  highlight?: Highlight;
  theme?: Theme;
  insight?: Insight;
  annotation?: Annotation;
};

const DEFAULTS = {
  code: { w: 280, h: 140 },
  theme: { w: 320, h: 160 },
  insight: { w: 360, h: 180 },
  annotation: { w: 220, h: 110 },
};

export const Canvas = ({ highlights, themes, insights, annotations, onUpdate }: CanvasProps) => {
  // Canvas and size
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const dprRef = useRef<number>(1);

  // Viewport transform
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // screen-space offset

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
    drawEdges(ctx, nodes);

    // Nodes
    nodes.forEach((n) => drawNode(ctx, n, selectedCodeIds, selectedThemeIds));

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

  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, step: number, color: string) {
    ctx.save();
    ctx.fillStyle = color;
    for (let x = 0; x < w; x += step) {
      for (let y = 0; y < h; y += step) {
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.restore();
  }

  function drawEdges(ctx: CanvasRenderingContext2D, ns: NodeView[]) {
    const byKey = new Map(ns.map((n) => [`${n.kind}:${n.id}`, n] as const));
    ctx.save();
    ctx.strokeStyle = '#b1b1b7';
    ctx.lineWidth = 1; // scale with zoom

    // code -> theme
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

    // theme -> insight
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
  }

  function drawOrthogonal(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) {
    const midY = (ay + by) / 2;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax, midY);
    ctx.lineTo(bx, midY);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawNode(
    ctx: CanvasRenderingContext2D,
    n: NodeView,
    selectedCodeIds: string[],
    selectedThemeIds: string[]
  ) {
    ctx.save();
    const radius = 10;
    const isSelected = (n.kind === 'code' && selectedCodeIds.includes(n.id)) || (n.kind === 'theme' && selectedThemeIds.includes(n.id));

    // Energetic accents
    const accent =
      n.kind === 'code' ? '#2563eb' : // blue
      n.kind === 'theme' ? '#10b981' : // emerald
      n.kind === 'insight' ? '#f59e0b' : // amber
      '#ef4444'; // red for notes

    // Elevated selected shadow and border
    if (isSelected) {
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 6;
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.06)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 3;
    }

    // Body
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = isSelected ? accent : '#111827';
    ctx.lineWidth = isSelected ? 3 : 1.5;
    roundRect(ctx, n.x, n.y, n.w, n.h, radius);
    ctx.fill();
    ctx.stroke();

    // Accent bar
    ctx.fillStyle = accent;
    ctx.fillRect(n.x, n.y, 6, n.h);

    // Header actions (top-right icons area)
    const iconY = n.y + 8;
    const iconX = n.x + n.w - 24;
    // Draw an external/open icon placeholder
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px ui-sans-serif, system-ui, -apple-system';
    ctx.fillText('↗', iconX, iconY + 10);

    // Title and meta
    const fontSize = getFontSize(n);
    ctx.fillStyle = '#111827';
    ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system`;
    if (n.kind === 'code' && n.highlight) {
      ctx.fillText(n.highlight.codeName || 'Untitled', n.x + 12, n.y + 22);
    } else if (n.kind === 'theme' && n.theme) {
      ctx.fillText(n.theme.name, n.x + 12, n.y + 22);
    } else if (n.kind === 'insight' && n.insight) {
      ctx.fillText(n.insight.name, n.x + 12, n.y + 22);
    } else if (n.kind === 'annotation' && n.annotation) {
      wrapText(ctx, n.annotation.content || 'New text', n.x + 12, n.y + 22, n.w - 24, 14, 6);
    }

    // Bottom-right type label
    ctx.textAlign = 'right';
    ctx.fillStyle = '#9ca3af';
    const typeLabel = n.kind === 'code' ? 'Code' : n.kind === 'theme' ? 'Theme' : n.kind === 'insight' ? 'Insight' : 'Note';
    ctx.fillText(typeLabel, n.x + n.w - 8, n.y + n.h - 8);
    ctx.textAlign = 'left';

    ctx.restore();
  }

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
      setHoverCursor(idx !== -1 ? 'move' : 'default');
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
      draw();
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
      </div>

      <div className="absolute z-20 top-3 left-1/2 -translate-x-1/2 bg-white border-2 border-black px-2 py-1 flex items-center gap-2">
        <TextSizeIcon className="w-4 h-4" />
        <select className="text-sm outline-none" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value) || 12)}>
          {[10,12,14,16,18,20,24].map(sz => <option key={sz} value={sz}>{sz}px</option>)}
        </select>
        {(() => {
          const idx = selectedCodeIds.length === 1 ? nodes.findIndex(n => n.kind==='code' && n.id===selectedCodeIds[0]) : selectedThemeIds.length===1 ? nodes.findIndex(n=>n.kind==='theme' && n.id===selectedThemeIds[0]) : -1;
          const n = idx>=0 ? nodes[idx] : null;
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
                  await createTheme({ name, highlightIds: selectedCodeIds, size: DEFAULTS.theme });
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
                  await createInsight({ name, themeIds: selectedThemeIds, size: DEFAULTS.insight });
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

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        style={{ cursor: (dragState.current?.mode === 'pan' ? 'grabbing' : (isPanning ? 'grab' : hoverCursor)) as React.CSSProperties['cursor'] }}
      />

      {openEntity && (
        <div className="absolute inset-0 z-30 bg-black/40 backdrop-blur flex items-center justify-center p-6" onClick={() => setOpenEntity(null)}>
          <div className="bg-white border-2 border-black max-w-2xl w-full max-h-[75vh] overflow-auto p-4 relative" onClick={(e) => e.stopPropagation()}>
            <button className="absolute right-3 top-3 border border-black w-8 h-8 grid place-items-center bg-white hover:bg-muted" onClick={() => setOpenEntity(null)} aria-label="Close">
              <CloseIcon className="w-4 h-4" />
            </button>
            {(() => {
              const n = nodes.find(nn => nn.kind===openEntity.kind && nn.id===openEntity.id);
              if (!n) return null;
              const title = n.kind==='code' ? (n.highlight?.codeName||'Untitled') : n.kind==='theme' ? n.theme?.name : n.kind==='insight' ? n.insight?.name : 'Note';
              const body = n.kind==='code' ? (n.highlight?.text||'') : n.kind==='annotation' ? (n.annotation?.content||'') : '';
              return (
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <input className="border-2 border-black px-2 py-1 w-full" defaultValue={title as string} onBlur={async (e) => {
                      const val = e.target.value.trim();
                      try {
                        if (n.kind==='code') await updateHighlight(n.id, { codeName: val });
                        if (n.kind==='theme') await updateTheme(n.id, { name: val });
                        if (n.kind==='insight') await updateInsight(n.id, { name: val });
                        if (n.kind==='annotation') await updateAnnotation(n.id, { content: val });
                        onUpdate();
                      } catch { toast.error('Save failed'); }
                    }} />
                    <Button size="icon" variant="outline" className="rounded-none" onClick={async () => {
                      if (!confirm('Delete?')) return;
                      try {
                        if (n.kind==='code') await deleteHighlight(n.id);
                        if (n.kind==='theme') await deleteTheme(n.id);
                        if (n.kind==='insight') await deleteInsight(n.id);
                        if (n.kind==='annotation') await deleteAnnotation(n.id);
                        setOpenEntity(null);
                        onUpdate();
                      } catch { toast.error('Delete failed'); }
                    }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  {body && <pre className="whitespace-pre-wrap text-sm leading-relaxed">{body}</pre>}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

// Helpers restored
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(/\s+/);
  let line = '';
  let lineCount = 0;
  for (let n = 0; n < words.length; n++) {
    const testLine = line ? line + ' ' + words[n] : words[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n];
      y += lineHeight;
      lineCount++;
      if (lineCount >= maxLines - 1) {
        const remaining = words.slice(n).join(' ');
        const ell = ellipsize(ctx, remaining, maxWidth);
        ctx.fillText(ell, x, y);
        return;
      }
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  let t = text;
  while (ctx.measureText(t + '…').width > maxWidth && t.length > 0) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

function hitTestNode(wx: number, wy: number, list: NodeView[]) {
  for (let i = list.length - 1; i >= 0; i--) {
    const n = list[i];
    if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) return i;
  }
  return -1;
}

function intersects(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function toggleInArray(arr: string[], id: string, clearOthers: boolean) {
  if (clearOthers) return arr.includes(id) ? [] : [id];
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}

function union(a: string[], b: string[]) {
  const s = new Set([...a, ...b]);
  return Array.from(s);
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

// onWheel restored
// Event handlers
const onWheelFactory = (
  screenToWorld: (sx: number, sy: number) => { x: number; y: number },
  zoom: number,
  setZoom: (z: number) => void,
  offset: { x: number; y: number },
  setOffset: (o: { x: number; y: number }) => void,
  canvasRef: React.RefObject<HTMLCanvasElement>
) => (e: React.WheelEvent<HTMLCanvasElement>) => {
  e.preventDefault();
  const rect = canvasRef.current?.getBoundingClientRect();
  if (!rect) return;
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const worldBefore = screenToWorld(mx, my);

  const delta = -e.deltaY;
  const factor = Math.exp(delta * 0.001);
  const newZoom = clamp(zoom * factor, 0.2, 2.5);
  setZoom(newZoom);

  const newOffsetX = mx - worldBefore.x * newZoom;
  const newOffsetY = my - worldBefore.y * newZoom;
  setOffset({ x: newOffsetX, y: newOffsetY });
};
