import type { NodeView, NodeKind } from './CanvasTypes';

export type BBox = { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number };

export function selectionBBox(nodes: NodeView[], selectedCodeIds: string[], selectedThemeIds: string[], kinds: NodeKind[]): BBox | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const isSelected = (n.kind === 'code' && kinds.includes('code') && selectedCodeIds.includes(n.id)) ||
      (n.kind === 'theme' && kinds.includes('theme') && selectedThemeIds.includes(n.id));
    if (!isSelected) continue;
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

export function placeRightOf(bbox: { maxX: number; cy: number }, w: number, h: number) {
  const margin = 40;
  return { x: bbox.maxX + margin, y: bbox.cy - h / 2 };
}
