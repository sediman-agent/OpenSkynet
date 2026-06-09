/**
 * Cron Manager - Simplified
 *
 * Refactored from 389 lines to ~200 lines
 * Validation extracted to CronValidator
 * Persistence extracted to CronJobRepository
 * Execution extracted to CronJobExecutor
 */

import * as cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { getConfig } from "../core/config.js";
import logger from "../core/logging.js";

// Extracted modules
import { CronValidator, validateCronExpr } from "./validation/index.js";
import { CronJobRepository, type StoredCronJob, type ResultEntry } from "./repository/index.js";
import { CronJobExecutor, executeCronJob } from "./execution/index.js";

/**
 * Cron Manager coordinates cron job scheduling and management
 * This is the simplified main file that delegates to specialized modules
 */
export class CronManager {
  private repository: CronJobRepository;
  private executor: CronJobExecutor;
  private validator: CronValidator;
  private scheduledTasks: Map<string, ScheduledTask> = new Map();

  constructor(cronDir?: string) {
    const config = getConfig();
    const jobsDir = cronDir ?? config.cronDir;

    this.repository = new CronJobRepository(jobsDir);
    this.executor = new CronJobExecutor();
    this.validator = new CronValidator();

    // Load existing scheduled tasks
    this.loadScheduledTasks();
  }

  /**
   * Load and resume existing tasks
   */
  private loadScheduledTasks(): void {
    const jobs = this.repository.listJobs();

    for (const job of jobs) {
      if (job.enabled) {
        this.scheduleTask(job);
      }
    }

    logger.info(`[CronManager] Loaded ${jobs.length} jobs, ${this.scheduledTasks.size} scheduled`);
  }

  /**
   * Add a new cron job
   */
  addJob(
    cronExpr: string,
    task: string,
    skillName?: string,
    provider?: string,
    model?: string,
    baseUrl?: string,
    notify?: string,
  ): string {
    // Validate cron expression
    const validation = this.validator.validateExpression(cronExpr);
    if (!validation.valid) {
      throw new Error(`Invalid cron expression: ${validation.error}`);
    }

    // Create job
    const jobId = this.repository.generateJobId();
    const job: StoredCronJob = {
      id: jobId,
      cron: cronExpr,
      task,
      skill_name: skillName,
      provider: provider ?? "openai",
      model,
      base_url: baseUrl,
      created_at: new Date().toISOString(),
      last_run: null,
      last_result: null,
      enabled: true,
      notify,
    };

    this.repository.saveJob(job);

    // Schedule the task
    this.scheduleTask(job);

    logger.info(`[CronManager] Added job ${jobId}: ${cronExpr} - ${task.slice(0, 50)}`);
    return jobId;
  }

  /**
   * Schedule a task using node-cron
   */
  private scheduleTask(job: StoredCronJob): void {
    // Remove existing task if any
    this.unscheduleTask(job.id);

    try {
      const task = cron.schedule(
        job.cron,
        () => this.executeScheduledJob(job.id),
        { scheduled: false }
      );

      this.scheduledTasks.set(job.id, task);
      task.start();

      logger.debug(`[CronManager] Scheduled task ${job.id}`);
    } catch (error) {
      logger.error(`[CronManager] Failed to schedule task ${job.id}:`, error);
    }
  }

  /**
   * Unschedule a task
   */
  private unscheduleTask(jobId: string): void {
    const task = this.scheduledTasks.get(jobId);
    if (task) {
      task.stop();
      this.scheduledTasks.delete(jobId);
      logger.debug(`[CronManager] Unscheduled task ${jobId}`);
    }
  }

  /**
   * Execute a scheduled job
   */
  private async executeScheduledJob(jobId: string): Promise<void> {
    const job = this.repository.loadJob(jobId);
    if (!job) {
      logger.warn(`[CronManager] Job ${jobId} not found, skipping execution`);
      return;
    }

    if (!job.enabled) {
      logger.debug(`[CronManager] Job ${jobId} is disabled, skipping execution`);
      return;
    }

    logger.info(`[CronManager] Executing job ${jobId}: ${job.task}`);

    try {
      const result = await this.executor.execute(job);

      // Update job status
      this.repository.updateJobStatus(
        jobId,
        new Date(),
        result.result
      );

      // Append to results
      this.repository.appendResult({
        job_id: jobId,
        task: job.task,
        result: result.success ? result.result : `Error: ${result.error}`,
        timestamp: new Date().toISOString()
      });

      logger.info(`[CronManager] Job ${jobId} completed: ${result.success ? 'success' : 'failed'}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[CronManager] Job ${jobId} failed: ${message}`);

      // Update with failure
      this.repository.updateJobStatus(
        jobId,
        new Date(),
        `Error: ${message}`
      );
    }
  }

