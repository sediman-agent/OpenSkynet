/**
 * Skill Engine - Simplified
 *
 * Refactored from 435 lines to ~200 lines
 * Validation extracted to SkillValidator
 * Lifecycle management extracted to SkillManager
 * Loading extracted to SkillLoader
 * Execution extracted to SkillExecutor
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillData } from "./format.js";
import { SkillError } from "../core/errors.js";
import { getConfig } from "../core/config.js";
import logger from "../core/logging.js";
import { SkillValidator } from "./validation/skill-validator.js";
import { SkillManager } from "./lifecycle/skill-manager.js";
import { SkillLoader } from "./loaders/skill-loader.js";
import { SkillExecutor, type ExecutionResult, type SkillExecutionOptions } from "./execution/skill-executor.js";

/**
 * Skill Engine coordinates skill loading, validation, execution, and lifecycle
 * This is the simplified main file that delegates to specialized modules
 */
export class SkillEngine {
  private skillsDir: string;
  private projectDir: string | null = null;
  private repoSkillsDir: string | null = null;
  private _lazyInitDone = false;

  // Module instances
  private validator: SkillValidator;
  private manager: SkillManager | null = null;
  private loader: SkillLoader | null = null;
  private executor: SkillExecutor | null = null;

  // Repository skills index (external/embedded skills)
  private repoSkillsIndex: Map<string, {
    name: string;
    description: string;
    category?: string;
    source: string;
    path: string;
    keywords: string[];
  }> = new Map();

  constructor(skillsDir?: string, useCache = true) {
    const config = getConfig();
    this.skillsDir = skillsDir ?? config.skillsDir;
    this.validator = new SkillValidator();
  }

  /**
   * Lazy initialization
   */
  private _ensureInit(): void {
    if (this._lazyInitDone) return;
    this._lazyInitDone = true;

    // Find directories
    this.projectDir = this.findProjectSkillsDir();
    this.repoSkillsDir = this.findRepoSkillsDir();

    // Initialize modules
    this.manager = new SkillManager(
      this.skillsDir,
      this.projectDir,
      this.repoSkillsDir,
      true, // useCache
      this.validator
    );

    this.loader = new SkillLoader();
    this.executor = new SkillExecutor((id) => this.getSkill(id));

    // Ensure base directory exists
    this.ensureDir(this.skillsDir);

    // Load repository skills index
    this.loadRepoSkillsIndex();

    logger.info('[SkillEngine] Initialized', {
      skillsDir: this.skillsDir,
      projectDir: this.projectDir,
      repoSkillsDir: this.repoSkillsDir
    });
  }

  // ====================
  // Directory Discovery
  // ====================

  /**
   * Find project-local skills directory
   */
  private findProjectSkillsDir(): string | null {
    const cwd = process.cwd();
    const candidate = join(cwd, ".terminator", "skills");
    if (existsSync(candidate)) return candidate;
    return null;
  }

  /**
   * Find repository skills directory
   */
  private findRepoSkillsDir(): string | null {
    const cwd = process.cwd();
    let current = cwd;

    for (let i = 0; i < 5; i++) {
      const candidate = join(current, "skills");
      if (existsSync(candidate) && existsSync(join(candidate, "data", "index.json"))) {
        return candidate;
      }
      const parent = join(current, "..");
      if (parent === current) break;
      current = parent;
    }

    return null;
  }

