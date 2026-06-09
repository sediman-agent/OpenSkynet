/**
 * Tag Builder
 * Functions for building tag representations in snapshot output
 */

/**
 * Generate tag builder JavaScript code
 */
export function generateTagBuilderJS(): string {
  return `
function buildTag(el, refId, isNew) {
  const tag = el.tagName.toLowerCase();
  let attrs = [];
  let text = '';

  // Build attributes
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

  // Get direct text content
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
`.trim();
}
