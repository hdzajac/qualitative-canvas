import { describe, it, expect } from 'vitest';
import { selectionBBox, placeRightOf } from '../CanvasGeometry';
import type { NodeView } from '../CanvasTypes';

describe('CanvasGeometry', () => {
  const nodes: NodeView[] = [
    { id: 'a', kind: 'code', x: 0, y: 0, w: 100, h: 50, highlight: undefined },
    { id: 'b', kind: 'code', x: 120, y: 20, w: 80, h: 40, highlight: undefined },
    { id: 't1', kind: 'theme', x: 300, y: 100, w: 100, h: 60, theme: undefined },
  ] as unknown as NodeView[];

  it('computes selection bounding box for codes', () => {
    const bbox = selectionBBox(nodes, ['a', 'b'], [], ['code']);
    expect(bbox).not.toBeNull();
    expect(bbox!.minX).toBe(0);
    expect(bbox!.maxX).toBe(200); // 120+80
    expect(bbox!.minY).toBe(0);
    expect(bbox!.maxY).toBe(60); // 20+40
  });

  it('returns null when nothing selected', () => {
    const bbox = selectionBBox(nodes, [], [], ['code']);
    expect(bbox).toBeNull();
  });

  it('places new node to the right of bbox', () => {
  const bbox = { maxX: 200, cy: 30 } as { maxX: number; cy: number };
  const pos = placeRightOf(bbox, 100, 60);
    expect(pos.x).toBeGreaterThan(200);
    expect(pos.y).toBe(0); // cy - h/2
  });
});
