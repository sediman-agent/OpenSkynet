/**
 * Result History Manager
 * Manages result history storage and retrieval
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ResultEntry } from './types-new.js';
import { getConfig } from '../core/config.js';

/**
 * Result History Manager
 * This is extracted from scheduler/cron.ts
 */
export class ResultHistoryManager {
  private resultsFile: string;

  constructor(jobsDir: string) {
    this.resultsFile = join(jobsDir, 'results.jsonl');
  }

  /**
   * Append result to history
   */
  appendResult(jobId: string, task: string, result: string): void {
    mkdirSync(this.getJobsDir(), { recursive: true });
    const config = getConfig();
    const entry: ResultEntry = {
      job_id: jobId,
      task,
      result: result.slice(0, config.maxResultChars),
      timestamp: new Date().toISOString(),
    };
    appendFileSync(this.resultsFile, JSON.stringify(entry) + '\n');
    this.trimHistory(jobId);
  }

  /**
   * Read all results from history
   */
  readAllResults(): ResultEntry[] {
    if (!existsSync(this.resultsFile)) return [];

    const entries: ResultEntry[] = [];
    for (const line of readFileSync(this.resultsFile, 'utf-8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed));
      } catch {
        // Skip malformed entries
      }
    }
    return entries;
  }

  /**
   * Get results with optional filtering
   */
  getResults(options?: {
    jobId?: string;
    taskFilter?: string;
    limit?: number;
  }): ResultEntry[] {
    let entries = this.readAllResults();

    // Filter by job ID
    if (options?.jobId) {
      entries = entries.filter((e) => e.job_id === options.jobId);
    }

    // Filter by task keyword
    if (options?.taskFilter) {
      const kw = options.taskFilter.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.task.toLowerCase().includes(kw) ||
          e.result.toLowerCase().includes(kw)
      );
    }

    // Sort by timestamp (newest first)
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    // Limit results
    if (options?.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Get results for specific job
   */
  getJobResults(jobId: string, limit?: number): ResultEntry[] {
    return this.getResults({ jobId, limit });
  }

  /**
   * Search results by keyword
   */
  searchResults(keyword: string, limit = 10): ResultEntry[] {
    return this.getResults({ taskFilter: keyword, limit });
  }

  /**
   * Trim history to keep only recent entries
   */
  private trimHistory(jobId: string): void {
    if (!existsSync(this.resultsFile)) return;

    const config = getConfig();
    const entries = this.readAllResults();
    const jobEntries = entries.filter((e) => e.job_id === jobId);

    if (jobEntries.length <= config.maxResultsPerJob) return;

    // Keep only the most recent entries for this job
    const keepTimestamps = new Set(
      jobEntries.slice(-config.maxResultsPerJob).map((e) => e.timestamp)
    );
    const others = entries.filter((e) => e.job_id !== jobId);
    const kept = jobEntries.filter((e) => keepTimestamps.has(e.timestamp));
    const all = [...others, ...kept].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp)
    );

    writeFileSync(
      this.resultsFile,
      all.map((e) => JSON.stringify(e)).join('\n') + (all.length ? '\n' : '')
    );
  }

  /**
   * Clear all history
   */
  clearHistory(): boolean {
    try {
      if (existsSync(this.resultsFile)) {
        writeFileSync(this.resultsFile, '');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get history statistics
   */
  getStats(): {
    totalEntries: number;
    jobsCount: number;
    fileSize: number;
  } {
    const entries = this.readAllResults();
    const jobs = new Set(entries.map((e) => e.job_id));

    let fileSize = 0;
    try {
      const { statSync } = require('node:fs');
      fileSize = statSync(this.resultsFile).size;
    } catch {
      // File doesn't exist
    }

    return {
      totalEntries: entries.length,
      jobsCount: jobs.size,
      fileSize
    };
  }

  /**
   * Get jobs directory path
   */
  private getJobsDir(): string {
    // Extract jobs dir from results file path
    return this.resultsFile.replace(/\/[^\/]*$/, '');
  }
}
