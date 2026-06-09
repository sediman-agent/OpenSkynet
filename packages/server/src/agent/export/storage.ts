/**
 * Conversation Storage
 * Handles file storage and directory management for conversation exports
 */

import { writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { getConfig } from '../../core/config.js';
import { createLogger } from '../../core/logging.js';
import type { FormattedContent } from './formatters.js';

const logger = createLogger('conversation-storage');

/**
 * Conversation Storage Manager
 * This is extracted from agent/export/conversation-exporter.ts
 */
export class ConversationStorage {
  private exportDir: string;

  constructor() {
    const config = getConfig();
    this.exportDir = join(config.dataDir, 'conversations');
  }

  /**
   * Ensure export directory exists
   */
  async ensureDir(): Promise<void> {
    if (!existsSync(this.exportDir)) {
      await mkdir(this.exportDir, { recursive: true });
      logger.info({ dir: this.exportDir }, 'storage_dir_created');
    }
  }

  /**
   * Write formatted content to file
   */
  async write(
    sessionId: string,
    timestamp: string,
    formatted: FormattedContent
  ): Promise<string> {
    await this.ensureDir();

    const filename = `${sessionId}_${timestamp}.${formatted.extension}`;
    const filepath = join(this.exportDir, filename);

    await writeFile(filepath, formatted.content, 'utf-8');
    logger.info({ file: filepath }, 'conversation_written');

    return filepath;
  }

  /**
   * Delete a file by name
   */
  async deleteFile(filename: string): Promise<boolean> {
    try {
      await unlink(join(this.exportDir, filename));
      logger.info({ file: filename }, 'conversation_deleted');
      return true;
    } catch (error) {
      logger.warn({ err: (error as Error).message, file: filename }, 'delete_failed');
      return false;
    }
  }

  /**
   * List all files in export directory
   */
  async listFiles(): Promise<string[]> {
    try {
      await this.ensureDir();
      return await readdir(this.exportDir);
    } catch (error) {
      logger.error({ err: (error as Error).message }, 'list_files_failed');
      return [];
    }
  }

  /**
   * Read file content
   */
  async readFile(filename: string): Promise<string | null> {
    try {
      const { readFile } = await import('node:fs/promises');
      const content = await readFile(join(this.exportDir, filename), 'utf-8');
      return content;
    } catch (error) {
      logger.error({ err: (error as Error).message, file: filename }, 'read_file_failed');
      return null;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filename: string): Promise<boolean> {
    const files = await this.listFiles();
    return files.includes(filename);
  }

  /**
   * Get file statistics
   */
  async getStats(): Promise<{ totalFiles: number; totalSize: number; byFormat: Record<string, number> }> {
    const files = await this.listFiles();
    const byFormat: Record<string, number> = {};
    let totalSize = 0;

    for (const file of files) {
      const ext = file.split('.').pop() || 'unknown';
      byFormat[ext] = (byFormat[ext] || 0) + 1;

      try {
        const { statSync } = await import('node:fs');
        const filepath = join(this.exportDir, file);
        totalSize += statSync(filepath).size;
      } catch {
        // Skip files that can't be read
      }
    }

    return {
      totalFiles: files.length,
      totalSize,
      byFormat,
    };
  }

  /**
   * Clear all files in export directory
   */
  async clearAll(): Promise<number> {
    const files = await this.listFiles();
    let deleted = 0;

    for (const file of files) {
      const success = await this.deleteFile(file);
      if (success) deleted++;
    }

    logger.info({ deleted, total: files.length }, 'storage_cleared');
    return deleted;
  }

  /**
   * Get export directory path
   */
  getExportDir(): string {
    return this.exportDir;
  }

  /**
   * Generate timestamp string
   */
  generateTimestamp(): string {
    return new Date().toISOString().replace(/[:.]/g, '-');
  }
}
