import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
  type NodeTypes,
  type Connection,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { Highlight, Theme, Insight, Annotation, UploadedFile } from '@/types';
import {
  updateHighlight,
  updateTheme,
  updateInsight,
  updateAnnotation,
  deleteAnnotation as apiDeleteAnnotation,
} from '@/services/api';
import { toast } from 'sonner';

import CodeCard, { type CodeCardData } from './nodes/CodeCard';
import ThemeCard, { type ThemeCardData } from './nodes/ThemeCard';
import InsightCard, { type InsightCardData } from './nodes/InsightCard';
import AnnotationNode, { type AnnotationNodeData } from './nodes/AnnotationNode';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_W = 200;
const DEFAULT_H = 60;
const DEFAULT_ANNOTATION_W = 160;
const DEFAULT_ANNOTATION_H = 60;

const NODE_TYPES: NodeTypes = {
  code: CodeCard,
  theme: ThemeCard,
  insight: InsightCard,
  annotation: AnnotationNode,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildNodes(
  highlights: Highlight[],
  themes: Theme[],
  insights: Insight[],
  annotations: Annotation[],
  files: UploadedFile[],
  onOpen: (kind: string, id: string) => void,
  onAnnotationCommit: (id: string, text: string) => void,
  prevNodes: Node[],
): Node[] {
  const fileById = new Map(files.map((f) => [f.id, f.filename ?? f.id]));
  const posMap = new Map(prevNodes.map((n) => [n.id, n.position]));
  const styleMap = new Map(prevNodes.map((n) => [n.id, n.style]));

  const nodes: Node[] = [];

  highlights.forEach((h, idx) => {
    const nodeId = `code:${h.id}`;
    const data: CodeCardData = {
      highlight: h,
      fileName: h.fileId ? fileById.get(h.fileId) : undefined,
      onOpen: (id) => onOpen('code', id),
    };
    nodes.push({
      id: nodeId,
      type: 'code',
      position: posMap.get(nodeId) ?? { x: h.position?.x ?? 100 + (idx % 5) * 260, y: h.position?.y ?? 100 + Math.floor(idx / 5) * 180 },
      style: styleMap.get(nodeId) ?? { width: h.size?.w ?? DEFAULT_W, height: h.size?.h ?? DEFAULT_H },
      data: data as unknown as Record<string, unknown>,
    });
  });

  themes.forEach((t, idx) => {
    const nodeId = `theme:${t.id}`;
    const data: ThemeCardData = {
      theme: t,
      onOpen: (id) => onOpen('theme', id),
    };
    nodes.push({
      id: nodeId,
      type: 'theme',
      position: posMap.get(nodeId) ?? { x: t.position?.x ?? 100 + (idx % 4) * 320, y: t.position?.y ?? 420 },
      style: styleMap.get(nodeId) ?? { width: t.size?.w ?? DEFAULT_W, height: t.size?.h ?? DEFAULT_H },
      data: data as unknown as Record<string, unknown>,
    });
  });

  insights.forEach((i, idx) => {
    const nodeId = `insight:${i.id}`;
    const data: InsightCardData = {
      insight: i,
      onOpen: (id) => onOpen('insight', id),
    };
    nodes.push({
      id: nodeId,
      type: 'insight',
      position: posMap.get(nodeId) ?? { x: i.position?.x ?? 100 + (idx % 3) * 380, y: i.position?.y ?? 760 },
      style: styleMap.get(nodeId) ?? { width: i.size?.w ?? DEFAULT_W, height: i.size?.h ?? DEFAULT_H },
      data: data as unknown as Record<string, unknown>,
    });
  });

  annotations.forEach((a, idx) => {
    const nodeId = `annotation:${a.id}`;
    const data: AnnotationNodeData = {
      annotation: a,
      onCommit: onAnnotationCommit,
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

function buildEdges(themes: Theme[], insights: Insight[]): Edge[] {
  const edges: Edge[] = [];

  themes.forEach((t) => {
    (t.highlightIds ?? []).forEach((hid) => {
      edges.push({
        id: `code-theme:${hid}:${t.id}`,
        source: `code:${hid}`,
        target: `theme:${t.id}`,
        type: 'smoothstep',
        style: { stroke: '#b1b1b7', strokeWidth: 1 },
      });
    });
  });

  insights.forEach((i) => {
    (i.themeIds ?? []).forEach((tid) => {
      edges.push({
        id: `theme-insight:${tid}:${i.id}`,
        source: `theme:${tid}`,
        target: `insight:${i.id}`,
        type: 'smoothstep',
        style: { stroke: '#b1b1b7', strokeWidth: 1 },
      });
    });
  });

  return edges;
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
}: FlowCanvasProps) {
  // Stable callbacks passed into node data — defined before node building
  const handleOpen = useCallback((kind: string, id: string) => {
    onOpenEntity(kind, id);
  }, [onOpenEntity]);

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

  // Start empty; useEffect re-syncs whenever React Query data arrives or onUpdate fires
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);

  useEffect(() => {
    setNodes((prev) =>
      buildNodes(highlights, themes, insights, annotations, files, handleOpen, handleAnnotationCommit, prev)
    );
  }, [highlights, themes, insights, annotations, files, handleOpen, handleAnnotationCommit, setNodes]);

  useEffect(() => {
    setEdges(buildEdges(themes, insights));
  }, [themes, insights, setEdges]);

  // Debounce timer ref for position persistence
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FIX M1: clean up debounce timer on unmount
  useEffect(() => {
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, []);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds));

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

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      changes.forEach((change) => {
        if (change.type !== 'remove') return;
        const edgeId = change.id;
        if (edgeId.startsWith('code-theme:')) {
          const parts = edgeId.split(':');
          const codeId = parts[1];
          const themeId = parts[2];
          const theme = themes.find((t) => t.id === themeId);
          if (theme) {
            updateTheme(themeId, { highlightIds: theme.highlightIds.filter((id) => id !== codeId) })
              .then(onUpdate)
              .catch(() => toast.error('Failed to remove connection'));
          }
        } else if (edgeId.startsWith('theme-insight:')) {
          const parts = edgeId.split(':');
          const themeId = parts[1];
          const insightId = parts[2];
          const insight = insights.find((i) => i.id === insightId);
          if (insight) {
            updateInsight(insightId, { themeIds: insight.themeIds.filter((id) => id !== themeId) })
              .then(onUpdate)
              .catch(() => toast.error('Failed to remove connection'));
          }
        }
      });
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [themes, insights, setEdges, onUpdate]
  );

  const onConnect: OnConnect = useCallback(
    async (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target) return;
      const sColonIdx = source.indexOf(':');
      const sourceKind = source.slice(0, sColonIdx);
      const sourceId = source.slice(sColonIdx + 1);
      const tColonIdx = target.indexOf(':');
      const targetKind = target.slice(0, tColonIdx);
      const targetId = target.slice(tColonIdx + 1);

      try {
        if (sourceKind === 'code' && targetKind === 'theme') {
          const theme = themes.find((t) => t.id === targetId);
          if (!theme) return;
          const newIds = Array.from(new Set([...theme.highlightIds, sourceId]));
          await updateTheme(targetId, { highlightIds: newIds });
          setEdges((eds) =>
            addEdge(
              {
                ...connection,
                id: `code-theme:${sourceId}:${targetId}`,
                type: 'smoothstep',
                style: { stroke: '#b1b1b7', strokeWidth: 1 },
              },
              eds
            )
          );
          onUpdate();
        } else if (sourceKind === 'theme' && targetKind === 'insight') {
          const insight = insights.find((i) => i.id === targetId);
          if (!insight) return;
          const newIds = Array.from(new Set([...insight.themeIds, sourceId]));
          await updateInsight(targetId, { themeIds: newIds });
          setEdges((eds) =>
            addEdge(
              {
                ...connection,
                id: `theme-insight:${sourceId}:${targetId}`,
                type: 'smoothstep',
                style: { stroke: '#b1b1b7', strokeWidth: 1 },
              },
              eds
            )
          );
          onUpdate();
        }
      } catch {
        toast.error('Failed to create connection');
      }
    },
    [themes, insights, setEdges, onUpdate]
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        minZoom={0.1}
        maxZoom={2}
        selectionOnDrag
        panOnDrag={[1, 2]}
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
