/**
 * Memory Compression
 * Handles compression and summarization of hierarchical memory
 */

import { createLogger } from '../../../core/logging.js';

const logger = createLogger('MemoryCompression');

export interface CompressionOptions {
  maxNodes?: number;
  maxContentLength?: number;
  preserveRecent?: boolean;
}

export interface CompressionResult {
  success: boolean;
  compressed: number;
  error?: string;
}

/**
 * Memory Compression handles memory optimization
 * This is extracted from hierarchical-memory.ts
 */
export class MemoryCompression {
  /**
   * Compress memory to stay within limits
   */
  compress(storage: any, options: CompressionOptions = {}): CompressionResult {
    try {
      const {
        maxNodes = 1000,
        maxContentLength = 5000,
        preserveRecent = true
      } = options;

      const stats = storage.getStats();
      const compressed = stats.totalNodes;

      if (stats.totalNodes <= maxNodes) {
        return { success: true, compressed: 0 };
      }

      logger.info(`[MemoryCompression] Compressing ${stats.totalNodes} nodes to max ${maxNodes}`);

      // Get all nodes sorted by timestamp
      const allNodes = Array.from((storage as any).nodes.values())
        .sort((a: any, b: any) => b.timestamp - a.timestamp);

      // Determine which to keep
      const nodesToKeep = this.selectNodesToKeep(allNodes, maxNodes, preserveRecent);

      // Nodes to delete
      const nodesToDelete = allNodes.slice(nodesToKeep.length);

      let deletedCount = 0;
      for (const node of nodesToDelete) {
        const result = storage.delete(node.id);
        if (result.success) deletedCount++;
      }

      logger.info(`[MemoryCompression] Compressed ${deletedCount} nodes`);

      return {
        success: true,
        compressed: deletedCount
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[MemoryCompression] Compression failed: ${message}`);
      return {
        success: false,
        error: message,
        compressed: 0
      };
    }
  }

  /**
   * Select which nodes to keep based on strategy
   */
  private selectNodesToKeep(nodes: any[], maxNodes: number, preserveRecent: boolean): any[] {
    if (preserveRecent) {
      // Keep most recent nodes
      return nodes.slice(0, maxNodes);
    }

    // Keep nodes with more connections (more important in hierarchy)
    const scoredNodes = nodes.map(node => ({
      node,
      score: this.calculateImportance(node)
    }));

    scoredNodes.sort((a, b) => b.score - a.score);

    return scoredNodes.slice(0, maxNodes).map(item => item.node);
  }

  /**
   * Calculate importance score for a node
   */
  private calculateImportance(node: any): number {
    let score = 0;

    // More connections = more important
    score += (node.children?.length || 0) * 10;

    // Recent activity
    const age = Date.now() - node.timestamp;
    score += Math.max(0, 100 - age / (1000 * 60)); // Decay over 100 minutes

    // Content length (more info = more important)
    score += Math.min(node.content?.length || 0, 100);

    // Metadata quality
    if (node.metadata) {
      score += 5;
    }

    return score;
  }

  /**
   * Compress node content
   */
  compressContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;

    // Simple truncation with indicator
    return content.slice(0, maxLength - 3) + '...';
  }

  /**
   * Merge duplicate memories
   */
  mergeDuplicates(storage: any): { merged: number; error?: string } {
    try {
      const duplicates = this.findDuplicates(storage);

      let merged = 0;
      for (const duplicate of duplicates) {
        // Keep the most recent one, delete others
        const nodes = duplicate.sort((a: any, b: any) => b.timestamp - a.timestamp);
        const toKeep = nodes[0];
        const toDelete = nodes.slice(1);

        for (const node of toDelete) {
          const result = storage.delete(node.id);
          if (result.success) merged++;
        }

        // Update parent's child list if needed
        if (toKeep.parentId && toDelete.length > 0) {
          const parent = storage.retrieve(toKeep.parentId);
          if (parent) {
            parent.children = parent.children.filter(
              id => !toDelete.some((del: any) => del.id === id)
            );
          }
        }
      }

      logger.info(`[MemoryCompression] Merged ${merged} duplicate memories`);

      return { merged };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { merged: 0, error: message };
    }
  }

  /**
   * Find duplicate memories
   */
  private findDuplicates(storage: any): any[][] {
    const duplicates: Map<string, any[]> = new Map();
    const allNodes = Array.from((storage as any).nodes.values());

    for (const node of allNodes) {
      // Create a signature for the node
      const signature = this.createSignature(node);

      if (!duplicates.has(signature)) {
        duplicates.set(signature, []);
      }
      duplicates.get(signature)!.push(node);
    }

    // Return only groups with duplicates
    return Array.from(duplicates.values()).filter(group => group.length > 1);
  }

  /**
   * Create signature for duplicate detection
   */
  private createSignature(node: any): string {
    const contentSig = (node.content || '').slice(0, 100).toLowerCase();
    const domainSig = node.domain || '';
    return `${domainSig}:${contentSig}`;
  }
}
