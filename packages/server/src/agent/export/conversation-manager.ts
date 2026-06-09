/**
 * Conversation Manager
 * Manages exported conversations (list, load, delete)
 */

import { ConversationStorage } from './storage.js';
import type { ConversationData, ExportedConversationInfo, ConversationStats } from './types.js';
import { createLogger } from '../../core/logging.js';

const logger = createLogger('conversation-manager');

/**
 * Conversation Manager
 * This is extracted from agent/export/conversation-exporter.ts
 */
export class ConversationManager {
  constructor(private storage: ConversationStorage) {}

  /**
   * List exported conversations
   */
  async listConversations(limit = 50): Promise<ExportedConversationInfo[]> {
    const files = await this.storage.listFiles();

    const conversations = files
      .filter(
        filename =>
          filename.endsWith('.json') || filename.endsWith('.md') || filename.endsWith('.txt')
      )
      .map(filename => this.parseFilename(filename))
      .filter(info => info.sessionId !== 'unknown')
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);

    return conversations;
  }

  /**
   * Load exported conversation
   */
  async loadConversation(sessionId: string, timestamp?: string): Promise<ConversationData | null> {
    const files = await this.storage.listFiles();

    const matchingFile = files.find(filename => {
      const parts = filename.split('_');
      return parts[0] === sessionId && (!timestamp || parts[1]?.startsWith(timestamp));
    });

    if (!matchingFile) {
      logger.warn({ sessionId, timestamp }, 'conversation_not_found');
      return null;
    }

    try {
      const content = await this.storage.readFile(matchingFile);
      if (!content) {
        return null;
      }

      const data = JSON.parse(content) as ConversationData;
      logger.info({ sessionId, file: matchingFile }, 'conversation_loaded');
      return data;
    } catch (error) {
      logger.error({ err: (error as Error).message }, 'load_conversation_failed');
      return null;
    }
  }

  /**
   * Delete exported conversation
   */
  async deleteConversation(sessionId: string, timestamp?: string): Promise<boolean> {
    const files = await this.storage.listFiles();

    let deleted = false;

    for (const filename of files) {
      const parts = filename.split('_');
      if (parts[0] === sessionId && (!timestamp || parts[1]?.startsWith(timestamp))) {
        const success = await this.storage.deleteFile(filename);
        if (success) {
          deleted = true;
          logger.info({ sessionId, file: filename }, 'conversation_deleted');
        }
      }
    }

    return deleted;
  }

  /**
   * Get conversation statistics
   */
  async getStats(): Promise<ConversationStats> {
    const storageStats = await this.storage.getStats();
    return {
      totalConversations: storageStats.totalFiles,
      byFormat: storageStats.byFormat,
      totalSize: storageStats.totalSize,
    };
  }

  /**
   * Search conversations by task
   */
  async searchByTask(searchTerm: string, limit = 20): Promise<ExportedConversationInfo[]> {
    const conversations = await this.listConversations(1000); // Get all for searching

    const matches: ExportedConversationInfo[] = [];

    for (const info of conversations) {
      if (matches.length >= limit) break;

      const data = await this.loadConversation(info.sessionId, info.timestamp);
      if (data && data.task.toLowerCase().includes(searchTerm.toLowerCase())) {
        matches.push(info);
      }
    }

    return matches;
  }

  /**
   * Parse filename to extract conversation info
   */
  private parseFilename(filename: string): ExportedConversationInfo {
    const parts = filename.split('_');
    const format = filename.split('.').pop() || 'unknown';

    return {
      filename,
      sessionId: parts[0] || 'unknown',
      timestamp: parts[1]?.split('.')[0] || 'unknown',
      format,
    };
  }

  /**
   * Get conversations by format
   */
  async getConversationsByFormat(format: 'json' | 'md' | 'txt'): Promise<ExportedConversationInfo[]> {
    const all = await this.listConversations();
    return all.filter(info => info.format === format);
  }
}
