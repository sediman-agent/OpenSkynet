/**
 * Skill Lifecycle Manager
 * Handles CRUD operations, versioning, and lifecycle management
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
  renameSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { SkillData } from "../format.js";
import { loadSkill, SkillDataSchema, skillToJson } from "../format.js";
import { SkillError } from "../../core/errors.js";
import { createLogger } from "../../core/logging.js";
import { SkillValidator } from "../validation/skill-validator.js";

const logger = createLogger('SkillManager');

export interface CacheEntry {
  mtime: number;
  data: Record<string, unknown>;
}

/**
 * Skill Lifecycle Manager manages skill creation, updates, deletion, and versioning
 * This is extracted from skills/engine.ts
 */
export class SkillManager {
  private cache: Map<string, CacheEntry> = new Map();

  constructor(
    private skillsDir: string,
    private projectDir: string | null,
    private repoSkillsDir: string | null,
    private useCache: boolean = true,
    private validator: SkillValidator = new SkillValidator()
  ) {}

  /**
   * Create a new skill
   */
  create(
    name: string,
    description: string,
    steps: string[],
    extra: Partial<SkillData> = {}
  ): Record<string, unknown> {
    // Validate name
    this.validator.validateName(name);

    const dir = this.skillDir(name);
    this.validatePath(dir);

    if (existsSync(dir)) {
      throw new SkillError(`Skill "${name}" already exists`, "ALREADY_EXISTS");
    }

    mkdirSync(dir, { recursive: true });

    const now = new Date().toISOString();
    const data: SkillData = SkillDataSchema.parse({
      name,
      description,
      steps,
      version: 1,
      created_at: now,
      updated_at: now,
      ...extra,
    });

    const filePath = join(dir, "skill.json");
    this.atomicWrite(filePath, JSON.stringify(data, null, 2) + "\n");
    this.invalidateCache(dir);

    logger.info({ skill: name }, "skill_created");
    return skillToJson(data);
  }

  /**
   * Read skill data
   */
  read(name: string, preferProject = false): Record<string, unknown> | null {
    const dir = this.skillDir(name, preferProject);
    this.validatePath(dir);
    return this.readCached(dir);
  }

  /**
   * Update skill (partial update)
   */
  patch(
    name: string,
    updates: Record<string, unknown>
  ): Record<string, unknown> | null {
    const dir = this.skillDir(name, true);
    this.validatePath(dir);
    const existing = this.readCached(dir);

    if (!existing) return null;

    // Archive current version before patching
    this.archiveVersion(name, dir);

    const merged = { ...existing, ...updates, updated_at: new Date().toISOString() };
    const parsed = SkillDataSchema.parse(merged);
    const filePath = join(dir, "skill.json");
    this.atomicWrite(filePath, JSON.stringify(parsed, null, 2) + "\n");
    this.invalidateCache(dir);

    logger.info({ skill: name }, "skill_patched");
    return skillToJson(parsed);
  }

