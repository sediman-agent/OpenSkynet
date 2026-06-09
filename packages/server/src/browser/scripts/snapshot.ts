/**
 * Page Snapshot Script - Simplified
 *
 * Refactored from 337 lines to ~80 lines
 * Constants extracted to snapshot/constants.ts
 * Element detection extracted to snapshot/element-detection.ts
 * Tag builder extracted to snapshot/tag-builder.ts
 * Statistics extracted to snapshot/statistics.ts
 * Scroll context extracted to snapshot/scroll-context.ts
 * DOM walker extracted to snapshot/dom-walker.ts
 * Output builder extracted to snapshot/output-builder.ts
 */

import { generateConstantsJS } from './snapshot/constants.js';
import { generateElementDetectionJS } from './snapshot/element-detection.js';
import { generateTagBuilderJS } from './snapshot/tag-builder.js';
import { generateStatisticsJS } from './snapshot/statistics.js';
import { generateScrollContextJS } from './snapshot/scroll-context.js';
import { generateDOMWalkerJS } from './snapshot/dom-walker.js';
import { generateOutputBuilderJS } from './snapshot/output-builder.js';

/**
 * Assembles the complete snapshot script from modules
 */
export function assembleSnapshotScript(): string {
  return `
(() => {
  ${generateConstantsJS()}

  let counter = 0;
  let elementsArray = [];
  let outputLines = [];

  ${generateElementDetectionJS()}

  ${generateTagBuilderJS()}

  ${generateStatisticsJS()}

  ${generateScrollContextJS()}

  ${generateDOMWalkerJS()}

  ${generateOutputBuilderJS()}

  // Main execution
  const prevRefIds = new Set();
  document.querySelectorAll('[data-sediman-ref-id]').forEach(el => {
    prevRefIds.add(el.getAttribute('data-sediman-ref-id'));
  });

  // Clear existing markers
  document.querySelectorAll('[data-sediman-ref-id]').forEach(el => {
    el.removeAttribute('data-sediman-ref-id');
  });

  // Initialize statistics
  let stats = {
    links: 0,
    interactive: 0,
    iframes: 0,
    images: 0,
    total: 0,
    textChars: 0,
    shadowOpen: 0,
    shadowClosed: 0
  };

  // Start walking from body
  if (document.body) {
    for (const child of document.body.children) {
      walkDOM(child, 0, elementsArray, outputLines, prevRefIds, stats);
    }
  }

  // Get scroll context
  const scrollCtx = getScrollContext();

  // Build text preview
  const textPreview = buildTextPreview();

  // Build final output
  const output = buildOutput(outputLines, elementsArray, stats, scrollCtx, textPreview);

  // Return result
  return buildReturnObject(output, textPreview, elementsArray, scrollCtx);
})();
`.trim();
}

/**
 * Complete snapshot script (for backward compatibility)
 */
