/**
 * Usage Tracker
 * Records and tracks skill usage statistics
 */

import type { SkillData } from '../../format.js';
import { SkillDataSchema } from '../../format.js';
import type { SkillStorage } from './skill-storage-new.js';

/**
 * Usage statistics
 */
export interface UsageStats {
  useCount: number;
  executionCount: number;
  lastUsedAt: string | null;
  firstUsedAt: string | null;
}

/**
 * Usage Tracker
 * This is extracted from skills/lifecycle/skill-manager.ts
 */
export class UsageTracker {
  /**
   * Record skill usage (increments usage counters)
   */
  recordUsage(
    storage: SkillStorage,
    skillDir: string,
    currentData: Record<string, unknown>
  ): void {
    if (!currentData) return;

    const now = new Date().toISOString();
    const useCount = ((currentData.use_count as number) ?? 0) + 1;
    const merged = {
      ...currentData,
      use_count: useCount,
      last_used_at: now,
      execution_count: ((currentData.execution_count as number) ?? 0) + 1,
      first_used_at: (currentData.first_used_at as string) ?? now,
    };

    const parsed = SkillDataSchema.parse(merged);
    storage.write(skillDir, parsed);
  }

  /**
   * Get usage statistics for skill
   */
  getUsageStats(data: Record<string, unknown> | null): UsageStats {
    if (!data) {
      return {
        useCount: 0,
        executionCount: 0,
        lastUsedAt: null,
        firstUsedAt: null
      };
    }

    return {
      useCount: (data.use_count as number) ?? 0,
      executionCount: (data.execution_count as number) ?? 0,
      lastUsedAt: (data.last_used_at as string) ?? null,
      firstUsedAt: (data.first_used_at as string) ?? null
    };
  }

  /**
   * Get most used skills
   */
  getMostUsedSkills(storage: SkillStorage, limit = 10): Array<{
    name: string;
    useCount: number;
    executionCount: number;
  }> {
    const allSkills = storage.listAllDirectories();
    const results: Array<{
      name: string;
      useCount: number;
      executionCount: number;
    }> = [];

    for (const { dir, name } of allSkills) {
      const data = storage.read(dir);
      if (!data) continue;

      const stats = this.getUsageStats(data);
      results.push({
        name,
        useCount: stats.useCount,
        executionCount: stats.executionCount
      });
    }

    return results
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, limit);
  }

  /**
   * Get recently used skills
   */
  getRecentlyUsedSkills(storage: SkillStorage, limit = 10): Array<{
    name: string;
    lastUsedAt: string | null;
  }> {
    const allSkills = storage.listAllDirectories();
    const results: Array<{
      name: string;
      lastUsedAt: string | null;
    }> = [];

    for (const { dir, name } of allSkills) {
      const data = storage.read(dir);
      if (!data) continue;

      const stats = this.getUsageStats(data);
      if (stats.lastUsedAt) {
        results.push({
          name,
          lastUsedAt: stats.lastUsedAt
        });
      }
    }

    return results
      .sort((a, b) => {
        if (!a.lastUsedAt) return 1;
        if (!b.lastUsedAt) return -1;
        return b.lastUsedAt.localeCompare(a.lastUsedAt);
      })
      .slice(0, limit);
  }

  /**
   * Reset usage statistics for skill
   */
  resetUsageStats(
    storage: SkillStorage,
    skillDir: string,
    currentData: Record<string, unknown>
  ): void {
    if (!currentData) return;

    const merged = {
      ...currentData,
      use_count: 0,
      execution_count: 0,
      last_used_at: null,
      first_used_at: null
    };

    const parsed = SkillDataSchema.parse(merged);
    storage.write(skillDir, parsed);
  }
}
