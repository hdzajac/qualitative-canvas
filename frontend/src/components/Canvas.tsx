import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Highlight, Theme, Insight, Annotation, CardStyle, UploadedFile } from '../types';
import { Button } from './ui/button';
import { Trash2 } from 'lucide-react';
import { createAnnotation, createTheme, createInsight, updateHighlight, updateTheme, updateInsight, updateAnnotation, deleteHighlight, deleteTheme, deleteInsight, deleteAnnotation, getFile } from '../services/api';
import { toast } from 'sonner';
import { useSelectedProject } from '../hooks/useSelectedProject';
import { NodeKind, Tool, NodeView, DEFAULTS, ResizeCorner, /* add subtype imports */ } from './canvas/CanvasTypes';
// Add explicit subtype imports for type narrowing
import type { CodeNodeView, ThemeNodeView, InsightNodeView, AnnotationNodeView } from './canvas/CanvasTypes';
import { clamp, toggleInArray, union, hitTestNode, intersects, measureWrappedLines, isInOpenIcon, isInConnectHandle } from './canvas/CanvasUtils';
import { drawGrid, drawOrthogonal, roundRect, drawNode } from './canvas/CanvasDrawing';
import { selectionBBox as computeSelectionBBox, placeRightOf as computePlaceRightOf } from './canvas/CanvasGeometry';
import CanvasToolbarLeft from './canvas/CanvasToolbarLeft';
import CanvasFontToolbar from './canvas/CanvasFontToolbar';
import CanvasContextPopup from './canvas/CanvasContextPopup';
import CanvasSizeControls from './canvas/CanvasSizeControls';
import AnnotationSticky from './canvas/AnnotationSticky';
import { CanvasHelpPanel } from './canvas/CanvasHelpPanel';
import { CanvasEntityPanel } from './canvas/CanvasEntityPanel';
import { useCanvasViewport } from './canvas/useCanvasViewport';
import { useCanvasSelection } from './canvas/useCanvasSelection';
import { useCanvasNodes } from './canvas/useCanvasNodes';
import { useCanvasInteraction } from './canvas/useCanvasInteraction';

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

  // Tools and interaction
  const [tool, setTool] = useState<Tool>('select');

  const [projectId] = useSelectedProject();

  // Node management (building and syncing with data props)
  const canvasNodes = useCanvasNodes({ highlights, themes, insights, annotations });
  const { nodes, nodesRef, setNodes, nodeIndexByKey } = canvasNodes;

  // Viewport management (zoom, offset, panning)
  const viewport = useCanvasViewport({
    canvasSize: size,
    nodes,
    projectId,
  });
  const { zoom, offset, setZoom, setOffset, isSpacePanning, setIsSpacePanning, worldToScreen, screenToWorld, fitToContent } = viewport;
  const isPanning = tool === 'hand' || isSpacePanning;

  // Selection management
  const selection = useCanvasSelection({ nodes });
  const {
    selectedCodeIds,
    selectedThemeIds,
    selectedCodeIdsRef,
    selectedThemeIdsRef,
    setSelectedCodeIds,
    setSelectedThemeIds,
    clearSelection,
    showContextPopup: showPopup,
    selectionBBox,
  } = selection;

  // Annotation drafts and focus state (rendered as HTML textfields)
  const [annotationDrafts, setAnnotationDrafts] = useState<Record<string, string>>({});
  const [editingAnnotation, setEditingAnnotation] = useState<null | { id: string }>(null);
  const editingInputRef = useRef<HTMLTextAreaElement | null>(null);
  // Drag/resize state for annotations rendered as HTML
  const dragAnnoRef = useRef<null | { mode: 'move' | 'resize'; id: string; startClient: { x: number; y: number }; startNode: { x: number; y: number; w: number; h: number } }>(null);
  useEffect(() => {
    if (editingAnnotation && editingInputRef.current) {
      const el = editingInputRef.current;
      el.focus();
      el.select();
    }
  }, [editingAnnotation]);

  // Global mouse handlers for moving/resizing annotations
  useEffect(() => {
    function onMove(e: MouseEvent) {
      const st = dragAnnoRef.current; if (!st) return;
      const dx = e.clientX - st.startClient.x; const dy = e.clientY - st.startClient.y;
      const dxW = dx / Math.max(0.0001, zoom); const dyW = dy / Math.max(0.0001, zoom);
      setNodes(prev => prev.map(nn => {
        if (nn.kind !== 'annotation' || nn.id !== st.id) return nn;
        if (st.mode === 'move') {
          return { ...nn, x: st.startNode.x + dxW, y: st.startNode.y + dyW };
        } else {
          const minW = 60; const minH = 24;
          return { ...nn, w: Math.max(minW, st.startNode.w + dxW), h: Math.max(minH, st.startNode.h + dyW) };
        }
      }));
    }
    async function onUp() {
      const st = dragAnnoRef.current; if (!st) return;
      dragAnnoRef.current = null;
      const nn = nodesRef.current.find((n: NodeView) => n.kind === 'annotation' && n.id === st.id) as AnnotationNodeView | undefined;
      if (!nn) return;
      try {
        await updateAnnotation(nn.id, { position: { x: nn.x, y: nn.y }, size: { w: nn.w, h: nn.h } });
        onUpdate();
      } catch { toast.error('Failed to save'); }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [zoom, onUpdate, setNodes, nodesRef]);

  // Help overlay state
  const [showHelp, setShowHelp] = useState(false);

  // Initialize drafts for annotations when they load (don't clobber existing drafts)
  useEffect(() => {
    setAnnotationDrafts((prev) => {
      const next = { ...prev };
      annotations.forEach(a => {
        if (next[a.id] === undefined) next[a.id] = a.content || '';
      });
      // Optionally remove drafts for deleted annotations
      const ids = new Set(annotations.map(a => a.id));
      (Object.keys(next) as Array<string>).forEach((id: string) => { if (!ids.has(id)) delete next[id]; });
      return next;
    });
  }, [annotations]);

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
  const deleteSelection = useCallback(async () => {
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
  }, [selectedCodeIdsRef, selectedThemeIdsRef, setNodes, setSelectedCodeIds, setSelectedThemeIds, onUpdate]);

  // Popup editing for all kinds
  const [openEntity, setOpenEntity] = useState<{ kind: NodeKind; id: string } | null>(null);
  const openPopupFor = useCallback((n: NodeView) => { setOpenEntity({ kind: n.kind, id: n.id }); }, []);
  const openEntityRef = useRef<typeof openEntity>(null);
  useEffect(() => { openEntityRef.current = openEntity; }, [openEntity]);

  // Callback for when node is clicked (for annotations or open icon)
  const handleNodeClick = useCallback((n: NodeView) => {
    if (n.kind === 'annotation') {
      setEditingAnnotation({ id: n.id });
    } else {
      openPopupFor(n);
    }
  }, [openPopupFor]);

  // Callback for edge deletion
  const handleEdgeDelete = useCallback((edge: { kind: 'code-theme' | 'theme-insight'; fromId: string; toId: string }) => {
    const confirmMsg = edge.kind === 'code-theme' ? 'Remove code from theme?' : 'Remove theme from insight?';
    if (confirm(confirmMsg)) {
      (async () => {
        try {
          if (edge.kind === 'code-theme') {
            const t = themes.find(tt => tt.id === edge.toId);
            if (!t) return;
            const newIds = t.highlightIds.filter((id: string) => id !== edge.fromId);
            await updateTheme(t.id, { highlightIds: newIds });
          } else {
            const iobj = insights.find(ii => ii.id === edge.toId);
            if (!iobj) return;
            const newIds = iobj.themeIds.filter((id: string) => id !== edge.fromId);
            await updateInsight(iobj.id, { themeIds: newIds });
          }
          toast.success('Connection removed');
          onUpdate();
        } catch {
          toast.error('Failed to update');
        }
      })();
    }
  }, [themes, insights, onUpdate]);

  // Callback for connection completion
  const handleConnectComplete = useCallback(async (fromKind: NodeKind, fromId: string, targetId: string, targetKind: NodeKind) => {
    try {
      if (fromKind === 'code' && targetKind === 'theme') {
        const t = themes.find(tt => tt.id === targetId);
        if (t) {
          const newIds = Array.from(new Set([...(t.highlightIds || []), fromId]));
          await updateTheme(t.id, { highlightIds: newIds });
          toast.success('Code added to theme');
          onUpdate();
        }
      } else if (fromKind === 'theme' && targetKind === 'insight') {
        const iobj = insights.find(ii => ii.id === targetId);
        if (iobj) {
          const newIds = Array.from(new Set([...(iobj.themeIds || []), fromId]));
          await updateInsight(iobj.id, { themeIds: newIds });
          toast.success('Theme added to insight');
          onUpdate();
        }
      }
    } catch {
      toast.error('Failed to connect');
    }
  }, [themes, insights, onUpdate]);

  // Callback for node move completion
  const handleNodeMoveComplete = useCallback(async (movedNodes: NodeView[]) => {
    try {
      await Promise.all(movedNodes.map(async (n) => {
        if (n.kind === 'code' && n.highlight) return updateHighlight(n.id, { position: { x: n.x, y: n.y }, size: { w: n.w, h: n.h } });
        if (n.kind === 'theme' && n.theme) return updateTheme(n.id, { position: { x: n.x, y: n.y }, size: { w: n.w, h: n.h } });
        if (n.kind === 'insight' && n.insight) return updateInsight(n.id, { position: { x: n.x, y: n.y }, size: { w: n.w, h: n.h } });
        if (n.kind === 'annotation' && n.annotation) return updateAnnotation(n.id, { position: { x: n.x, y: n.y }, size: { w: n.w, h: n.h } });
      }));
      onUpdate();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save');
    }
  }, [onUpdate]);

  // Callback for marquee selection
  const handleMarqueeSelect = useCallback((codes: string[], ths: string[], additive: boolean) => {
    setSelectedCodeIds((prev) => (additive ? union(prev, codes) : codes));
    setSelectedThemeIds((prev) => (additive ? union(prev, ths) : ths));
    // draw() will be called automatically by the draw effect
  }, [setSelectedCodeIds, setSelectedThemeIds]);

  // Keyboard for tools, space-panning, delete selection, and quick-create Theme/Insight
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
      // T: Create Theme when available (codes selected); otherwise fall back to Text tool
      if (e.code === 'KeyT' && !isEditableTarget(e.target)) {
        const codes = selectedCodeIdsRef.current || [];
        if (codes.length > 0) {
          e.preventDefault();
          (async () => {
            const name = prompt('Theme name');
            if (!name) return;
            try {
              const bbox = selectionBBox(['code']);
              const defaultW = DEFAULTS.theme.w; const defaultH = DEFAULTS.theme.h;
              const pos = bbox ? placeRightOf(bbox!, defaultW, defaultH) : viewportCenterWorld();
              await createTheme({ name, highlightIds: codes, size: DEFAULTS.theme, position: pos });
              toast.success('Theme created');
              setSelectedCodeIds([]);
              onUpdate();
            } catch {
              toast.error('Failed to create theme');
            }
          })();
          return;
        } else {
          // no codes selected -> default to text tool
          setTool('text');
        }
      }
      // I: Create Insight when available (themes selected)
      if (e.code === 'KeyI' && !isEditableTarget(e.target)) {
        const ths = selectedThemeIdsRef.current || [];
        if (ths.length > 0) {
          e.preventDefault();
          (async () => {
            const name = prompt('Insight name');
            if (!name) return;
            try {
              const bbox = selectionBBox(['theme']);
              const defaultW = DEFAULTS.insight.w; const defaultH = DEFAULTS.insight.h;
              const pos = bbox ? placeRightOf(bbox!, defaultW, defaultH) : viewportCenterWorld();
              await createInsight({ name, themeIds: ths, size: DEFAULTS.insight, position: pos });
              toast.success('Insight created');
              setSelectedThemeIds([]);
              onUpdate();
            } catch {
              toast.error('Failed to create insight');
            }
          })();
          return;
        }
      }
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
      t.highlightIds.forEach((hid: string) => {
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
      i.themeIds.forEach((tid: string) => {
        const t = themes.find(tt => tt.id === tid);
        if (!t) return;
        t.highlightIds.forEach((hid: string) => {
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

    // Edges under nodes with hover highlight
    const byKey = new Map(nodes.map((n) => [`${n.kind}:${n.id}`, n] as const));
    const hovered = hoveredEdgeRef.current;
    const highlightNodeIds = new Set<string>();
    ctx.save();
    themes.forEach((t) => {
      t.highlightIds.forEach((hid: string) => {
        const a = byKey.get(`code:${hid}`);
        const b = byKey.get(`theme:${t.id}`);
        if (!a || !b) return;
        const ax = a.x + a.w / 2;
        const ay = a.y + a.h;
        const bx = b.x + b.w / 2;
        const by = b.y;
        const isHovered = hovered && hovered.kind === 'code-theme' && hovered.fromId === hid && hovered.toId === t.id;
        ctx.strokeStyle = isHovered ? '#dc2626' : '#b1b1b7';
        ctx.lineWidth = isHovered ? 2.5 : 1;
        if (isHovered) { highlightNodeIds.add(hid); highlightNodeIds.add(t.id); }
        drawOrthogonal(ctx, ax, ay, bx, by);
      });
    });
    insights.forEach((i) => {
      i.themeIds.forEach((tid: string) => {
        const a = byKey.get(`theme:${tid}`);
        const b = byKey.get(`insight:${i.id}`);
        if (!a || !b) return;
        const ax = a.x + a.w / 2;
        const ay = a.y + a.h;
        const bx = b.x + b.w / 2;
        const by = b.y;
        const isHovered = hovered && hovered.kind === 'theme-insight' && hovered.fromId === tid && hovered.toId === i.id;
        ctx.strokeStyle = isHovered ? '#dc2626' : '#b1b1b7';
        ctx.lineWidth = isHovered ? 2.5 : 1;
        if (isHovered) { highlightNodeIds.add(tid); highlightNodeIds.add(i.id); }
        drawOrthogonal(ctx, ax, ay, bx, by);
      });
    });
    ctx.restore();

    // Nodes (show subtle handle only for hovered node, or for the source node during connect)
    nodes.forEach((n) => {
      const isConnectingFromThis = (dragState.current && dragState.current.mode === 'connect' && dragState.current.fromId === n.id);
      const showHandle = isConnectingFromThis || ((hoverInfo.current && hoverInfo.current.kind === 'node' && hoverInfo.current.id === n.id) ? (n.kind === 'code' || n.kind === 'theme') : false);
      const isConnectTarget = Boolean(connectTargetRef.current && connectTargetRef.current.id === n.id);
      const isEdgeHoverHighlight = highlightNodeIds.has(n.id);
      drawNode(ctx, n, selectedCodeIds, selectedThemeIds, getFontSize, getBottomRightLabel, getLabelScroll, { showHandle, highlightAsTarget: isConnectTarget || isEdgeHoverHighlight });
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

  // Attach wheel event listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      if (dragState.current) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
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

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenToWorld, zoom, setZoom, setOffset]);

  // Helpers to position new nodes
  const viewportCenterWorld = useCallback(() => screenToWorld(size.w / 2, size.h / 2), [screenToWorld, size.w, size.h]);
  const placeRightOf = useCallback((bbox: { maxX: number; cy: number }, w: number, h: number) => computePlaceRightOf(bbox, w, h), []);

  // Canvas interaction management (mouse/keyboard handlers, drag state)
  const interaction = useCanvasInteraction({
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
    getFontSize: (n: NodeView) => {
      const style: CardStyle | undefined = n.kind === 'code' ? n.highlight?.style : n.kind === 'theme' ? n.theme?.style : n.kind === 'insight' ? n.insight?.style : n.annotation?.style;
      return style?.fontSize ?? fontSize;
    },
    getBottomRightLabel,
    getLabelScroll: (_nodeId: string, _kind: NodeKind) => 0,
    onNodeClick: handleNodeClick,
    onEdgeDelete: handleEdgeDelete,
    onConnectComplete: handleConnectComplete,
    onNodeMoveComplete: handleNodeMoveComplete,
    onMarqueeSelect: handleMarqueeSelect,
    deleteSelection,
  });
  const { dragState, hoverCursor, hoveredEdge, hoveredEdgeVersion, onMouseDown, onMouseMove, onMouseLeave, onMouseUp, onWheel: interactionOnWheel } = interaction;

  // Create a ref wrapper for dragState to maintain compatibility with existing code
  const hoveredEdgeRef = { current: hoveredEdge };

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

  // Note: Mouse event handlers (onMouseDown, onMouseMove, onMouseLeave, onMouseUp) are now provided by useCanvasInteraction hook

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
    getFile(fid).then((f: UploadedFile) => setFileNames(prev => ({ ...prev, [fid]: f.filename }))).catch(() => { });
  }, [openEntity, nodes, fileNames]);



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
        // Do not auto-grow annotations; user resizes them manually
        const topPadding = 18; // space before first line baseline
        const bottomPadding = 18; // reserve for type label
        const minH = n.kind === 'code' ? DEFAULTS.code.h : n.kind === 'theme' ? DEFAULTS.theme.h : n.kind === 'insight' ? DEFAULTS.insight.h : DEFAULTS.annotation.h;
        const desired = Math.max(minH, topPadding + lines * lineHeight + bottomPadding);
        if ((n.kind === 'code' || n.kind === 'theme' || n.kind === 'insight') && desired > n.h + 0.5) { changed = true; return { ...n, h: desired }; }
        return n;
      });
      return changed ? next : prev;
    });
    // Redraw after potential size change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontSize, nodes]);

  // Toolbar additions: text size selector
  // ...left toolbar remains, append a small control on top center

  // custom delete X cursor data URI (center hotspot 12,12)
  const deleteCursorUrl = 'url("data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2224%22 height=%2224%22 viewBox=%220 0 24 24%22><rect width=%2224%22 height=%2224%22 fill=%22white%22 fill-opacity=%220%22/><path d=%22M5 5 L19 19 M19 5 L5 19%22 stroke=%22%23dc2626%22 stroke-width=%223%22 stroke-linecap=%22round%22/></svg>") 12 12, pointer';
  const resolvedCursor = hoverCursor === 'x-delete' ? deleteCursorUrl : hoverCursor;

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
        style={{ cursor: resolvedCursor }}
      />

      <CanvasToolbarLeft tool={tool} onSetTool={setTool} onFit={fitToContent} />

      <CanvasFontToolbar
        fontSize={fontSize}
        onChangeFontSize={setFontSize}
        canApply={(() => {
          const idx = selectedCodeIds.length === 1 ? nodes.findIndex(n => n.kind === 'code' && n.id === selectedCodeIds[0]) : selectedThemeIds.length === 1 ? nodes.findIndex(n => n.kind === 'theme' && n.id === selectedThemeIds[0]) : -1;
          return idx >= 0;
        })()}
        onApply={() => {
          const idx = selectedCodeIds.length === 1 ? nodes.findIndex(n => n.kind === 'code' && n.id === selectedCodeIds[0]) : selectedThemeIds.length === 1 ? nodes.findIndex(n => n.kind === 'theme' && n.id === selectedThemeIds[0]) : -1;
          const n = idx >= 0 ? nodes[idx] : null;
          if (n) void persistFontSize(n, fontSize);
        }}
      />

      <CanvasContextPopup
        selectedCodeCount={selectedCodeIds.length}
        selectedThemeCount={selectedThemeIds.length}
        onCreateTheme={async () => {
          const name = prompt('Theme name');
          if (!name) return;
          const bbox = selectionBBox(['code']);
          const defaultW = DEFAULTS.theme.w; const defaultH = DEFAULTS.theme.h;
          const pos = bbox ? placeRightOf(bbox, defaultW, defaultH) : viewportCenterWorld();
          await createTheme({ name, highlightIds: selectedCodeIds, size: DEFAULTS.theme, position: pos });
          toast.success('Theme created');
          setSelectedCodeIds([]);
          onUpdate();
        }}
        onCreateInsight={async () => {
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
      />

      {/* Annotation textfields (persistent) via component */}
      {nodes.filter((nn): nn is AnnotationNodeView => nn.kind === 'annotation').map((n) => {
        const id = n.id;
        const fs = getFontSize(n);
        const val = annotationDrafts[id] ?? n.annotation?.content ?? '';
        const bg = (n.annotation?.style && n.annotation.style.background) || '#FEF3C7';
        const palette: string[] = ['#FEF3C7', '#FED7AA', '#FBCFE8', '#DCFCE7', '#DBEAFE', '#E9D5FF', '#F3F4F6'];
        const isDraggingAnno = dragAnnoRef.current?.mode === 'move' && dragAnnoRef.current.id === id;
        const isResizingAnno = dragAnnoRef.current?.mode === 'resize' && dragAnnoRef.current.id === id;
        return (
          <AnnotationSticky
            key={id}
            id={id}
            x={n.x} y={n.y} w={n.w} h={n.h}
            zoom={zoom}
            offset={offset}
            bg={bg}
            fontSizePx={fs}
            value={val}
            active={editingAnnotation?.id === id}
            isDragging={isDraggingAnno}
            isResizing={isResizingAnno}
            palette={palette}
            onChange={(noteId, newVal) => setAnnotationDrafts(prev => ({ ...prev, [noteId]: newVal }))}
            onFocus={(noteId) => setEditingAnnotation({ id: noteId })}
            onCommit={async (noteId, finalText) => {
              const trimmed = finalText.trim();
              setEditingAnnotation(null);
              try {
                if (!trimmed) {
                  await deleteAnnotation(noteId);
                  toast.success('Text removed');
                } else {
                  await updateAnnotation(noteId, { content: trimmed });
                  toast.success('Saved');
                }
                onUpdate();
              } catch {
                toast.error('Save failed');
              }
            }}
            onApplyColor={async (noteId, color) => {
              try {
                await updateAnnotation(noteId, { style: { ...(n.annotation?.style || {}), background: color } });
                setNodes(prev => prev.map(nn => (nn.kind === 'annotation' && nn.id === noteId) ? { ...nn, annotation: { ...nn.annotation!, style: { ...(nn.annotation?.style || {}), background: color } } } : nn));
                onUpdate();
              } catch { toast.error('Save failed'); }
            }}
            onApplyFontSize={async (noteId, size) => {
              const currentBg = (n.annotation?.style && n.annotation.style.background) || '#FEF3C7';
              try {
                await updateAnnotation(noteId, { style: { ...(n.annotation?.style || {}), background: currentBg, fontSize: size } });
                setNodes(prev => prev.map(nn => (nn.kind === 'annotation' && nn.id === noteId) ? { ...nn, annotation: { ...nn.annotation!, style: { ...(nn.annotation?.style || {}), background: currentBg, fontSize: size } } } : nn));
                onUpdate();
              } catch { toast.error('Save failed'); }
            }}
            onStartMove={(noteId, clientX, clientY, startNode) => {
              dragAnnoRef.current = { mode: 'move', id: noteId, startClient: { x: clientX, y: clientY }, startNode };
            }}
            onStartResize={(noteId, clientX, clientY, startNode) => {
              dragAnnoRef.current = { mode: 'resize', id: noteId, startClient: { x: clientX, y: clientY }, startNode };
            }}
          />
        );
      })}

      {/* Size controls for single selection (width presets + font size per-card) */}
      {(() => {
        const singleCode = selectedCodeIds.length === 1 ? nodes.find(n => n.kind === 'code' && n.id === selectedCodeIds[0]) : undefined;
        const singleTheme = (!singleCode && selectedThemeIds.length === 1) ? nodes.find(n => n.kind === 'theme' && n.id === selectedThemeIds[0]) : undefined;
        const n = singleCode || singleTheme;
        if (!n) return null;
        const fs = getFontSize(n);
        const widthVariant: '200' | '300' = n.w <= 210 ? '200' : '300';
        return (
          <CanvasSizeControls
            widthVariant={widthVariant}
            onSetWidth200={() => { setNodes(prev => prev.map(nn => (nn.kind === n.kind && nn.id === n.id) ? { ...nn, w: 200 } : nn)); draw(); }}
            onSetWidth300={() => { setNodes(prev => prev.map(nn => (nn.kind === n.kind && nn.id === n.id) ? { ...nn, w: 300 } : nn)); draw(); }}
            fontSize={fs}
            onChangeFontSize={(val) => {
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
              })); draw();
            }}
            onSave={async () => {
              try {
                if (n.kind === 'code') await updateHighlight(n.id, { size: { w: n.w, h: n.h }, style: { ...(n.highlight?.style || {}), fontSize: getFontSize(n) } });
                if (n.kind === 'theme') await updateTheme(n.id, { size: { w: n.w, h: n.h }, style: { ...(n.theme?.style || {}), fontSize: getFontSize(n) } });
                if (n.kind === 'insight') await updateInsight(n.id, { size: { w: n.w, h: n.h }, style: { ...(n.insight?.style || {}), fontSize: getFontSize(n) } });
                if (n.kind === 'annotation') await updateAnnotation(n.id, { size: { w: n.w, h: n.h }, style: { ...(n.annotation?.style || {}), fontSize: getFontSize(n) } });
                toast.success('Saved');
                onUpdate();
              } catch { toast.error('Save failed'); }
            }}
          />
        );
      })()}

      {/* Entity Panel */}
      <CanvasEntityPanel
        entity={openEntity}
        nodes={nodes}
        themes={themes}
        fileNames={fileNames}
        fileNameById={fileNameById}
        codeFileNameById={codeFileNameById}
        highlightById={highlightById}
        themeById={themeById}
        onClose={() => setOpenEntity(null)}
        onUpdate={onUpdate}
        onNodeUpdate={setNodes}
      />

      {/* Help button & panel */}
      <CanvasHelpPanel visible={showHelp} onToggle={() => setShowHelp(s => !s)} />
    </div>
  );
};
