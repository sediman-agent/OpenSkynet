/**
 * Cron Job Executor
 * Handles execution of scheduled cron jobs
 */

import type { StoredCronJob } from "../repository/cron-repository.js";
import { createLogger } from "../../core/logging.js";

const logger = createLogger('CronExecutor');

export interface JobExecutionContext {
  jobId: string;
  task: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  skillName?: string;
}

export interface JobExecutionResult {
  success: boolean;
  result: string;
  error?: string;
  duration: number;
}

/**
 * Cron Job Executor handles job execution
 * This is extracted from scheduler/cron.ts
 */
export class CronJobExecutor {
  /**
   * Execute a cron job
   */
  async execute(job: StoredCronJob): Promise<JobExecutionResult> {
    const startTime = Date.now();

    logger.info(`[CronExecutor] Executing job ${job.id}: ${job.task}`);

    try {
      // Build context for execution
      const context: JobExecutionContext = {
        jobId: job.id,
        task: job.task,
        provider: job.provider,
        model: job.model,
        baseUrl: job.base_url,
        skillName: job.skill_name
      };

      // Execute based on job type
      let result: string;

      if (job.skill_name) {
        result = await this.executeSkillJob(context);
      } else {
        result = await this.executeAgentJob(context);
      }

      const duration = Date.now() - startTime;

      logger.info(`[CronExecutor] Job ${job.id} completed in ${duration}ms`);

      return {
        success: true,
        result,
        duration
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      logger.error(`[CronExecutor] Job ${job.id} failed: ${message}`);

      return {
        success: false,
        result: message,
        error: message,
        duration
      };
    }
  }

  /**
   * Execute a skill-based job
   */
  private async executeSkillJob(context: JobExecutionContext): Promise<string> {
    logger.info(`[CronExecutor] Executing skill job: ${context.skillName}`);

    // Import skill engine dynamically
    const { SkillEngine } = await import("../../skills/engine.js");

    const skillEngine = new SkillEngine();

    // Find and execute the skill
    const skill = skillEngine.getSkill(context.skillName!);
    if (!skill) {
      throw new Error(`Skill not found: ${context.skillName}`);
    }

    // Execute skill with task as input
    const result = await skillEngine.execute(context.skillName!, {
      task: context.task
    });

    if (!result.success) {
      throw new Error(result.error || "Skill execution failed");
    }

    return result.result || "Skill executed successfully";
  }

  /**
   * Execute an agent-based job
   */
  private async executeAgentJob(context: JobExecutionContext): Promise<string> {
    logger.info(`[CronExecutor] Executing agent job with provider: ${context.provider}`);

    // Import agent factory dynamically
    const { createAgent } = await import("../../agent/factory.js");

    // Build agent options
    const agentOptions: any = {
      provider: context.provider || "openai",
      model: context.model,
      baseUrl: context.baseUrl
    };

    const agent = createAgent(agentOptions);

    // Run the agent with the task
    const response = await agent.run(context.task, {
      stream: false,
      timeout: 300000 // 5 minutes
    });

    return response.result || response.finalResponse || "Task completed";
  }

  /**
   * Execute job with retry logic
   */
  async executeWithRetry(
    job: StoredCronJob,
    maxRetries: number = 3
  ): Promise<JobExecutionResult> {
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      logger.info(`[CronExecutor] Attempt ${attempt}/${maxRetries} for job ${job.id}`);

      const result = await this.execute(job);

      if (result.success) {
        return result;
      }

      lastError = result.error || result.result;

      // Don't retry if it's a validation error
      if (this.isValidationError(result.error)) {
        logger.warn(`[CronExecutor] Validation error for job ${job.id}, not retrying`);
        return result;
      }

      // Exponential backoff before retry
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        logger.info(`[CronExecutor] Retrying job ${job.id} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted
    return {
      success: false,
      result: lastError || "Job failed after all retries",
      error: lastError || undefined,
      duration: 0
    };
  }

  /**
   * Check if error is a validation error (non-retryable)
   */
  private isValidationError(error?: string): boolean {
    if (!error) return false;

    const validationPatterns = [
      /invalid/i,
      /not found/i,
      /validation/i,
      /unauthorized/i,
      /authentication/i
    ];

    return validationPatterns.some(pattern => pattern.test(error));
  }

  /**
   * Execute job in background (fire and forget)
   */
  executeInBackground(job: StoredCronJob): void {
    // Execute without awaiting
    this.execute(job).catch(error => {
      logger.error(`[CronExecutor] Background job failed:`, error);
    });
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    jobsExecuted: number;
    jobsSucceeded: number;
    jobsFailed: number;
    averageDuration: number;
  } {
    // This would be tracked in a real implementation
    return {
      jobsExecuted: 0,
      jobsSucceeded: 0,
      jobsFailed: 0,
      averageDuration: 0
    };
  }
}

/**
 * Execute a cron job (standalone function for backward compatibility)
 */
export async function executeCronJob(job: StoredCronJob): Promise<string> {
  const executor = new CronJobExecutor();
  const result = await executor.execute(job);

  if (!result.success) {
    throw new Error(result.error || result.result);
  }

  return result.result;
}
