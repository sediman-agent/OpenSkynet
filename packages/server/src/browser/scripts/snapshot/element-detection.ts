/**
 * Element Detection
 * Functions for detecting element properties (interactive, visible, etc.)
 */

/**
 * Generate element detection JavaScript code
 */
export function generateElementDetectionJS(): string {
  return `
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

function isTextNode(tag) {
  return ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'span'].includes(tag);
}

function isCssOrJsText(s) {
  if (!s) return false;
  s = s.trim();
  if (/^[.#@][\\w-]/.test(s) && /\\{/.test(s)) return true;
  if (/^(var|let|const|function |if |for |while |return |this\\.|window\\.|document\\.|\\(function|try\\s*\\{)/.test(s)) return true;
  if (s.startsWith('{') && s.endsWith('}') && s.length > 30) return true;
  return false;
}
`.trim();
}

/**
 * Generate element info extraction code
 */
export function generateElementInfoJS(): string {
  return `
function getElementInfo(el, refId, isNew) {
  const tag = el.tagName.toLowerCase();
  const r = el.getBoundingClientRect();

  return {
    refId,
    tag,
    isNew,
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
    boundingBox: {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height)
    }
  };
}

function getDirectText(el) {
  let text = '';
  for (const child of el.childNodes) {
    if (child.nodeType === 3) text += child.textContent;
  }
  return text.replace(/\\s+/g, ' ').trim().slice(0, 200);
}
`.trim();
}
