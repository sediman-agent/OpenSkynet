/**
 * Snapshot Constants
 * Constants for page snapshot generation
 */

/**
 * Interactive HTML tags
 */
export const INTERACTIVE_TAGS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'details', 'summary',
  'option', 'optgroup', 'fieldset', 'label', 'output', 'iframe', 'frame',
  'video', 'audio',
]);

/**
 * Interactive ARIA roles
 */
export const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'combobox', 'checkbox', 'radio',
  'menuitem', 'tab', 'switch', 'slider', 'spinbutton', 'searchbox',
  'treeitem', 'option', 'menuitemcheckbox', 'menuitemradio',
  'listbox', 'gridcell', 'row', 'columnheader', 'rowheader',
]);

/**
 * Content-bearing tags
 */
export const CONTENT_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'p', 'li', 'td', 'th',
  'span', 'div', 'section', 'article', 'header', 'footer', 'nav', 'main',
  'pre', 'code', 'blockquote',
]);

/**
 * Tags to skip during traversal
 */
export const SKIP_TAGS = new Set([
  'style', 'script', 'noscript', 'svg', 'path', 'link', 'meta',
]);

/**
 * Tags to remove from text preview
 */
export const TEXT_PREVIEW_SKIP_TAGS = new Set([
  'script', 'style', 'noscript', 'svg', 'path', 'iframe', 'nav', 'footer', 'header',
]);

/**
 * Snapshot limits
 */
export const SNAPSHOT_LIMITS = {
  MAX_ELEMENTS: 300,
  MAX_TEXT_PREVIEW: 3000,
  MAX_ATTR_LENGTH: 60,
  MAX_TEXT_LENGTH: 200,
  MAX_DIRECT_TEXT: 150,
  MAX_SHORT_TEXT: 20,
} as const;

/**
 * Attributes to include in snapshot
 */
export const SNAPSHOT_ATTRIBUTES = [
  'id',
  'type',
  'placeholder',
  'aria-label',
  'role',
  'href',
  'value',
  'name',
  'title',
  'alt',
  'src',
] as const;

/**
 * Button-like class patterns
 */
export const BUTTON_CLASS_PATTERNS = [
  '\\bbtn\\b',
  '\\bbutton\\b',
] as const;

/**
 * Data attribute patterns for interactivity
 */
export const INTERACTIVE_DATA_ATTRIBUTES = [
  'data-action',
  'data-click',
  'ng-click',
  'onclick',
] as const;

/**
 * Generate constants JavaScript code
 */
export function generateConstantsJS(): string {
  const interactiveTagsArray = Array.from(INTERACTIVE_TAGS);
  const interactiveRolesArray = Array.from(INTERACTIVE_ROLES);
  const contentTagsArray = Array.from(CONTENT_TAGS);
  const skipTagsArray = Array.from(SKIP_TAGS);

  return `
const MAX_ELEMENTS = ${SNAPSHOT_LIMITS.MAX_ELEMENTS};
const MAX_TEXT_PREVIEW = ${SNAPSHOT_LIMITS.MAX_TEXT_PREVIEW};

const interactiveTags = new Set([
  ${interactiveTagsArray.map(t => `'${t}'`).join(', ')}
]);

const interactiveRoles = new Set([
  ${interactiveRolesArray.map(r => `'${r}'`).join(', ')}
]);

const contentTags = new Set([
  ${contentTagsArray.map(t => `'${t}'`).join(', ')}
]);

const skipTags = new Set([
  ${skipTagsArray.map(t => `'${t}'`).join(', ')}
]);
`.trim();
}
