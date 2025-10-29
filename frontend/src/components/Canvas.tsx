import { useCallback, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  Connection,
  useNodesState,
  useEdgesState,
  addEdge,
  NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { CodeNode } from './nodes/CodeNode';
import { ThemeNode } from './nodes/ThemeNode';
import { InsightNode } from './nodes/InsightNode';
import { AnnotationNode } from './nodes/AnnotationNode';
import { Highlight, Theme, Insight, Annotation } from '@/types';
import { Button } from './ui/button';
import { StickyNote } from 'lucide-react';
import { createAnnotation } from '@/services/api';
import { toast } from 'sonner';

interface CanvasProps {
  highlights: Highlight[];
  themes: Theme[];
  insights: Insight[];
  annotations: Annotation[];
  onUpdate: () => void;
  onSelectionChange?: (sel: { codeIds: string[]; themeIds: string[] }) => void;
}

const nodeTypes: NodeTypes = {
  code: CodeNode,
  theme: ThemeNode,
  insight: InsightNode,
  annotation: AnnotationNode,
};

export const Canvas = ({ highlights, themes, insights, annotations, onUpdate, onSelectionChange }: CanvasProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Build nodes from data
  const buildNodes = useCallback(() => {
    const newNodes: Node[] = [];

    // Code nodes
    highlights.forEach((highlight, idx) => {
      newNodes.push({
        id: `code-${highlight.id}`,
        type: 'code',
        position: highlight.position || { x: 100 + (idx % 5) * 250, y: 100 + Math.floor(idx / 5) * 200 },
        data: { highlight, onUpdate },
        selectable: true,
      });
    });

    // Theme nodes
    themes.forEach((theme, idx) => {
      newNodes.push({
        id: `theme-${theme.id}`,
        type: 'theme',
        position: theme.position || { x: 100 + (idx % 4) * 300, y: 500 },
        data: { theme, highlights, onUpdate },
        selectable: true,
      });
    });

    // Insight nodes
    insights.forEach((insight, idx) => {
      newNodes.push({
        id: `insight-${insight.id}`,
        type: 'insight',
        position: insight.position || { x: 100 + (idx % 3) * 400, y: 900 },
        data: { insight, themes, highlights, onUpdate },
        selectable: true,
      });
    });

    // Annotation nodes
    annotations.forEach((annotation) => {
      newNodes.push({
        id: `annotation-${annotation.id}`,
        type: 'annotation',
        position: annotation.position,
        data: { annotation, onUpdate },
        selectable: false,
      });
    });

    setNodes(newNodes);
  }, [highlights, themes, insights, annotations, onUpdate, setNodes]);

  // Build edges from relationships
  const buildEdges = useCallback(() => {
    const newEdges: Edge[] = [];

    // Connect codes to themes
    themes.forEach((theme) => {
      theme.highlightIds.forEach((highlightId) => {
        newEdges.push({
          id: `code-${highlightId}-theme-${theme.id}`,
          source: `code-${highlightId}`,
          target: `theme-${theme.id}`,
          type: 'smoothstep',
        });
      });
    });

    // Connect themes to insights
    insights.forEach((insight) => {
      insight.themeIds.forEach((themeId) => {
        newEdges.push({
          id: `theme-${themeId}-insight-${insight.id}`,
          source: `theme-${themeId}`,
          target: `insight-${insight.id}`,
          type: 'smoothstep',
        });
      });
    });

    setEdges(newEdges);
  }, [themes, insights, setEdges]);

  // Rebuild when data changes
  useState(() => {
    buildNodes();
    buildEdges();
  });

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges]
  );

  const handleAddAnnotation = async () => {
    try {
      await createAnnotation({
        content: 'New annotation',
        position: { x: 400, y: 400 },
      });
      toast.success('Annotation added');
      onUpdate();
    } catch (error) {
      toast.error('Failed to add annotation');
    }
  };

  return (
    <div className="relative w-full h-full">
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button onClick={handleAddAnnotation} size="sm">
          <StickyNote className="w-4 h-4 mr-2" />
          Add Note
        </Button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        onSelectionChange={(sel) => {
          if (!onSelectionChange) return;
          const selectedNodes = sel.nodes ?? [];
          const codeIds = selectedNodes
            .filter((n) => n.id.startsWith('code-'))
            .map((n) => n.id.replace('code-', ''));
          const themeIds = selectedNodes
            .filter((n) => n.id.startsWith('theme-'))
            .map((n) => n.id.replace('theme-', ''));
          onSelectionChange({ codeIds, themeIds });
        }}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};
