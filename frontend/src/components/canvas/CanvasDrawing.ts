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

function truncateWithEllipsis(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ell = '…';
  const ellW = ctx.measureText(ell).width;
  let lo = 0, hi = text.length;
  // binary search for max chars that fit
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const candidate = text.slice(0, mid);
    if (ctx.measureText(candidate).width + ellW <= maxWidth) lo = mid; else hi = mid - 1;
  }
  return text.slice(0, lo) + ell;
}

export function drawNode(
  ctx: CanvasRenderingContext2D,
  n: NodeView,
  selectedCodeIds: string[],
  selectedThemeIds: string[],
  getFontSize: (n: NodeView) => number,
  getBottomRightLabel?: (n: NodeView) => string,
  getLabelScroll?: (n: NodeView) => number,
  options?: { showHandle?: boolean; highlightAsTarget?: boolean }
) {
  // Annotations are rendered as HTML textfields, not drawn on canvas.
  if (n.kind === 'annotation') {
    return;
  }
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
  }

  // Bottom-right label: document filename(s) with ellipsis or scroll on hover
  if (getBottomRightLabel) {
    const raw = getBottomRightLabel(n) || '';
    if (raw) {
      const labelRectX = n.x + 12;
      const labelRectY = n.y + n.h - 8; // baseline
      const labelMaxW = Math.max(0, n.w - 24);
      ctx.fillStyle = '#9ca3af';
      ctx.font = '11px ui-sans-serif, system-ui, -apple-system';
      ctx.textAlign = 'left';
      // Clip to label line area to avoid overflow
      ctx.save();
      ctx.beginPath();
      ctx.rect(n.x + 8, n.y + n.h - 18, Math.max(0, n.w - 16), 14);
      ctx.clip();

      const scroll = getLabelScroll ? (getLabelScroll(n) || 0) : 0;
      if (scroll > 0) {
        ctx.fillText(raw, labelRectX - scroll, labelRectY);
      } else {
        const display = truncateWithEllipsis(ctx, raw, labelMaxW);
        ctx.fillText(display, labelRectX, labelRectY);
      }
      ctx.restore();
    }
  }

  ctx.restore(); // end clip

  // Optional: small connect handle on the right side for code and theme nodes (only when requested)
  if (options?.showHandle && (n.kind === 'code' || n.kind === 'theme')) {
    const cx = n.x + n.w - 8;
    const cy = n.y + n.h / 2;
    ctx.save();
    ctx.globalAlpha = 0.7;
    // subtle: white fill, accent stroke
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = (n.kind === 'code') ? '#2563eb' : '#10b981';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Optional: highlight node as a potential connect target
  if (options?.highlightAsTarget) {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 3]);
    roundRect(ctx, n.x, n.y, n.w, n.h, radius);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}
