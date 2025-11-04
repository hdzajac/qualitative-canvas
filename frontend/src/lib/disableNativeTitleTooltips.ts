// Installs early, global suppression of native title tooltips (Opera/Chromium/others)
// Strategy:
// - pointerover (capture): synchronously remove `title` from the hovered element or its closest ancestor.
// - pointerout (capture): restore the cached title if truly leaving the element (not entering a child).
// - focusin/focusout (capture): do the same for keyboard focus.
//
// We cache into a custom attribute `data-qt-title` to avoid clobbering other data-* usage.
// Attach once on module import and guard against double registration.

(function installOnce() {
  if (typeof document === 'undefined') return;
  const flag = '__qt_tooltip_suppressed__';
  const docAny = document as unknown as Record<string, unknown>;
  if (docAny[flag]) return; // already installed
  docAny[flag] = true;

  const cacheAttr = 'data-qt-title';

  const stripTitle = (el: Element | null) => {
    if (!el) return;
    const t = el.getAttribute('title');
    if (t !== null) {
      el.setAttribute(cacheAttr, t);
      el.removeAttribute('title');
    }
  };

  const restoreTitle = (el: Element | null) => {
    if (!el) return;
    const t = el.getAttribute(cacheAttr);
    if (t !== null) {
      el.setAttribute('title', t);
      el.removeAttribute(cacheAttr);
    }
  };

  const onPointerOver = (e: Event) => {
    const target = e.target as Element | null;
    if (!target) return;
    const el = target.closest('[title]');
    if (el) stripTitle(el);
  };

  const onPointerOut = (e: PointerEvent) => {
    const target = e.target as Element | null;
    if (!target) return;
    // If moving into a descendant of the same element, don't restore yet.
    const elWithCache = target.closest('[data-qt-title]');
    if (!elWithCache) return;
    const rt = e.relatedTarget as Element | null;
    if (rt && elWithCache.contains(rt)) return;
    restoreTitle(elWithCache);
  };

  const onFocusIn = (e: FocusEvent) => {
    const target = e.target as Element | null;
    if (!target) return;
    const el = target.closest('[title]');
    if (el) stripTitle(el);
  };

  const onFocusOut = (e: FocusEvent) => {
    const target = e.target as Element | null;
    if (!target) return;
    const el = target.closest('[data-qt-title]');
    if (el) restoreTitle(el);
  };

  document.addEventListener('pointerover', onPointerOver, true);
  document.addEventListener('pointerout', onPointerOut, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
})();
