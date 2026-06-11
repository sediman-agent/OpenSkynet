/**
 * Accessibility Tree Extractor
 *
 * Replaces full DOM dumps with smart, token-efficient element extraction
 * Uses Chrome Accessibility Tree via CDP for 90%+ token reduction
 *
 * @module browser/perception/ax-extractor
 */

import type { Page } from 'playwright';
import type { AXNode, ElementMetadata, InteractiveElement, PageState } from '../controller';
import { createLogger } from '../../core/logging';

const logger = createLogger('ax-extractor');

// Import from refactored modules
import {
  extractAccessibilityTree,
  getRootNode,
  getNodeChildren
} from './ax-tree-extractor';
import {
  isInteractiveRole,
  shouldIncludeNode,
  getElementType,
  extractNodeText,
  extractHref,
  inferTagFromRole
} from './element-classifier';
import {
  getScrollInfo
} from './scroll-info';
import {
  generateXPath,
  extractAttributes,
  getBoundingBox,
  isElementVisible,
  isElementInteractable,
  hashElement,
  hashElementFromElement
} from './element-metadata';

// ============================================================================
// Main Extractor Class
// ============================================================================

export class AccessibilityTreeExtractor {
  private previousElementHashes: Set<string> = new Set();
  private previousRefIds: Map<string, number> = new Map();
  private nextRefId = 0;

