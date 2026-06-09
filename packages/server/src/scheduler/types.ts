/**
 * Scheduler Types
 * Shared types for the cron scheduler
 */

/**
 * Stored cron job
 */
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

/**
 * Result history entry
 */
export interface ResultEntry {
  job_id: string;
  task: string;
  result: string;
  timestamp: string;
}

/**
 * Job statistics
 */
export interface JobStats {
  total: number;
  enabled: number;
  disabled: number;
  lastRun: string | null;
}
