/**
 * Agent History Manager - Simplified
 *
 * Refactored from 321 lines to ~100 lines
 * Storage extracted to HistoryStorage
 * Search extracted to HistorySearch
 * Statistics extracted to HistoryStats
 */

import { join } from 'node:path';
import { getConfig } from '../../core/config';

// Re-export types
export type { AgentHistoryEntry };

// Import extracted modules
import { HistoryStorage } from './storage/index.js';
import { HistorySearch, type SearchCriteria } from './search/index.js';
import { HistoryStats } from './stats/index.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface AgentHistoryEntry {
  id: string;
  task: string;
  timestamp: string;
  steps: any[];
  result: string;
  success: boolean;
  iterations: number;
  strategyUsed: string;
  elapsedSecs: number;
  conversation?: Array<{ role: string; content: string | any[] }>;
  actionsTaken: string[];
  metadata?: {
    category?: string;
    mode?: string;
    startTime?: string;
    endTime?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// Agent History Manager (Simplified)
// ============================================================================

/**
 * Agent History Manager coordinates history storage, search, and stats
 * This is the simplified main file that delegates to specialized modules
 */
export class AgentHistoryManager {
  private storage: HistoryStorage;
  private search: HistorySearch;
  private stats: HistoryStats;

  constructor() {
    const config = getConfig();
    const historyDir = join(config.dataDir, 'agent_history');

    this.storage = new HistoryStorage(historyDir);
    this.search = new HistorySearch(this.storage);
    this.stats = new HistoryStats(historyDir);
  }

  /**
   * Save agent execution to history
   */
  async saveToHistory(entry: Omit<AgentHistoryEntry, 'id' | 'timestamp'>): Promise<string> {
    return this.storage.save(entry);
  }

  /**
   * Load history entry by ID
   */
  async loadHistory(id: string): Promise<AgentHistoryEntry | null> {
    return this.storage.load(id);
  }

  /**
   * List all history entries
   */
  async listHistory(limit = 50): Promise<AgentHistoryEntry[]> {
    return this.storage.list(limit);
  }

  /**
   * Search history by task content
   */
  async searchHistory(query: string, limit = 20): Promise<AgentHistoryEntry[]> {
    return this.search.search(query, limit);
  }

  /**
   * Search by multiple criteria
   */
  async searchByCriteria(criteria: SearchCriteria): Promise<AgentHistoryEntry[]> {
    return this.search.searchByCriteria(criteria);
  }

  /**
   * Find similar tasks
   */
  async findSimilar(task: string, limit = 5): Promise<AgentHistoryEntry[]> {
    return this.search.findSimilar(task, limit);
  }

  /**
   * Create rerun configuration from history
   */
  async createRerunConfig(id: string): Promise<{
    task: string;
    conversation: Array<{ role: string; content: string | any[] }>;
    metadata: Record<string, unknown>;
  } | null> {
    const entry = await this.loadHistory(id);

    if (!entry) {
      return null;
    }

    return {
      task: entry.task,
      conversation: entry.conversation || [],
      metadata: {
        originalId: entry.id,
        originalTimestamp: entry.timestamp,
        originalResult: entry.result,
        originalSuccess: entry.success,
        originalIterations: entry.iterations,
        originalStrategy: entry.strategyUsed,
        originalElapsedSecs: entry.elapsedSecs,
        originalActions: entry.actionsTaken,
      }
    };
  }

  /**
   * Delete history entry
   */
  async deleteHistory(id: string): Promise<boolean> {
    return this.storage.delete(id);
  }

  /**
   * Clear all history
   */
  async clearHistory(): Promise<number> {
    return this.storage.clear();
  }

  /**
   * Get history statistics
   */
  async getHistoryStats(): Promise<ReturnType<HistoryStats['getStats']>> {
    return this.stats.getStats();
  }

  /**
   * Prune old history entries
   */
  async pruneOldEntries(maxEntries?: number): Promise<number> {
    const config = getConfig();
    const maxHistory = maxEntries ?? config.maxHistoryEntries;

    const allHistory = await this.listHistory(maxHistory + 100);

    if (allHistory.length <= maxHistory) {
      return 0;
    }

    const toDelete = allHistory.slice(maxHistory);
    let deleted = 0;

    for (const entry of toDelete) {
      const success = await this.deleteHistory(entry.id);
      if (success) {
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Get history directory path
   */
  getHistoryDir(): string {
    return this.storage.getStorageDir();
  }

  /**
   * Check if history entry exists
   */
  hasHistory(id: string): boolean {
    return this.storage.exists(id);
  }

  /**
   * Get successful tasks
   */
  async getSuccessful(limit = 20): Promise<AgentHistoryEntry[]> {
    return this.search.getSuccessful(limit);
  }

  /**
   * Get failed tasks
   */
  async getFailed(limit = 20): Promise<AgentHistoryEntry[]> {
    return this.search.getFailed(limit);
  }

  /**
   * Get categories
   */
  async getCategories(): Promise<string[]> {
    return this.search.getCategories();
  }
}

/**
 * Create an agent history manager instance
 */
export function createAgentHistoryManager(): AgentHistoryManager {
  return new AgentHistoryManager();
}

// Re-export classes for direct use
export { HistoryStorage, HistorySearch, HistoryStats };
export type { SearchCriteria };