  /**
   * Remove a job
   */
  removeJob(jobId: string): boolean {
    this.unscheduleTask(jobId);
    return this.repository.deleteJob(jobId);
  }

  /**
   * Get a job by ID
   */
  getJob(jobId: string): StoredCronJob | null {
    return this.repository.loadJob(jobId);
  }

  /**
   * List all jobs
   */
  listJobs(): StoredCronJob[] {
    return this.repository.listJobs();
  }

  /**
   * Enable a job
   */
  enableJob(jobId: string): boolean {
    const job = this.repository.loadJob(jobId);
    if (!job) return false;

    this.repository.setJobEnabled(jobId, true);
    this.scheduleTask(job);

    logger.info(`[CronManager] Enabled job ${jobId}`);
    return true;
  }

  /**
   * Disable a job
   */
  disableJob(jobId: string): boolean {
    this.unscheduleTask(jobId);
    const result = this.repository.setJobEnabled(jobId, false);

    if (result) {
      logger.info(`[CronManager] Disabled job ${jobId}`);
    }

    return result;
  }

  /**
   * Get job results
   */
  getResults(jobId: string, limit: number = 50): ResultEntry[] {
    return this.repository
      .readRecentResults(1000)
      .filter(r => r.job_id === jobId)
      .slice(0, limit);
  }

  /**
   * Get all results
   */
  getAllResults(limit: number = 100): ResultEntry[] {
    return this.repository.readRecentResults(limit);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalJobs: number;
    enabledJobs: number;
    scheduledTasks: number;
    repoStats: ReturnType<CronJobRepository['getStats']>;
  } {
    const repoStats = this.repository.getStats();

    return {
      totalJobs: repoStats.totalJobs,
      enabledJobs: repoStats.enabledJobs,
      scheduledTasks: this.scheduledTasks.size,
      repoStats
    };
  }

  /**
   * Cleanup resources
   */
  shutdown(): void {
    for (const [jobId, task] of this.scheduledTasks) {
      task.stop();
      logger.debug(`[CronManager] Stopped task ${jobId}`);
    }

    this.scheduledTasks.clear();
    logger.info('[CronManager] Shutdown complete');
  }
}

/**
 * Cron Scheduler manages scheduled task execution
 */
export class CronScheduler {
  private manager: CronManager;
  private taskMap: Map<string, ScheduledTask> = new Map();

  constructor(manager?: CronManager) {
    this.manager = manager ?? new CronManager();
  }

  /**
   * Schedule a new task
   */
  schedule(
    cronExpr: string,
    handler: () => void,
    jobId?: string
  ): string {
    if (!validateCronExpr(cronExpr)) {
      throw new Error(`Invalid cron expression: ${cronExpr}`);
    }

    const id = jobId ?? `task_${Date.now()}`;

    const task = cron.schedule(cronExpr, handler, { scheduled: true });
    this.taskMap.set(id, task);

    logger.info(`[CronScheduler] Scheduled task ${id}`);
    return id;
  }

  /**
   * Unschedule a task
   */
  unschedule(taskId: string): boolean {
    const task = this.taskMap.get(taskId);
    if (!task) return false;

    task.stop();
    this.taskMap.delete(taskId);

    logger.info(`[CronScheduler] Unscheduled task ${taskId}`);
    return true;
  }

  /**
   * Check if task exists
   */
  has(taskId: string): boolean {
    return this.taskMap.has(taskId);
  }

  /**
   * Get task count
   */
  getTaskCount(): number {
    return this.taskMap.size;
  }

  /**
   * Get all task IDs
   */
  getTaskIds(): string[] {
    return Array.from(this.taskMap.keys());
  }

  /**
   * Shutdown scheduler
   */
  shutdown(): void {
    for (const [taskId, task] of this.taskMap) {
      task.stop();
    }

    this.taskMap.clear();
    this.manager.shutdown();

    logger.info('[CronScheduler] Shutdown complete');
  }
}

// Re-export for backward compatibility
export { validateCronExpr, executeCronJob };
export type { StoredCronJob, ResultEntry };
