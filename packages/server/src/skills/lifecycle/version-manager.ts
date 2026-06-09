/**
 * Version Manager
 * Handles skill versioning, history, and rollback
 */

import { existsSync, readFileSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SkillData } from '../../format.js';
import { SkillDataSchema } from '../../format.js';

/**
 * Version history entry
 */
export interface VersionEntry {
  version: number;
  modified: string;
  filePath: string;
}

/**
 * Version Manager
 * This is extracted from skills/lifecycle/skill-manager.ts
 */
export class VersionManager {
  /**
   * Archive current version before updating
   */
  archiveVersion(dir: string, currentData: Record<string, unknown>): void {
    const version = (currentData.version as number) ?? 1;
    const historyDir = join(dir, 'history');
    this.ensureDir(historyDir);

    const archivePath = join(historyDir, `skill.json.v${version}`);
    if (!existsSync(archivePath)) {
      writeFileSync(archivePath, JSON.stringify(currentData, null, 2) + '\n', 'utf-8');
    }
  }

  /**
   * List version history
   */
  listHistory(dir: string): VersionEntry[] {
    const historyDir = join(dir, 'history');

    if (!existsSync(historyDir)) return [];

    const results: VersionEntry[] = [];

    for (const f of readdirSync(historyDir)) {
      const match = f.match(/^skill\.json\.v(\d+)$/);
      if (!match) continue;

      const stat = statSync(join(historyDir, f));
      results.push({
        version: parseInt(match[1], 10),
        modified: stat.mtime.toISOString(),
        filePath: join(historyDir, f)
      });
    }

    return results.sort((a, b) => a.version - b.version);
  }

  /**
   * Rollback to specific version
   */
  rollback(dir: string, version?: number): Record<string, unknown> | null {
    const historyDir = join(dir, 'history');

    if (!existsSync(historyDir)) return null;

    const files = readdirSync(historyDir)
      .filter((f) => f.startsWith('skill.json.v'))
      .sort();

    if (files.length === 0) return null;

    let target: string;
    if (version !== undefined) {
      target = `skill.json.v${version}`;
      if (!files.includes(target)) {
        return null;
      }
    } else {
      target = files[files.length - 1];
    }

    const archivePath = join(historyDir, target);
    const raw = readFileSync(archivePath, 'utf-8');
    const parsed = SkillDataSchema.parse(JSON.parse(raw));

    return {
      ...parsed,
      // Convert to plain object for return
      name: parsed.name,
      description: parsed.description,
      steps: parsed.steps
    };
  }

  /**
   * Get latest version number
   */
  getLatestVersion(dir: string): number {
    const history = this.listHistory(dir);
    if (history.length === 0) return 0;
    return history[history.length - 1].version;
  }

  /**
   * Get version count
   */
  getVersionCount(dir: string): number {
    return this.listHistory(dir).length;
  }

  /**
   * Delete version history
   */
  clearHistory(dir: string): boolean {
    const historyDir = join(dir, 'history');
    if (!existsSync(historyDir)) return true;

    try {
      const { rmSync } = require('node:fs');
      rmSync(historyDir, { recursive: true, force: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure directory exists
   */
  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Create a backup before major changes
   */
  createBackup(dir: string, suffix = 'backup'): string | null {
    const filePath = join(dir, 'skill.json');
    if (!existsSync(filePath)) return null;

    const backupPath = join(dir, `skill.json.${suffix}`);
    const content = readFileSync(filePath, 'utf-8');
    writeFileSync(backupPath, content, 'utf-8');

    return backupPath;
  }
}
