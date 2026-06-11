/**
 * Element Classifier Module
 * Handles element type detection and classification
 */

import type { AXNode } from '../controller';
import { createLogger } from '../../core/logging';

const logger = createLogger('element-classifier');

/**
 * Interactive roles that should be extracted
 */
export const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'spinbutton',
  'slider',
  'checkbox',
  'radio',
  'switch',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'tabpanel',
  'treeitem',
  'gridcell',
  'columnheader',
  'rowheader',
  'cell',
  'row',
  'grid',
  'table',
  'feed',
  'article',
  'log',
  'main',
  'navigation',
  'banner',
  'contentinfo',
  'region',
  'form',
  'alert',
  'alertdialog',
  'dialog',
  'status',
  'progressbar',
  'progressbar',
  'scrollbar',
  'separator',
  'tooltip'
]);

/**
 * Check if a role is interactive
 */
export function isInteractiveRole(role: string): boolean {
  return INTERACTIVE_ROLES.has(role.toLowerCase()) || INTERACTIVE_ROLES.has(role);
}

/**
 * Check if node should be included based on visibility
 */
export function shouldIncludeNode(
  node: AXNode,
  options: {
    includeInvisible?: boolean;
    includeDisabled?: boolean;
  } = {}
): boolean {
  const { includeInvisible = true, includeDisabled = true } = options;

  // Skip disabled if not including them
  if (!includeDisabled && node.disabled) {
    return false;
  }

  // Check visibility (has name/description/value = visible to accessibility)
  const isVisible = !!(node.name || node.description || node.value);
  if (!includeInvisible && !isVisible) {
    return false;
  }

  return true;
}

/**
 * Determine element tag from role and attributes
 */
export function inferTagFromRole(role: string): string {
  const roleLower = role.toLowerCase();

  const tagMap: Record<string, string> = {
    'textbox': 'input',
    'searchbox': 'input',
    'combobox': 'select',
    'listbox': 'select',
    'checkbox': 'input',
    'radio': 'input',
    'spinbutton': 'input',
    'slider': 'input',
    'link': 'a',
    'button': 'button',
    'submit': 'button',
    'reset': 'button',
    'tab': 'a',
    'search': 'input[type="search"]'
  };

  return tagMap[roleLower] || 'div';
}

/**
 * Extract element type from role
 */
export function getElementType(role: string, node: AXNode): string {
  if (role === 'textbox' || role === 'searchbox') {
    if (node.attributes?.type) {
      return `input[type="${node.attributes.type}"]`;
    }
    return 'input';
  }

  if (role === 'checkbox') {
    return 'input[type="checkbox"]';
  }

  if (role === 'radio') {
    return 'input[type="radio"]';
  }

  return inferTagFromRole(role);
}

/**
 * Extract text content from node
 */
export function extractNodeText(node: AXNode): string {
  const parts: string[] = [];

  if (node.name) {
    parts.push(node.name);
  }

  if (node.value) {
    parts.push(node.value);
  }

  if (node.description) {
    parts.push(node.description);
  }

  // Prefer value over name for form elements
  if (node.role === 'textbox' || node.role === 'searchbox') {
    return node.value || node.name || node.placeholder || '';
  }

  return parts.join(' ') || '';
}

/**
 * Get element href from node
 */
export function extractHref(node: AXNode): string | undefined {
  if (node.attributes?.href) {
    return node.attributes.href;
  }

  // Check if node is a link
  if (node.role === 'link' && node.name) {
    // Might be URL in name
    if (node.name.startsWith('http')) {
      return node.name;
    }
  }

  return undefined;
}
