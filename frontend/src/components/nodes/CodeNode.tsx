import { Handle, Position } from 'reactflow';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Highlight } from '@/types';

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
    <div className={`min-w-[200px] max-w-[250px] ${selected ? 'ring-4 ring-indigo-400' : ''}`}>
      <Card className="p-3 bg-card shadow-md border-l-4 border-l-primary">
        <Badge className="mb-2 text-xs">Code</Badge>
        <p className="text-xs font-semibold mb-2 text-foreground">{highlight.codeName}</p>
        <p className="text-xs text-muted-foreground italic line-clamp-3">
          "{highlight.text}"
        </p>
      </Card>
      <Handle type="source" position={Position.Bottom} className="!bg-primary" />
    </div>
  );
};
