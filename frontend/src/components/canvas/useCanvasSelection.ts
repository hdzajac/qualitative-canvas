import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { NodeView, NodeKind } from './CanvasTypes';
import { toggleInArray, union } from './CanvasUtils';
import { selectionBBox as computeSelectionBBox } from './CanvasGeometry';

interface UseCanvasSelectionProps {
  nodes: NodeView[];
}

export interface CanvasSelection {
  selectedCodeIds: string[];
  selectedThemeIds: string[];
  selectedCodeIdsRef: React.RefObject<string[]>;
  selectedThemeIdsRef: React.RefObject<string[]>;
  setSelectedCodeIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSelectedThemeIds: React.Dispatch<React.SetStateAction<string[]>>;
  clearSelection: () => void;
  toggleCodeSelection: (id: string, add?: boolean) => void;
  toggleThemeSelection: (id: string, add?: boolean) => void;
  selectCodes: (ids: string[], additive?: boolean) => void;
  selectThemes: (ids: string[], additive?: boolean) => void;
  isCodeSelected: (id: string) => boolean;
  isThemeSelected: (id: string) => boolean;
  isNodeSelected: (node: NodeView) => boolean;
  hasSelection: boolean;
  showContextPopup: boolean;
  selectionBBox: (kinds: NodeKind[]) => { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number };
}

/**
 * Hook to manage canvas selection state for codes and themes
 */
export function useCanvasSelection({ nodes }: UseCanvasSelectionProps): CanvasSelection {
  const [selectedCodeIds, setSelectedCodeIds] = useState<string[]>([]);
  const [selectedThemeIds, setSelectedThemeIds] = useState<string[]>([]);
  
  // Refs to access latest selection in global key handlers
  const selectedCodeIdsRef = useRef<string[]>([]);
  const selectedThemeIdsRef = useRef<string[]>([]);
  
  useEffect(() => {
    selectedCodeIdsRef.current = selectedCodeIds;
  }, [selectedCodeIds]);
  
  useEffect(() => {
    selectedThemeIdsRef.current = selectedThemeIds;
  }, [selectedThemeIds]);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedCodeIds([]);
    setSelectedThemeIds([]);
  }, []);

  // Toggle individual code selection
  const toggleCodeSelection = useCallback((id: string, add: boolean = false) => {
    setSelectedCodeIds((prev) => toggleInArray(prev, id, add));
  }, []);

  // Toggle individual theme selection
  const toggleThemeSelection = useCallback((id: string, add: boolean = false) => {
    setSelectedThemeIds((prev) => toggleInArray(prev, id, add));
  }, []);

  // Select multiple codes (with optional additive mode)
  const selectCodes = useCallback((ids: string[], additive: boolean = false) => {
    setSelectedCodeIds((prev) => (additive ? union(prev, ids) : ids));
  }, []);

  // Select multiple themes (with optional additive mode)
  const selectThemes = useCallback((ids: string[], additive: boolean = false) => {
    setSelectedThemeIds((prev) => (additive ? union(prev, ids) : ids));
  }, []);

  // Check if a code is selected
  const isCodeSelected = useCallback((id: string) => {
    return selectedCodeIds.includes(id);
  }, [selectedCodeIds]);

  // Check if a theme is selected
  const isThemeSelected = useCallback((id: string) => {
    return selectedThemeIds.includes(id);
  }, [selectedThemeIds]);

  // Check if a node is selected
  const isNodeSelected = useCallback((node: NodeView) => {
    if (node.kind === 'code') return selectedCodeIds.includes(node.id);
    if (node.kind === 'theme') return selectedThemeIds.includes(node.id);
    return false;
  }, [selectedCodeIds, selectedThemeIds]);

  // Check if there's any selection
  const hasSelection = useMemo(() => {
    return selectedCodeIds.length > 0 || selectedThemeIds.length > 0;
  }, [selectedCodeIds, selectedThemeIds]);

  // Show context popup when 2+ codes or 1+ themes selected
  const showContextPopup = useMemo(() => {
    return selectedCodeIds.length >= 2 || selectedThemeIds.length >= 1;
  }, [selectedCodeIds, selectedThemeIds]);

  // Calculate bounding box of selected nodes
  const selectionBBox = useCallback((kinds: NodeKind[]) => {
    return computeSelectionBBox(nodes, selectedCodeIds, selectedThemeIds, kinds);
  }, [nodes, selectedCodeIds, selectedThemeIds]);

  return {
    selectedCodeIds,
    selectedThemeIds,
    selectedCodeIdsRef,
    selectedThemeIdsRef,
    setSelectedCodeIds,
    setSelectedThemeIds,
    clearSelection,
    toggleCodeSelection,
    toggleThemeSelection,
    selectCodes,
    selectThemes,
    isCodeSelected,
    isThemeSelected,
    isNodeSelected,
    hasSelection,
    showContextPopup,
    selectionBBox,
  };
}
