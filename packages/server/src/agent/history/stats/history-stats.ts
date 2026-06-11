/**
 * History Statistics
 * Handles statistics and analysis of agent history
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentHistoryEntry } from '../history-manager.js';
import { createLogger } from '../../../../core/logging';

const logger = createLogger('HistoryStats');

/**
 * History Statistics provides analytics for agent history
 * This is extracted from agent/history/history-manager.ts
 */
export class HistoryStats {
  constructor(private historyDir: string) {}

  /**
   * Get comprehensive history statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    oldestEntry?: string;
    newestEntry?: string;
    averageIterations: number;
    successRate: number;
    categoryBreakdown: Record<string, number>;
  }> {
    try {
      const files = await readdir(this.historyDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      let totalSize = 0;
      let oldestTimestamp: string | null = null;
      let newestTimestamp: string | null = null;
      let totalIterations = 0;
      let successCount = 0;
      const categoryBreakdown: Record<string, number> = {};

      for (const file of jsonFiles) {
        const filePath = join(this.historyDir, file);
        const stats = await (await import('node:fs/promises')).stat(filePath);
        totalSize += stats.size;

        const content = await readFile(filePath, 'utf-8');
        const entry = JSON.parse(content) as AgentHistoryEntry;

        if (!oldestTimestamp || entry.timestamp < oldestTimestamp) {
          oldestTimestamp = entry.timestamp;
        }
        if (!newestTimestamp || entry.timestamp > newestTimestamp) {
          newestTimestamp = entry.timestamp;
        }

        totalIterations += entry.iterations;
        if (entry.success) successCount++;

        const category = entry.metadata?.category || 'general';
        categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
      }

      return {
        totalEntries: jsonFiles.length,
        totalSize,
        oldestEntry: oldestTimestamp || undefined,
        newestEntry: newestTimestamp || undefined,
        averageIterations: jsonFiles.length > 0 ? totalIterations / jsonFiles.length : 0,
        successRate: jsonFiles.length > 0 ? successCount / jsonFiles.length : 0,
        categoryBreakdown
      };
    } catch (error) {
      logger.error({ err: (error as Error).message }, 'history_stats_failed');
      return {
        totalEntries: 0,
        totalSize: 0,
        averageIterations: 0,
        successRate: 0,
        categoryBreakdown: {}
      };
    }
  }

  /**
   * Get success rate
   */
  async getSuccessRate(): Promise<number> {
    const stats = await this.getStats();
    return stats.successRate;
  }

  /**
   * Get average iterations
   */
  async getAverageIterations(): Promise<number> {
    const stats = await this.getStats();
    return stats.averageIterations;
  }

  /**
   * Get category breakdown
   */
  async getCategoryBreakdown(): Promise<Record<string, number>> {
    const stats = await this.getStats();
    return stats.categoryBreakdown;
  }

  /**
   * Get size statistics
   */
  async getSizeStats(): Promise<{
    totalEntries: number;
    totalSize: number;
    avgSize: number;
  }> {
    try {
      const files = await readdir(this.historyDir);
      const jsonFiles = files.filter(f => f.endsWith('.json'));

      let totalSize = 0;

      for (const file of jsonFiles) {
        const filePath = join(this.historyDir, file);
        const stats = await (await import('node:fs/promises')).stat(filePath);
        totalSize += stats.size;
      }

      return {
        totalEntries: jsonFiles.length,
        totalSize,
        avgSize: jsonFiles.length > 0 ? totalSize / jsonFiles.length : 0
      };
    } catch (error) {
      logger.error({ err: (error as Error).message }, 'size_stats_failed');
      return { totalEntries: 0, totalSize: 0, avgSize: 0 };
    }
  }

  /**
   * Get time-based statistics
   */
  async getTimeStats(): Promise<{
    oldest?: string;
    newest?: string;
    timeSpan?: number; // in days
  }> {
    const stats = await this.getStats();

    if (!stats.oldestEntry || !stats.newestEntry) {
      return { oldest: undefined, newest: undefined };
    }

    const oldest = new Date(stats.oldestEntry);
    const newest = new Date(stats.newestEntry);
    const timeSpan = (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24);

    return {
      oldest: stats.oldestEntry,
      newest: stats.newestEntry,
      timeSpan
    };
  }
}
