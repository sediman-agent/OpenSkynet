/**
 * Skill Executor
 * Handles execution of skills with validation and error handling
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('SkillExecutor');

export interface ExecutionContext {
  [key: string]: any;
}

export interface ExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
  executionTime?: number;
}

export interface SkillExecutionOptions {
  timeout?: number;
  retryOnFailure?: boolean;
  maxRetries?: number;
}

/**
 * Skill Executor handles skill execution with validation and retries
 * This is extracted from skills/engine.ts
 */
export class SkillExecutor {
  constructor(
    private getSkill: (id: string) => any | null
  ) {}

  /**
   * Execute a skill by ID
   */
  async execute(
    skillId: string,
    input: any,
    options: SkillExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      logger.info(`[SkillExecutor] Executing skill: ${skillId}`);

      const skill = this.getSkill(skillId);
      if (!skill) {
        return {
          success: false,
          error: `Skill not found: ${skillId}`
        };
      }

      // Validate input if skill has parameters
      const validation = this.validateInput(skill, input);
      if (!validation.valid) {
        return {
          success: false,
          error: `Input validation failed: ${validation.errors.join(', ')}`
        };
      }

      // Execute with timeout
      const result = await this.executeWithTimeout(skill, input, options.timeout || 30000);

      const executionTime = Date.now() - startTime;

      logger.info(`[SkillExecutor] Skill ${skillId} executed successfully in ${executionTime}ms`);

      return {
        success: true,
        result,
        executionTime
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[SkillExecutor] Skill execution failed: ${message}`);

      // Retry if configured
      if (options.retryOnFailure && options.maxRetries && options.maxRetries > 0) {
        logger.info(`[SkillExecutor] Retrying skill ${skillId} (${options.maxRetries} attempts remaining)`);

        for (let i = 0; i < options.maxRetries; i++) {
          await this.delay(1000 * (i + 1));

          const retryResult = await this.execute(skillId, input, {
            ...options,
            retryOnFailure: false
          });

          if (retryResult.success) {
            return retryResult;
          }
        }
      }

      return {
        success: false,
        error: message
      };
    }
  }

  /**
   * Validate input against skill parameters
   */
  private validateInput(skill: any, input: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!skill.parameters) return { valid: true, errors: [] };

    for (const [name, param] of Object.entries(skill.parameters)) {
      const value = input[name];

      // Check required parameters
      if (param.required && (value === undefined || value === null)) {
        errors.push(`Missing required parameter: ${name}`);
        continue;
      }

      // Type validation
      if (value !== undefined && param.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== param.type && param.type !== 'any') {
          errors.push(`Parameter ${name}: expected ${param.type}, got ${actualType}`);
        }
      }

      // Custom validation if skill provides one
      if (param.validate && typeof param.validate === 'function') {
        const isValid = param.validate(value);
        if (!isValid) {
          errors.push(`Parameter ${name} validation failed`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Execute skill with timeout
   */
  private async executeWithTimeout(skill: any, input: any, timeout: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Execution timeout after ${timeout}ms`));
      }, timeout);

      skill
        .execute(input)
        .then(resolve)
        .catch(reject)
        .finally(() => clearTimeout(timeoutId));
    });
  }

  /**
   * Delay helper
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Batch execute multiple skills
   */
  async executeBatch(
    executions: Array<{ skillId: string; input: any }>,
    options?: SkillExecutionOptions
  ): Promise<ExecutionResult[]> {
    logger.info(`[SkillExecutor] Batch executing ${executions.length} skills`);

    const results: ExecutionResult[] = [];

    for (const execution of executions) {
      const result = await this.execute(execution.skillId, execution.input, options);
      results.push(result);

      // Stop on first failure if not retrying
      if (!result.success && !options?.retryOnFailure) {
        logger.warn(`[SkillExecutor] Batch execution stopped at ${execution.skillId}`);
        break;
      }
    }

    const successCount = results.filter(r => r.success).length;
    logger.info(`[SkillExecutor] Batch execution complete: ${successCount}/${executions.length} successful`);

    return results;
  }

  /**
   * Check if skill is loaded
   */
  isLoaded(skillId: string): boolean {
    const skill = this.getSkill(skillId);
    return skill !== null;
  }
}
