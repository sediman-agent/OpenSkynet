/**
 * History Search
 * Handles searching and filtering of agent history
 */

import type { AgentHistoryEntry } from '../history-manager.js';
import { HistoryStorage } from '../storage/history-storage.js';
import { createLogger } from '../../../../core/logging';

const logger = createLogger('HistorySearch');

export interface SearchCriteria {
  query?: string;
  task?: string;
  dateFrom?: string;
  dateTo?: string;
  success?: boolean;
  minIterations?: number;
  maxIterations?: number;
  category?: string;
  limit?: number;
}

/**
 * History Search handles searching and filtering of agent history
 * This is extracted from agent/history/history-manager.ts
 */
export class HistorySearch {
  constructor(private storage: HistoryStorage) {}

  /**
   * Search history by query string
   */
  async search(query: string, limit = 20): Promise<AgentHistoryEntry[]> {
    const allHistory = await this.storage.list();
    const lowerQuery = query.toLowerCase();

    return allHistory
      .filter(entry =>
        entry.task.toLowerCase().includes(lowerQuery) ||
        entry.result.toLowerCase().includes(lowerQuery) ||
        entry.actionsTaken.some(action => action.toLowerCase().includes(lowerQuery))
      )
      .slice(0, limit);
  }

  /**
   * Search by multiple criteria
   */
  async searchByCriteria(criteria: SearchCriteria): Promise<AgentHistoryEntry[]> {
    const allHistory = await this.storage.list(criteria.limit || 100);
    let results = allHistory;

    // Filter by query
    if (criteria.query) {
      const lowerQuery = criteria.query.toLowerCase();
      results = results.filter(entry =>
        entry.task.toLowerCase().includes(lowerQuery) ||
        entry.result.toLowerCase().includes(lowerQuery)
      );
    }

    // Filter by task pattern
    if (criteria.task) {
      const taskPattern = new RegExp(criteria.task, 'i');
      results = results.filter(entry => taskPattern.test(entry.task));
    }

    // Filter by date range
    if (criteria.dateFrom || criteria.dateTo) {
      results = results.filter(entry => {
        const entryDate = new Date(entry.timestamp);
        if (criteria.dateFrom && entryDate < new Date(criteria.dateFrom)) {
          return false;
        }
        if (criteria.dateTo && entryDate > new Date(criteria.dateTo)) {
          return false;
        }
        return true;
      });
    }

    // Filter by success
    if (criteria.success !== undefined) {
      results = results.filter(entry => entry.success === criteria.success);
    }

    // Filter by iterations
    if (criteria.minIterations !== undefined) {
      results = results.filter(entry => entry.iterations >= criteria.minIterations!);
    }
    if (criteria.maxIterations !== undefined) {
      results = results.filter(entry => entry.iterations <= criteria.maxIterations!);
    }

    // Filter by category
    if (criteria.category) {
      results = results.filter(entry =>
        entry.metadata?.category === criteria.category
      );
    }

    // Apply limit
    const limit = criteria.limit || 20;
    return results.slice(0, limit);
  }

  /**
   * Find similar tasks
   */
  async findSimilar(task: string, limit = 5): Promise<AgentHistoryEntry[]> {
    const allHistory = await this.storage.list();
    const taskLower = task.toLowerCase();
    const taskTokens = new Set(taskLower.split(/\s+/));

    const scored = allHistory.map(entry => {
      const entryTask = entry.task.toLowerCase();
      const entryTokens = new Set(entryTask.split(/\s+/));

      // Calculate token overlap
      let overlap = 0;
      for (const token of taskTokens) {
        if (entryTokens.has(token)) {
          overlap++;
        }
      }

      const score = overlap / Math.max(taskTokens.size, 1);
      return { entry, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(s => s.entry);
  }

  /**
   * Get successful tasks
   */
  async getSuccessful(limit = 20): Promise<AgentHistoryEntry[]> {
    const allHistory = await this.storage.list(limit);
    return allHistory
      .filter(entry => entry.success)
      .slice(0, limit);
  }

  /**
   * Get failed tasks
   */
  async getFailed(limit = 20): Promise<AgentHistoryEntry[]> {
    const allHistory = await this.storage.list(limit);
    return allHistory
      .filter(entry => !entry.success)
      .slice(0, limit);
  }

  /**
   * Get tasks by category
   */
  async getByCategory(category: string, limit = 20): Promise<AgentHistoryEntry[]> {
    return this.searchByCriteria({ category, limit });
  }

  /**
   * Get recent history
   */
  async getRecent(limit = 10): Promise<AgentHistoryEntry[]> {
    return this.storage.list(limit);
  }

  /**
   * Get unique categories
   */
  async getCategories(): Promise<string[]> {
    const allHistory = await this.storage.list();
    const categories = new Set<string>();

    for (const entry of allHistory) {
      if (entry.metadata?.category) {
        categories.add(entry.metadata.category as string);
      }
    }

    return Array.from(categories).sort();
  }

  /**
   * Get search statistics
   */
  getSearchStats(): {
    totalEntries: number;
    categories: number;
  } {
    // This would be cached for performance
    return {
      totalEntries: 0,
      categories: 0
    };
  }
}
