/**
 * Scroll Context
 * Functions for calculating scroll position and page context
 */

/**
 * Generate scroll context JavaScript code
 */
export function generateScrollContextJS(): string {
  return `
function getScrollContext() {
  const scrollEl = document.scrollingElement || document.documentElement;
  const scrollY = scrollEl.scrollTop || 0;
  const scrollX = scrollEl.scrollLeft || 0;
  const viewportH = window.innerHeight;
  const pageH = Math.max(
    document.body.scrollHeight,
    document.documentElement.scrollHeight
  );
  const pixelsAbove = scrollY;
  const pixelsBelow = Math.max(0, pageH - scrollY - viewportH);
  const pagesAbove = pixelsAbove / viewportH;
  const pagesBelow = pixelsBelow / viewportH;

  return {
    x: Math.round(scrollX),
    y: Math.round(scrollY),
    pagesAbove,
    pagesBelow,
    pixelsAbove,
    pixelsBelow,
    viewportHeight: viewportH,
    pageHeight: pageH,
    hasContentAbove: pagesAbove > 0,
    hasContentBelow: pagesBelow > 0
  };
}

function formatScrollInfo(ctx) {
  let info = ctx.pagesAbove.toFixed(1) + ' pages above, ' + ctx.pagesBelow.toFixed(1) + ' pages below';
  if (ctx.pagesBelow > 0.2) {
    info += ' — scroll down to reveal more content';
  }
  return info;
}
`.trim();
}
