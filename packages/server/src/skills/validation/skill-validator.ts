/**
 * Skill Validator
 * Handles validation of skill names, paths, and data structures
 */

import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { SkillError } from "../../core/errors";
import { getConfig } from "../../core/config";
import type { SkillData } from "../format";
import { SkillDataSchema } from "../format";

const config = getConfig();

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Skill Validator handles all validation logic
 * This is extracted from skills/engine.ts
 */
export class SkillValidator {
  /**
   * Check if skill name is safe (alphanumeric with hyphens, reasonable length)
   */
  isSafeName(name: string): boolean {
    return config.safeNameRe.test(name) && name.length <= config.maxNameLength;
  }

  /**
   * Validate skill name and throw if invalid
   */
  validateName(name: string): void {
    if (!this.isSafeName(name)) {
      throw new SkillError(
        `Invalid skill name: "${name}". Use lowercase alphanumeric with hyphens.`,
        "INVALID_NAME"
      );
    }
  }

  /**
   * Validate path is within allowed roots (prevent path traversal)
   */
  validatePath(dir: string, allowedRoots: string[]): void {
    const resolved = resolve(dir);
    const ok = allowedRoots.some(
      (root) => resolved === root || resolved.startsWith(root + "/")
    );
    if (!ok) {
      throw new SkillError(`Path traversal detected: ${resolved}`, "PATH_TRAVERSAL");
    }
  }

  /**
   * Validate skill data structure
   */
  validateSkillData(data: unknown): ValidationResult {
    const errors: string[] = [];

    try {
      const parsed = SkillDataSchema.parse(data);

      // Validate name
      if (!this.isSafeName(parsed.name)) {
        errors.push(`Invalid skill name: "${parsed.name}"`);
      }

      // Validate description
      if (!parsed.description || typeof parsed.description !== 'string') {
        errors.push('Description is required and must be a string');
      }

      // Validate steps
      if (!parsed.steps || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
        errors.push('Steps must be a non-empty array');
      }

      return {
        valid: errors.length === 0,
        errors
      };
    } catch (error) {
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Validate skill directory exists and is accessible
   */
  validateDirectory(dir: string): ValidationResult {
    const errors: string[] = [];

    if (!existsSync(dir)) {
      errors.push(`Directory does not exist: ${dir}`);
      return { valid: false, errors };
    }

    try {
      const stat = statSync(dir);
      if (!stat.isDirectory()) {
        errors.push(`Path is not a directory: ${dir}`);
      }
    } catch (error) {
      errors.push(`Cannot access directory: ${dir}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate skill.json exists in directory
   */
  validateSkillFile(dir: string): ValidationResult {
    const errors: string[] = [];
    const filePath = join(dir, "skill.json");

    if (!existsSync(filePath)) {
      errors.push(`skill.json not found in: ${dir}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate and parse skill data with detailed errors
   */
  parseAndValidate(data: unknown): { success: boolean; data?: SkillData; errors?: string[] } {
    try {
      const parsed = SkillDataSchema.parse(data);
      const validation = this.validateSkillData(parsed);

      if (!validation.valid) {
        return { success: false, errors: validation.errors };
      }

      return { success: true, data: parsed };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Validate skill parameters for execution
   */
  validateExecutionParameters(skill: SkillData, params: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];

    // Check if skill has parameter definitions
    if (skill.parameters) {
      for (const [paramName, paramDef] of Object.entries(skill.parameters)) {
        const value = params[paramName];

        // Check required parameters
        if (paramDef.required && (value === undefined || value === null)) {
          errors.push(`Missing required parameter: ${paramName}`);
        }

        // Type validation
        if (value !== undefined && paramDef.type) {
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (actualType !== paramDef.type && paramDef.type !== 'any') {
            errors.push(`Parameter ${paramName}: expected ${paramDef.type}, got ${actualType}`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate skill version for rollback
   */
  validateVersion(version: number | undefined, availableVersions: number[]): ValidationResult {
    const errors: string[] = [];

    if (version !== undefined && !availableVersions.includes(version)) {
      errors.push(`Version ${version} not found. Available: ${availableVersions.join(', ')}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
