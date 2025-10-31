import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Highlight, Theme, Insight, Annotation, CardStyle, UploadedFile } from '@/types';
import { Button } from './ui/button';
import { MousePointer2, Hand, Type as TypeIcon, X as CloseIcon, Text as TextSizeIcon, Trash2 } from 'lucide-react';
import { createAnnotation, createTheme, createInsight, updateHighlight, updateTheme, updateInsight, updateAnnotation, deleteHighlight, deleteTheme, deleteInsight, deleteAnnotation, getFile } from '@/services/api';
import { toast } from 'sonner';
import { useSelectedProject } from '@/hooks/useSelectedProject';
import { NodeKind, Tool, NodeView, DEFAULTS, ResizeCorner, /* add subtype imports */ } from './canvas/CanvasTypes';
// Add explicit subtype imports for type narrowing
import type { CodeNodeView, ThemeNodeView, InsightNodeView, AnnotationNodeView } from './canvas/CanvasTypes';
import { clamp, toggleInArray, union, hitTestNode, intersects, measureWrappedLines } from './canvas/CanvasUtils';
import { drawGrid, drawOrthogonal, roundRect, drawNode } from './canvas/CanvasDrawing';

interface CanvasProps {
  highlights: Highlight[];
  themes: Theme[];
  insights: Insight[];
  annotations: Annotation[];
  files: UploadedFile[];
  onUpdate: () => void;
}

