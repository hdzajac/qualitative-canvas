import type { NodeView } from './CanvasTypes';
import { wrapText } from './CanvasUtils';

export function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, step: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  for (let x = 0; x < w; x += step) {
    for (let y = 0; y < h; y += step) {
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.restore();
}

export function drawOrthogonal(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number) {
  const midY = (ay + by) / 2;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax, midY);
  ctx.lineTo(bx, midY);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  // changed to sharp rectangle (no rounding)
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.closePath();
}

export function drawNode(
  ctx: CanvasRenderingContext2D,
  n: NodeView,
  selectedCodeIds: string[],
  selectedThemeIds: string[],
  getFontSize: (n: NodeView) => number
) {
  ctx.save();
  const radius = 0; // no rounding
  const isSelected = (n.kind === 'code' && selectedCodeIds.includes(n.id)) || (n.kind === 'theme' && selectedThemeIds.includes(n.id));

  const accent =
    n.kind === 'code' ? '#2563eb' :
    n.kind === 'theme' ? '#10b981' :
    n.kind === 'insight' ? '#f59e0b' : '#ef4444';

  if (isSelected) {
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.06)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 3;
  }

  ctx.fillStyle = '#fff';
  ctx.strokeStyle = isSelected ? accent : '#111827';
  ctx.lineWidth = isSelected ? 3 : 1.5;
  roundRect(ctx, n.x, n.y, n.w, n.h, radius);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.fillRect(n.x, n.y, 6, n.h);

  const iconY = n.y + 6; // slightly tighter
  const iconX = n.x + n.w - 18;
  ctx.fillStyle = '#374151';
  ctx.font = '13px ui-sans-serif, system-ui, -apple-system';
  ctx.fillText('↗', iconX, iconY + 10);

  const fontSize = getFontSize(n);
  ctx.fillStyle = '#111827';
  ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system`;
  const titleY = n.y + 18;
  if (n.kind === 'code' && n.highlight) {
    ctx.fillText(n.highlight.codeName || 'Untitled', n.x + 12, titleY);
    // snippet
    const body = n.highlight.text || '';
    if (body) {
      ctx.font = `${Math.max(10, Math.round(fontSize * 0.9))}px ui-sans-serif, system-ui, -apple-system`;
      wrapText(ctx, body, n.x + 12, titleY + 14, n.w - 24, Math.max(12, Math.round(fontSize * 1.05)), 1000);
    }
  } else if (n.kind === 'theme' && n.theme) {
    ctx.fillText(n.theme.name, n.x + 12, titleY);
  } else if (n.kind === 'insight' && n.insight) {
    ctx.fillText(n.insight.name, n.x + 12, titleY);
  } else if (n.kind === 'annotation' && n.annotation) {
    wrapText(ctx, n.annotation.content || 'New text', n.x + 12, titleY, n.w - 24, 13, 2000);
  }

  // Keep label font fixed irrespective of text size
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9ca3af';
  ctx.font = '11px ui-sans-serif, system-ui, -apple-system';
  const typeLabel = n.kind === 'code' ? 'Code' : n.kind === 'theme' ? 'Theme' : n.kind === 'insight' ? 'Insight' : 'Note';
  ctx.fillText(typeLabel, n.x + n.w - 8, n.y + n.h - 8);
  ctx.textAlign = 'left';

  ctx.restore();
}
