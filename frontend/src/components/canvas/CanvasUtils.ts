import type { NodeView } from './CanvasTypes';

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(/\s+/);
  let line = '';
  let lineCount = 0;
  for (let n = 0; n < words.length; n++) {
    const testLine = line ? line + ' ' + words[n] : words[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n];
      y += lineHeight;
      lineCount++;
      if (lineCount >= maxLines - 1) {
        const remaining = words.slice(n).join(' ');
        const ell = ellipsize(ctx, remaining, maxWidth);
        ctx.fillText(ell, x, y);
        return;
      }
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

export function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  let t = text;
  while (ctx.measureText(t + '…').width > maxWidth && t.length > 0) {
    t = t.slice(0, -1);
  }
  return t + '…';
}

export function hitTestNode(wx: number, wy: number, list: NodeView[]) {
  for (let i = list.length - 1; i >= 0; i--) {
    const n = list[i];
    if (wx >= n.x && wx <= n.x + n.w && wy >= n.y && wy <= n.y + n.h) return i;
  }
  return -1;
}

export function intersects(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

export function union(a: string[], b: string[]) {
  const s = new Set([...a, ...b]);
  return Array.from(s);
}

export function toggleInArray(arr: string[], id: string, clearOthers: boolean) {
  if (clearOthers) return arr.includes(id) ? [] : [id];
  return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];
}

// Measure number of wrapped lines using an offscreen canvas
export function measureWrappedLines(text: string, maxWidth: number, font: string): number {
  if (typeof document === 'undefined') return 1;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return 1;
  ctx.font = font;
  const words = text.split(/\s+/);
  let line = '';
  let lines = 1;
  for (let n = 0; n < words.length; n++) {
    const testLine = line ? line + ' ' + words[n] : words[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      line = words[n];
      lines += 1;
    } else {
      line = testLine;
    }
  }
  return Math.max(1, lines);
}
