/**
 * Cron Job Repository
 * Handles persistence and storage of cron jobs
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync
} from "node:fs";
import { join } from "node:path";
import * as crypto from "node:crypto";
import { createLogger } from "../../core/logging.js";

const logger = createLogger('CronRepository');

const JOB_ID_RE = /^[a-f0-9]{1,12}$/;

export interface StoredCronJob {
  id: string;
  cron: string;
  task: string;
  skill_name?: string;
  provider: string;
  model?: string;
  base_url?: string;
  created_at: string;
  last_run: string | null;
  last_result: string | null;
  enabled: boolean;
  notify?: string;
}

export interface ResultEntry {
  job_id: string;
  task: string;
  result: string;
  timestamp: string;
}

/**
 * Cron Job Repository handles job persistence
 * This is extracted from scheduler/cron.ts
 */
export class CronJobRepository {
  private jobsDir: string;
  private resultsFile: string;
  private _dirEnsured = false;

  constructor(jobsDir: string) {
    this.jobsDir = jobsDir;
    this.resultsFile = join(jobsDir, "results.jsonl");
  }

  /**
   * Ensure directory exists
   */
  private ensureDir(): void {
    if (this._dirEnsured) return;
    mkdirSync(this.jobsDir, { recursive: true });
    this._dirEnsured = true;
  }

  /**
   * Get file path for a job
   */
  private jobPath(jobId: string): string {
    if (!JOB_ID_RE.test(jobId)) {
      throw new Error(`Invalid job ID: '${jobId}'`);
    }
    return join(this.jobsDir, `${jobId}.json`);
  }

  /**
   * Generate a new job ID
   */
  generateJobId(): string {
    return crypto.randomBytes(6).toString("hex").slice(0, 12);
  }

  /**
   * Save a job to storage
   */
  saveJob(job: StoredCronJob): void {
    this.ensureDir();
    const path = this.jobPath(job.id);
    writeFileSync(path, JSON.stringify(job, null, 2), "utf-8");
    logger.debug(`[CronRepository] Saved job ${job.id}`);
  }

  /**
   * Load a job from storage
   */
  loadJob(jobId: string): StoredCronJob | null {
    const path = this.jobPath(jobId);
    if (!existsSync(path)) return null;

    try {
      const content = readFileSync(path, "utf-8");
      return JSON.parse(content) as StoredCronJob;
    } catch (error) {
      logger.error(`[CronRepository] Failed to load job ${jobId}:`, error);
      return null;
    }
  }

  /**
   * Delete a job from storage
   */
  deleteJob(jobId: string): boolean {
    const path = this.jobPath(jobId);
    if (!existsSync(path)) return false;

    try {
      unlinkSync(path);
      logger.info(`[CronRepository] Deleted job ${jobId}`);
      return true;
    } catch (error) {
      logger.error(`[CronRepository] Failed to delete job ${jobId}:`, error);
      return false;
    }
  }

  /**
   * List all jobs
   */
  listJobs(): StoredCronJob[] {
    this.ensureDir();

    if (!existsSync(this.jobsDir)) return [];

    const jobs: StoredCronJob[] = [];

    try {
      for (const entry of readdirSync(this.jobsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

        const path = join(this.jobsDir, entry.name);
        try {
          const content = readFileSync(path, "utf-8");
          const job = JSON.parse(content) as StoredCronJob;

          // Validate structure
          if (job.id && job.cron && job.task) {
            jobs.push(job);
          }
        } catch (error) {
          logger.warn(`[CronRepository] Failed to parse job file ${entry.name}:`, error);
        }
      }
    } catch (error) {
      logger.error("[CronRepository] Failed to list jobs:", error);
    }

    return jobs;
  }

  /**
   * Update job status after execution
   */
  updateJobStatus(
    jobId: string,
    lastRun: Date,
    lastResult: string
  ): boolean {
    const job = this.loadJob(jobId);
    if (!job) return false;

    job.last_run = lastRun.toISOString();
    job.last_result = lastResult;
    this.saveJob(job);

    return true;
  }

  /**
   * Enable/disable a job
   */
  setJobEnabled(jobId: string, enabled: boolean): boolean {
    const job = this.loadJob(jobId);
    if (!job) return false;

    job.enabled = enabled;
    this.saveJob(job);

    logger.info(`[CronRepository] Job ${jobId} ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Append execution result
   */
  appendResult(entry: ResultEntry): void {
    this.ensureDir();

    const line = JSON.stringify(entry) + "\n";
    try {
      // Check if file exists, create with header if not
      if (!existsSync(this.resultsFile)) {
        writeFileSync(this.resultsFile, "", "utf-8");
      }

      // Append result
      const fs = require("node:fs");
      fs.appendFileSync(this.resultsFile, line, "utf-8");
    } catch (error) {
      logger.error("[CronRepository] Failed to append result:", error);
    }
  }

  /**
   * Read recent results (last N entries)
   */
  readRecentResults(limit: number = 100): ResultEntry[] {
    if (!existsSync(this.resultsFile)) return [];

    try {
      const content = readFileSync(this.resultsFile, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      // Parse from most recent to oldest
      const results: ResultEntry[] = [];
      for (let i = lines.length - 1; i >= 0 && results.length < limit; i--) {
        try {
          results.push(JSON.parse(lines[i]) as ResultEntry);
        } catch {
          // Skip invalid lines
        }
      }

      return results;
    } catch (error) {
      logger.error("[CronRepository] Failed to read results:", error);
      return [];
    }
  }

  /**
   * Clear old results
   */
  clearOldResults(keepCount: number = 1000): void {
    if (!existsSync(this.resultsFile)) return;

    try {
      const content = readFileSync(this.resultsFile, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);

      if (lines.length <= keepCount) return;

      // Keep only the most recent entries
      const recentLines = lines.slice(-keepCount);
      writeFileSync(this.resultsFile, recentLines.join("\n") + "\n", "utf-8");

      logger.info(`[CronRepository] Cleared old results, kept ${recentLines.length}`);
    } catch (error) {
      logger.error("[CronRepository] Failed to clear old results:", error);
    }
  }

  /**
   * Get repository statistics
   */
  getStats(): {
    totalJobs: number;
    enabledJobs: number;
    disabledJobs: number;
    resultsCount: number;
  } {
    const jobs = this.listJobs();
    const enabled = jobs.filter(j => j.enabled).length;
    const results = this.readRecentResults(10000); // Count all

    return {
      totalJobs: jobs.length,
      enabledJobs: enabled,
      disabledJobs: jobs.length - enabled,
      resultsCount: results.length
    };
  }
}
