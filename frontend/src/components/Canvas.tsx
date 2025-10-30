import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ReactFlowInstance,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { CodeNode } from './nodes/CodeNode';
import { ThemeNode } from './nodes/ThemeNode';
import { InsightNode } from './nodes/InsightNode';
import { AnnotationNode } from './nodes/AnnotationNode';
import { Highlight, Theme, Insight, Annotation } from '@/types';
import { Button } from './ui/button';
import { StickyNote, MousePointer2, Hand, Type as TypeIcon } from 'lucide-react';
import { createAnnotation, createTheme, createInsight, updateHighlight, updateTheme, updateInsight, updateAnnotation } from '@/services/api';
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

const nodeTypes: NodeTypes = {
  code: CodeNode,
  theme: ThemeNode,
  insight: InsightNode,
  annotation: AnnotationNode,
};

export const Canvas = ({ highlights, themes, insights, annotations, onUpdate }: CanvasProps) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([]);
  const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const flowRef = useRef<HTMLDivElement>(null);
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const [isSpacePanning, setIsSpacePanning] = useState(false);
  const [projectId] = useSelectedProject();

  // Build nodes from data - memoize to prevent unnecessary rebuilds
  useEffect(() => {
    const newNodes: Node[] = [];

    // Code nodes
    highlights.forEach((highlight, idx) => {
      const selected = selectedCodeIds.includes(highlight.id);
      newNodes.push({
        id: `code-${highlight.id}`,
        type: 'code',
        position: highlight.position || { x: 100 + (idx % 5) * 250, y: 100 + Math.floor(idx / 5) * 200 },
        data: { highlight, onUpdate, selected },
        selectable: true,
        className: selected ? 'ring-4 ring-indigo-400' : undefined,
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
    annotations.forEach((annotation, idx) => {
      newNodes.push({
        id: `annotation-${annotation.id}`,
        type: 'annotation',
        position: annotation.position || { x: 60 + (idx % 6) * 180, y: 60 },
        data: { annotation, onUpdate },
        selectable: false,
      });
    });

    setNodes(newNodes);
  }, [highlights, themes, insights, annotations, selectedCodeIds]);

  // Build edges from relationships
  useEffect(() => {
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
  }, [themes, insights]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges]
  );

  // Toolbar and interactions
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

  const isPanning = tool === 'hand' || isSpacePanning;

  // Contextual popup for creating theme or insight from selection
  const [popup, setPopup] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (selectedCodeIds.length >= 2 || selectedThemeIds.length >= 1) {
      setPopup({ x: 16, y: 16 });
    } else {
      setPopup(null);
    }
  }, [selectedCodeIds, selectedThemeIds]);

  return (
    <div ref={flowRef} className="relative w-full h-full">
      {/* Left toolbar */}
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

      {/* Contextual popup */}
      {popup && (
        <div className="absolute z-20 bg-white border-2 border-black p-2 left-3 top-3 space-y-2">
          {selectedCodeIds.length >= 2 && (
            <div>
              <div className="text-xs mb-2">{selectedCodeIds.length} codes selected</div>
              <Button size="sm" className="brutal-button" onClick={async () => {
                const name = prompt('Theme name');
                if (!name) return;
                await createTheme({ name, highlightIds: selectedCodeIds });
                toast.success('Theme created');
                setPopup(null);
                setSelectedCodeIds([]);
                onUpdate();
              }}>Create Theme</Button>
            </div>
          )}
          {selectedThemeIds.length >= 1 && (
            <div>
              <div className="text-xs mb-2">{selectedThemeIds.length} themes selected</div>
              <Button size="sm" className="brutal-button" onClick={async () => {
                const name = prompt('Insight name');
                if (!name) return;
                await createInsight({ name, themeIds: selectedThemeIds });
                toast.success('Insight created');
                setPopup(null);
                setSelectedThemeIds([]);
                onUpdate();
              }}>Create Insight</Button>
            </div>
          )}
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        panOnDrag={isPanning}
        selectionOnDrag={tool === 'select'}
        onInit={(inst) => { rfInstanceRef.current = inst; }}
        onSelectionChange={(sel) => {
          const selectedNodes = sel.nodes ?? [];
          const codeIds = selectedNodes.filter(n => n.id.startsWith('code-')).map(n => n.id.replace('code-', ''));
          const themeIds = selectedNodes.filter(n => n.id.startsWith('theme-')).map(n => n.id.replace('theme-', ''));
          setSelectedCodeIds(codeIds);
          setSelectedThemeIds(themeIds);
        }}
        onNodeDragStop={async (_e, node) => {
          try {
            const { id, position, type } = node;
            if (!position) return;
            if (type === 'code') {
              const hid = id.replace('code-', '');
              await updateHighlight(hid, { position });
            } else if (type === 'theme') {
              const tid = id.replace('theme-', '');
              await updateTheme(tid, { position });
            } else if (type === 'insight') {
              const iid = id.replace('insight-', '');
              await updateInsight(iid, { position });
            } else if (type === 'annotation') {
              const aid = id.replace('annotation-', '');
              await updateAnnotation(aid, { position });
            }
            onUpdate();
          } catch (err) {
            console.error(err);
            toast.error('Failed to save position');
          }
        }}
        onPaneClick={async (e) => {
          if (tool === 'text' && rfInstanceRef.current) {
            const proj = rfInstanceRef.current.project({ x: e.clientX, y: e.clientY });
            await createAnnotation({ content: 'New text', position: { x: proj.x, y: proj.y }, projectId });
            toast.success('Text added');
            onUpdate();
          }
        }}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};
