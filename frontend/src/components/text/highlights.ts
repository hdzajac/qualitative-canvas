import type { Highlight } from '@/types';

export const getCorrectedRange = (text: string, h: Highlight) => {
  const proposedStart = h.startOffset;
  const proposedEnd = h.endOffset;
  const target = h.text || '';
  if (!target) return { start: proposedStart, end: proposedEnd };

  const slice = text.slice(proposedStart, proposedEnd);
  if (slice === target) return { start: proposedStart, end: proposedEnd };

  // If trimmed slice matches, shift inwards by leading/trailing whitespace
  if (slice.trim() === target) {
    const lead = slice.length - slice.replace(/^\s+/, '').length;
    const trail = slice.length - slice.replace(/\s+$/, '').length;
    return { start: proposedStart + lead, end: proposedEnd - trail };
  }

  // Global fuzzy search: find occurrence closest to proposedStart
  if (target.length >= 3) {
    let from = 0;
    let bestIdx = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    while (from <= text.length - target.length) {
      const idx = text.indexOf(target, from);
      if (idx === -1) break;
      const dist = Math.abs(idx - proposedStart);
      if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
      from = idx + 1;
    }
    if (bestIdx !== -1) return { start: bestIdx, end: bestIdx + target.length };
  }

  // Fallback
  return { start: proposedStart, end: proposedEnd };
};
