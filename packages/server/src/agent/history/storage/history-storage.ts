/**
 * History Storage
 * Handles file I/O operations for agent history
 */

import { randomUUID } from 'node:crypto';
import { writeFile, readFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createLogger } from '../../../../core/logging';
import type { AgentHistoryEntry } from '../history-manager.js';

const logger = createLogger('HistoryStorage');

/**
 * History Storage handles persistence of agent history
 * This is extracted from agent/history/history-manager.ts
 */
export class HistoryStorage {
  constructor(private historyDir: string) {}

  /**
   * Ensure history directory exists
   */
  async ensureDir(): Promise<void> {
    if (!existsSync(this.historyDir)) {
      await mkdir(this.historyDir, { recursive: true });
    }
  }

  /**
   * Save history entry
   */
  async save(entry: Omit<AgentHistoryEntry, 'id' | 'timestamp'>): Promise<string> {
    await this.ensureDir();

    const id = randomUUID();
    const timestamp = new Date().toISOString();

    const historyEntry: AgentHistoryEntry = {
      id,
      timestamp,
      ...entry
    };

    const filename = join(this.historyDir, `${id}.json`);
    await writeFile(filename, JSON.stringify(historyEntry, null, 2), 'utf-8');

    logger.info({ id, task: entry.task.slice(0, 50) }, 'history_saved');

    return id;
  }

  /**
   * Load history entry by ID
   */
  async load(id: string): Promise<AgentHistoryEntry | null> {
    await this.ensureDir();

    const filename = join(this.historyDir, `${id}.json`);

    if (!existsSync(filename)) {
      logger.warn({ id }, 'history_not_found');
      return null;
    }

    try {
      const content = await readFile(filename, 'utf-8');
      return JSON.parse(content) as AgentHistoryEntry;
    } catch (error) {
      logger.error({ err: (error as Error).message, id }, 'history_load_failed');
      return null;
    }
  }

  /**
   * Delete history entry
   */
  async delete(id: string): Promise<boolean> {
    const filename = join(this.historyDir, `${id}.json`);

    if (!existsSync(filename)) {
      return false;
    }

    try {
      await unlink(filename);
      logger.info({ id }, 'history_deleted');
      return true;
    } catch (error) {
      logger.error({ err: (error as Error).message, id }, 'history_delete_failed');
      return false;
    }
  }

  /**
   * List all history entries
   */
  async list(limit = 50): Promise<AgentHistoryEntry[]> {
    await this.ensureDir();

    try {
      const files = await readdir(this.historyDir);
      const entries: AgentHistoryEntry[] = [];

      for (const file of files.slice(-limit)) {
        if (file.endsWith('.json')) {
          try {
            const content = await readFile(join(this.historyDir, file), 'utf-8');
            entries.push(JSON.parse(content) as AgentHistoryEntry);
          } catch (error) {
            logger.warn({ err: (error as Error).message, file }, 'history_entry_skip');
          }
        }
      }

      // Sort by timestamp descending (newest first)
      return entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    } catch (error) {
      logger.error({ err: (error as Error).message }, 'history_list_failed');
      return [];
    }
  }

  /**
   * Clear all history
   */
  async clear(): Promise<number> {
    await this.ensureDir();

    try {
      const files = await readdir(this.historyDir);
      let deleted = 0;

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            await unlink(join(this.historyDir, file));
            deleted++;
          } catch (error) {
            logger.warn({ err: (error as Error).message, file }, 'history_clear_skip');
          }
        }
      }

      logger.info({ deleted }, 'history_cleared');
      return deleted;
    } catch (error) {
      logger.error({ err: (error as Error).message }, 'history_clear_failed');
      return 0;
    }
  }

  /**
   * Get all JSON file names
   */
  async getFileNames(): Promise<string[]> {
    await this.ensureDir();

    try {
      const files = await readdir(this.historyDir);
      return files.filter(f => f.endsWith('.json'));
    } catch (error) {
      logger.error({ err: (error as Error).message }, 'history_files_failed');
      return [];
    }
  }

  /**
   * Get file path for history entry
   */
  getFilePath(id: string): string {
    return join(this.historyDir, `${id}.json`);
  }

  /**
   * Check if history entry exists
   */
  exists(id: string): boolean {
    return existsSync(this.getFilePath(id));
  }

  /**
   * Get storage directory path
   */
  getStorageDir(): string {
    return this.historyDir;
  }
}
