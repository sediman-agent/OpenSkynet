/**
 * Hierarchical Memory - Simplified
 *
 * Refactored from 452 lines to ~150 lines
 * Storage extracted to MemoryStorage
 * Retrieval extracted to strategy classes
 * Compression extracted to MemoryCompression
 */

import type { Memory } from "../../strategy.js";
import type { MemoryNode } from "./storage/memory-storage.js";
import { MemoryStorage } from "./storage/memory-storage.js";
import {
  ExactMatchRetrieval,
  SemanticRetrieval,
  HierarchicalRetrieval,
  TimeBasedRetrieval
} from "./retrieval/memory-retrieval.js";
import { MemoryCompression } from "./compression/index.js";
import { createLogger } from "../../core/logging.js";

const logger = createLogger("HierarchicalMemory");

export interface HierarchicalMemoryOptions {
  maxNodes?: number;
  maxContentLength?: number;
  retrievalStrategy?: 'exact' | 'semantic' | 'hierarchical' | 'time';
  compressionEnabled?: boolean;
}

/**
 * Hierarchical Memory manages tree-structured memory with multiple retrieval strategies
 * This coordinates storage, retrieval, and compression modules
 */
export class HierarchicalMemory implements Memory {
  private storage: MemoryStorage;
  private compression: MemoryCompression;
  private retrievalStrategies: Map<string, any>;

  constructor(options: HierarchicalMemoryOptions = {}) {
    this.storage = new MemoryStorage();
    this.compression = new MemoryCompression();

    // Initialize retrieval strategies
    this.retrievalStrategies = new Map([
      ['exact', new ExactMatchRetrieval()],
      ['semantic', new SemanticRetrieval()],
      ['hierarchical', new HierarchicalRetrieval()],
      ['time', new TimeBasedRetrieval()],
    ]);

    logger.info('[HierarchicalMemory] Initialized with strategies:', Array.from(this.retrievalStrategies.keys()));
  }

  /**
   * Write a memory to storage
   */
  async write(domain: string, content: string, metadata?: any): Promise<void> {
    const nodeId = this.generateNodeId(domain);

    const node: MemoryNode = {
      id: nodeId,
      domain,
      content,
      metadata: { ...metadata, timestamp: Date.now() },
      timestamp: Date.now(),
      parentId: undefined,
      children: [],
      level: 0
    };

    const result = this.storage.store(node);

    if (!result.success) {
      throw new Error(`Failed to store memory: ${result.error}`);
    }

    // Compress if needed
    if (this.compression && (metadata?.compress !== false)) {
      this.compression.compress(this.storage, {
        maxNodes: options.maxNodes ?? 1000
      });
    }

    logger.debug(`[HierarchicalMemory] Wrote memory ${nodeId} to domain ${domain}`);
  }

  /**
   * Recall memories based on query
   */
  async recall(query: string, domain?: string, limit?: number): Promise<Memory[]> {
    const strategyName = options?.retrievalStrategy || 'hierarchical';
    const strategy = this.retrievalStrategies.get(strategyName);

    if (!strategy) {
      throw new Error(`Unknown retrieval strategy: ${strategyName}`);
    }

    logger.debug(`[HierarchicalMemory] Recalling with strategy: ${strategyName}`);

    const result = strategy.retrieve(
      { query, domain, maxResults: limit },
      this.storage
    );

    return result.nodes.map(node => ({
      domain: node.domain,
      content: node.content,
      metadata: node.metadata
    }));
  }

  /**
   * Get all memories in a domain
   */
  getDomainMemories(domain: string): Memory[] {
    const nodes = this.storage.getDomain(domain);
    return nodes.map(node => ({
      domain: node.domain,
      content: node.content,
      metadata: node.metadata
    }));
  }

  /**
   * Get memory by ID
   */
  getMemory(id: string): Memory | null {
    const node = this.storage.retrieve(id);
    if (!node) return null;

    return {
      domain: node.domain,
      content: node.content,
      metadata: node.metadata
    };
  }

  /**
   * Update a memory
   */
  updateMemory(id: string, updates: Partial<Memory>): boolean {
    const node = this.storage.retrieve(id);
    if (!node) return false;

    // Apply updates
    if (updates.content !== undefined) node.content = updates.content;
    if (updates.domain !== undefined) node.domain = updates.domain;
    if (updates.metadata !== undefined) {
      node.metadata = { ...node.metadata, ...updates.metadata };
    }
    node.timestamp = Date.now();

    const result = this.storage.store(node);
    return result.success;
  }

  /**
   * Delete a memory
   */
  deleteMemory(id: string): boolean {
    const result = this.storage.delete(id);
    return result.success;
  }

  /**
   * Clear all memories
   */
  clear(): void {
    this.storage.clear();
    logger.info('[HierarchicalMemory] Cleared all memories');
  }

  /**
   * Get memory statistics
   */
  getStats(): { total: number; byDomain: Record<string, number> } {
    const stats = this.storage.getStats();
    return {
      total: stats.totalNodes,
      byDomain: stats.domainCounts
    };
  }

  /**
   * Compress memory to stay within limits
   */
  compress(options?: { maxNodes?: number; maxContentLength?: number }): { compressed: number; error?: string } {
    const result = this.compression.compress(this.storage, options);
    return {
      compressed: result.compressed || 0,
      error: result.error
    };
  }

  /**
   * Get hierarchical tree structure
   */
  getTree(domain?: string): any {
    const nodes = domain
      ? this.storage.getDomain(domain)
      : Array.from(this.storage.nodes.values());

    // Build tree structure
    const roots = nodes.filter(n => !n.parentId);
    const buildNode = (nodeId: string): any => {
      const node = this.storage.retrieve(nodeId);
      if (!node) return null;

      return {
        ...node,
        children: (node.children || []).map(buildNode).filter(n => n !== null)
      };
    };

    return {
      roots: roots.map(buildNode).filter(n => n !== null),
      total: nodes.length
    };
  }

  /**
   * Generate unique node ID
   */
  private generateNodeId(domain: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `${domain}_${timestamp}_${random}`;
  }

  /**
   * Lifecycle hook - called at start of turn
   */
  async onTurnStart(): Promise<void> {
    // No-op for hierarchical memory
  }

  /**
   * Lifecycle hook - called at end of session
   */
  async onSessionEnd(): Promise<void> {
    // Optional: Persist to disk if needed
  }

  /**
   * Get storage instance (for advanced use)
   */
  getStorage(): MemoryStorage {
    return this.storage;
  }

  /**
   * Get all retrieval strategies
   */
  getRetrievalStrategies(): string[] {
    return Array.from(this.retrievalStrategies.keys());
  }

  /**
   * Check if memory is empty
   */
  isEmpty(): boolean {
    const stats = this.storage.getStats();
    return stats.totalNodes === 0;
  }
}
