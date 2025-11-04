import { describe, it, expect } from 'vitest';
import { ellipsize, hitTestNode, intersects, clamp, union, toggleInArray, wrapText } from '../CanvasUtils';
import type { NodeView } from '../CanvasTypes';

describe('CanvasUtils', () => {
  it('clamp keeps value within bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('union merges unique values', () => {
    expect(union(['a', 'b'], ['b', 'c']).sort()).toEqual(['a', 'b', 'c']);
  });

  it('toggleInArray toggles presence', () => {
    expect(toggleInArray(['a'], 'a', false)).toEqual([]);
    expect(toggleInArray(['a'], 'b', false).sort()).toEqual(['a', 'b']);
    expect(toggleInArray(['a'], 'a', true)).toEqual([]);
    expect(toggleInArray(['a'], 'b', true)).toEqual(['b']);
  });

  it('intersects detects rectangle overlap', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 5, y: 5, w: 10, h: 10 };
    const c = { x: 20, y: 20, w: 5, h: 5 };
    expect(intersects(a, b)).toBe(true);
    expect(intersects(a, c)).toBe(false);
  });

  it('hitTestNode finds topmost hit index', () => {
    const nodes = [
      { id: '1', x: 0, y: 0, w: 10, h: 10, kind: 'code' as const },
      { id: '2', x: 5, y: 5, w: 10, h: 10, kind: 'theme' as const },
    ] as unknown as NodeView[];
    expect(hitTestNode(6, 6, nodes)).toBe(1);
    expect(hitTestNode(1, 1, nodes)).toBe(0);
    expect(hitTestNode(100, 100, nodes)).toBe(-1);
  });

  it('ellipsize trims text to fit width', () => {
    // fake context measures width as 10 per char
    const ctx = {
      measureText: (t: string) => ({ width: t.length * 10 }),
    } as unknown as CanvasRenderingContext2D;
    const out = ellipsize(ctx, 'HelloWorld', 60);
    expect(out.endsWith('…')).toBe(true);
  });

  it('wrapText wraps and ellipsizes respecting maxLines', () => {
    const calls: Array<{ text: string; x: number; y: number }> = [];
    const ctx = {
      measureText: (t: string) => ({ width: t.length * 10 }),
      fillText: (text: string, x: number, y: number) => calls.push({ text, x, y }),
    } as unknown as CanvasRenderingContext2D;
    wrapText(ctx, 'one two three four five', 0, 0, 50, 10, 2);
    // Should produce at most 2 lines; last line ends with ellipsis
    expect(calls.length).toBe(2);
    expect(calls[1].text.endsWith('…')).toBe(true);
  });
});
