/**
 * Memory Storage Interface
 * Abstracts storage backend for hierarchical memory
 */

import { createLogger } from '../../../core/logging.js';

const logger = createLogger('MemoryStorage');

export interface MemoryNode {
  id: string;
  domain: string;
  content: string;
  metadata?: any;
  timestamp: number;
  parentId?: string;
  children: string[];
  level: number;
}

export interface StorageResult {
  success: boolean;
  error?: string;
}

/**
 * Memory Storage handles data persistence for hierarchical memory
 * This is extracted from hierarchical-memory.ts
 */
export class MemoryStorage {
  private nodes: Map<string, MemoryNode> = new Map();
  private domainIndex: Map<string, Set<string>> = new Map();

  /**
   * Store a memory node
   */
  store(node: MemoryNode): StorageResult {
    try {
      this.nodes.set(node.id, node);

      // Update domain index
      if (!this.domainIndex.has(node.domain)) {
        this.domainIndex.set(node.domain, new Set());
      }
      this.domainIndex.get(node.domain)!.add(node.id);

      // Update parent's children list
      if (node.parentId) {
        const parent = this.nodes.get(node.parentId);
        if (parent) {
          if (!parent.children.includes(node.id)) {
            parent.children.push(node.id);
          }
        }
      }

      logger.debug(`[MemoryStorage] Stored node ${node.id} in domain ${node.domain}`);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[MemoryStorage] Failed to store node: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Retrieve a memory node
   */
  retrieve(id: string): MemoryNode | null {
    return this.nodes.get(id) || null;
  }

  /**
   * Get all nodes in a domain
   */
  getDomain(domain: string): MemoryNode[] {
    const domainSet = this.domainIndex.get(domain);
    if (!domainSet) return [];

    const nodes: MemoryNode[] = [];
    for (const id of domainSet) {
      const node = this.nodes.get(id);
      if (node) nodes.push(node);
    }
    return nodes;
  }

  /**
   * Get children of a node
   */
  getChildren(parentId: string): MemoryNode[] {
    const parent = this.nodes.get(parentId);
    if (!parent) return [];

    return parent.children
      .map(id => this.nodes.get(id))
      .filter((n): n !== null) as MemoryNode[];
  }

  /**
   * Delete a node
   */
  delete(id: string): StorageResult {
    const node = this.nodes.get(id);
    if (!node) {
      return { success: false, error: `Node ${id} not found` };
    }

    // Remove from domain index
    const domainSet = this.domainIndex.get(node.domain);
    if (domainSet) {
      domainSet.delete(id);
    }

    // Remove from parent's children
    if (node.parentId) {
      const parent = this.nodes.get(node.parentId);
      if (parent) {
        parent.children = parent.children.filter(childId => childId !== id);
      }
    }

    // Recursively delete children
    for (const childId of node.children) {
      this.delete(childId);
    }

    this.nodes.delete(id);
    logger.debug(`[MemoryStorage] Deleted node ${id}`);
    return { success: true };
  }

  /**
   * Clear all storage
   */
  clear(): void {
    this.nodes.clear();
    this.domainIndex.clear();
    logger.info('[MemoryStorage] Cleared all storage');
  }

  /**
   * Get storage stats
   */
  getStats(): { totalNodes: number; domains: number; domainCounts: Record<string, number> } {
    const domainCounts: Record<string, number> = {};
    for (const [domain, nodeSet] of this.domainIndex) {
      domainCounts[domain] = nodeSet.size;
    }

    return {
      totalNodes: this.nodes.size,
      domains: this.domainIndex.size,
      domainCounts
    };
  }
}
