import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import SelectionTooltip from '@/components/text/SelectionTooltip';
import { useTextSelectionHotkeys } from '@/hooks/useTextSelectionHotkeys';
import { getDomPositionForOffset } from '@/components/text/dom';
import { parseVttLine, parseSpeakerOnly, parseAnyLine, composeVttLine, isSemanticallyEmptyVttLine, getLineStart, getLineEndNoNl, mergePrevCurr, mergeCurrNext } from '@/components/text/vtt';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Highlight } from '@/types';
import { createHighlight, updateFile } from '@/services/api';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { DEFAULTS } from '@/components/canvas/CanvasTypes';
import { getCorrectedRange as utilGetCorrectedRange } from '@/components/text/highlights';

export type TextViewerHandle = {
  scrollToOffset: (offset: number) => void;
  flashAtOffset: (offset: number) => void;
};

interface TextViewerProps {
  fileId: string;
  content: string;
  highlights: Highlight[];
  onHighlightCreated: () => void;
  isVtt?: boolean;
}

export const TextViewer = forwardRef<TextViewerHandle, TextViewerProps>(
  ({ fileId, content, highlights, onHighlightCreated, isVtt = false }, ref) => {
    const [selectedText, setSelectedText] = useState<{ text: string; start: number; end: number } | null>(null);
    const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
    // Snapshot of selection used while the sheet is open, so UI doesn't clear when focus moves
    const [frozenSelection, setFrozenSelection] = useState<{ text: string; start: number; end: number } | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [codeName, setCodeName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const textRootRef = useRef<HTMLDivElement>(null);
    const [flashOffset, setFlashOffset] = useState<number | null>(null);
    const flashTimer = useRef<number | null>(null);
    // Detect Opera for placement tweaks
    const isOpera = useMemo(() => (typeof navigator !== 'undefined' && /\bOPR\//.test(navigator.userAgent)), []);

    // Local text to allow editing
    const [text, setText] = useState(content);
    useEffect(() => { setText(content); }, [content]);

    // VTT-only editing: range of blocks [start,end]
    const [editingRange, setEditingRange] = useState<{ start: number; end: number } | null>(null);
    const saveTimer = useRef<number | null>(null);
    const lastSavedContentRef = useRef<string>(content);
    const [isSaving, setIsSaving] = useState(false);

    // Choose blocks:
    // - VTT: each statement is a single line (we included one statement per line during import)
    // - non-VTT: render as a single block to keep original behavior
    const vttLineBlocks = useMemo(() => {
      const res: { start: number; end: number }[] = [];
      let start = 0;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') { res.push({ start, end: i + 1 }); start = i + 1; }
      }
      if (start < text.length) res.push({ start, end: text.length });
      return res;
    }, [text]);

    const blocks: { start: number; end: number }[] = useMemo(() => {
      return isVtt ? vttLineBlocks : [{ start: 0, end: text.length }];
    }, [isVtt, vttLineBlocks, text.length]);

    const blockOfOffset = useCallback((offset: number): number => {
      for (let i = 0; i < blocks.length; i++) {
        if (offset >= blocks[i].start && offset <= blocks[i].end) return i;
      }
      return blocks.length - 1;
    }, [blocks]);

    // Selection → global offsets computed against the entire container text
    const handleSelection = useCallback(() => {
      if (editingRange) return; // disable while editing
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const selText = selection.toString();

      if (!textRootRef.current || selText.length === 0) {
        setSelectedText(null);
        setSelectionRect(null);
        return;
      }

      const pre = document.createRange();
      pre.selectNodeContents(textRootRef.current);
      pre.setEnd(range.startContainer, range.startOffset);
      const start = pre.toString().length;
      const end = start + selText.length;

      const rect = range.getBoundingClientRect();

      setSelectedText({ text: selText, start, end });
      setSelectionRect(rect);
    }, [editingRange]);

    // Track selection live (so the floating action is resilient and shows reliably)
    useEffect(() => {
      const onSelChange = () => {
        if (editingRange) return;
        if (sheetOpen) return; // don't clear live selection while sheet is open
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
          setSelectedText(null);
          setSelectionRect(null);
          return;
        }
        const container = textRootRef.current; if (!container) return;
        const range = sel.getRangeAt(0);
        if (!container.contains(range.commonAncestorContainer)) {
          setSelectedText(null);
          setSelectionRect(null);
          return;
        }
        const pre = document.createRange();
        pre.selectNodeContents(container);
        pre.setEnd(range.startContainer, range.startOffset);
        const start = pre.toString().length;
        const end = start + sel.toString().length;
        const rect = range.getBoundingClientRect();
        setSelectedText({ text: sel.toString(), start, end });
        setSelectionRect(rect);
      };
      document.addEventListener('selectionchange', onSelChange);
      return () => document.removeEventListener('selectionchange', onSelChange);
    }, [editingRange, sheetOpen]);

    // Keyboard shortcuts via hook
    useTextSelectionHotkeys({
      enabled: Boolean(selectedText) && !editingRange,
      sheetOpen,
      isVtt,
      onAddCode: () => openAddCode(),
      onEditBlocks: () => startEditSelectedBlock(),
    });

    useEffect(() => {
      if (sheetOpen && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [sheetOpen]);

    const openAddCode = () => {
      if (!selectedText) return;
      // Snapshot selection for use in the sheet
      setFrozenSelection(selectedText);
      setSheetOpen(true);
    };

    const handleCreateCode = async () => {
      const activeSel = frozenSelection || selectedText;
      if (!activeSel || !codeName.trim()) {
        toast.error('Please provide a code name');
        return;
      }
      try {
        const snippet = text.slice(activeSel.start, activeSel.end);
        await createHighlight({
          fileId,
          startOffset: activeSel.start,
          endOffset: activeSel.end,
          text: snippet,
          codeName: codeName.trim(),
          size: DEFAULTS.code,
        });
        toast.success('Code created');
        setSelectedText(null);
        setSelectionRect(null);
        setCodeName('');
        setSheetOpen(false);
        setFrozenSelection(null);
        onHighlightCreated();
      } catch (error) {
        toast.error('Failed to create code');
        console.error(error);
      }
    };

    // Map offset -> DOM position (for scroll/flash) via util

    useImperativeHandle(ref, () => ({
      scrollToOffset: (offset: number) => {
        if (!textRootRef.current) return;
        const pos = getDomPositionForOffset(textRootRef.current, offset);
        if (!pos) return;
        const r = document.createRange();
        const nodeTextLen = (pos.node.nodeValue || '').length;
        if (nodeTextLen === 0) {
          r.selectNode(textRootRef.current);
        } else {
          r.setStart(pos.node, Math.min(pos.offset, nodeTextLen));
          r.setEnd(pos.node, Math.min(nodeTextLen, Math.max(0, pos.offset + 1)));
        }
        const rect = r.getBoundingClientRect();
        const top = rect.top || textRootRef.current.getBoundingClientRect().top + 10;
        window.scrollTo({ top: window.scrollY + top - 120, behavior: 'smooth' });
      },
      flashAtOffset: (offset: number) => {
        setFlashOffset(offset);
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlashOffset(null), 1200);
      },
    }), []);

    // Correct highlight range if stored offsets don't match stored text (legacy trimmed selections)
    const correctedRange = (h: Highlight) => utilGetCorrectedRange(text, h);

    // Highlight-aware renderer for a generic block range
    const renderBlockWithHighlights = (
      bStart: number,
      bEnd: number,
      wrapText: (chunkText: string, absStart: number, absEnd: number) => JSX.Element | JSX.Element[],
      wrapHighlighted: (chunkText: string, absStart: number, absEnd: number) => JSX.Element | JSX.Element[]
    ) => {
      // Sort by start, then by end to ensure stable forward iteration
      const sorted = [...highlights].sort((a, b) => (a.startOffset - b.startOffset) || (a.endOffset - b.endOffset));
      const parts: JSX.Element[] = [];
      let cursor = bStart;
      sorted.forEach((h) => {
        const { start: hsAbs, end: heAbs } = correctedRange(h);
        let hs = Math.max(hsAbs, bStart);
        const he = Math.min(heAbs, bEnd);
        // Clamp to forward progress to avoid duplicate rendering for overlapping highlights
        if (he <= cursor) return; // already fully before current cursor
        if (hs < cursor) hs = cursor;
        if (hs < he) {
          if (hs > cursor) {
            const chunk = wrapText(text.substring(cursor, hs), cursor, hs);
            if (Array.isArray(chunk)) {
              parts.push(...chunk);
            } else {
              parts.push(chunk);
            }
          }
          const highlightedChunk = wrapHighlighted(text.substring(hs, he), hs, he);
          if (Array.isArray(highlightedChunk)) {
            highlightedChunk.forEach((el, idx) => {
              parts.push(<React.Fragment key={`h-${hs}-${he}-${idx}`}>{el}</React.Fragment>);
            });
          } else {
            parts.push(<React.Fragment key={`h-${hs}-${he}`}>{highlightedChunk}</React.Fragment>);
          }
          cursor = he;
        }
      });
      if (cursor < bEnd) {
        const chunk = wrapText(text.substring(cursor, bEnd), cursor, bEnd);
        if (Array.isArray(chunk)) {
          parts.push(...chunk);
        } else {
          parts.push(chunk);
        }
      }
      if (parts.length === 0) return wrapText(text.substring(bStart, bEnd), bStart, bEnd);
      return parts;
    };

    // VTT statement renderer: subtle timestamp, distinct speaker, speech on new line
    const renderVttBlock = (block: { start: number; end: number }) => {
      const bStart = block.start;
      const bEnd = block.end;
      const full = text.substring(bStart, bEnd);

      // Try to match full VTT line with timestamp first
      const m = full.match(/^(\d{1,2}:\d{2}:\d{2})\s+(?:(.+?):\s+)?/);
      if (!m) {
        // Fallback: no timestamp. Try to detect optional speaker label at start: "Name: speech"
        let speaker = '';
        let speakerStart = -1;
        let speakerEnd = -1;
        let speechStart = 0;
        const colon = full.indexOf(':');
        if (colon > -1) {
          const possible = full.slice(0, colon).trim();
          if (possible.length > 0 && possible.length <= 64) {
            speaker = possible;
            // compute indices including trailing ": " if present
            const afterColon = colon + 1;
            const spaceAfter = full[afterColon] === ' ' ? 1 : 0;
            speakerStart = Math.max(0, full.indexOf(possible));
            speakerEnd = speakerStart + possible.length + 1 + spaceAfter;
            speechStart = colon + 1 + spaceAfter;
          }
        }
        const wrapFallback = (_chunkText: string, absStart: number, absEnd: number): JSX.Element[] => {
          const relStart = absStart - bStart;
          const relEnd = absEnd - bStart;
          const out: JSX.Element[] = [];
          const pushSeg = (from: number, to: number, cls: string, key: string) => {
            if (to <= from) return;
            out.push(<span key={key} className={cls}>{full.substring(from, to)}</span>);
          };
          const boundaries = [relStart];
          if (speakerStart >= 0) {
            if (speakerStart > relStart && speakerStart < relEnd) boundaries.push(speakerStart);
            if (speakerEnd > relStart && speakerEnd < relEnd) boundaries.push(speakerEnd);
          }
          if (speechStart > relStart && speechStart < relEnd) boundaries.push(speechStart);
          boundaries.push(relEnd);
          boundaries.sort((a, b) => a - b);
          let insertedBreak = false;
          for (let i = 0; i < boundaries.length - 1; i++) {
            const s = boundaries[i];
            const e = boundaries[i + 1];
            if (!insertedBreak && s === speechStart) { out.push(<br key={`br-fb-${bStart}-${s}`} />); insertedBreak = true; }
            let cls = 'text-sm text-neutral-800';
            if (speaker && s >= speakerStart && e <= speakerEnd) cls = 'text-sm font-semibold text-neutral-800 mr-2 align-top';
            // speech segments are inline to prevent line breaks in the middle of highlights
            else if (s >= speechStart) cls = 'text-sm leading-relaxed text-neutral-800';
            pushSeg(s, e, cls, `seg-fb-${bStart}-${s}-${e}`);
          }
          return out;
        };
        const wrapFallbackHighlighted = (_chunkText: string, absStart: number, absEnd: number): JSX.Element[] => {
          const relStart = absStart - bStart;
          const relEnd = absEnd - bStart;
          const bg = (flashOffset === absStart) ? 'bg-yellow-200' : 'bg-primary/20 hover:bg-primary/30';
          const out: JSX.Element[] = [];
          const pushSeg = (from: number, to: number, cls: string, key: string) => {
            if (to <= from) return;
            out.push(<span key={key} className={`${cls} ${bg}`}>{full.substring(from, to)}</span>);
          };
          const boundaries = [relStart];
          if (speakerStart >= 0) {
            if (speakerStart > relStart && speakerStart < relEnd) boundaries.push(speakerStart);
            if (speakerEnd > relStart && speakerEnd < relEnd) boundaries.push(speakerEnd);
          }
          if (speechStart > relStart && speechStart < relEnd) boundaries.push(speechStart);
          boundaries.push(relEnd);
          boundaries.sort((a, b) => a - b);
          let insertedBreak = false;
          for (let i = 0; i < boundaries.length - 1; i++) {
            const s = boundaries[i];
            const e = boundaries[i + 1];
            if (!insertedBreak && s === speechStart) { out.push(<br key={`br-fbh-${bStart}-${s}`} />); insertedBreak = true; }
            let cls = 'text-sm text-neutral-800';
            if (speaker && s >= speakerStart && e <= speakerEnd) cls = 'text-sm font-semibold text-neutral-800 mr-2 align-top';
            else if (s >= speechStart) cls = 'text-sm leading-relaxed text-neutral-800';
            pushSeg(s, e, cls, `seg-fbh-${bStart}-${s}-${e}`);
          }
          return out;
        };
        return renderBlockWithHighlights(bStart, bEnd, wrapFallback, wrapFallbackHighlighted);
      }

      const ts = m?.[1] ?? '';
      const speaker = m?.[2] ?? '';
      const tsEnd = ts ? ts.length : 0;
      const speakerStart = m && speaker ? (m[0].indexOf(speaker)) : -1;
      const speakerEnd = speaker ? speakerStart + speaker.length + 2 /*": "*/ : -1;
      const speechStart = m ? m[0].length : 0;

      const wrap = (_chunkText: string, absStart: number, absEnd: number): JSX.Element[] => {
        const relStart = absStart - bStart;
        const relEnd = absEnd - bStart;
        const out: JSX.Element[] = [];
        const pushSeg = (from: number, to: number, cls: string, key: string) => {
          if (to <= from) return;
          out.push(<span key={key} className={cls}>{full.substring(from, to)}</span>);
        };
        const boundaries = [relStart];
        if (tsEnd > relStart && tsEnd < relEnd) boundaries.push(tsEnd);
        if (speakerStart >= 0) {
          if (speakerStart > relStart && speakerStart < relEnd) boundaries.push(speakerStart);
          if (speakerEnd > relStart && speakerEnd < relEnd) boundaries.push(speakerEnd);
        }
        if (speechStart > relStart && speechStart < relEnd) boundaries.push(speechStart);
        boundaries.push(relEnd);
        boundaries.sort((a, b) => a - b);
        let insertedBreak = false;
        for (let i = 0; i < boundaries.length - 1; i++) {
          const s = boundaries[i];
          const e = boundaries[i + 1];
          if (!insertedBreak && s === speechStart) { out.push(<br key={`br-${bStart}-${s}`} />); insertedBreak = true; }
          let cls = 'text-sm text-neutral-800';
          if (s < tsEnd) cls = 'text-[11px] text-neutral-400 mr-2 align-top';
          else if (speaker && s >= speakerStart && e <= speakerEnd) cls = 'text-sm font-semibold text-neutral-800 mr-2 align-top';
          else if (s >= speechStart) cls = 'text-sm leading-relaxed text-neutral-800'; // inline speech
          pushSeg(s, e, cls, `seg-${bStart}-${s}-${e}`);
        }
        return out;
      };

      const wrapHighlighted = (_chunkText: string, absStart: number, absEnd: number): JSX.Element[] => {
        const relStart = absStart - bStart;
        const relEnd = absEnd - bStart;
        const bg = (flashOffset === absStart) ? 'bg-yellow-200' : 'bg-primary/20 hover:bg-primary/30';
        const out: JSX.Element[] = [];
        const pushSeg = (from: number, to: number, cls: string, key: string) => {
          if (to <= from) return;
          out.push(<span key={key} className={`${cls} ${bg}`}>{full.substring(from, to)}</span>);
        };
        const boundaries = [relStart];
        if (tsEnd > relStart && tsEnd < relEnd) boundaries.push(tsEnd);
        if (speakerStart >= 0) {
          if (speakerStart > relStart && speakerStart < relEnd) boundaries.push(speakerStart);
          if (speakerEnd > relStart && speakerEnd < relEnd) boundaries.push(speakerEnd);
        }
        if (speechStart > relStart && speechStart < relEnd) boundaries.push(speechStart);
        boundaries.push(relEnd);
        boundaries.sort((a, b) => a - b);
        let insertedBreak = false;
        for (let i = 0; i < boundaries.length - 1; i++) {
          const s = boundaries[i];
          const e = boundaries[i + 1];
          if (!insertedBreak && s === speechStart) { out.push(<br key={`br-h-${bStart}-${s}`} />); insertedBreak = true; }
          let cls = 'text-sm text-neutral-800';
          if (s < tsEnd) cls = 'text-[11px] text-neutral-400 mr-2 align-top';
          else if (speaker && s >= speakerStart && e <= speakerEnd) cls = 'text-sm font-semibold text-neutral-800 mr-2 align-top';
          else if (s >= speechStart) cls = 'text-sm leading-relaxed text-neutral-800';
          pushSeg(s, e, cls, `seg-h-${bStart}-${s}-${e}`);
        }
        return out;
      };

      return renderBlockWithHighlights(bStart, bEnd, wrap, wrapHighlighted);
    };

    // Generic block renderer (non-VTT)
    const renderGenericBlock = (block: { start: number; end: number }) => {
      const wrap = (chunkText: string, _absStart: number, _absEnd: number) => <>{chunkText}</>;
      const wrapHighlighted = (chunkText: string, absStart: number, _absEnd: number) => (
        <span className={`${flashOffset === absStart ? 'bg-yellow-200' : 'bg-primary/20 hover:bg-primary/30'}`}>{chunkText}</span>
      );
      return renderBlockWithHighlights(block.start, block.end, wrap, wrapHighlighted);
    };

    // Debounced save
    const scheduleSave = useCallback(
      (next: string, opts?: { silent?: boolean }) => {
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(async () => {
          try {
            if (next === lastSavedContentRef.current) return;
            if (!opts?.silent) setIsSaving(true);
            await updateFile(fileId, { content: next });
            lastSavedContentRef.current = next;
          } catch (err) {
            console.error(err);
            toast.error('Failed to save');
          } finally {
            if (!opts?.silent) setIsSaving(false);
          }
        }, 700);
      },
      [fileId]
    );

    const startEditSelectedBlock = () => {
      if (!selectedText || !isVtt) return;
      const selStartBlock = blockOfOffset(selectedText.start);
      const selEndBlock = blockOfOffset(selectedText.end);
      const start = Math.max(0, selStartBlock - 1);
      const end = Math.min(blocks.length - 1, selEndBlock + 1);
      setEditingRange({ start, end });
      setSelectedText(null);
      setSelectionRect(null);
    };

    const onBlockInput = (i: number): React.FormEventHandler<HTMLDivElement> => (e) => {
      if (!editingRange || i < editingRange.start || i > editingRange.end) return;
      const el = e.currentTarget as HTMLDivElement & { dataset: { start?: string; end?: string } };
      const fallbackStart = el.dataset.start ? parseInt(el.dataset.start, 10) : undefined;
      const fallbackEnd = el.dataset.end ? parseInt(el.dataset.end, 10) : undefined;
      const block = blocks[i] || (fallbackStart !== undefined && fallbackEnd !== undefined ? { start: fallbackStart, end: fallbackEnd } : undefined);
      if (!block) return;
      const hadTrailingNewline = text.charCodeAt(Math.max(0, block.end - 1)) === 10; // '\n'
      let newBlockText = (el.innerText || '').replace(/\r\n/g, '\n');

      if (isVtt) {
        const base = newBlockText.replace(/\n+$/g, '');
        const semEmpty = isSemanticallyEmptyVttLine(base);
        if (semEmpty) {
          newBlockText = '';
        } else if (hadTrailingNewline && !newBlockText.endsWith('\n')) {
          newBlockText += '\n';
        }
      }

      let next = text.substring(0, block.start) + newBlockText + text.substring(block.end);
      if (isVtt) {
        next = next.replace(/\n{2,}/g, '\n');
      }
      // Avoid setText while typing to prevent React re-renders that move the caret.
      // Save silently in the background; we'll sync state on blur.
      scheduleSave(next, { silent: true });
    };

    // VTT helpers imported from utils

    const onBlockBlur = (i: number): React.FocusEventHandler<HTMLDivElement> => async (e) => {
      if (!editingRange || i < editingRange.start || i > editingRange.end) return;
      const el = e.currentTarget as HTMLDivElement & { dataset: { start?: string; end?: string } };
      const fallbackStart = el.dataset.start ? parseInt(el.dataset.start, 10) : undefined;
      const fallbackEnd = el.dataset.end ? parseInt(el.dataset.end, 10) : undefined;
      const block = blocks[i] || (fallbackStart !== undefined && fallbackEnd !== undefined ? { start: fallbackStart, end: fallbackEnd } : undefined);
      if (!block) { setEditingRange(null); return; }
      const hadTrailingNewline = text.charCodeAt(Math.max(0, block.end - 1)) === 10; // '\n'
      const rawText = (el.innerText || '').replace(/\r\n/g, '\n');

      let newBlockText = rawText;
      if (isVtt) {
        const base = rawText.replace(/\n+$/g, '');
        const semEmpty = isSemanticallyEmptyVttLine(base);
        if (semEmpty) {
          newBlockText = '';
        } else if (hadTrailingNewline && !newBlockText.endsWith('\n')) {
          newBlockText += '\n';
        }
      }

      let next = text.substring(0, block.start) + newBlockText + text.substring(block.end);
      if (saveTimer.current) { window.clearTimeout(saveTimer.current); saveTimer.current = null; }
      if (isVtt) {
        next = next.replace(/\n{2,}/g, '\n');
        // After replacing the current block, pivot may shift.
        const pivot = Math.min(block.start, Math.max(0, next.length - 1));
        // Always attempt to merge neighbors (works for both edit and deletion cases)
        next = mergePrevCurr(next, pivot);
        next = mergeCurrNext(next, pivot);
        next = next.replace(/\n{2,}/g, '\n');
      }
      try {
        if (next !== lastSavedContentRef.current) {
          setIsSaving(true);
          await updateFile(fileId, { content: next });
          lastSavedContentRef.current = next;
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to save');
      } finally {
        setIsSaving(false);
        // Sync local state after finishing editing to reflect changes and re-enable markup rendering
        setText(next);
        setEditingRange(null);
      }
    };

    // Keep last saved in sync
    useEffect(() => {
      if (!editingRange) {
        lastSavedContentRef.current = content;
      }
    }, [content, editingRange]);

    return (
      <div className="relative space-y-4">
        <Card className="p-6">
          <div
            ref={textRootRef}
            className="prose prose-sm max-w-none leading-relaxed select-text"
            onMouseUp={handleSelection}
            onContextMenu={(e) => e.preventDefault()}
          >
            {blocks.map((b, i) => (
              <div
                key={`block-${i}-${b.start}`}
                data-block-idx={i}
                data-start={b.start}
                data-end={b.end}
                className={`whitespace-pre-wrap mb-4 p-2 rounded ${editingRange && i >= editingRange.start && i <= editingRange.end ? 'bg-yellow-50 outline outline-2 outline-indigo-500' : 'bg-transparent'}`}
                contentEditable={Boolean(isVtt && editingRange && i >= editingRange.start && i <= editingRange.end)}
                suppressContentEditableWarning
                onInput={onBlockInput(i)}
                onBlur={onBlockBlur(i)}
              >
                {isVtt
                  ? (editingRange && i >= editingRange.start && i <= editingRange.end
                    ? text.substring(b.start, b.end)
                    : renderVttBlock({ start: b.start, end: b.end }))
                  : renderGenericBlock({ start: b.start, end: b.end })}
              </div>
            ))}
            {isSaving ? <div className="mt-2 text-xs text-neutral-500">Saving…</div> : null}
          </div>
        </Card>

        {(selectedText || frozenSelection) && selectionRect && (
          <SelectionTooltip
            rect={selectionRect}
            isVtt={isVtt}
            onAddCode={openAddCode}
            onEditBlocks={isVtt ? startEditSelectedBlock : undefined}
          />
        )}

        <Sheet open={sheetOpen} onOpenChange={(open) => { setSheetOpen(open); if (!open) { setFrozenSelection(null); } }}>
          <SheetContent side="right" className="rounded-none border-l-4 border-black sm:max-w-sm">
            <SheetHeader>
              <SheetTitle className="uppercase tracking-wide">Add Code</SheetTitle>
            </SheetHeader>
            {(frozenSelection || selectedText) && (
              <div className="space-y-3 mt-4">
                <div>
                  <Label className="text-sm font-medium">Selected Text</Label>
                  <p className="text-sm text-muted-foreground italic mt-1">"{(frozenSelection || selectedText)!.text}"</p>
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
                  <Button variant="outline" onClick={() => { setSheetOpen(false); setCodeName(''); setFrozenSelection(null); }}>Cancel</Button>
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
