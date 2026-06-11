/**
 * Element Metadata Module
 * Handles element metadata extraction and computation
 */

import type { Page } from 'playwright';
import type { AXNode } from '../controller';
import { createLogger } from '../../core/logging';

const logger = createLogger('element-metadata');

/**
 * Generate XPath for accessibility node
 */
export function generateXPath(node: AXNode, parentPath: string[] = []): string {
  const parts: string[] = [];

  // Add role-based selector
  if (node.role) {
    if (node.name) {
      parts.push(`//${node.role}[@name="${node.name}"]`);
    } else {
      parts.push(`//${node.role}`);
    }
  }

  // Add parent path
  if (parentPath.length > 0) {
    const parentSelector = parentPath.join('/');
    if (parts.length > 0) {
      return `${parentSelector}/${parts.join('/')}`;
    }
    return parentSelector + (parts.length > 0 ? `/${parts[0]}` : '');
  }

  return parts.join('/') || '//*';
}

/**
 * Extract attributes from accessibility node
 */
export function extractAttributes(node: AXNode): Record<string, string> {
  const attrs: Record<string, string> = {};

  // Standard attributes
  if (node.name) attrs.name = node.name;
  if (node.description) attrs.description = node.description;
  if (node.value) attrs.value = node.value;
  if (node.placeholder) attrs.placeholder = node.placeholder;
  if (node.checked !== undefined) attrs.checked = String(node.checked);
  if (node.disabled) attrs.disabled = 'true';
  if (node.required) attrs.required = 'true';
  if (node.readonly) attrs.readonly = 'true';
  if (node.multiline) attrs.multiline = 'true';
  if (node.selected) attrs.selected = 'true';
  if (node.expanded) attrs.expanded = 'true';

  // Custom attributes
  if (node.attributes) {
    for (const [key, value] of Object.entries(node.attributes)) {
      attrs[key] = value;
    }
  }

  return attrs;
}

/**
 * Get bounding box for element
 */
export async function getBoundingBox(page: Page, xpath: string): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  try {
    const box = await page.evaluate((xpathToFind: string) => {
      const element = document.evaluate(xpathToFind);
      if (!element || !(element instanceof HTMLElement)) {
        return null;
      }

      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        width: rect.width,
        height: rect.height
      };
    }, xpath);

    return box;
  } catch (error) {
    logger.warn({ error, xpath }, 'Failed to get bounding box');
    return null;
  }
}

/**
 * Check if element is visible in viewport
 */
export async function isElementVisible(page: Page, xpath: string): Promise<boolean> {
  try {
    const isVisible = await page.evaluate((xpathToFind: string) => {
      const element = document.evaluate(xpathToFind);
      if (!element || !(element instanceof HTMLElement)) {
        return false;
      }

      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return false;
      }

      // Check if in viewport
      const isInViewport = (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= window.innerHeight &&
        rect.right <= window.innerWidth
      );

      return isInViewport;
    }, xpath);

    return isVisible;
  } catch (error) {
    logger.warn({ error, xpath }, 'Failed to check element visibility');
    return false;
  }
}

/**
 * Check if element is interactable
 */
export function isElementInteractable(node: AXNode): boolean {
  // Not interactable if disabled
  if (node.disabled) return false;

  // Not interactable if readonly
  if (node.readonly) return false;

  // Not interactable if hidden
  if (node.hidden) return false;

  // Check role-specific constraints
  if (node.role === 'gridcell' && node.disabled) return false;

  return true;
}

/**
 * Calculate element hash for change detection
 */
export function hashElement(node: AXNode): string {
  const parts: string[] = [];

  // Hash role and name
  parts.push(node.role);
  if (node.name) parts.push(node.name);

  // Hash key attributes
  const attrs = Object.keys(node.attributes || {}).sort();
  parts.push(...attrs);

  // Hash value for form elements
  if (node.value) {
    parts.push(node.value.slice(0, 50)); // Only hash first 50 chars
  }

  return parts.join(':');
}

/**
 * Calculate element hash from InteractiveElement
 */
export function hashElementFromElement(el: any): string {
  const parts: string[] = [];

  parts.push(el.tag || 'div');
  parts.push(el.role || 'region');
  parts.push(el.text?.slice(0, 50) || '');
  parts.push(el.placeholder?.slice(0, 50) || '');
  parts.push(el.value?.slice(0, 50) || '');

  return parts.join(':');
}