  /**
   * Delete a skill
   */
  delete(name: string): boolean {
    const dir = this.skillDir(name, true);
    this.validatePath(dir);

    if (!existsSync(dir)) return false;

    try {
      rmSync(dir, { recursive: true, force: true });
      this.invalidateCache(dir);
      logger.info({ skill: name }, "skill_deleted");
      return true;
    } catch (err) {
      throw new SkillError(
        `Failed to delete skill "${name}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Rollback to a previous version
   */
  rollback(name: string, version?: number): Record<string, unknown> | null {
    const dir = this.skillDir(name, true);
    this.validatePath(dir);
    const historyDir = join(dir, "history");

    if (!existsSync(historyDir)) return null;

    const files = readdirSync(historyDir)
      .filter((f) => f.startsWith("skill.json.v"))
      .sort();

    if (files.length === 0) return null;

    let target: string;
    if (version !== undefined) {
      target = `skill.json.v${version}`;
      if (!files.includes(target)) {
        throw new SkillError(`Version ${version} not found for skill "${name}"`, "VERSION_NOT_FOUND");
      }
    } else {
      target = files[files.length - 1];
    }

    const archivePath = join(historyDir, target);
    const raw = readFileSync(archivePath, "utf-8");
    const parsed = SkillDataSchema.parse(JSON.parse(raw));
    const filePath = join(dir, "skill.json");
    this.atomicWrite(filePath, JSON.stringify(parsed, null, 2) + "\n");
    this.invalidateCache(dir);

    logger.info({ skill: name, version: parsed.version }, "skill_rolled_back");
    return skillToJson(parsed);
  }

  /**
   * List version history
   */
  listHistory(name: string): Array<{ version: number; modified: string }> {
    const dir = this.skillDir(name, true);
    const historyDir = join(dir, "history");

    if (!existsSync(historyDir)) return [];

    const results: Array<{ version: number; modified: string }> = [];

    for (const f of readdirSync(historyDir)) {
      const match = f.match(/^skill\.json\.v(\d+)$/);
      if (!match) continue;

      const stat = statSync(join(historyDir, f));
      results.push({
        version: parseInt(match[1], 10),
        modified: stat.mtime.toISOString()
      });
    }

    return results.sort((a, b) => a.version - b.version);
  }

  /**
   * Record skill usage (increments usage counters)
   */
  recordUsage(name: string): void {
    const dir = this.skillDir(name, true);
    this.validatePath(dir);
    const data = this.readCached(dir);

    if (!data) return;

    const now = new Date().toISOString();
    const useCount = ((data.use_count as number) ?? 0) + 1;
    const merged = {
      ...data,
      use_count: useCount,
      last_used_at: now,
      execution_count: ((data.execution_count as number) ?? 0) + 1,
    };

    const parsed = SkillDataSchema.parse(merged);
    const filePath = join(dir, "skill.json");
    this.atomicWrite(filePath, JSON.stringify(parsed, null, 2) + "\n");
    this.invalidateCache(dir);
  }

  /**
   * Archive current version before updating
   */
  private archiveVersion(name: string, dir: string): void {
    const current = this.readCached(dir);
    if (!current) return;

    const version = (current.version as number) ?? 1;
    const historyDir = join(dir, "history");
    this.ensureDir(historyDir);

    const archivePath = join(historyDir, `skill.json.v${version}`);
    if (!existsSync(archivePath)) {
      writeFileSync(archivePath, JSON.stringify(current, null, 2) + "\n", "utf-8");
    }
  }

  /**
   * Read skill with caching
   */
  readCached(dir: string): Record<string, unknown> | null {
    const filePath = join(dir, "skill.json");
    if (!existsSync(filePath)) return null;

    const mtime = statSync(filePath).mtimeMs;

    // Check cache first
    if (this.useCache) {
      const cached = this.cache.get(dir);
      if (cached && cached.mtime === mtime) return cached.data;
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
  private invalidateCache(dir: string): void {
    this.cache.delete(dir);
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get skill directory path
   */
  private skillDir(name: string, preferProject = false): string {
    if (preferProject && this.projectDir) {
      const pDir = join(this.projectDir, name);
      if (existsSync(pDir)) return pDir;
    }
    return join(this.skillsDir, name);
  }

  /**
   * Validate path is within allowed roots
   */
  private validatePath(dir: string): void {
    const allowedRoots = [this.skillsDir];
    if (this.projectDir) allowedRoots.push(this.projectDir);
    if (this.repoSkillsDir) allowedRoots.push(this.repoSkillsDir);

    this.validator.validatePath(dir, allowedRoots);
  }

  /**
   * Ensure directory exists
   */
  private ensureDir(dir: string): void {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  /**
   * Atomic write helper
   */
  private atomicWrite(filePath: string, data: string): void {
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, data, "utf-8");
    renameSync(tmp, filePath);
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
   * List all skills from all directories
   */
  listAllSkills(): Array<{ dir: string; name: string }> {
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
   * Ensure a skill exists, create if not
   */
  ensureSkill(
    name: string,
    data: SkillData | Record<string, unknown>
  ): Record<string, unknown> {
    const existing = this.read(name);
    if (existing) return existing;

    const parsed = SkillDataSchema.parse({ ...data, name });
    return this.create(parsed.name, parsed.description, parsed.steps, parsed);
  }

  /**
   * Install a skill from data
   */
  install(data: SkillData): Record<string, unknown> {
    const parsed = SkillDataSchema.parse({ ...data, source: data.source ?? "hub" });
    const existing = this.read(parsed.name);

    if (existing) {
      return this.patch(parsed.name, {
        ...parsed,
        version: ((existing.version as number) ?? 0) + 1,
      })!;
    }

    return this.create(parsed.name, parsed.description, parsed.steps, parsed);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; entries: number } {
    let entries = 0;
    let totalSize = 0;

    for (const [dir, entry] of this.cache) {
      entries++;
      totalSize += JSON.stringify(entry.data).length;
    }

    return { size: totalSize, entries };
  }
}
