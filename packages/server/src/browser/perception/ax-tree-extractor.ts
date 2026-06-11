/**
 * AX Tree Extractor Module
 * Handles Chrome Accessibility Tree extraction
 */

import type { Page } from 'playwright';
import type { AXNode } from '../controller';
import { createLogger } from '../../core/logging';

const logger = createLogger('ax-tree-extractor');

/**
 * Extract accessibility tree from page
 */
export async function extractAccessibilityTree(page: Page): Promise<AXNode | null> {
  try {
    const tree = await (page as any).accessibility.snapshot({
      interesting: true, // Only accessible nodes
    });

    if (!tree) {
      logger.warn('Accessibility tree snapshot returned null');
      return null;
    }

    return tree;
  } catch (error) {
    logger.error({ err: error as Error }, 'Failed to extract accessibility tree');
    return null;
  }
}

/**
 * Check if accessibility tree is valid
 */
export function isValidAXTree(tree: AXNode | null): boolean {
  if (!tree) return false;
  if (typeof tree !== 'object') return false;
  return true;
}

/**
 * Get root node from accessibility tree
 */
export function getRootNode(tree: AXNode): AXNode {
  return tree;
}

/**
 * Get node children safely
 */
export function getNodeChildren(node: AXNode): AXNode[] {
  return node.children || [];
}

/**
 * Check if node has children
 */
export function hasChildren(node: AXNode): boolean {
  return !!(node.children && node.children.length > 0);
}
