/**
 * DOM Walker
 * Functions for walking the DOM and collecting elements
 */

/**
 * Generate DOM walker JavaScript code
 */
export function generateDOMWalkerJS(): string {
  return `
function walkDOM(el, depth, elementsArray, outputLines, prevRefIds, stats) {
  if (elementsArray.length >= MAX_ELEMENTS) return;
  if (el.nodeType !== 1) return; // Skip non-elements
  if (!isVisible(el)) return;

  const tag = el.tagName.toLowerCase();

  // Skip polluting elements
  if (skipTags.has(tag)) return;

  collectStats(el, stats);
  const isInter = isInteractive(el);
  const isContent = contentTags.has(tag);
  const isTextNode = isTextNode(tag);

  if (!isInter && !isContent && !isTextNode) {
    // Still walk children for non-content elements
    for (const child of el.children) {
      walkDOM(child, depth, elementsArray, outputLines, prevRefIds, stats);
    }
    return;
  }

  if (isInter) {
    const refId = counter++;
    el.setAttribute('data-sediman-ref-id', String(refId));
    const isNew = !prevRefIds.has(String(refId));

    elementsArray.push(getElementInfo(el, refId, isNew));

    const indent = '\\t'.repeat(depth);
    const line = indent + buildTag(el, refId, isNew);
    outputLines.push({ line, depth });

    // Show direct text content for interactive elements
    let directText = '';
    for (const child of el.childNodes) {
      if (child.nodeType === 3) directText += child.textContent;
    }
    directText = directText.replace(/\\s+/g, ' ').trim().slice(0, 150);
    if (directText && directText.length > 20) {
      outputLines.push({ line: indent + '\\t' + directText, depth: depth + 1 });
    }

    // Handle shadow DOM
    if (el.shadowRoot) {
      const shadowMode = el.shadowRoot.mode;
      outputLines.push({ line: indent + '\\t|SHADOW(' + shadowMode + ')|', depth: depth + 1 });
    }

    // Walk children with increased depth
    for (const child of el.children) {
      walkDOM(child, depth + 1, elementsArray, outputLines, prevRefIds, stats);
    }
  } else {
    // Content element - show text content and continue walking
    const line = buildContentLine(el);
    if (line) {
      const indent = '\\t'.repeat(depth);
      outputLines.push({ line: indent + line, depth });
    }
    for (const child of el.children) {
      walkDOM(child, depth, elementsArray, outputLines, prevRefIds, stats);
    }
  }
}
`.trim();
}
