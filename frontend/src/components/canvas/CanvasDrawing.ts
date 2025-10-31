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

  // Clip contents to card bounds (inside the stroke)
  ctx.save();
  ctx.beginPath();
  ctx.rect(n.x + 1, n.y + 1, n.w - 2, n.h - 2);
  ctx.clip();

  const iconY = n.y + 6; // slightly tighter
  const iconX = n.x + n.w - 18;
  ctx.fillStyle = '#374151';
  ctx.font = '13px ui-sans-serif, system-ui, -apple-system';
  ctx.fillText('↗', iconX, iconY + 10);

  const fontSize = getFontSize(n);
  ctx.fillStyle = '#111827';
  ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system`;
  const titleY = n.y + 18;

  // compute available space values (used for notes), but do not clamp title lines here
  const bottomPadding = 18;
  const lineHeight = Math.max(12, Math.round(fontSize * 1.2));

  if (n.kind === 'code' && n.highlight) {
    const title = n.highlight.codeName || 'Untitled';
    wrapText(ctx, title, n.x + 12, titleY, n.w - 24, lineHeight, 1000);
    // Do NOT draw snippet body here; it should only be visible in the side panel
  } else if (n.kind === 'theme' && n.theme) {
    wrapText(ctx, n.theme.name, n.x + 12, titleY, n.w - 24, lineHeight, 1000);
  } else if (n.kind === 'insight' && n.insight) {
    wrapText(ctx, n.insight.name, n.x + 12, titleY, n.w - 24, lineHeight, 1000);
  } else if (n.kind === 'annotation' && n.annotation) {
    // Notes show their body directly, clamp to bounds implicitly via clip
    const availableH = Math.max(0, n.h - (titleY - n.y) - bottomPadding);
    wrapText(ctx, n.annotation.content || 'New text', n.x + 12, titleY, n.w - 24, lineHeight, Math.max(1, Math.floor(availableH / lineHeight)));
  }

  // Keep label font fixed irrespective of text size
  ctx.textAlign = 'right';
  ctx.fillStyle = '#9ca3af';
  ctx.font = '11px ui-sans-serif, system-ui, -apple-system';
  const typeLabel = n.kind === 'code' ? 'Code' : n.kind === 'theme' ? 'Theme' : n.kind === 'insight' ? 'Insight' : 'Note';
  ctx.fillText(typeLabel, n.x + n.w - 8, n.y + n.h - 8);
  ctx.textAlign = 'left';

  ctx.restore(); // end clip

  ctx.restore();
}