  /**
   * Extract interactive elements from page with change detection
   */
  async extractInteractiveElements(
    page: Page,
    options: {
      maxDepth?: number;
      includeDisabled?: boolean;
      includeInvisible?: boolean;
    } = {}
  ): Promise<PageState> {
    const {
      maxDepth = 50,
      includeDisabled = true,
      includeInvisible = true
    } = options;

    const url = page.url();
    const title = await page.title().catch(() => 'Unknown');
    const scrollInfo = await getScrollInfo(page);

    const currentHashes = new Set<string>();
    const elements: InteractiveElement[] = [];
    let viewportIndex = 0;

    const axTree = await extractAccessibilityTree(page);

    if (axTree) {
      let totalNodes = 0;
      let interactiveNodes = 0;

      // Process accessibility tree
      const processNode = async (
        node: AXNode,
        depth: number,
        parentPath: string[] = []
      ): Promise<void> => {
        totalNodes++;

        // Check depth limit
        if (depth > maxDepth) return;

        const roleLower = node.role.toLowerCase();
        const isInteractive = isInteractiveRole(roleLower) ||
                             isInteractiveRole(node.role);

        if (!isInteractive) {
          // Still process children if present
          if (node.children) {
            for (const child of node.children) {
              await processNode(child, depth + 1, [...parentPath, node.role]);
            }
          }
          return;
        }

        // Check if node should be included
        if (!shouldIncludeNode(node, { includeInvisible, includeDisabled })) {
          if (node.children) {
            for (const child of node.children) {
              await processNode(child, depth + 1, [...parentPath, node.role]);
            }
          }
          return;
        }

        interactiveNodes++;

        // Compute element hash
        const elementHash = hashElement(node);
        currentHashes.add(elementHash);

        // Determine if this is a new element
        const isNew = !this.previousElementHashes.has(elementHash);

        // Generate XPath
        const xpath = generateXPath(node, parentPath);

        // Get bounding box (lazy loading for performance)
        let boundingBox: ElementMetadata['boundingBox'] | undefined;
        try {
          const box = await getBoundingBox(page, xpath);
          if (box) {
            boundingBox = box;
          }
        } catch (error) {
          // Bounding box extraction is optional
        }

        // Extract attributes
        const attributes = extractAttributes(node);

        // Extract text content
        const text = extractNodeText(node);

        // Extract href if available
        const href = extractHref(node);

        // Get refId (allocate new or reuse)
        let refId: number;
        const refIdKey = `${xpath}:${text}`;
        if (this.previousRefIds.has(refIdKey)) {
          refId = this.previousRefIds.get(refIdKey)!;
        } else {
          refId = this.nextRefId++;
        }

        // Create interactive element
        const element: InteractiveElement = {
          refId,
          tag: getElementType(node.role, node),
          role: node.role,
          text: text || '',
          placeholder: node.placeholder,
          value: node.value,
          ariaLabel: node.name || node.description,
          href: href,
          isNew,
          isHighlighted: isNew,
          position: {
            index: elements.length,
            viewportIndex: boundingBox ? this.calculateViewportIndex(boundingBox) : -1
          },
          metadata: {
            id: refId,
            tag: getElementType(node.role, node),
            text: text || '',
            xpath,
            boundingBox,
            isVisible: boundingBox ? await isElementVisible(page, xpath) : true,
            isInteractable: isElementInteractable(node),
            attributes,
            hash: elementHash
          }
        };

        elements.push(element);

        // Update viewport index
        if (boundingBox && element.metadata?.isVisible) {
          viewportIndex++;
        }

        // Process children
        if (node.children) {
          for (const child of node.children) {
            await processNode(child, depth + 1, [...parentPath, node.role]);
          }
        }
      };

      await processNode(axTree, 0);

      logger.info({
        url,
        totalNodes,
        interactiveNodes,
        extractedElements: elements.length
      }, 'ax_extraction_complete');
    }

    // Update previous hashes for next run
    this.previousElementHashes = currentHashes;

    return {
      url,
      title,
      elements,
      stats: {
        totalElements: elements.length,
        interactiveElements: elements.filter(el => el.metadata?.isInteractable).length,
        newElements: elements.filter(el => el.isNew).length,
        viewportElements: elements.filter(el => el.position && el.position.viewportIndex >= 0).length
      },
      scrollInfo,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate viewport index for element
   */
  private calculateViewportIndex(box: { x: number; y: number }): number {
    // Group into vertical strips (100px each)
    const stripIndex = Math.floor(box.y / 100);
    return stripIndex;
  }

  /**
   * Detect new elements since last extraction
   */
  async detectNewElements(page: Page): Promise<InteractiveElement[]> {
    const currentState = await this.extractInteractiveElements(page);
    return currentState.elements.filter(el => el.isNew);
  }

  /**
   * Get current refId count
   */
  getRefIdCount(): number {
    return this.nextRefId;
  }

  /**
   * Reset state (for new page loads)
   */
  reset(): void {
    this.previousElementHashes.clear();
    this.previousRefIds.clear();
    this.nextRefId = 0;
  }

  /**
   * Update state with new elements (from previous extraction)
   */
  updateState(elements: InteractiveElement[]): void {
    this.nextRefId = Math.max(this.nextRefId, ...elements.map(el => el.refId + 1));

    for (const element of elements) {
      const key = `${element.metadata?.xpath || ''}:${element.text || ''}`;
      if (!this.previousRefIds.has(key)) {
        this.previousRefIds.set(key, element.refId);
      }
    }
  }

  /**
   * Format DOM state for LLM
   */
  formatForLLM(domState: PageState): string {
    const lines: string[] = [];

    for (const element of domState.elements) {
      const position = element.position
        ? `[${element.position.index}, viewport: ${element.position.viewportIndex}]`
        : `[${element.refId}]`;

      const meta = element.metadata
        ? `(vis: ${element.metadata.isVisible}, int: ${element.metadata.isInteractable})`
        : '';

      const line = `${position} ${element.tag}${element.role ? ` as ${element.role}` : ''}${element.text ? `: "${element.text}"` : ''}${meta ? ` ${meta}` : ''}`;
      lines.push(line);
    }

    return lines.join('\n');
  }

  /**
   * Convert DOM state to JSON
   */
  toJSON(domState: PageState): string {
    return JSON.stringify({
      url: domState.url,
      title: domState.title,
      timestamp: domState.timestamp,
      elements: domState.elements.map(el => ({
        refId: el.refId,
        tag: el.tag,
        role: el.role,
        text: el.text,
        position: el.position,
        xpath: el.xpath
      })),
      stats: domState.stats
    }, null, 2);
  }
}

// Singleton instance
export const axExtractor = new AccessibilityTreeExtractor();
