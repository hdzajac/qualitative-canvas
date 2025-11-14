import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTextSelectionHotkeys } from '@/hooks/useTextSelectionHotkeys';
import { createHighlight } from '@/services/api';
import { DEFAULTS } from '@/components/canvas/CanvasTypes';
import { toast } from 'sonner';

export type SelectionRange = { text: string; start: number; end: number } | null;

type UseSelectionActionsOpts = {
  fileId: string;
  text: string;
  enabled: boolean; // when true, hotkeys and actions are active
  isVtt: boolean;
  readOnly?: boolean;
  enableSelectionActions?: boolean;
  textPrefix?: string; // Optional prefix to add to the selected text (e.g., participant name)
  onHighlightCreated: () => void;
  startEditSelectedBlock: () => void; // callback to begin VTT block edit
  getContainer: () => HTMLElement | null; // function returning root container for selection calculations
};

export const useSelectionActions = ({
  fileId,
  text,
  enabled,
  isVtt,
  readOnly = false,
  enableSelectionActions = true,
  textPrefix = '',
  onHighlightCreated,
  startEditSelectedBlock,
  getContainer,
}: UseSelectionActionsOpts) => {
  const [selectedText, setSelectedText] = useState<SelectionRange>(null);
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [frozenSelection, setFrozenSelection] = useState<SelectionRange>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [codeName, setCodeName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Compute enabled for hotkeys
  const hotkeysEnabled = useMemo(() => enabled && !readOnly && enableSelectionActions && Boolean(selectedText), [enabled, readOnly, enableSelectionActions, selectedText]);

  // Keyboard shortcuts
  useTextSelectionHotkeys({
    enabled: hotkeysEnabled,
    sheetOpen,
    isVtt,
    onAddCode: () => openAddCode(),
    onEditBlocks: () => startEditSelectedBlock(),
  });

  // Focus input when sheet opens
  useEffect(() => {
    if (sheetOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [sheetOpen]);

  const openAddCode = () => {
    if (!selectedText || readOnly || !enableSelectionActions) return;
    setFrozenSelection(selectedText);
    setSheetOpen(true);
  };

  const handleCreateCode = async () => {
    if (readOnly || !enableSelectionActions) return;
    const activeSel = frozenSelection || selectedText;
    if (!activeSel || !codeName.trim()) {
      toast.error('Please provide a code name');
      return;
    }
    try {
      const snippet = text.slice(activeSel.start, activeSel.end);
      const fullSnippet = textPrefix ? textPrefix + snippet : snippet;
      await createHighlight({
        fileId,
        startOffset: activeSel.start,
        endOffset: activeSel.end,
        text: fullSnippet,
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

  // Selection tracking: compute absolute offsets within container
  const updateSelectionFromWindow = useCallback(() => {
    const container = getContainer();
    if (!container) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelectedText(null);
      setSelectionRect(null);
      return;
    }
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
  }, [getContainer]);

  useEffect(() => {
    if (sheetOpen) return; // don't clear while sheet open
    const onSelChange = () => updateSelectionFromWindow();
    document.addEventListener('selectionchange', onSelChange);
    return () => document.removeEventListener('selectionchange', onSelChange);
  }, [sheetOpen, updateSelectionFromWindow]);

  return {
    // state
    selectedText, setSelectedText,
    selectionRect, setSelectionRect,
    frozenSelection, setFrozenSelection,
    sheetOpen, setSheetOpen,
    codeName, setCodeName,
    inputRef,
    // actions
    openAddCode,
    handleCreateCode,
  } as const;
};
