import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Highlight } from '@/types';
import { createHighlight } from '@/services/api';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

export type TextViewerHandle = {
  scrollToOffset: (offset: number) => void;
};

interface TextViewerProps {
  fileId: string;
  content: string;
  highlights: Highlight[];
  onHighlightCreated: () => void;
}

export const TextViewer = forwardRef<TextViewerHandle, TextViewerProps>(
  ({ fileId, content, highlights, onHighlightCreated }, ref) => {
    const [selectedText, setSelectedText] = useState<{ text: string; start: number; end: number } | null>(null);
    const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [codeName, setCodeName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const textRef = useRef<HTMLDivElement>(null);

    const handleSelection = useCallback(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const text = selection.toString().trim();

      if (!textRef.current || text.length === 0) {
        setSelectedText(null);
        setSelectionRect(null);
        return;
      }

      // Calculate offsets relative to the content
      const preRange = document.createRange();
      preRange.selectNodeContents(textRef.current);
      preRange.setEnd(range.startContainer, range.startOffset);
      const start = preRange.toString().length;
      const end = start + text.length;

      const rect = range.getBoundingClientRect();

      setSelectedText({ text, start, end });
      setSelectionRect(rect);
    }, []);

    useEffect(() => {
      if (sheetOpen && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [sheetOpen]);

    const openAddCode = () => {
      if (!selectedText) return;
      setSheetOpen(true);
    };

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
        setSelectionRect(null);
        setCodeName('');
        setSheetOpen(false);
        onHighlightCreated();
      } catch (error) {
        toast.error('Failed to create code');
        console.error(error);
      }
    };

    // Map exact character offset to a DOM Range using a Text node walker
    const getDomPositionForOffset = (container: Node, charOffset: number): { node: Node; offset: number } | null => {
      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
      let current: Node | null = walker.nextNode();
      let traversed = 0;
      while (current) {
        const textContent = (current.nodeValue || '');
        const nextTraversed = traversed + textContent.length;
        if (charOffset <= nextTraversed) {
          return { node: current, offset: Math.max(0, charOffset - traversed) };
        }
        traversed = nextTraversed;
        current = walker.nextNode();
      }
      return null;
    };

    useImperativeHandle(ref, () => ({
      scrollToOffset: (offset: number) => {
        if (!textRef.current) return;
        const pos = getDomPositionForOffset(textRef.current, offset);
        if (!pos) return;
        const r = document.createRange();
        r.setStart(pos.node, pos.offset);
        r.setEnd(pos.node, pos.offset + 1);
        const rect = r.getBoundingClientRect();
        window.scrollTo({ top: window.scrollY + rect.top - 120, behavior: 'smooth' });
      },
    }), []);

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
            id={`hl-${highlight.id}`}
            className="bg-primary/20 rounded px-0.5 cursor-pointer hover:bg-primary/30 transition-colors"
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
      <div className="relative space-y-4">
        <Card className="p-6">
          <div
            ref={textRef}
            className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed select-text"
            onMouseUp={handleSelection}
            onContextMenu={(e) => e.preventDefault()}
          >
            {renderHighlightedText()}
          </div>
        </Card>

        {/* Floating action above selection */}
        {selectedText && selectionRect && (
          <div
            className="fixed z-50 bg-black text-white text-xs px-2 py-1 rounded shadow-md"
            style={{ top: Math.max(8, selectionRect.top - 32), left: Math.max(8, selectionRect.left) }}
          >
            <button className="underline" onClick={openAddCode}>Add code</button>
          </div>
        )}

        {/* Side sheet for adding code name */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="rounded-none border-l-4 border-black sm:max-w-sm">
            <SheetHeader>
              <SheetTitle className="uppercase tracking-wide">Add Code</SheetTitle>
            </SheetHeader>
            {selectedText && (
              <div className="space-y-3 mt-4">
                <div>
                  <Label className="text-sm font-medium">Selected Text</Label>
                  <p className="text-sm text-muted-foreground italic mt-1">"{selectedText.text}"</p>
                </div>
                <div>
                  <Label htmlFor="codeName">Code Name</Label>
                  <Input
                    id="codeName"
                    ref={inputRef}
                    value={codeName}
                    onChange={(e) => setCodeName(e.target.value)}
                    placeholder="Enter a code name for this highlight"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) return handleCreateCode();
                      if (e.key === 'Enter') return handleCreateCode();
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleCreateCode} className="brutal-button">Create Code</Button>
                  <Button variant="outline" onClick={() => { setSheetOpen(false); setCodeName(''); }}>Cancel</Button>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    );
  }
);

TextViewer.displayName = 'TextViewer';
