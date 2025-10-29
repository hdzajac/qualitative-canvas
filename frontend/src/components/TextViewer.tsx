import { useState, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Highlight } from '@/types';
import { createHighlight } from '@/services/api';
import { toast } from 'sonner';
import { Highlighter } from 'lucide-react';

interface TextViewerProps {
  fileId: string;
  content: string;
  highlights: Highlight[];
  onHighlightCreated: () => void;
}

export const TextViewer = ({ fileId, content, highlights, onHighlightCreated }: TextViewerProps) => {
  const [selectedText, setSelectedText] = useState<{ text: string; start: number; end: number } | null>(null);
  const [codeName, setCodeName] = useState('');
  const textRef = useRef<HTMLDivElement>(null);

  const handleSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const text = selection.toString().trim();
    
    if (text.length === 0 || !textRef.current) return;

    // Calculate offsets relative to the content
    const preRange = document.createRange();
    preRange.selectNodeContents(textRef.current);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + text.length;

    setSelectedText({ text, start, end });
  }, []);

  const handleCreateCode = async () => {
    if (!selectedText || !codeName.trim()) {
      toast.error('Please provide a code name');
      return;
    }

    try {
      await createHighlight({
        fileId,
        startOffset: selectedText.start,
        endOffset: selectedText.end,
        text: selectedText.text,
        codeName: codeName.trim(),
      });
      toast.success('Code created');
      setSelectedText(null);
      setCodeName('');
      onHighlightCreated();
    } catch (error) {
      toast.error('Failed to create code');
      console.error(error);
    }
  };

  const renderHighlightedText = () => {
    if (highlights.length === 0) return content;

    const sortedHighlights = [...highlights].sort((a, b) => a.startOffset - b.startOffset);
    const parts: JSX.Element[] = [];
    let lastIndex = 0;

    sortedHighlights.forEach((highlight, idx) => {
      if (highlight.startOffset > lastIndex) {
        parts.push(
          <span key={`text-${idx}`}>
            {content.substring(lastIndex, highlight.startOffset)}
          </span>
        );
      }

      parts.push(
        <mark
          key={`highlight-${highlight.id}`}
          className="bg-primary/20 rounded px-0.5 cursor-pointer hover:bg-primary/30 transition-colors"
          title={highlight.codeName}
        >
          {content.substring(highlight.startOffset, highlight.endOffset)}
        </mark>
      );

      lastIndex = highlight.endOffset;
    });

    if (lastIndex < content.length) {
      parts.push(
        <span key="text-end">{content.substring(lastIndex)}</span>
      );
    }

    return parts;
  };

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div
          ref={textRef}
          className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed select-text"
          onMouseUp={handleSelection}
        >
          {renderHighlightedText()}
        </div>
      </Card>

      {selectedText && (
        <Card className="p-4 border-primary">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Highlighter className="w-5 h-5 text-primary mt-1" />
              <div className="flex-1">
                <Label htmlFor="codeName" className="text-sm font-medium">
                  Selected Text
                </Label>
                <p className="text-sm text-muted-foreground italic mt-1">
                  "{selectedText.text}"
                </p>
              </div>
            </div>
            
            <div>
              <Label htmlFor="codeName">Code Name</Label>
              <Input
                id="codeName"
                value={codeName}
                onChange={(e) => setCodeName(e.target.value)}
                placeholder="Enter a code name for this highlight"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCode()}
              />
            </div>
            
            <div className="flex gap-2">
              <Button onClick={handleCreateCode} className="flex-1">
                Create Code
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedText(null);
                  setCodeName('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};
