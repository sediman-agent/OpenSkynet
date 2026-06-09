/**
 * Skill Storage
 * Handles file operations, caching, and storage for skills
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import type { SkillData } from '../../format.js';
import { loadSkill, skillToJson } from '../../format.js';
import { SkillValidator } from '../../validation/skill-validator.js';

/**
 * Cache entry for skill data
 */
export interface CacheEntry {
  mtime: number;
  data: Record<string, unknown>;
}

/**
 * Skill Storage
 * This is extracted from skills/lifecycle/skill-manager.ts
 */
export class SkillStorage {
  private cache: Map<string, CacheEntry> = new Map();

  constructor(
    private skillsDir: string,
    private projectDir: string | null,
    private repoSkillsDir: string | null,
    private useCache = true,
    private validator: SkillValidator = new SkillValidator()
  ) {}

  /**
   * Read skill data from directory
   */
  read(dir: string): Record<string, unknown> | null {
    return this.readCached(dir);
  }

  /**
   * Write skill data to directory
   */
  write(dir: string, data: SkillData): void {
    const filePath = join(dir, 'skill.json');
    this.atomicWrite(filePath, JSON.stringify(data, null, 2) + '\n');
    this.invalidateCache(dir);
  }

  /**
   * Check if skill exists
   */
  exists(dir: string): boolean {
    const filePath = join(dir, 'skill.json');
    return existsSync(filePath);
  }

  /**
   * Delete skill directory
   */
  delete(dir: string): boolean {
    if (!existsSync(dir)) return false;

    try {
      rmSync(dir, { recursive: true, force: true });
      this.invalidateCache(dir);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Ensure directory exists
   */
  ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Read with caching
   */
  private readCached(dir: string): Record<string, unknown> | null {
    const filePath = join(dir, 'skill.json');
    if (!existsSync(filePath)) return null;

    const mtime = statSync(filePath).mtimeMs;

    // Check cache first
    if (this.useCache) {
      const cached = this.cache.get(dir);
      if (cached && cached.mtime === mtime) {
        return cached.data;
      }
    }

    // Load fresh data
    const data = loadSkill(dir);
    if (!data) return null;

    const json = skillToJson(data);

    // Update cache
    if (this.useCache) {
      this.cache.set(dir, { mtime, data: json });
    }

    return json;
  }

  /**
   * Invalidate cache entry
   */
  invalidateCache(dir: string): void {
    this.cache.delete(dir);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: number } {
    let entries = 0;
    let totalSize = 0;

    for (const [, entry] of this.cache) {
      entries++;
      totalSize += JSON.stringify(entry.data).length;
    }

    return { size: totalSize, entries };
  }

  /**
   * Atomic write helper
   */
  private atomicWrite(filePath: string, data: string): void {
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, data, 'utf-8');
    renameSync(tmp, filePath);
  }

  /**
   * Validate path is within allowed roots
   */
  validatePath(dir: string): void {
    const allowedRoots = [this.skillsDir];
    if (this.projectDir) allowedRoots.push(this.projectDir);
    if (this.repoSkillsDir) allowedRoots.push(this.repoSkillsDir);

    this.validator.validatePath(dir, allowedRoots);
  }

  /**
   * Get skill directory path
   */
  getSkillDir(name: string, preferProject = false): string {
    if (preferProject && this.projectDir) {
      const pDir = join(this.projectDir, name);
      if (existsSync(pDir)) return pDir;
    }
    return join(this.skillsDir, name);
  }

  /**
   * Get all search directories
   */
  getSearchDirs(): string[] {
    const dirs = [this.skillsDir];
    if (this.projectDir) dirs.push(this.projectDir);
    if (this.repoSkillsDir) dirs.push(this.repoSkillsDir);
    return dirs;
  }

  /**
   * List all directories from search paths
   */
  listAllDirectories(): Array<{ dir: string; name: string }> {
    const results: Array<{ dir: string; name: string }> = [];
    const seen = new Set<string>();

    for (const baseDir of this.getSearchDirs()) {
      if (!existsSync(baseDir)) continue;

      for (const entry of readdirSync(baseDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (seen.has(entry.name)) continue;

        seen.add(entry.name);
        results.push({
          dir: join(baseDir, entry.name),
          name: entry.name
        });
      }
    }

    return results;
  }

  /**
   * Read file content
   */
  readFile(filePath: string): string | null {
    try {
      return readFileSync(filePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Write file content
   */
  writeFile(filePath: string, content: string): boolean {
    try {
      this.atomicWrite(filePath, content);
      return true;
    } catch {
      return false;
    }
  }
}
