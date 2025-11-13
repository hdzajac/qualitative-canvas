import React, { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import SelectionTooltip from '@/components/text/SelectionTooltip';
import { useSelectionActions, type SelectionRange } from '@/hooks/useSelectionActions';
import { getDomPositionForOffset } from '@/components/text/dom';
import { parseVttLine, parseSpeakerOnly, parseAnyLine, composeVttLine, isSemanticallyEmptyVttLine, getLineStart, getLineEndNoNl, mergePrevCurr, mergeCurrNext } from '@/components/text/vtt';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Highlight } from '@/types';
import { updateFile } from '@/services/api';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
// DEFAULTS not needed here; used inside selection hook
import { getCorrectedRange as utilGetCorrectedRange } from '@/components/text/highlights';
import { Trash2, Play, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';

export type TextViewerHandle = {
  scrollToOffset: (offset: number) => void;
  flashAtOffset: (offset: number) => void;
  flashAtRange: (start: number, end: number) => void;
  // Expose metrics to align external code panels
  getContainerRect: () => DOMRect | null;
  getTopForOffset: (offset: number) => number | null; // absolute page Y in px
};

interface TextViewerProps {
  fileId: string;
  content: string;
  highlights: Highlight[];
  onHighlightCreated: () => void;
  isVtt?: boolean;
  framed?: boolean; // if true, wrap in Card frame; if false, plain container
  // Optional behavior controls
  readOnly?: boolean; // disable selection actions and editing
  enableSelectionActions?: boolean; // show selection tooltip/actions (default true)
  saveContent?: (next: string) => Promise<void>; // override default updateFile
  // Optional playback handler for VTT segments
  onPlaySegment?: (startMs: number | null, endMs: number | null) => void;
  canPlay?: boolean;
  // Current playback time (ms) to highlight active segment (optional)
  currentTimeMs?: number | null;
  // Auto-stop at segment end when playing (optional flag)
  activeSegmentAutoStop?: boolean;
  // Auto-scroll controls
  autoScrollEnabled?: boolean;
  autoScrollMode?: 'center' | 'pin';
  // Optional VTT metadata (one per block in order) for read-only transcript interactions
  vttMeta?: Array<{ segmentId: string; startMs?: number; endMs?: number; participantId?: string | null; participantName?: string | null }>;
  // Optional participant assignment support
  participants?: MinimalParticipant[];
  onAssignParticipant?: (segmentId: string, participantId: string | null) => Promise<void> | void;
}

type MinimalParticipant = { id: string; name: string | null };

export const TextViewer = forwardRef<TextViewerHandle, TextViewerProps>(
  ({ fileId, content, highlights, onHighlightCreated, isVtt = false, framed = true, readOnly = false, enableSelectionActions = true, saveContent, onPlaySegment, canPlay = true, currentTimeMs, activeSegmentAutoStop = false, autoScrollEnabled = true, autoScrollMode = 'pin', vttMeta, participants, onAssignParticipant }, ref) => {
    const textRootRef = useRef<HTMLDivElement>(null);
    const [flashRange, setFlashRange] = useState<{ start: number; end: number } | null>(null);
    const flashTimer = useRef<number | null>(null);
    // Detect Opera for placement tweaks
    const isOpera = useMemo(() => (typeof navigator !== 'undefined' && /\bOPR\//.test(navigator.userAgent)), []);

    // Codes rail removed: no external panel

    // Local text state for editing - only sync from prop when it's a confirmed external change
    const [text, setText] = useState(content);
    const contentRef = useRef(content);

    useEffect(() => {
      // Only update local state if content changed externally (not from our own saves)
      // This prevents overwriting user edits during typing
      if (content !== contentRef.current && content !== text) {
        setText(content);
        contentRef.current = content;
      }
    }, [content, text]);

    // VTT-only editing: range of blocks [start,end]
    const [editingRange, setEditingRange] = useState<{ start: number; end: number } | null>(null);
    const saveTimer = useRef<number | null>(null);
    const lastSavedContentRef = useRef<string>(content);
    const [isSaving, setIsSaving] = useState(false);
    // Multi-level undo/redo stacks for committed edits (blur or deletion)
    const undoStackRef = useRef<string[]>([]);
    const redoStackRef = useRef<string[]>([]);
    const lastPlayClickRef = useRef<number>(0);

    const performUndo = useCallback(async () => {
      if (undoStackRef.current.length === 0) return;
      const current = lastSavedContentRef.current;
      const prev = undoStackRef.current.pop() as string;
      try {
        setIsSaving(true);
        await updateFile(fileId, { content: prev });
        // push current into redo stack
        redoStackRef.current.push(current);
        lastSavedContentRef.current = prev;
        contentRef.current = prev; // Track that we've persisted this version
        setText(prev);
        setEditingRange(null);
      } catch (err) {
        console.error(err);
        toast.error('Failed to undo');
      } finally {
        setIsSaving(false);
      }
    }, [fileId]);

    const performRedo = useCallback(async () => {
      if (redoStackRef.current.length === 0) return;
      const current = lastSavedContentRef.current;
      const next = redoStackRef.current.pop() as string;
      try {
        setIsSaving(true);
        await updateFile(fileId, { content: next });
        // push current into undo stack
        undoStackRef.current.push(current);
        lastSavedContentRef.current = next;
        contentRef.current = next; // Track that we've persisted this version
        setText(next);
        setEditingRange(null);
      } catch (err) {
        console.error(err);
        toast.error('Failed to redo');
      } finally {
        setIsSaving(false);
      }
    }, [fileId]);

    // Global undo/redo handlers for committed edits
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        const isEditable = !!target && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
        if (isEditable) return; // let native undo work inside inputs/contentEditable
        const isZ = e.key === 'z' || e.key === 'Z';
        const isY = e.key === 'y' || e.key === 'Y';
        if ((e.metaKey || e.ctrlKey) && isZ && !e.shiftKey) { e.preventDefault(); void performUndo(); }
        if ((e.metaKey || e.ctrlKey) && ((isZ && e.shiftKey) || isY)) { e.preventDefault(); void performRedo(); }
      };
      document.addEventListener('keydown', onKeyDown);
      return () => document.removeEventListener('keydown', onKeyDown);
    }, [performUndo, performRedo]);

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

    // Compute active segment index based on currentTimeMs and vttMeta (scroll and highlight support)
    const activeIndex = useMemo(() => {
      if (!isVtt || !vttMeta || currentTimeMs == null) return -1;
      for (let i = 0; i < Math.min(vttMeta.length, blocks.length); i++) {
        const m = vttMeta[i];
        if (!m) continue;
        const s = m.startMs;
        const e = m.endMs;
        if (s != null && e != null && currentTimeMs >= s && currentTimeMs < e) return i;
      }
      return -1;
    }, [isVtt, vttMeta, currentTimeMs, blocks.length]);

    // Scroll the active block into view when it changes (small enhancement)
    const lastActiveRef = useRef<number>(-1);
    useEffect(() => {
      if (activeIndex < 0 || activeIndex === lastActiveRef.current) return;
      lastActiveRef.current = activeIndex;
      if (!autoScrollEnabled) return;
      if (!textRootRef.current) return;
      const blockEl = textRootRef.current.querySelector(`[data-block-idx="${activeIndex}"]`) as HTMLElement | null;
      if (!blockEl) return;
      // Prefer speech anchor inside block for more stable vertical positioning
      const anchor = blockEl.querySelector('[data-speech-anchor="1"]') as HTMLElement | null;
      const target = anchor || blockEl;
      const rect = target.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      // Only scroll if target is mostly out of view (less than 30% visible)
      const visiblePx = Math.min(vh, Math.max(0, vh - Math.max(0, rect.top < 0 ? -rect.top : 0) - Math.max(0, rect.bottom > vh ? rect.bottom - vh : 0)));
      const ratio = rect.height > 0 ? visiblePx / rect.height : 1;
      if (ratio >= 0.3) return;
      try {
        if (autoScrollMode === 'center') {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          // Gentle pinning: keep target between 30% and 60% from top
          const topTarget = Math.max(0, window.scrollY + rect.top + (rect.height * 0.45) - (vh * 0.45));
          window.scrollTo({ top: topTarget, behavior: 'smooth' });
        }
      } catch { /* ignore */ }
    }, [activeIndex, autoScrollEnabled, autoScrollMode]);

    const startEditSelectedBlock = useCallback(() => {
      if (!selectedTextRef.current || !isVtt || readOnly) return;
      const selStartBlock = blockOfOffset(selectedTextRef.current.start);
      const selEndBlock = blockOfOffset(selectedTextRef.current.end);
      const start = Math.max(0, selStartBlock - 1);
      const end = Math.min(blocks.length - 1, selEndBlock + 1);
      setEditingRange({ start, end });
      selectedTextRef.current = null;
      // Clear any visible selection UI
      setSelectedTextFnRef.current(null);
      setSelectionRectFnRef.current(null);
    }, [isVtt, readOnly, blockOfOffset, blocks]);

    // Internal ref so hook can access current selection before we declare the hook
    // Selection state is managed by the selection hook. We keep refs to access/clear it inside callbacks declared before the hook.
    const selectedTextRef = useRef<SelectionRange>(null);
    const setSelectedTextFnRef = useRef<(sel: SelectionRange) => void>(() => { });
    const setSelectionRectFnRef = useRef<(rect: DOMRect | null) => void>(() => { });

    // Hook usage (after startEditSelectedBlock declared)
    const {
      // state
      selectedText, setSelectedText,
      selectionRect, setSelectionRect,
      frozenSelection, setFrozenSelection,
      sheetOpen, setSheetOpen,
      codeName, setCodeName,
      inputRef,
      // actions
      openAddCode, handleCreateCode,
    } = useSelectionActions({
      fileId,
      text,
      enabled: !editingRange,
      isVtt,
      readOnly,
      enableSelectionActions,
      onHighlightCreated,
      startEditSelectedBlock,
      getContainer: () => textRootRef.current,
    });

    // Keep refs in sync for callbacks defined before hook initialization
    useEffect(() => { selectedTextRef.current = selectedText; }, [selectedText]);
    useEffect(() => { setSelectedTextFnRef.current = setSelectedText; setSelectionRectFnRef.current = setSelectionRect; }, [setSelectedText, setSelectionRect]);

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
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        setFlashRange({ start: Math.max(0, offset), end: Math.max(0, offset + 1) });
        flashTimer.current = window.setTimeout(() => setFlashRange(null), 1200);
      },
      flashAtRange: (start: number, end: number) => {
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        const s = Math.max(0, Math.min(start, end));
        const e = Math.max(0, Math.max(start, end));
        setFlashRange({ start: s, end: e });
        flashTimer.current = window.setTimeout(() => setFlashRange(null), 1200);
      },
      getContainerRect: () => {
        if (!textRootRef.current) return null;
        return textRootRef.current.getBoundingClientRect();
      },
      getTopForOffset: (offset: number) => {
        if (!textRootRef.current) return null;
        const pos = getDomPositionForOffset(textRootRef.current, offset);
        if (!pos) return null;
        const r = document.createRange();
        const nodeTextLen = (pos.node.nodeValue || '').length;
        r.setStart(pos.node, Math.min(pos.offset, nodeTextLen));
        r.setEnd(pos.node, Math.min(nodeTextLen, Math.max(0, pos.offset + 1)));
        const rect = r.getBoundingClientRect();
        return window.scrollY + (rect.top || 0);
      },
    }), []);

    // Codes rail removed: no position mapping needed

    // Correct highlight range if stored offsets don't match stored text (legacy trimmed selections)
    const correctedRange = (h: Highlight) => utilGetCorrectedRange(text, h);

    // Highlight-aware renderer for a generic block range
    const renderBlockWithHighlights = (
      bStart: number,
      bEnd: number,
      wrapText: (chunkText: string, absStart: number, absEnd: number) => JSX.Element | JSX.Element[],
      wrapHighlighted: (chunkText: string, absStart: number, absEnd: number, h?: Highlight) => JSX.Element | JSX.Element[]
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
              parts.push(<React.Fragment key={`t-${cursor}-${hs}`}>{chunk}</React.Fragment>);
            }
          }
          const highlightedChunk = wrapHighlighted(text.substring(hs, he), hs, he, h);
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
          parts.push(<React.Fragment key={`t-${cursor}-${bEnd}`}>{chunk}</React.Fragment>);
        }
      }
      if (parts.length === 0) return wrapText(text.substring(bStart, bEnd), bStart, bEnd);
      return parts;
    };

    // VTT statement renderer: subtle timestamp, distinct speaker, speech on new line
    const hmsToMsLocal = (hms: string): number | null => {
      const m = hms.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
      if (!m) return null;
      const h = parseInt(m[1], 10);
      const mm = parseInt(m[2], 10);
      const ss = parseInt(m[3], 10);
      if (Number.isNaN(h) || Number.isNaN(mm) || Number.isNaN(ss)) return null;
      return ((h * 3600) + (mm * 60) + ss) * 1000;
    };

    const findMetaForTimes = (idx: number, startMs: number | null, endMs: number | null) => {
      let meta = vttMeta && vttMeta[idx] ? vttMeta[idx] : undefined;
      if (!meta && vttMeta && startMs != null) {
        // Fuzzy match by time if indexes don't align (e.g., finalized file reflow)
        const TOL_START = 1200; // ms tolerance on start
        const TOL_END = 1500; // slightly looser tolerance on end
        const candidates = vttMeta
          .filter(m => (m.startMs != null && Math.abs((m.startMs ?? startMs) - startMs) <= TOL_START)
            && (endMs == null || m.endMs == null || Math.abs((m.endMs ?? endMs) - endMs) <= TOL_END))
          .map(m => {
            const ds = Math.abs((m.startMs ?? startMs) - startMs);
            const de = (endMs != null && m.endMs != null) ? Math.abs(m.endMs - endMs) : 0;
            return { m, score: ds + de };
          })
          .sort((a, b) => a.score - b.score);
        meta = candidates.length > 0 ? candidates[0].m : undefined;
      }
      return meta;
    };

    const renderVttBlock = (block: { start: number; end: number }, idx: number) => {
      const bStart = block.start;
      const bEnd = block.end;
      const full = text.substring(bStart, bEnd);

      // Accept either bracketed "[HH:MM:SS - HH:MM:SS]" format (our finalized transcripts)
      // or plain "HH:MM:SS [Speaker:] ..." format.
      const bracket = full.match(/^\[(\d{1,2}:\d{2}:\d{2})\s*-\s*(\d{1,2}:\d{2}:\d{2})\]\s*/);
      const m = full.match(/^(\d{1,2}:\d{2}:\d{2})\s+(?:(.+?):\s+)?/);
      if (!bracket && !m) {
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
            // Add ARIA label for speaker segments to aid screen readers
            const isSpeakerSeg = speaker && from >= speakerStart && to <= speakerEnd;
            if (isSpeakerSeg) {
              const meta = vttMeta && vttMeta[idx] ? vttMeta[idx] : undefined;
              const segId = meta?.segmentId;
              const labelText = full.substring(from, to);
              if (labelText.trim().length === 0) {
                out.push(<span key={key} className={cls} aria-label={`Speaker: ${speaker}`}></span>);
              } else if (readOnly && segId && participants && participants.length > 0 && onAssignParticipant) {
                out.push(
                  <AssignPopover
                    key={`spk-fb-pop-${bStart}-${from}-${to}`}
                    label={labelText}
                    className={cls}
                    participants={participants}
                    onSelect={(pid) => onAssignParticipant(segId, pid)}
                  />
                );
              } else {
                out.push(
                  <span key={key} className={cls} aria-label={`Speaker: ${speaker}`}>
                    {labelText}
                  </span>
                );
              }
            } else {
              out.push(<span key={key} className={cls}>{full.substring(from, to)}</span>);
            }
          };
          const boundaries = [relStart];
          if (speakerStart >= 0) {
            if (speakerStart > relStart && speakerStart < relEnd) boundaries.push(speakerStart);
            if (speakerEnd > relStart && speakerEnd < relEnd) boundaries.push(speakerEnd);
          }
          if (speechStart > relStart && speechStart < relEnd) boundaries.push(speechStart);
          boundaries.push(relEnd);
          boundaries.sort((a, b) => a - b);
          for (let i = 0; i < boundaries.length - 1; i++) {
            const s = boundaries[i];
            const e = boundaries[i + 1];
            let cls = 'text-sm text-neutral-800';
            if (speaker && s >= speakerStart && e <= speakerEnd) cls = 'text-sm font-semibold text-neutral-800 mr-1 align-top';
            // speech segments are inline to prevent line breaks in the middle of highlights
            else if (s >= speechStart) cls = 'text-sm leading-snug text-neutral-800';
            pushSeg(s, e, cls, `seg-fb-${bStart}-${s}-${e}`);
          }
          return out;
        };
        const wrapFallbackHighlighted = (_chunkText: string, absStart: number, absEnd: number, h?: Highlight): JSX.Element[] => {
          const relStart = absStart - bStart;
          const relEnd = absEnd - bStart;
          const isFlashing = flashRange && !(absEnd <= flashRange.start || absStart >= flashRange.end);
          const bg = isFlashing ? 'bg-yellow-200' : 'bg-primary/20 hover:bg-primary/30';
          const out: JSX.Element[] = [];
          const pushSeg = (from: number, to: number, cls: string, key: string) => {
            if (to <= from) return;
            out.push(
              <mark
                key={key}
                className={`${cls} ${bg}`}
                role="mark"
                aria-label={h?.codeName ? `Code: ${h.codeName}` : 'Highlight'}
              >
                {full.substring(from, to)}
              </mark>
            );
          };
          const boundaries = [relStart];
          if (speakerStart >= 0) {
            if (speakerStart > relStart && speakerStart < relEnd) boundaries.push(speakerStart);
            if (speakerEnd > relStart && speakerEnd < relEnd) boundaries.push(speakerEnd);
          }
          if (speechStart > relStart && speechStart < relEnd) boundaries.push(speechStart);
          boundaries.push(relEnd);
          boundaries.sort((a, b) => a - b);
          for (let i = 0; i < boundaries.length - 1; i++) {
            const s = boundaries[i];
            const e = boundaries[i + 1];
            let cls = 'text-sm text-neutral-800';
            if (speaker && s >= speakerStart && e <= speakerEnd) cls = 'text-sm font-semibold text-neutral-800 mr-1 align-top';
            else if (s >= speechStart) cls = 'text-sm leading-snug text-neutral-800';
            pushSeg(s, e, cls, `seg-fbh-${bStart}-${s}-${e}`);
          }
          return out;
        };
        // Render with optional leading play button if we can infer a timestamp at the start (fallback lacks strict ts)
        const parts = renderBlockWithHighlights(bStart, bEnd, wrapFallback, wrapFallbackHighlighted);
        // For fallback, we don't know exact times; skip play control
        return parts;
      }

      // Normalize fields depending on which pattern matched
      let ts = '';
      let speaker = '';
      let tsEnd = 0;
      let speakerStart = -1;
      let speakerEnd = -1;
      let speechStart = 0;
      if (bracket) {
        ts = bracket[1] || '';
        tsEnd = bracket[0].length; // include the entire bracket as timestamp region
        // Try to parse optional speaker label right after bracketed timestamp: "Speaker: "
        const afterTs = full.slice(tsEnd);
        const sp = afterTs.match(/^\s*(.+?):\s*/);
        if (sp) {
          speaker = sp[1] || '';
          const leading = (sp[0].length - (speaker.length + 1)) // includes spaces + colon
          const leadingSpaces = Math.max(0, leading - 1); // account for colon
          speakerStart = tsEnd + leadingSpaces;
          speakerEnd = speakerStart + speaker.length + 2; // ": "
          speechStart = tsEnd + sp[0].length;
        } else {
          speechStart = tsEnd;
        }
      } else if (m) {
        ts = m[1] || '';
        speaker = m[2] || '';
        tsEnd = ts ? ts.length : 0;
        speakerStart = m && speaker ? (m[0].indexOf(speaker)) : -1;
        speakerEnd = speaker ? speakerStart + speaker.length + 2 /*": "*/ : -1;
        speechStart = m ? m[0].length : 0;
      }

      // Derive ms for playback if available
      // Prefer meta times if provided, else parse from text, else fuzzy-match
      const parsedStart = bracket ? hmsToMsLocal(bracket[1]) : (ts ? hmsToMsLocal(ts) : null);
      const parsedEnd = bracket ? hmsToMsLocal(bracket[2]) : null;
      const meta = findMetaForTimes(idx, parsedStart, parsedEnd);
      const startMs = meta?.startMs ?? parsedStart;
      const endMs = meta?.endMs ?? parsedEnd;

      // Debug: Log meta matching
      if (currentTimeMs != null && parsedStart != null && meta) {
        console.log('[TextViewer] Meta match for idx', idx, {
          parsedStart,
          parsedEnd,
          'meta.startMs': meta.startMs,
          'meta.endMs': meta.endMs,
          finalStartMs: startMs,
          finalEndMs: endMs
        });
      }

      const isActive = currentTimeMs != null && startMs != null && endMs != null && currentTimeMs >= startMs && currentTimeMs < endMs;

      // Debug logging for ALL segments being checked
      if (currentTimeMs != null && startMs != null && endMs != null) {
        console.log('[TextViewer] Checking segment:', {
          idx,
          currentTimeMs,
          startMs,
          endMs,
          isActive,
          bracket: bracket ? `[${bracket[1]} - ${bracket[2]}]` : null,
          blockText: full.substring(0, Math.min(50, full.length))
        });
      }

      const playControl = (
        <button
          key={`play-${bStart}`}
          type="button"
          className={`inline-flex items-center justify-center w-6 h-6 mr-2 align-top border-2 border-black rounded-md ${isActive ? 'bg-black text-white' : 'bg-white hover:bg-neutral-50'}`}
          aria-label="Play segment"
          title="Play segment"
          onMouseDown={(e) => e.preventDefault()}
          disabled={!canPlay || startMs == null}
          onClick={(e) => {
            e.stopPropagation();
            const now = Date.now();
            if (now - lastPlayClickRef.current < 150) return; // simple debounce for rapid clicks
            lastPlayClickRef.current = now;
            if (onPlaySegment) onPlaySegment(startMs, endMs);
          }}
        >
          <Play className="w-3 h-3" />
        </button>
      );

      const wrap = (_chunkText: string, absStart: number, absEnd: number): JSX.Element[] => {
        const relStart = absStart - bStart;
        const relEnd = absEnd - bStart;
        const out: JSX.Element[] = [];
        let speechAnchorInserted = false;

        // Debug: Log when wrap() is called for active segment
        if (isActive) {
          console.log('[TextViewer wrap()] Called for ACTIVE segment:', {
            idx,
            absStart,
            absEnd,
            relStart,
            relEnd,
            bStart,
            isActive
          });
        }
        const pushText = (from: number, to: number, cls: string, key: string, isSpeechStart: boolean) => {
          if (to <= from) return;
          const content = full.substring(from, to);
          if (isSpeechStart && !speechAnchorInserted) {
            speechAnchorInserted = true;
            out.push(<span key={key} className={cls} data-speech-anchor="1">{content}</span>);
          } else {
            out.push(<span key={key} className={cls}>{content}</span>);
          }
        };
        // Do not render play here; we attach it after speaker label if available (or after timestamp if no speaker)
        const boundaries = [relStart];
        if (tsEnd > relStart && tsEnd < relEnd) boundaries.push(tsEnd);
        if (speakerStart >= 0) {
          if (speakerStart > relStart && speakerStart < relEnd) boundaries.push(speakerStart);
          if (speakerEnd > relStart && speakerEnd < relEnd) boundaries.push(speakerEnd);
        }
        if (speechStart > relStart && speechStart < relEnd) boundaries.push(speechStart);
        boundaries.push(relEnd);
        boundaries.sort((a, b) => a - b);
        for (let i = 0; i < boundaries.length - 1; i++) {
          const s = boundaries[i];
          const e = boundaries[i + 1];
          let cls = 'text-sm text-neutral-800';
          // Determine if this specific segment is the speech portion
          const isSpeechSegment = s >= speechStart;

          // Debug logging for active segments in wrap()
          if (isActive && isSpeechSegment) {
            console.log('[TextViewer wrap()] Applying highlight:', {
              s, e, speechStart, tsEnd, speakerStart, speakerEnd,
              text: full.substring(s, e),
              isSpeechSegment,
              isActive
            });
          }

          if (s < tsEnd) cls = 'text-[11px] text-neutral-400 mr-2 align-top';
          else if (speaker && s >= speakerStart && e <= speakerEnd) cls = 'inline-flex items-center text-[12px] font-medium text-neutral-800 mr-1 align-top border border-black rounded-full px-1.5 py-0.5';
          else if (isSpeechSegment) {
            cls = `text-sm leading-snug text-neutral-800 ${isActive ? 'bg-indigo-50' : ''}`;
            if (isActive) {
              console.log('[TextViewer wrap()] Setting class with bg-indigo-50:', {
                s, e, speechStart, cls, textContent: full.substring(s, e)
              });
            }
          }
          if (s < tsEnd) {
            // timestamp segment
            const label = bracket ? `From ${bracket[1]} to ${bracket[2]}` : (ts ? `At ${ts}` : 'Timestamp');
            out.push(
              <time key={`time-${bStart}-${s}-${e}`} className={cls} aria-label={label}>
                {full.substring(s, e)}
              </time>
            );
            // Do not render a left-of-line play control; play stays next to speaker only
          } else if (speaker && s >= speakerStart && e <= speakerEnd) {
            const segId = meta?.segmentId;
            const labelText = full.substring(s, e);
            if (labelText.trim().length === 0) {
              // Safety: don't render empty pill or play button if label is empty
              pushText(s, e, cls, `seg-empty-${bStart}-${s}-${e}`, false);
            } else if (readOnly && segId && participants && participants.length > 0 && onAssignParticipant) {
              // Interactive pill with popover
              out.push(
                <AssignPopover
                  key={`spk-pop-${bStart}-${s}-${e}`}
                  label={labelText}
                  className={cls}
                  participants={participants}
                  onSelect={(pid) => onAssignParticipant(segId, pid)}
                />
              );
              // Append play control right after speaker label when available (only if onPlaySegment is provided)
              if (onPlaySegment) {
                out.push(<React.Fragment key={`playafter-${bStart}-${s}-${e}`}>{playControl}</React.Fragment>);
              }
            } else {
              out.push(
                <span key={`spk-${bStart}-${s}-${e}`} className={cls} aria-label={`Speaker: ${speaker}`}>
                  {labelText}
                </span>
              );
              if (onPlaySegment) {
                out.push(<React.Fragment key={`playafter2-${bStart}-${s}-${e}`}>{playControl}</React.Fragment>);
              }
            }
          } else {
            const isSpeechStart = s >= speechStart && !speechAnchorInserted;
            pushText(s, e, cls, `seg-${bStart}-${s}-${e}`, isSpeechStart);
          }
        }
        return out;
      };

      const wrapHighlighted = (_chunkText: string, absStart: number, absEnd: number, h?: Highlight): JSX.Element[] => {
        const relStart = absStart - bStart;
        const relEnd = absEnd - bStart;
        const isFlashing = flashRange && !(absEnd <= flashRange.start || absStart >= flashRange.end);
        const bg = isFlashing ? 'bg-yellow-200' : 'bg-primary/20 hover:bg-primary/30';
        const out: JSX.Element[] = [];
        let speechAnchorInsertedH = false;
        const pushSeg = (from: number, to: number, cls: string, key: string) => {
          if (to <= from) return;
          if (from < tsEnd) {
            const label = bracket ? `From ${bracket[1]} to ${bracket[2]}` : (ts ? `At ${ts}` : 'Timestamp');
            out.push(
              <time key={`time-h-${bStart}-${from}-${to}`} className={cls} aria-label={label}>
                {full.substring(from, to)}
              </time>
            );
            return;
          }
          if (speaker && from >= speakerStart && to <= speakerEnd) {
            out.push(
              <span key={`spk-h-${bStart}-${from}-${to}`} className={cls} aria-label={`Speaker: ${speaker}`}>
                {full.substring(from, to)}
              </span>
            );
            return;
          }
          const isSpeechStart = from >= speechStart && !speechAnchorInsertedH;
          if (isSpeechStart) speechAnchorInsertedH = true;
          out.push(
            <mark
              key={key}
              className={`${cls} ${bg}`}
              role="mark"
              aria-label={h?.codeName ? `Code: ${h.codeName}` : 'Highlight'}
              {...(isSpeechStart ? { 'data-speech-anchor': '1' } : {})}
            >
              {full.substring(from, to)}
            </mark>
          );
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
        const insertedBreak = false;
        for (let i = 0; i < boundaries.length - 1; i++) {
          const s = boundaries[i];
          const e = boundaries[i + 1];
          let cls = 'text-sm text-neutral-800';
          // Determine if this specific segment is the speech portion
          const isSpeechSegment = s >= speechStart;

          // Debug logging for active segments in wrapHighlighted()
          if (isActive && isSpeechSegment) {
            console.log('[TextViewer wrapHighlighted()] Applying highlight:', {
              s, e, speechStart, tsEnd, speakerStart, speakerEnd,
              text: full.substring(s, e),
              isSpeechSegment,
              isActive
            });
          }

          if (s < tsEnd) cls = 'text-[11px] text-neutral-400 mr-2 align-top';
          else if (speaker && s >= speakerStart && e <= speakerEnd) cls = 'inline-flex items-center text-[12px] font-medium text-neutral-800 mr-1 align-top border border-black rounded-full px-1.5 py-0.5';
          else if (isSpeechSegment) cls = `text-sm leading-snug text-neutral-800 ${isActive ? 'bg-indigo-50' : ''}`; // active bg only on speech
          pushSeg(s, e, cls, `seg-h-${bStart}-${s}-${e}`);
        }
        return out;
      };

      return renderBlockWithHighlights(bStart, bEnd, wrap, wrapHighlighted);
    };

    // Generic block renderer (non-VTT)
    const renderGenericBlock = (block: { start: number; end: number }) => {
      const wrap = (chunkText: string, _absStart: number, _absEnd: number) => <>{chunkText}</>;
      const wrapHighlighted = (chunkText: string, absStart: number, absEnd: number, h?: Highlight) => {
        const isFlashing = flashRange && !(absEnd <= flashRange.start || absStart >= flashRange.end);
        return (
          <mark
            className={`${isFlashing ? 'bg-yellow-200' : 'bg-primary/20 hover:bg-primary/30'}`}
            role="mark"
            aria-label={h?.codeName ? `Code: ${h.codeName}` : 'Highlight'}
          >
            {chunkText}
          </mark>
        );
      };
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
            if (readOnly) return; // do not persist in read-only mode
            if (saveContent) {
              await saveContent(next);
            } else {
              await updateFile(fileId, { content: next });
            }
            lastSavedContentRef.current = next;
            contentRef.current = next; // Track that we've persisted this version
          } catch (err) {
            console.error(err);
            toast.error('Failed to save');
          } finally {
            if (!opts?.silent) setIsSaving(false);
          }
        }, 700);
      },
      [fileId, saveContent, readOnly]
    );

    // Replace references where we cleared selection

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

    const contentEl = (
      <div
        ref={textRootRef}
        role="document"
        aria-label="Transcript"
        className="max-w-none leading-snug select-text break-words"
        onMouseUp={() => {/* selection tracking handled in hook's selectionchange listener */ }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {blocks.map((b, i) => {
          // Active segment highlight now applied only to speech spans, not wrapper
          return (
            <div key={`blockwrap-${i}-${b.start}`} className={`relative group`}>
              {isVtt && !readOnly && (!editingRange || i < editingRange.start || i > editingRange.end) && (
                <button
                  type="button"
                  className="absolute -left-10 top-1 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-700 hover:text-red-700 bg-white border-2 border-black rounded-md px-2 py-1 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
                  aria-label="Delete block (Cmd+Z to undo)"
                  title="Delete block (Cmd+Z to undo)"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={async (e) => {
                    e.stopPropagation();
                    // Prepare delete
                    const block = blocks[i];
                    if (!block) return;
                    const prev = text;
                    let next = prev.substring(0, block.start) + prev.substring(block.end);
                    if (isVtt) {
                      next = next.replace(/\n{2,}/g, '\n');
                      const pivot = Math.max(0, Math.min(block.start, next.length - 1));
                      next = mergePrevCurr(next, pivot);
                      next = mergeCurrNext(next, pivot);
                      next = next.replace(/\n{2,}/g, '\n');
                    }
                    try {
                      // Push previous content to undo stack and clear redo stack
                      undoStackRef.current.push(prev);
                      redoStackRef.current = [];
                      setIsSaving(true);
                      await updateFile(fileId, { content: next });
                      lastSavedContentRef.current = next;
                      setText(next);
                      toast.success('Block deleted', {
                        action: {
                          label: 'Undo',
                          onClick: () => { void performUndo(); },
                        },
                      });
                    } catch (err) {
                      console.error(err);
                      toast.error('Failed to delete block');
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                >
                  <span className="flex items-center gap-1">
                    <Trash2 className="w-4 h-4" />
                    <span className="text-[10px] font-medium text-neutral-500">⌘Z</span>
                  </span>
                </button>
              )}
              <div
                key={`block-${i}-${b.start}`}
                data-block-idx={i}
                data-start={b.start}
                data-end={b.end}
                className={`whitespace-pre-wrap ${((text.substring(b.start, b.end) || '').trim().length === 0) ? 'mb-1' : 'mb-2'} pl-4 ${editingRange && i >= editingRange.start && i <= editingRange.end ? 'bg-yellow-50 outline outline-2 outline-indigo-500' : 'bg-transparent'}`}
                contentEditable={Boolean(!readOnly && isVtt && editingRange && i >= editingRange.start && i <= editingRange.end)}
                suppressContentEditableWarning
                onInput={onBlockInput(i)}
                onBlur={onBlockBlur(i)}
              >
                {isVtt
                  ? (editingRange && i >= editingRange.start && i <= editingRange.end
                    ? text.substring(b.start, b.end)
                    : renderVttBlock({ start: b.start, end: b.end }, i))
                  : renderGenericBlock({ start: b.start, end: b.end })}
              </div>
            </div>
          );
        })}
        {isSaving ? <div className="mt-2 text-xs text-neutral-500">Saving…</div> : null}
      </div>
    );

    return (
      <div className="relative space-y-4">
        {framed ? <Card className="p-6">{contentEl}</Card> : contentEl}

        {(selectedText || frozenSelection) && selectionRect && enableSelectionActions && !readOnly && (
          <SelectionTooltip
            rect={selectionRect}
            isVtt={isVtt}
            onAddCode={openAddCode}
            onEditBlocks={isVtt ? startEditSelectedBlock : undefined}
          />
        )}

        <Sheet open={sheetOpen} onOpenChange={(open) => { setSheetOpen(open); if (!open) { /* frozenSelection cleared in hook */ } }}>
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

// Lightweight participant assignment popover used in read-only transcript mode
function AssignPopover({ label, className, participants, onSelect }: { label: string; className: string; participants: MinimalParticipant[]; onSelect: (participantId: string | null) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const handleSelect = async (pid: string | null) => {
    // Close first for snappy UX, then perform assignment
    setOpen(false);
    try { await onSelect(pid); } catch { /* ignore */ }
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={className} aria-label={`Participant ${label}. Click to reassign`} aria-expanded={open}>
          {label}
        </button>
      </PopoverTrigger>
      {open && (
        <PopoverContent align="start" className="p-0 w-56">
          <Command>
            <CommandInput placeholder="Search and assign" />
            <CommandEmpty>No participants.</CommandEmpty>
            <CommandGroup heading="Participants">
              {participants.map(p => (
                <CommandItem
                  key={p.id}
                  value={p.name || ''}
                  onSelect={() => {
                    // Prevent immediate text selection race; close then assign
                    handleSelect(p.id);
                  }}
                >
                  {p.name || 'Unnamed'}
                </CommandItem>
              ))}
              <CommandItem value="unassign" onSelect={() => handleSelect(null)}>
                <span className="inline-flex items-center gap-1"><Plus className="w-3 h-3" /> Unassign</span>
              </CommandItem>
            </CommandGroup>
          </Command>
        </PopoverContent>
      )}
    </Popover>
  );
}
