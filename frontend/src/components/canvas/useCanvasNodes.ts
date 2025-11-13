import { useState, useRef, useEffect, useMemo } from 'react';
import type { Highlight, Theme, Insight, Annotation } from '../../types';
import type { NodeView, NodeKind } from './CanvasTypes';
import { DEFAULTS } from './CanvasTypes';

interface UseCanvasNodesProps {
  highlights: Highlight[];
  themes: Theme[];
  insights: Insight[];
  annotations: Annotation[];
}

export interface CanvasNodes {
  nodes: NodeView[];
  nodesRef: React.RefObject<NodeView[]>;
  setNodes: React.Dispatch<React.SetStateAction<NodeView[]>>;
  nodeIndexByKey: Map<string, number>;
  getNodeByKey: (kind: NodeKind, id: string) => NodeView | undefined;
  updateNode: (kind: NodeKind, id: string, updates: Partial<NodeView>) => void;
}

/**
 * Hook to manage canvas nodes - building, syncing, and updating node views
 */
export function useCanvasNodes({
  highlights,
  themes,
  insights,
  annotations,
}: UseCanvasNodesProps): CanvasNodes {
  const [nodes, setNodes] = useState<NodeView[]>([]);
  const nodesRef = useRef<NodeView[]>([]);

  // Keep ref in sync with state for use in event handlers
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // Build index for quick node lookup
  const nodeIndexByKey = useMemo(() => {
    const m = new Map<string, number>();
    nodes.forEach((n, i) => m.set(`${n.kind}:${n.id}`, i));
    return m;
  }, [nodes]);

  // Get node by kind and id
  const getNodeByKey = (kind: NodeKind, id: string): NodeView | undefined => {
    const idx = nodeIndexByKey.get(`${kind}:${id}`);
    return idx !== undefined ? nodes[idx] : undefined;
  };

  // Update a specific node
  const updateNode = (kind: NodeKind, id: string, updates: Partial<NodeView>) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.kind === kind && n.id === id ? { ...n, ...updates } : n
      )
    );
  };

  // Sync nodes with data props, preserving user-adjusted positions
  useEffect(() => {
    const newNodes: NodeView[] = [];

    // Code nodes
    highlights.forEach((h, idx) => {
      newNodes.push({
        id: h.id,
        kind: 'code',
        x: h.position?.x ?? 100 + (idx % 5) * 260,
        y: h.position?.y ?? 100 + Math.floor(idx / 5) * 180,
        w: h.size?.w ?? DEFAULTS.code.w,
        h: h.size?.h ?? DEFAULTS.code.h,
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
        w: t.size?.w ?? DEFAULTS.theme.w,
        h: t.size?.h ?? DEFAULTS.theme.h,
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
        w: i.size?.w ?? DEFAULTS.insight.w,
        h: i.size?.h ?? DEFAULTS.insight.h,
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
        w: a.size?.w ?? DEFAULTS.annotation.w,
        h: a.size?.h ?? DEFAULTS.annotation.h,
        annotation: a,
      });
    });

    setNodes((prev) => {
      // Try to keep user-adjusted positions if already in state
      type Key = `${NodeKind}:${string}`;
      const prevMap = new Map<Key, NodeView>(
        prev.map((p) => [`${p.kind}:${p.id}` as Key, p])
      );
      return newNodes.map((n) => {
        const key = `${n.kind}:${n.id}` as Key;
        const prevN = prevMap.get(key);
        // Preserve position and size if node already exists
        return prevN ? { ...n, x: prevN.x, y: prevN.y, w: prevN.w, h: prevN.h } : n;
      });
    });
  }, [highlights, themes, insights, annotations]);

  return {
    nodes,
    nodesRef,
    setNodes,
    nodeIndexByKey,
    getNodeByKey,
    updateNode,
  };
}
