/**
 * Statistics Collector
 * Functions for collecting page statistics
 */

/**
 * Generate statistics collector JavaScript code
 */
export function generateStatisticsJS(): string {
  return `
function collectStats(el, stats) {
  stats.total++;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a' && el.getAttribute('href')) stats.links++;
  if (tag === 'iframe' || tag === 'frame') stats.iframes++;
  if (tag === 'img') stats.images++;
  if (isInteractive(el)) stats.interactive++;
  for (const child of el.childNodes) {
    if (child.nodeType === 3) stats.textChars += (child.textContent || '').trim().length;
  }
  // Check shadow root
  if (el.shadowRoot) {
    if (el.shadowRoot.mode === 'closed') stats.shadowClosed++;
    else stats.shadowOpen++;
  }
}

function formatStats(stats) {
  let parts = [];
  if (stats.total < 10) {
    parts.push('Page appears empty (SPA not loaded?) - ');
  }
  parts.push(stats.links + ' links');
  parts.push(stats.interactive + ' interactive');
  parts.push(stats.iframes + ' iframes');
  if (stats.shadowOpen > 0 || stats.shadowClosed > 0) {
    parts.push(stats.shadowOpen + ' shadow(open), ' + stats.shadowClosed + ' shadow(closed)');
  }
  parts.push(stats.images + ' images');
  parts.push(stats.total + ' total elements');
  parts.push(stats.textChars + ' text chars');
  return parts.join(', ');
}
`.trim();
}