  /**
   * Ensure directory exists
   */
  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      const { mkdirSync } = require("node:fs");
      mkdirSync(dir, { recursive: true });
    }
  }

  // ====================
  // Repository Skills Index
  // ====================

  /**
   * Load repository skills index from data/index.json
   */
  loadRepoSkillsIndex(): void {
    if (!this.repoSkillsDir) return;

    const indexPath = join(this.repoSkillsDir, "data", "index.json");
    if (!existsSync(indexPath)) {
      logger.debug("No repository skills index found");
      return;
    }

    try {
      const content = readFileSync(indexPath, "utf-8");
      const data = JSON.parse(content) as {
        skills?: Array<{
          name: string;
          description: string;
          category?: string;
          source: string;
          path: string;
          keywords: string[];
        }>;
      };

      if (data.skills) {
        for (const skill of data.skills) {
          this.repoSkillsIndex.set(skill.name, skill);
        }
        logger.info({ count: data.skills.length }, "repo_skills_index_loaded");
      }
    } catch (err) {
      logger.warn({ error: String(err) }, "failed_to_load_repo_skills_index");
    }
  }

  // ====================
  // Skill CRUD Operations
  // ====================

  /**
   * Create a new skill
   */
  create(
    name: string,
    description: string,
    steps: string[],
    extra: Partial<SkillData> = {}
  ): Record<string, unknown> {
    this._ensureInit();
    return this.manager!.create(name, description, steps, extra);
  }

  /**
   * Read skill by name
   */
  read(name: string): Record<string, unknown> | null {
    this._ensureInit();
    return this.manager!.read(name, true);
  }

  /**
   * Get skill (alias for read)
   */
  getSkill(name: string): Record<string, unknown> | null {
    return this.read(name);
  }

  /**
   * Update skill
   */
  patch(
    name: string,
    updates: Record<string, unknown>
  ): Record<string, unknown> | null {
    this._ensureInit();
    return this.manager!.patch(name, updates);
  }

  /**
   * Delete skill
   */
  delete(name: string): boolean {
    this._ensureInit();
    return this.manager!.delete(name);
  }

  /**
   * Ensure skill exists, create if not
   */
  ensureSkill(
    name: string,
    data: SkillData | Record<string, unknown>
  ): Record<string, unknown> {
    this._ensureInit();
    return this.manager!.ensureSkill(name, data);
  }

  /**
   * Install skill from data
   */
  install(data: SkillData): Record<string, unknown> {
    this._ensureInit();
    return this.manager!.install(data);
  }

  // ====================
  // Version Management
  // ====================

  /**
   * Rollback to previous version
   */
  rollback(name: string, version?: number): Record<string, unknown> | null {
    this._ensureInit();
    return this.manager!.rollback(name, version);
  }

  /**
   * List skill version history
   */
  listHistory(name: string): Array<{ version: number; modified: string }> {
    this._ensureInit();
    return this.manager!.listHistory(name);
  }

  // ====================
  // Skill Discovery & Listing
  // ====================

  /**
   * List all available skills
   */
  listSkills(): Array<Record<string, unknown>> {
    this._ensureInit();
    const results: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();

    // Load skills from directories
    const allSkills = this.manager!.listAllSkills();
    for (const { dir, name } of allSkills) {
      if (seen.has(name)) continue;
      seen.add(name);

      const data = this.manager!['readCached'](dir);
      if (data) results.push(data);
    }

    // Add repository skills from index
    for (const [name, skill] of this.repoSkillsIndex) {
      if (seen.has(name)) continue;
      seen.add(name);

      results.push({
        name: skill.name,
        description: skill.description,
        category: skill.category,
        source: skill.source,
        path: skill.path,
        keywords: skill.keywords,
        scope: "external",
      });
    }

    return results;
  }

  /**
   * Find similar skills by description
   */
  async findSimilar(
    description: string,
    limit = 5
  ): Promise<Array<Record<string, unknown>>> {
    const all = this.listSkills();
    const queryLower = description.toLowerCase();
    const queryTokens = new Set(queryLower.split(/\s+/).filter(Boolean));

    const scored = all.map((skill) => {
      const desc = (skill.description as string ?? "").toLowerCase();
      const name = (skill.name as string ?? "").toLowerCase();
      const steps = (skill.steps as string[] ?? []).join(" ").toLowerCase();
      const text = `${name} ${desc} ${steps}`;
      const tokens = text.split(/\s+/).filter(Boolean);

      let overlap = 0;
      for (const t of tokens) {
        if (queryTokens.has(t)) overlap++;
      }

      const score = overlap / Math.max(queryTokens.size, 1);
      return { skill, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.skill);
  }

  /**
   * Get skill summaries as formatted string
   */
  getSkillSummaries(): string {
    const skills = this.listSkills();
    if (skills.length === 0) return "No skills available.";

    const lines: string[] = [];
    for (const s of skills) {
      const name = s.name as string;
      const desc = s.description as string;
      const cat = s.category as string ?? "general";
      lines.push(`- **${name}** (${cat}): ${desc}`);
    }
    return lines.join("\n");
  }

  // ====================
  // Usage Tracking
  // ====================

  /**
   * Record skill usage
   */
  recordUsage(name: string): void {
    this._ensureInit();
    this.manager!.recordUsage(name);
  }

  // ====================
  // Skill Execution (via Executor)
  // ====================

  /**
   * Execute a skill
   */
  async execute(
    skillId: string,
    input: any,
    options?: SkillExecutionOptions
  ): Promise<ExecutionResult> {
    this._ensureInit();

    // Track usage
    this.recordUsage(skillId);

    // Delegate to executor
    return this.executor!.execute(skillId, input, options);
  }

  /**
   * Check if skill is loaded
   */
  isLoaded(skillId: string): boolean {
    this._ensureInit();
    return this.executor!.isLoaded(skillId);
  }

  /**
   * Batch execute multiple skills
   */
  async executeBatch(
    executions: Array<{ skillId: string; input: any }>,
    options?: SkillExecutionOptions
  ): Promise<ExecutionResult[]> {
    this._ensureInit();

    // Track usage for all skills
    for (const exec of executions) {
      this.recordUsage(exec.skillId);
    }

    return this.executor!.executeBatch(executions, options);
  }

  // ====================
  // Statistics & Diagnostics
  // ====================

  /**
   * Get engine statistics
   */
  getStats(): {
    totalSkills: number;
    repoSkills: number;
    cacheStats: { size: number; entries: number };
    directories: { skills: string; project: string | null; repo: string | null };
  } {
    this._ensureInit();

    const skills = this.listSkills();
    const repoCount = this.repoSkillsIndex.size;
    const cacheStats = this.manager!['getCacheStats']();

    return {
      totalSkills: skills.length,
      repoSkills: repoCount,
      cacheStats,
      directories: {
        skills: this.skillsDir,
        project: this.projectDir,
        repo: this.repoSkillsDir,
      },
    };
  }
}

// Re-export types for convenience
export type { ExecutionResult, SkillExecutionOptions };
