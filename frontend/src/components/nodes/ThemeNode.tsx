import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Theme, Highlight } from '@/types';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface ThemeNodeProps {
  data: {
    theme: Theme;
    highlights: Highlight[];
    onUpdate: () => void;
  };
}

export const ThemeNode = ({ data }: ThemeNodeProps) => {
  const { theme, highlights } = data;
  const [expanded, setExpanded] = useState(false);

  const relatedHighlights = highlights.filter((h) => theme.highlightIds.includes(h.id));

  return (
    <div className="min-w-[250px] max-w-[300px]">
      <Handle type="target" position={Position.Top} className="!bg-accent" />
      <Card className="p-4 bg-card shadow-lg border-l-4 border-l-accent">
        <div className="flex items-start justify-between mb-2">
          <Badge variant="secondary" className="text-xs">Theme</Badge>
          {relatedHighlights.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="h-6 w-6 p-0"
            >
              {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </Button>
          )}
        </div>
        <p className="text-sm font-semibold mb-2 text-foreground">{theme.name}</p>
        <p className="text-xs text-muted-foreground">
          {relatedHighlights.length} code{relatedHighlights.length !== 1 ? 's' : ''}
        </p>

        {expanded && relatedHighlights.length > 0 && (
          <div className="mt-3 space-y-2 border-t pt-3">
            {relatedHighlights.map((highlight) => (
              <div key={highlight.id} className="text-xs p-2 bg-muted rounded">
                <p className="font-medium">{highlight.codeName}</p>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Handle type="source" position={Position.Bottom} className="!bg-accent" />
    </div>
  );
};
