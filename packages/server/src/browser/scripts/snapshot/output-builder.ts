/**
 * Output Builder
 * Functions for building the final snapshot output
 */

/**
 * Generate output builder JavaScript code
 */
export function generateOutputBuilderJS(): string {
  return `
function buildOutput(outputLines, elementsArray, stats, scrollCtx, textPreview) {
  let output = '';

  // Page statistics
  output += '<page_stats>';
  output += formatStats(stats);
  output += '</page_stats>\\n';

  // Scroll context
  output += '<page_info>';
  output += formatScrollInfo(scrollCtx);
  output += '</page_info>\\n';

  // Interactive elements
  output += '\\nInteractive elements:\\n';
  if (!scrollCtx.hasContentAbove) output += '[Start of page]\\n';

  for (const item of outputLines) {
    output += item.line + '\\n';
  }

  if (!scrollCtx.hasContentBelow) output += '[End of page]\\n';

  if (elementsArray.length >= MAX_ELEMENTS) {
    output += '\\n[Showing first ' + MAX_ELEMENTS + ' interactive elements — page has more]\\n';
  }

  return output;
}

function buildTextPreview() {
  let textPreview = '';
  try {
    const clone = document.body.cloneNode(true);
    const skipSelectors = ['script', 'style', 'noscript', 'svg', 'path', 'iframe', 'nav', 'footer', 'header'];
    clone.querySelectorAll(skipSelectors.join(',')).forEach(el => el.remove());
    textPreview = (clone.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, MAX_TEXT_PREVIEW);
  } catch(e) {}
  return textPreview;
}

function buildReturnObject(output, textPreview, elementsArray, scrollCtx) {
  return {
    output,
    textPreview,
    elements: elementsArray,
    scrollPosition: { x: scrollCtx.x, y: scrollCtx.y },
    viewport: { width: window.innerWidth, height: scrollCtx.viewportHeight },
    pageSize: { width: scrollCtx.pageHeight > 0 ? document.body.scrollWidth : 0, height: scrollCtx.pageHeight },
    url: location.href,
    title: document.title,
    stats,
    pagesAbove: scrollCtx.pagesAbove,
    pagesBelow: scrollCtx.pagesBelow,
  };
}
`.trim();
}