export const SNAPSHOT_JS = `
(() => {
  const MAX_ELEMENTS = 300;
  const MAX_TEXT_PREVIEW = 3000;

  let counter = 0;
  let elementsArray = [];
  let outputLines = [];

  const interactiveTags = new Set([
    'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
    'option', 'optgroup', 'fieldset', 'label', 'output', 'iframe', 'frame',
    'video', 'audio',
  ]);

  const interactiveRoles = new Set([
    'button', 'link', 'textbox', 'combobox', 'checkbox', 'radio',
    'menuitem', 'tab', 'switch', 'slider', 'spinbutton', 'searchbox',
    'treeitem', 'option', 'menuitemcheckbox', 'menuitemradio',
    'listbox', 'gridcell', 'row', 'columnheader', 'rowheader',
  ]);

  const contentTags = new Set([
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'p', 'li', 'td', 'th',
    'span', 'div', 'section', 'article', 'header', 'footer', 'nav', 'main',
    'pre', 'code', 'blockquote',
  ]);

  function isInteractive(el) {
    const tag = el.tagName.toLowerCase();
    if (interactiveTags.has(tag)) {
      if (tag === 'a' && !el.getAttribute('href')) return false;
      return true;
    }
    const role = el.getAttribute('role');
    if (role && interactiveRoles.has(role.toLowerCase())) return true;
    if (el.getAttribute('contenteditable') === 'true') return true;
    const tabindex = el.getAttribute('tabindex');
    if (tabindex !== null && tabindex !== '-1') return true;
    if (el.getAttribute('onclick') || el.getAttribute('ng-click')) return true;
    if (el.getAttribute('data-action') || el.getAttribute('data-click')) return true;
    const classes = (el.getAttribute('class') || '').toLowerCase();
    if (/\\bbtn\\b|\\bbutton\\b/.test(classes)) return true;
    return false;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
    return true;
  }

  function buildTag(el, refId, isNew) {
    const tag = el.tagName.toLowerCase();
    let attrs = [];
    let text = '';

    if (el.id) attrs.push('id=' + el.id.slice(0, 40));
    if (el.getAttribute('type')) attrs.push('type=' + el.getAttribute('type'));
    if (el.getAttribute('placeholder')) attrs.push('placeholder=' + JSON.stringify(el.getAttribute('placeholder').slice(0, 60)));
    if (el.getAttribute('aria-label')) attrs.push('aria-label=' + JSON.stringify(el.getAttribute('aria-label').slice(0, 60)));
    if (el.getAttribute('role')) attrs.push('role=' + el.getAttribute('role'));
    if (el.getAttribute('href')) attrs.push('href=' + JSON.stringify(el.getAttribute('href').slice(0, 60)));
    if (el.getAttribute('value')) attrs.push('value=' + JSON.stringify(el.getAttribute('value').slice(0, 40)));
    if (el.getAttribute('name')) attrs.push('name=' + JSON.stringify(el.getAttribute('name').slice(0, 40)));
    if (el.getAttribute('title')) attrs.push('title=' + JSON.stringify(el.getAttribute('title').slice(0, 40)));
    if (el.getAttribute('alt')) attrs.push('alt=' + JSON.stringify(el.getAttribute('alt').slice(0, 40)));
    if (el.getAttribute('src')) attrs.push('src=' + JSON.stringify(el.getAttribute('src').slice(0, 60)));

    if (tag === 'input' && !el.getAttribute('type')) attrs.push('type=text');

    for (const child of el.childNodes) {
      if (child.nodeType === 3) {
        text += child.textContent;
      }
    }
    text = text.replace(/\\s+/g, ' ').trim().slice(0, 120);
    if (text) attrs.push('text=' + JSON.stringify(text));

    const prefix = isNew ? '*' : '';
    const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
    return prefix + '[' + refId + ']<' + tag + attrStr + ' />';
  }

  function getDirectText(el) {
    let text = '';
    for (const child of el.childNodes) {
      if (child.nodeType === 3) text += child.textContent;
    }
    return text.replace(/\\s+/g, ' ').trim().slice(0, 200);
  }

  function isCssOrJsText(s) {
    if (!s) return false;
    s = s.trim();
    if (/^[.#@][\\w-]/.test(s) && /\\{/.test(s)) return true;
    if (/^(var|let|const|function |if |for |while |return |this\\.|window\\.|document\\.|\\(function|try\\s*\\{)/.test(s)) return true;
    if (s.startsWith('{') && s.endsWith('}') && s.length > 30) return true;
    return false;
  }

  function buildContentLine(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'img') {
      const alt = el.getAttribute('alt') || '';
      const src = (el.getAttribute('src') || '').slice(0, 60);
      return '<img alt=' + JSON.stringify(alt.slice(0, 60)) + ' src=' + JSON.stringify(src) + ' />';
    }
    if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
      const t = getDirectText(el);
      if (isCssOrJsText(t)) return '';
      return '<' + tag + '>' + (t || el.textContent?.replace(/\\s+/g, ' ').trim().slice(0, 200) || '') + '</' + tag + '>';
    }
    const t = getDirectText(el);
    if (!t || isCssOrJsText(t)) return '';
    if (isInteractive(el)) return '';
    return t;
  }

  const prevRefIds = new Set();
  document.querySelectorAll('[data-sediman-ref-id]').forEach(el => {
    prevRefIds.add(el.getAttribute('data-sediman-ref-id'));
  });

  document.querySelectorAll('[data-sediman-ref-id]').forEach(el => {
    el.removeAttribute('data-sediman-ref-id');
  });

  let stats = { links: 0, interactive: 0, iframes: 0, images: 0, total: 0, textChars: 0 };
  let shadowOpen = 0;
  let shadowClosed = 0;

  function collectStats(el) {
    stats.total++;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' && el.getAttribute('href')) stats.links++;
    if (tag === 'iframe' || tag === 'frame') stats.iframes++;
    if (tag === 'img') stats.images++;
    if (isInteractive(el)) stats.interactive++;
    for (const child of el.childNodes) {
      if (child.nodeType === 3) stats.textChars += (child.textContent || '').trim().length;
    }
    if (el.shadowRoot) {
      if (el.shadowRoot.mode === 'closed') shadowClosed++;
      else shadowOpen++;
    }
  }

  function walkDOM(el, depth) {
    if (elementsArray.length >= MAX_ELEMENTS) return;
    if (el.nodeType !== 1) return;
    if (!isVisible(el)) return;

    const tag = el.tagName.toLowerCase();

    if (tag === 'style' || tag === 'script' || tag === 'noscript' || tag === 'svg' || tag === 'path' || tag === 'link' || tag === 'meta') return;

    collectStats(el);
    const isInter = isInteractive(el);
    const isContent = contentTags.has(tag);
    const isTextNode = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'span'].includes(tag);

    if (!isInter && !isContent && !isTextNode) {
      for (const child of el.children) {
        walkDOM(child, depth);
      }
      return;
    }

    if (isInter) {
      const refId = counter++;
      el.setAttribute('data-sediman-ref-id', String(refId));
      const isNew = !prevRefIds.has(String(refId));

      elementsArray.push({
        refId, tag, isNew,
        text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 200),
        role: el.getAttribute('role') || '',
        placeholder: el.getAttribute('placeholder') || '',
        href: el.getAttribute('href') || '',
        src: el.getAttribute('src') || '',
        alt: el.getAttribute('alt') || '',
        type: el.getAttribute('type') || '',
        value: (el.value || el.getAttribute('value') || '').slice(0, 100),
        ariaLabel: el.getAttribute('aria-label') || '',
        title: el.getAttribute('title') || '',
        name: el.getAttribute('name') || '',
        boundingBox: (() => {
          const r = el.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
        })(),
      });

      const indent = '\\t'.repeat(depth);
      const line = indent + buildTag(el, refId, isNew);
      outputLines.push({ line, depth });

      let directText = '';
      for (const child of el.childNodes) {
        if (child.nodeType === 3) directText += child.textContent;
      }
      directText = directText.replace(/\\s+/g, ' ').trim().slice(0, 150);
      if (directText && directText.length > 20) {
        outputLines.push({ line: indent + '\\t' + directText, depth: depth + 1 });
      }

      if (el.shadowRoot) {
        const shadowMode = el.shadowRoot.mode;
        outputLines.push({ line: indent + '\\t|SHADOW(' + shadowMode + ')|', depth: depth + 1 });
      }

      for (const child of el.children) {
        walkDOM(child, depth + 1);
      }
    } else {
      const line = buildContentLine(el);
      if (line) {
        const indent = '\\t'.repeat(depth);
        outputLines.push({ line: indent + line, depth });
      }
      for (const child of el.children) {
        walkDOM(child, depth);
      }
    }
  }

  if (document.body) {
    for (const child of document.body.children) {
      walkDOM(child, 0);
    }
  }

  const scrollEl = document.scrollingElement || document.documentElement;
  const scrollY = scrollEl.scrollTop || 0;
  const scrollX = scrollEl.scrollLeft || 0;
  const viewportH = window.innerHeight;
  const pageH = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  const pixelsAbove = scrollY;
  const pixelsBelow = Math.max(0, pageH - scrollY - viewportH);
  const pagesAbove = pixelsAbove / viewportH;
  const pagesBelow = pixelsBelow / viewportH;

  let output = '';

  output += '<page_stats>';
  if (stats.total < 10) {
    output += 'Page appears empty (SPA not loaded?) - ';
  }
  output += stats.links + ' links, ' + stats.interactive + ' interactive, ' + stats.iframes + ' iframes';
  if (shadowOpen > 0 || shadowClosed > 0) {
    output += ', ' + shadowOpen + ' shadow(open), ' + shadowClosed + ' shadow(closed)';
  }
  output += ', ' + stats.images + ' images';
  output += ', ' + stats.total + ' total elements';
  output += ', ' + stats.textChars + ' text chars';
  output += '</page_stats>\\n';

  output += '<page_info>';
  output += pagesAbove.toFixed(1) + ' pages above, ' + pagesBelow.toFixed(1) + ' pages below';
  if (pagesBelow > 0.2) {
    output += ' — scroll down to reveal more content';
  }
  output += '</page_info>\\n';

  const hasContentAbove = pagesAbove > 0;
  const hasContentBelow = pagesBelow > 0;

  output += '\\nInteractive elements:\\n';
  if (!hasContentAbove) output += '[Start of page]\\n';

  for (const item of outputLines) {
    output += item.line + '\\n';
  }

  if (!hasContentBelow) output += '[End of page]\\n';

  if (elementsArray.length >= MAX_ELEMENTS) {
    output += '\\n[Showing first ' + MAX_ELEMENTS + ' interactive elements — page has more]\\n';
  }

  let textPreview = '';
  try {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('script, style, noscript, svg, path, iframe, nav, footer, header').forEach(el => el.remove());
    textPreview = (clone.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, MAX_TEXT_PREVIEW);
  } catch(e) {}

  return {
    output,
    textPreview,
    elements: elementsArray,
    scrollPosition: { x: Math.round(scrollX), y: Math.round(scrollY) },
    viewport: { width: window.innerWidth, height: viewportH },
    pageSize: { width: pageH > 0 ? document.body.scrollWidth : 0, height: pageH },
    url: location.href,
    title: document.title,
    stats,
    pagesAbove,
    pagesBelow,
  };
})();
`;

// Re-export for backward compatibility
export default SNAPSHOT_JS;
