/**
 * Job Storage
 * Handles job file storage and caching
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import type { StoredCronJob } from '../types.js';

const JOB_ID_RE = /^[a-f0-9]{1,12}$/;

/**
 * Job Storage
 * This is extracted from scheduler/cron.ts
 */
export class JobStorage {
  private _dirEnsured = false;

  constructor(
    private jobsDir: string
  ) {}

  /**
   * Ensure jobs directory exists
   */
  ensureDir(): void {
    if (this._dirEnsured) return;
    mkdirSync(this.jobsDir, { recursive: true });
    this._dirEnsured = true;
  }

  /**
   * Get file path for job
   */
  jobPath(jobId: string): string {
    if (!JOB_ID_RE.test(jobId)) {
      throw new Error(`Invalid job ID: '${jobId}'`);
    }
    return join(this.jobsDir, `${jobId}.json`);
  }

  /**
   * Read job from storage
   */
  readJob(jobId: string): StoredCronJob | null {
    try {
      const path = this.jobPath(jobId);
      if (existsSync(path)) {
        return JSON.parse(readFileSync(path, 'utf-8'));
      }
    } catch {
      // Invalid ID or read error
    }
    return null;
  }

  /**
   * Search for job by partial ID
   */
  searchJob(jobId: string): StoredCronJob | null {
    if (!existsSync(this.jobsDir)) return null;

    for (const name of readdirSync(this.jobsDir)) {
      if (!name.endsWith('.json')) continue;
      const stem = name.slice(0, -5);
      if (JOB_ID_RE.test(stem) && stem.startsWith(jobId)) {
        return JSON.parse(readFileSync(join(this.jobsDir, name), 'utf-8'));
      }
    }
    return null;
  }

  /**
   * Write job to storage
   */
  writeJob(job: StoredCronJob): void {
    this.ensureDir();
    const path = this.jobPath(job.id);
    writeFileSync(path, JSON.stringify(job, null, 2));
  }

  /**
   * Delete job from storage
   */
  deleteJob(jobId: string): boolean {
    try {
      const path = this.jobPath(jobId);
      if (existsSync(path)) {
        unlinkSync(path);
        return true;
      }
    } catch {
      // Invalid ID
    }

    // Try searching by partial ID
    if (!existsSync(this.jobsDir)) return false;
    for (const name of readdirSync(this.jobsDir)) {
      if (!name.endsWith('.json')) continue;
      const stem = name.slice(0, -5);
      if (JOB_ID_RE.test(stem) && stem.startsWith(jobId)) {
        unlinkSync(join(this.jobsDir, name));
        return true;
      }
    }

    return false;
  }

  /**
   * List all jobs
   */
  listJobs(): StoredCronJob[] {
    this.ensureDir();

    if (!existsSync(this.jobsDir)) return [];

    const jobs: StoredCronJob[] = [];
    for (const name of readdirSync(this.jobsDir).sort()) {
      if (!name.endsWith('.json')) continue;
      try {
        const data = JSON.parse(readFileSync(join(this.jobsDir, name), 'utf-8'));
        if (!data.id) data.id = name.slice(0, -5);
        jobs.push(data);
      } catch {
        // Skip invalid files
      }
    }
    return jobs;
  }

  /**
   * Count jobs
   */
  getJobCount(): number {
    return this.listJobs().length;
  }

  /**
   * Check if job exists
   */
  jobExists(jobId: string): boolean {
    return this.readJob(jobId) !== null || this.searchJob(jobId) !== null;
  }

  /**
   * Get jobs directory path
   */
  getJobsDir(): string {
    return this.jobsDir;
  }
}
