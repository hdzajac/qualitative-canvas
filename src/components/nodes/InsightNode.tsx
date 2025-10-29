import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Insight, Theme, Highlight } from '@/types';
import { ChevronDown, ChevronRight, Lightbulb } from 'lucide-react';

interface InsightNodeProps {
  data: {
    insight: Insight;
    themes: Theme[];
    highlights: Highlight[];
    onUpdate: () => void;
  };
}

export const InsightNode = ({ data }: InsightNodeProps) => {
  const { insight, themes, highlights } = data;
  const [expanded, setExpanded] = useState(false);

  const relatedThemes = themes.filter((t) => insight.themeIds.includes(t.id));

  return (
    <div className="min-w-[300px] max-w-[400px]">
      <Handle type="target" position={Position.Top} className="!bg-yellow-500" />
      <Card className="p-4 bg-card shadow-xl border-l-4 border-l-yellow-500">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-500" />
            <Badge className="text-xs bg-yellow-500">Insight</Badge>
          </div>
          {relatedThemes.length > 0 && (
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
        <p className="text-sm font-bold mb-2 text-foreground">{insight.name}</p>
        <p className="text-xs text-muted-foreground">
          {relatedThemes.length} theme{relatedThemes.length !== 1 ? 's' : ''}
        </p>

        {expanded && relatedThemes.length > 0 && (
          <div className="mt-3 space-y-3 border-t pt-3">
            {relatedThemes.map((theme) => {
              const themeHighlights = highlights.filter((h) => theme.highlightIds.includes(h.id));
              return (
                <div key={theme.id} className="p-2 bg-muted rounded">
                  <p className="font-medium text-xs mb-1">{theme.name}</p>
                  <div className="space-y-1 ml-2">
                    {themeHighlights.map((highlight) => (
                      <p key={highlight.id} className="text-xs text-muted-foreground">
                        • {highlight.codeName}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};