export const Canvas = ({ highlights, themes, insights, annotations, files, onUpdate }: CanvasProps) => {
  // Canvas and size
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const dprRef = useRef<number>(1);
  // Reusable offscreen context for label measurement (avoid per-frame canvas creation)
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  useEffect(() => {
    const c = document.createElement('canvas');
    measureCtxRef.current = c.getContext('2d');
  }, []);

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
  // Refs to access latest selection in global key handlers
  const selectedCodeIdsRef = useRef<string[]>([]);
  const selectedThemeIdsRef = useRef<string[]>([]);
  useEffect(() => { selectedCodeIdsRef.current = selectedCodeIds; }, [selectedCodeIds]);
  useEffect(() => { selectedThemeIdsRef.current = selectedThemeIds; }, [selectedThemeIds]);

  // Dragging
  const dragState = useRef<
    | {
      mode: 'node';
      nodeIdx: number;
      startWorld: { x: number; y: number };
      startNode: { x: number; y: number };
      moved: boolean;
      // New: group drag support (indices and their starting positions)
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
      fromKind: NodeKind; // 'code' | 'theme'
      fromId: string;
      start: { x: number; y: number }; // world
      last: { x: number; y: number }; // world
      anchor: { x: number; y: number }; // fixed world anchor at handle center
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

  // Deletion helper for selected items
  async function deleteSelection() {
    const codes = selectedCodeIdsRef.current.slice();
    const themes = selectedThemeIdsRef.current.slice();
    if (codes.length === 0 && themes.length === 0) return;
    const total = codes.length + themes.length;
    if (!confirm(`Delete ${total} selected item${total > 1 ? 's' : ''}?`)) return;
    try {
      await Promise.all([
        ...codes.map((id) => deleteHighlight(id)),
        ...themes.map((id) => deleteTheme(id)),
      ]);
      setNodes((prev) => prev.filter((n) => !((n.kind === 'code' && codes.includes(n.id)) || (n.kind === 'theme' && themes.includes(n.id)))));
      setSelectedCodeIds([]);
      setSelectedThemeIds([]);
      const oe = openEntityRef.current;
      if (oe && ((oe.kind === 'code' && codes.includes(oe.id)) || (oe.kind === 'theme' && themes.includes(oe.id)))) {
        setOpenEntity(null);
      }
      toast.success('Deleted');
      onUpdate();
    } catch {
      toast.error('Delete failed');
    }
  }

  // Keyboard for tools, space-panning, and delete selection
  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return true;
      if ((el as HTMLElement).isContentEditable) return true;
      const closestEditable = (el.closest && el.closest('input, textarea, [contenteditable="true"]')) as HTMLElement | null;
      return !!closestEditable;
    };

    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space') setIsSpacePanning(true);
      if (e.code === 'KeyV') setTool('select');
      if (e.code === 'KeyH') setTool('hand');
      if (e.code === 'KeyT') setTool('text');
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditableTarget(e.target)) {
        e.preventDefault();
        deleteSelection();
      }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build quick lookup maps for filenames and labels
  const fileNameById = useMemo(() => {
    const m = new Map<string, string>();
    files?.forEach(f => m.set(f.id, f.filename));
    return m;
  }, [files]);

  const codeFileNameById = useMemo(() => {
    const m = new Map<string, string>();
    highlights.forEach(h => {
      const name = h.fileId ? (fileNameById.get(h.fileId) || '') : '';
      if (name) m.set(h.id, name);
    });
    return m;
  }, [highlights, fileNameById]);

  // Fast lookup maps
  const highlightById = useMemo(() => {
    const m = new Map<string, Highlight>();
    highlights.forEach(h => m.set(h.id, h));
    return m;
  }, [highlights]);
  const themeById = useMemo(() => {
    const m = new Map<string, Theme>();
    themes.forEach(t => m.set(t.id, t));
    return m;
  }, [themes]);

  const themeLabelById = useMemo(() => {
    const m = new Map<string, string>();
    themes.forEach(t => {
      const set = new Set<string>();
      t.highlightIds.forEach(hid => {
        const n = codeFileNameById.get(hid);
        if (n) set.add(n);
      });
      const label = Array.from(set).join(', ');
      if (label) m.set(t.id, label);
    });
    return m;
  }, [themes, codeFileNameById]);

  const insightLabelById = useMemo(() => {
    const m = new Map<string, string>();
    insights.forEach(i => {
      const set = new Set<string>();
      i.themeIds.forEach(tid => {
        const t = themes.find(tt => tt.id === tid);
        if (!t) return;
        t.highlightIds.forEach(hid => {
          const n = codeFileNameById.get(hid);
          if (n) set.add(n);
        });
      });
      const label = Array.from(set).join(', ');
      if (label) m.set(i.id, label);
    });
    return m;
  }, [insights, themes, codeFileNameById]);

  const getBottomRightLabel = useCallback((n: NodeView) => {
    if (n.kind === 'code' && n.highlight) {
      const fid = n.highlight.fileId;
      return (fid && fileNameById.get(fid)) || '';
    }
    if (n.kind === 'theme') {
      return themeLabelById.get(n.id) || '';
    }
    if (n.kind === 'insight') {
      return insightLabelById.get(n.id) || '';
    }
    // annotations: no document label
    return '';
  }, [fileNameById, themeLabelById, insightLabelById]);

  // No hover animation: always return 0 scroll
  const getLabelScroll = useCallback((_n: NodeView) => 0, []);

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

    // Nodes (show subtle handle only for hovered node, or for the source node during connect)
    nodes.forEach((n) => {
      const isConnectingFromThis = (dragState.current && dragState.current.mode === 'connect' && dragState.current.fromId === n.id);
      const showHandle = isConnectingFromThis || ((hoverInfo.current && hoverInfo.current.kind === 'node' && hoverInfo.current.id === n.id) ? (n.kind === 'code' || n.kind === 'theme') : false);
      const isConnectTarget = Boolean(connectTargetRef.current && connectTargetRef.current.id === n.id);
      drawNode(ctx, n, selectedCodeIds, selectedThemeIds, getFontSize, getBottomRightLabel, getLabelScroll, { showHandle, highlightAsTarget: isConnectTarget });
    });

    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h, offset.x, offset.y, zoom, nodes, selectedCodeIds, selectedThemeIds, getBottomRightLabel]);

  // Track hover target to control handle visibility
  const hoverInfo = useRef<null | { kind: 'node'; id: string }>(null);
  // Track a connect target under cursor during connect gesture
  const connectTargetRef = useRef<null | { id: string; kind: 'theme' | 'insight' }>(null);

  // Redraw whenever draw dependencies change (covers zoom/offset updates)
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
    if (dragState.current) {
      // Ignore wheel when a drag gesture is active (connect, move, marquee, etc.)
      e.preventDefault();
      return;
    }
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
    const worldBefore = screenToWorld(mx, my);
    const delta = -e.deltaY; const factor = Math.exp(delta * 0.001);
    const newZoom = clamp(zoom * factor, 0.2, 2.5); setZoom(newZoom);
    const newOffsetX = mx - worldBefore.x * newZoom; const newOffsetY = my - worldBefore.y * newZoom;
    setOffset({ x: newOffsetX, y: newOffsetY });
    // draw will be triggered by the [draw] effect
  }, [screenToWorld, zoom]);

  // Helpers to detect hovering edge and connection handle
  function isInOpenIcon(n: NodeView, wx: number, wy: number) {
    return wx >= n.x + n.w - 28 && wx <= n.x + n.w - 8 && wy >= n.y + 6 && wy <= n.y + 20;
  }
  function isInConnectHandle(n: NodeView, wx: number, wy: number, z: number) {
    if (!(n.kind === 'code' || n.kind === 'theme')) return false;
    const cx = n.x + n.w - 8; const cy = n.y + n.h / 2;
    // Constant ~10px radius in screen space => world radius scales with zoom
    const r = Math.max(6, 10 / Math.max(0.0001, z));
    return (wx - cx) * (wx - cx) + (wy - cy) * (wy - cy) <= r * r;
  }

  // Edge model for hit-testing: store screen-space polyline of each edge
  type EdgeHit = { kind: 'code-theme' | 'theme-insight'; fromId: string; toId: string };
  function hitTestEdge(wx: number, wy: number): EdgeHit | null {
    // Consider edges from codes->themes and themes->insights
    // Simple tolerance to an orthogonal polyline: check distance to segments
    const byKey = new Map(nodes.map((n) => [`${n.kind}:${n.id}`, n] as const));
    const tol = 8; // world units
    function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
      const A = px - x1; const B = py - y1; const C = x2 - x1; const D = y2 - y1;
      const dot = A * C + B * D; const len_sq = C * C + D * D; let t = len_sq ? dot / len_sq : 0; t = Math.max(0, Math.min(1, t));
      const xx = x1 + C * t; const yy = y1 + D * t; const dx = px - xx; const dy = py - yy;
      return Math.sqrt(dx * dx + dy * dy);
    }
    for (const t of themes) {
      for (const hid of t.highlightIds) {
        const a = byKey.get(`code:${hid}`); const b = byKey.get(`theme:${t.id}`);
        if (!a || !b) continue;
        const ax = a.x + a.w / 2, ay = a.y + a.h; const bx = b.x + b.w / 2, by = b.y; const my = (ay + by) / 2;
        const d = Math.min(
          distToSeg(wx, wy, ax, ay, ax, my),
          distToSeg(wx, wy, ax, my, bx, my),
          distToSeg(wx, wy, bx, my, bx, by)
        );
        if (d <= tol) return { kind: 'code-theme', fromId: hid, toId: t.id };
      }
    }
    for (const i of insights) {
      for (const tid of i.themeIds) {
        const a = byKey.get(`theme:${tid}`); const b = byKey.get(`insight:${i.id}`);
        if (!a || !b) continue;
        const ax = a.x + a.w / 2, ay = a.y + a.h; const bx = b.x + b.w / 2, by = b.y; const my = (ay + by) / 2;
        const d = Math.min(
          distToSeg(wx, wy, ax, ay, ax, my),
          distToSeg(wx, wy, ax, my, bx, my),
          distToSeg(wx, wy, bx, my, bx, by)
        );
        if (d <= tol) return { kind: 'theme-insight', fromId: tid, toId: i.id };
      }
    }
    return null;
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
      // Start connect gesture if hitting handle (do not change selection or viewport)
      if (isInConnectHandle(n, world.x, world.y, zoom)) {
        if (n.kind === 'code' || n.kind === 'theme') {
          e.preventDefault(); e.stopPropagation();
          const ax = n.x + n.w - 8; const ay = n.y + n.h / 2;
          dragState.current = { mode: 'connect', fromKind: n.kind, fromId: n.id, start: world, last: world, anchor: { x: ax, y: ay } };
          setHoverCursor('crosshair');
          return;
        }
      }

      // Determine updated selection based on click
      const alreadySelected = (n.kind === 'code' && selectedCodeIds.includes(n.id)) || (n.kind === 'theme' && selectedThemeIds.includes(n.id));
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
        if ((nn.kind === 'code' && nextCodes.includes(nn.id)) || (nn.kind === 'theme' && nextThemes.includes(nn.id))) {
          groupIdxs.push(i);
        }
      }
      if (!groupIdxs.includes(idx)) groupIdxs.push(idx);
      const group = groupIdxs.map(i => ({ idx: i, startX: nodes[i].x, startY: nodes[i].y }));

      dragState.current = { mode: 'node', nodeIdx: idx, startWorld: world, startNode: { x: n.x, y: n.y }, moved: false, group };
    } else {
      // Edge click? If close to an edge, prompt deletion
      const edge = hitTestEdge(world.x, world.y);
      if (edge) {
        const confirmMsg = edge.kind === 'code-theme' ? 'Remove code from theme?' : 'Remove theme from insight?';
        if (confirm(confirmMsg)) {
          (async () => {
            try {
              if (edge.kind === 'code-theme') {
                const t = themes.find(tt => tt.id === edge.toId);
                if (!t) return;
                const newIds = t.highlightIds.filter(id => id !== edge.fromId);
                await updateTheme(t.id, { highlightIds: newIds });
              } else {
                const iobj = insights.find(ii => ii.id === edge.toId);
                if (!iobj) return;
                const newIds = iobj.themeIds.filter(id => id !== edge.fromId);
                await updateInsight(iobj.id, { themeIds: newIds });
              }
              toast.success('Connection removed');
              onUpdate();
            } catch {
              toast.error('Failed to update');
            }
          })();
        }
        return;
      }
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
        hoverInfo.current = { kind: 'node', id: n.id };
        if (isInOpenIcon(n, world.x, world.y)) { setHoverCursor('pointer'); draw(); return; }
        if (isInConnectHandle(n, world.x, world.y, zoom)) { setHoverCursor('crosshair'); draw(); return; }
        setHoverCursor('move');
        draw();
      } else {
        hoverInfo.current = null;
        // edge hover?
        const edge = hitTestEdge(world.x, world.y);
        if (edge) setHoverCursor('pointer'); else setHoverCursor('default');
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
        // Move all nodes in the group together
        dsNode.group.forEach(g => {
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
      nodes.forEach((n) => drawNode(ctx, n, selectedCodeIds, selectedThemeIds, getFontSize, getBottomRightLabel, getLabelScroll));
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
    } else if (dragState.current.mode === 'connect') {
      const world = screenToWorld(sx, sy);
      dragState.current.last = world;

      // Update hovered connect target indicator
      const fromKind = dragState.current.fromKind; // 'code' | 'theme'
      const idx = hitTestNode(world.x, world.y, nodes);
      const prevTarget = connectTargetRef.current?.id;
      let nextTarget: null | { id: string; kind: 'theme' | 'insight' } = null;
      if (idx !== -1) {
        const tgt = nodes[idx];
        const ok = (fromKind === 'code' && tgt.kind === 'theme') || (fromKind === 'theme' && tgt.kind === 'insight');
        if (ok) nextTarget = { id: tgt.id, kind: tgt.kind } as { id: string; kind: 'theme' | 'insight' };
      }
      connectTargetRef.current = nextTarget;

      const canvas = canvasRef.current; if (!canvas) return;
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      const dpr = dprRef.current;
      // Reset transform and clear entire canvas in device pixels
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      // Draw base scene once (it manages its own DPR scaling)
      // But we want to highlight a target; easiest is to manually draw similar to draw() with highlight flag
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, size.w, size.h);
      drawGrid(ctx, size.w, size.h, 16, '#e5e7eb');
      ctx.translate(offset.x, offset.y);
      ctx.scale(zoom, zoom);
      // Edges
      const byKey = new Map(nodes.map((n) => [`${n.kind}:${n.id}`, n] as const));
      ctx.save(); ctx.strokeStyle = '#b1b1b7'; ctx.lineWidth = 1;
      themes.forEach((t) => { t.highlightIds.forEach((hid) => { const a = byKey.get(`code:${hid}`); const b = byKey.get(`theme:${t.id}`); if (!a || !b) return; drawOrthogonal(ctx, a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y); }); });
      insights.forEach((i) => { i.themeIds.forEach((tid) => { const a = byKey.get(`theme:${tid}`); const b = byKey.get(`insight:${i.id}`); if (!a || !b) return; drawOrthogonal(ctx, a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y); }); });
      ctx.restore();
      // Nodes with potential highlight
      nodes.forEach((n) => {
        const isConnectingFromThis = (dragState.current && dragState.current.mode === 'connect' && dragState.current.fromId === n.id);
        const showHandle = isConnectingFromThis || ((hoverInfo.current && hoverInfo.current.kind === 'node' && hoverInfo.current.id === n.id) ? (n.kind === 'code' || n.kind === 'theme') : false);
        const isConnectTarget = Boolean(connectTargetRef.current && connectTargetRef.current.id === n.id);
        drawNode(ctx, n, selectedCodeIds, selectedThemeIds, getFontSize, getBottomRightLabel, getLabelScroll, { showHandle, highlightAsTarget: isConnectTarget });
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
        const ax = dsConn.anchor.x; const ay = dsConn.anchor.y;
        const bx = world.x; const by = world.y;
        drawOrthogonal(ctx, ax, ay, bx, by);
      }
      ctx.restore();
      setHoverCursor('crosshair');
    }
  };

  const onMouseLeave: React.MouseEventHandler<HTMLCanvasElement> = () => {
    setHoverCursor('default');
    // clear any transient connect target highlight
    connectTargetRef.current = null;
    draw();
  };

  const onMouseUp: React.MouseEventHandler<HTMLCanvasElement> = async (e) => {
    const ds = dragState.current; dragState.current = null; setHoverCursor('default');
    // reset potential target highlight
    connectTargetRef.current = null;
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

    // Finish connect: if released over a valid target, update model
    if (ds.mode === 'connect') {
      const world = screenToWorld(sx, sy);
      const idx = hitTestNode(world.x, world.y, nodes);
      if (idx !== -1) {
        const target = nodes[idx];
        try {
          if (ds.fromKind === 'code' && target.kind === 'theme') {
            const t = themes.find(tt => tt.id === target.id);
            if (t) {
              const newIds = Array.from(new Set([...(t.highlightIds || []), ds.fromId]));
              await updateTheme(t.id, { highlightIds: newIds });
              toast.success('Code added to theme');
              onUpdate();
            }
          } else if (ds.fromKind === 'theme' && target.kind === 'insight') {
            const iobj = insights.find(ii => ii.id === target.id);
            if (iobj) {
              const newIds = Array.from(new Set([...(iobj.themeIds || []), ds.fromId]));
              await updateInsight(iobj.id, { themeIds: newIds });
              toast.success('Theme added to insight');
              onUpdate();
            }
          }
        } catch {
          toast.error('Failed to connect');
        }
      }
      return;
    }

    // Persist node move
    if (ds.mode === 'node' && ds.moved) {
      // Persist all nodes that were part of the drag group
      const uniqueIdxs = Array.from(new Set(ds.group.map(g => g.idx)));
      try {
        await Promise.all(uniqueIdxs.map(async (i) => {
          const n = nodes[i];
          if (!n) return;
          if (n.kind === 'code' && n.highlight) return updateHighlight(n.id, { position: { x: n.x, y: n.y }, size: { w: n.w, h: n.h } });
          if (n.kind === 'theme' && n.theme) return updateTheme(n.id, { position: { x: n.x, y: n.y }, size: { w: n.w, h: n.h } });
          if (n.kind === 'insight' && n.insight) return updateInsight(n.id, { position: { x: n.x, y: n.y }, size: { w: n.w, h: n.h } });
          if (n.kind === 'annotation' && n.annotation) return updateAnnotation(n.id, { position: { x: n.x, y: n.y }, size: { w: n.w, h: n.h } });
        }));
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
  const openEntityRef = useRef<typeof openEntity>(null);
  useEffect(() => { openEntityRef.current = openEntity; }, [openEntity]);

  const [fontSize, setFontSize] = useState(12);
  useEffect(() => { /* no-op; value applied when drawing via getFontSize */ }, [fontSize]);
  const getFontSize = (n: NodeView) => {
    const style: CardStyle | undefined = n.kind === 'code' ? n.highlight?.style : n.kind === 'theme' ? n.theme?.style : n.kind === 'insight' ? n.insight?.style : n.annotation?.style;
    return style?.fontSize ?? fontSize;
  };

  // Persist font size for a single node and update local state
  const persistFontSize = async (n: NodeView, fs: number) => {
    try {
      if (n.kind === 'code') {
        await updateHighlight(n.id, { style: { ...(n.highlight?.style || {}), fontSize: fs } });
        setNodes(prev => prev.map(nn => (nn.kind === 'code' && nn.id === n.id) ? { ...nn, highlight: { ...nn.highlight!, style: { ...(nn.highlight?.style || {}), fontSize: fs } } } : nn));
      } else if (n.kind === 'theme') {
        await updateTheme(n.id, { style: { ...(n.theme?.style || {}), fontSize: fs } });
        setNodes(prev => prev.map(nn => (nn.kind === 'theme' && nn.id === n.id) ? { ...nn, theme: { ...nn.theme!, style: { ...(nn.theme?.style || {}), fontSize: fs } } } : nn));
      } else if (n.kind === 'insight') {
        await updateInsight(n.id, { style: { ...(n.insight?.style || {}), fontSize: fs } });
        setNodes(prev => prev.map(nn => (nn.kind === 'insight' && nn.id === n.id) ? { ...nn, insight: { ...nn.insight!, style: { ...(nn.insight?.style || {}), fontSize: fs } } } : nn));
      } else if (n.kind === 'annotation') {
        await updateAnnotation(n.id, { style: { ...(n.annotation?.style || {}), fontSize: fs } });
        setNodes(prev => prev.map(nn => (nn.kind === 'annotation' && nn.id === n.id) ? { ...nn, annotation: { ...nn.annotation!, style: { ...(nn.annotation?.style || {}), fontSize: fs } } } : nn));
      }
      toast.success('Saved');
      onUpdate();
    } catch {
      toast.error('Save failed');
    }
  };

  // File name cache for side panel document references
  const [fileNames, setFileNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!openEntity || openEntity.kind !== 'code') return;
    const n = nodes.find((nn): nn is CodeNodeView => nn.kind === 'code' && nn.id === openEntity.id);
    const fid = n?.highlight?.fileId;
    if (!fid || fileNames[fid]) return;
    getFile(fid).then(f => setFileNames(prev => ({ ...prev, [fid]: f.filename }))).catch(() => { });
  }, [openEntity, nodes, fileNames]);

  // Inline title editing for code in side panel
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  const saveCodeTitle = async (id: string, name: string) => {
    const val = name.trim();
    const node = nodes.find(nn => nn.kind === 'code' && nn.id === id);
    if (!node) return;
    try {
      await updateHighlight(id, { codeName: val });
      setNodes(prev => prev.map(nn => (nn.kind === 'code' && nn.id === id) ? { ...nn, highlight: { ...nn.highlight!, codeName: val } } : nn));
      onUpdate();
      toast.success('Saved');
    } catch {
      toast.error('Save failed');
    }
  };

  // Auto-grow height based on wrapped text
  useEffect(() => {
    setNodes((prev) => {
      let changed = false;
      const next = prev.map((n) => {
        const fs = getFontSize(n);
        const lineHeight = Math.max(12, Math.round(fs * 1.2));
        const contentWidth = Math.max(10, n.w - 24);
        let lines = 1;
        if (n.kind === 'code' && n.highlight) lines = measureWrappedLines(n.highlight.codeName || 'Untitled', contentWidth, `${fs}px ui-sans-serif, system-ui, -apple-system`);
        else if (n.kind === 'theme' && n.theme) lines = measureWrappedLines(n.theme.name || '', contentWidth, `${fs}px ui-sans-serif, system-ui, -apple-system`);
        else if (n.kind === 'insight' && n.insight) lines = measureWrappedLines(n.insight.name || '', contentWidth, `${fs}px ui-sans-serif, system-ui, -apple-system`);
        else if (n.kind === 'annotation' && n.annotation) lines = measureWrappedLines(n.annotation.content || 'New text', contentWidth, `${fs}px ui-sans-serif, system-ui, -apple-system`);
        const topPadding = 18; // space before first line baseline
        const bottomPadding = 18; // reserve for type label
        const minH = n.kind === 'code' ? DEFAULTS.code.h : n.kind === 'theme' ? DEFAULTS.theme.h : n.kind === 'insight' ? DEFAULTS.insight.h : DEFAULTS.annotation.h;
        const desired = Math.max(minH, topPadding + lines * lineHeight + bottomPadding);
        if (desired > n.h + 0.5) { changed = true; return { ...n, h: desired }; }
        return n;
      });
      return changed ? next : prev;
    });
    // Redraw after potential size change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontSize, nodes]);

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
        onMouseLeave={onMouseLeave}
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

      {/* Click-away overlay for side panel document references */}
      {openEntity && (
        <div className="absolute inset-0 z-20" onClick={() => setOpenEntity(null)} />
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
            <Button size="sm" variant={n.w <= 210 ? 'default' : 'outline'} className="rounded-none h-6 px-2" onClick={() => { setNodes(prev => prev.map(nn => (nn.kind === n.kind && nn.id === n.id) ? { ...nn, w: 200 } : nn)); draw(); }}>200</Button>
            <Button size="sm" variant={n.w >= 290 ? 'default' : 'outline'} className="rounded-none h-6 px-2" onClick={() => { setNodes(prev => prev.map(nn => (nn.kind === n.kind && nn.id === n.id) ? { ...nn, w: 300 } : nn)); draw(); }}>300</Button>
            <span className="text-xs ml-2">Text</span>
            <select className="text-xs border border-black px-1 py-0.5" value={fs} onChange={(e) => {
              const val = parseInt(e.target.value) || 12;
              setNodes(prev => prev.map(nn => {
                if (!(nn.kind === n.kind && nn.id === n.id)) return nn;
                switch (n.kind) {
                  case 'code':
                    return { ...(nn as CodeNodeView), highlight: { ...(nn as CodeNodeView).highlight!, style: { ...((nn as CodeNodeView).highlight?.style || {}), fontSize: val } } } as CodeNodeView;
                  case 'theme':
                    return { ...(nn as ThemeNodeView), theme: { ...(nn as ThemeNodeView).theme!, style: { ...((nn as ThemeNodeView).theme?.style || {}), fontSize: val } } } as ThemeNodeView;
                  case 'insight':
                    return { ...(nn as InsightNodeView), insight: { ...(nn as InsightNodeView).insight!, style: { ...((nn as InsightNodeView).insight?.style || {}), fontSize: val } } } as InsightNodeView;
                  case 'annotation':
                    return { ...(nn as AnnotationNodeView), annotation: { ...(nn as AnnotationNodeView).annotation!, style: { ...((nn as AnnotationNodeView).annotation?.style || {}), fontSize: val } } } as AnnotationNodeView;
                }
              }));
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
          {/* Header with close and delete only */}
          <div className="flex items-center justify-between mb-3">
            <Button size="icon" variant="outline" className="rounded-none" onClick={() => setOpenEntity(null)} aria-label="Close"><CloseIcon className="w-4 h-4" /></Button>
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

          {(() => {
            const n = nodes.find(nn => nn.kind === openEntity.kind && nn.id === openEntity.id);
            if (!n) return null;

            if (n.kind === 'code') {
              return (
                <>
                  {/* Title editable on click */}
                  <div className="mb-1">
                    {!editingTitle ? (
                      <div className="text-xl font-bold break-words cursor-text" onClick={() => { setTitleDraft(n.highlight?.codeName || 'Untitled'); setEditingTitle(true); }}>
                        {n.highlight?.codeName || 'Untitled'}
                      </div>
                    ) : (
                      <input
                        className="w-full border-2 border-black px-2 py-1 text-xl font-bold"
                        autoFocus
                        value={titleDraft}
                        onChange={(e) => setTitleDraft(e.target.value)}
                        onBlur={async () => { await saveCodeTitle(n.id, titleDraft); setEditingTitle(false); }}
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); }
                          if (e.key === 'Escape') { setEditingTitle(false); }
                        }}
                      />
                    )}
                  </div>
                  {/* Document reference */}
                  {n.highlight?.fileId ? (
                    <div className="text-sm text-neutral-600 mb-3">
                      Document: {fileNames[n.highlight.fileId] ?? '...'}
                    </div>
                  ) : null}
                  {/* Body */}
                  <div className="overflow-auto pr-2">
                    {(() => {
                      const body = n.highlight?.text || '';
                      return body ? <pre className="whitespace-pre-wrap text-sm leading-relaxed">{body}</pre> : <div className="text-sm text-neutral-500">No content.</div>;
                    })()}
                  </div>
                </>
              );
            }

            // Other kinds keep simple input editing
            return (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <input className="border-2 border-black px-2 py-1 flex-1" defaultValue={(() => {
                    return n.kind === 'theme' ? (n.theme?.name || '') : n.kind === 'insight' ? (n.insight?.name || '') : (n.annotation?.content || '');
                  })()} onBlur={async (e) => {
                    const val = e.target.value.trim();
                    try {
                      if (n.kind === 'theme') await updateTheme(n.id, { name: val });
                      if (n.kind === 'insight') await updateInsight(n.id, { name: val });
                      if (n.kind === 'annotation') await updateAnnotation(n.id, { content: val });
                      onUpdate();
                    } catch { toast.error('Save failed'); }
                  }} />
                </div>
                {/* List document filenames for themes and insights */}
                {(n.kind === 'theme' || n.kind === 'insight') && (
                  <div className="mb-3 text-sm text-neutral-600">
                    <div className="font-semibold mb-1">Documents</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {(() => {
                        const names = n.kind === 'theme'
                          ? Array.from(new Set(n.theme!.highlightIds.map(hid => codeFileNameById.get(hid)).filter(Boolean)))
                          : Array.from(new Set(n.insight!.themeIds.flatMap(tid => {
                            const t = themes.find(tt => tt.id === tid);
                            return t ? t.highlightIds.map(hid => codeFileNameById.get(hid)).filter(Boolean) : [];
                          })));
                        return names.map((name, i) => <li key={i}>{name}</li>);
                      })()}
                    </ul>
                  </div>
                )}

                {/* Underlying items: codes for themes; themes and codes for insights */}
                {n.kind === 'theme' && (
                  <div className="mb-3 text-sm text-neutral-800">
                    <div className="font-semibold mb-1">Codes</div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {n.theme!.highlightIds.map(hid => {
                        const h = highlightById.get(hid);
                        if (!h) return null;
                        const doc = h.fileId ? (fileNameById.get(h.fileId) || '') : '';
                        const label = h.codeName || '(untitled)';
                        return <li key={hid}><span className="font-medium">{label}</span>{doc ? <span className="text-neutral-500"> — {doc}</span> : null}</li>;
                      })}
                    </ul>
                  </div>
                )}

                {n.kind === 'insight' && (
                  <div className="mb-3 text-sm text-neutral-800 space-y-2">
                    <div className="font-semibold mb-1">Themes</div>
                    {n.insight!.themeIds.map(tid => {
                      const t = themeById.get(tid);
                      if (!t) return null;
                      return (
                        <div key={tid} className="ml-1">
                          <div className="font-medium">• {t.name || '(untitled theme)'}</div>
                          <ul className="list-disc list-inside space-y-0.5 ml-4 mt-1">
                            {t.highlightIds.map(hid => {
                              const h = highlightById.get(hid);
                              if (!h) return null;
                              const doc = h.fileId ? (fileNameById.get(h.fileId) || '') : '';
                              const label = h.codeName || '(untitled)';
                              return <li key={hid}><span className="font-normal">{label}</span>{doc ? <span className="text-neutral-500"> — {doc}</span> : null}</li>;
                            })}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="overflow-auto pr-2">
                  {(() => {
                    const body = n.kind === 'annotation' ? (n.annotation?.content || '') : '';
                    return body ? <pre className="whitespace-pre-wrap text-sm leading-relaxed">{body}</pre> : <div className="text-sm text-neutral-500">No content.</div>;
                  })()}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};
