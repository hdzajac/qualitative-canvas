import { useEffect } from 'react';

export type UseTextSelectionHotkeysOptions = {
  enabled: boolean; // selection exists and not editing
  sheetOpen: boolean;
  isVtt: boolean;
  onAddCode: () => void;
  onEditBlocks: () => void;
};

export const useTextSelectionHotkeys = ({ enabled, sheetOpen, isVtt, onAddCode, onEditBlocks }: UseTextSelectionHotkeysOptions) => {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!enabled) return;
      if (sheetOpen) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('input, textarea, [contenteditable="true"]'))) return;
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        onAddCode();
      } else if ((e.key === 'e' || e.key === 'E') && isVtt) {
        e.preventDefault();
        onEditBlocks();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enabled, sheetOpen, isVtt, onAddCode, onEditBlocks]);
};

export default useTextSelectionHotkeys;
