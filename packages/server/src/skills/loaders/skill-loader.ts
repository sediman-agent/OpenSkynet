/**
 * Skill Loader
 * Handles dynamic loading and initialization of skills
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('SkillLoader');

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  path: string;
  enabled: boolean;
  dependencies?: string[];
  parameters?: ParameterInfo[];
}

export interface ParameterInfo {
  name: string;
  type: string;
  description: string;
  required: boolean;
  default?: any;
}

export interface LoadResult {
  success: boolean;
  skill?: any;
  error?: string;
}

/**
 * Skill Loader handles dynamic skill loading from files
 * This is extracted from skills/engine.ts
 */
export class SkillLoader {
  private loadedSkills: Map<string, any> = new Map();
  private skillRegistry: Map<string, SkillInfo> = new Map();

  /**
   * Load a skill from a file path
   */
  async loadFromPath(skillPath: string): Promise<LoadResult> {
    try {
      logger.debug(`[SkillLoader] Loading skill from: ${skillPath}`);

      // Import the skill module
      const skillModule = await import(skillPath);

      // Validate skill structure
      if (!skillModule.default || typeof skillModule.default !== 'object') {
        return {
          success: false,
          error: 'Invalid skill format: must export a default object'
        };
      }

      const skill = skillModule.default;

      // Validate required properties
      if (!skill.id || !skill.execute) {
        return {
          success: false,
          error: 'Invalid skill: missing id or execute method'
        };
      }

      // Store the skill
      this.loadedSkills.set(skill.id, skill);
      this.registerSkill(skill);

      logger.info(`[SkillLoader] Loaded skill: ${skill.id} (${skill.name})`);

      return {
        success: true,
        skill
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[SkillLoader] Failed to load skill from ${skillPath}: ${message}`);
      return {
        success: false,
        error: message
      };
    }
  }

  /**
   * Load skill by ID
   */
  async loadById(skillId: string): Promise<LoadResult> {
    const info = this.skillRegistry.get(skillId);
    if (!info) {
      return {
        success: false,
        error: `Skill not found: ${skillId}`
      };
    }

    return this.loadFromPath(info.path);
  }

  /**
   * Get a loaded skill
   */
  getSkill(id: string): any | null {
    return this.loadedSkills.get(id) || null;
  }

  /**
   * Get all loaded skills
   */
  getAllSkills(): Map<string, any> {
    return new Map(this.loadedSkills);
  }

  /**
   * Register skill info in registry
   */
  private registerSkill(skill: any): void {
    const info: SkillInfo = {
      id: skill.id,
      name: skill.name || 'Unknown',
      description: skill.description || '',
      version: skill.version || '1.0.0',
      author: skill.author,
      path: '', // Would be set by loadFromPath
      enabled: skill.enabled ?? true,
      parameters: this.extractParameterInfo(skill)
    };

    this.skillRegistry.set(skill.id, info);
  }

  /**
   * Extract parameter information from skill
   */
  private extractParameterInfo(skill: any): ParameterInfo[] {
    const params: ParameterInfo[] = [];

    if (!skill.parameters) return params;

    for (const [name, param] of Object.entries(skill.parameters)) {
      params.push({
        name,
        type: param.type || 'string',
        description: param.description || '',
        required: param.required || false,
        default: param.default
      });
    }

    return params;
  }

  /**
   * Unload a skill
   */
  unload(skillId: string): boolean {
    const skill = this.loadedSkills.get(skillId);
    if (!skill) return false;

    // Call cleanup if skill has one
    if (skill.cleanup && typeof skill.cleanup === 'function') {
      try {
        skill.cleanup();
      } catch (error) {
        logger.warn(`[SkillLoader] Error cleaning up skill ${skillId}:`, error);
      }
    }

    this.loadedSkills.delete(skillId);
    this.skillRegistry.delete(skillId);

    logger.info(`[SkillLoader] Unloaded skill: ${skillId}`);
    return true;
  }

  /**
   * Get skill info
   */
  getSkillInfo(skillId: string): SkillInfo | null {
    return this.skillRegistry.get(skillId) || null;
  }

  /**
   * Get all skill infos
   */
  getAllSkillInfos(): SkillInfo[] {
    return Array.from(this.skillRegistry.values());
  }

  /**
   * Get skills by category/tag
   */
  getSkillsByCategory(category: string): SkillInfo[] {
    return this.getAllSkillInfos().filter(skill =>
      skill.description.toLowerCase().includes(category.toLowerCase()) ||
      skill.name.toLowerCase().includes(category.toLowerCase())
    );
  }

  /**
   * Clear all loaded skills
   */
  clear(): void {
    // Cleanup all skills
    for (const [id, skill] of this.loadedSkills) {
      if (skill.cleanup && typeof skill.cleanup === 'function') {
        try {
          skill.cleanup();
        } catch (error) {
          logger.warn(`[SkillLoader] Error cleaning up skill ${id}:`, error);
        }
      }
    }

    this.loadedSkills.clear();
    this.skillRegistry.clear();

    logger.info('[SkillLoader] All skills cleared');
  }

  /**
   * Get registry stats
   */
  getStats(): { total: number; enabled: number; byCategory: Record<string, number> } {
    const all = this.getAllSkillInfos();
    const enabled = all.filter(s => s.enabled);

    const byCategory: Record<string, number> = {};
    for (const skill of all) {
      const category = this.extractCategory(skill);
      byCategory[category] = (byCategory[category] || 0) + 1;
    }

    return {
      total: all.length,
      enabled: enabled.length,
      byCategory
    };
  }

  /**
   * Extract category from skill info
   */
  private extractCategory(skill: SkillInfo): string {
    // Simple category extraction from description
    const desc = skill.description.toLowerCase();
    if (desc.includes('browse')) return 'browsing';
    if (desc.includes('data')) return 'data';
    if (desc.includes('file')) return 'file';
    if (desc.includes('system')) return 'system';
    if (desc.includes('web')) return 'web';
    return 'general';
  }
}
