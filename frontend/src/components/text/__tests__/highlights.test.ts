import { describe, it, expect } from 'vitest';
import { getCorrectedRange } from '../highlights';
import type { Highlight } from '@/types';

const H = (start: number, end: number, text?: string): Highlight => ({
  id: 't',
  fileId: 'f',
  startOffset: start,
  endOffset: end,
  text: text ?? '',
  codeName: 'code',
  size: 1,
}) as unknown as Highlight;

describe('highlights utils', () => {
  const base = '  hello world  ';

  it('returns exact match when slice equals target', () => {
    const h = H(2, 13, 'hello world');
    const r = getCorrectedRange(base, h);
    expect(r).toEqual({ start: 2, end: 13 });
  });

  it('trims inward when trimmed slice equals target', () => {
    const h = H(0, 15, 'hello world');
    const r = getCorrectedRange(base, h);
    expect(r).toEqual({ start: 2, end: 13 });
  });

  it('fuzzy finds closest occurrence', () => {
    const text = 'foo bar baz bar';
    const h = H(0, 3, 'bar');
    const r = getCorrectedRange(text, h);
    // closest to start 0 is index 4
    expect(r).toEqual({ start: 4, end: 7 });
  });

  it('falls back when no target', () => {
    const h = H(1, 3, '');
    const r = getCorrectedRange(base, h);
    expect(r).toEqual({ start: 1, end: 3 });
  });
});
