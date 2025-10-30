import { Handle, Position } from 'reactflow';
import { Highlight } from '@/types';
import NodeContainer from './common/NodeContainer';
import NodeCard from './common/NodeCard';
import NodeHeader from './common/NodeHeader';

interface CodeNodeProps {
  data: {
    highlight: Highlight;
    onUpdate: () => void;
    selected?: boolean;
  };
}

export const CodeNode = ({ data }: CodeNodeProps) => {
  const { highlight, selected } = data;

  return (
    <NodeContainer selected={selected}>
      <NodeCard className="border-l-primary">
        <NodeHeader label="Code" />
        <p className="text-xs font-semibold mb-2 text-foreground">{highlight.codeName}</p>
        <p className="text-xs text-muted-foreground italic line-clamp-3">"{highlight.text}"</p>
      </NodeCard>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </NodeContainer>
  );
};
