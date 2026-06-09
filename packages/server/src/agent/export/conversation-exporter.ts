/**
 * Conversation Exporter - Simplified
 *
 * Refactored from 335 lines to ~100 lines
 * Formatters extracted to export/formatters.ts
 * Types extracted to export/types.ts
 * Storage extracted to export/storage.ts
 * Conversation management extracted to export/conversation-manager.ts
 */

import { randomUUID } from 'node:crypto';
import type { ConversationExportFormat, ConversationData, ExportOptions, ExportResult } from './types.js';
import { ConversationFormatters } from './formatters.js';
import { ConversationStorage } from './storage.js';
import { ConversationManager } from './conversation-manager.js';
import { createLogger } from '../../core/logging.js';

const logger = createLogger('conversation-exporter');

// Re-export types
export * from './types.js';

// ============================================================================
// Conversation Exporter
// ============================================================================

export class ConversationExporter {
  private storage: ConversationStorage;
  private manager: ConversationManager;

  constructor() {
    this.storage = new ConversationStorage();
    this.manager = new ConversationManager(this.storage);
  }

  /**
   * Export conversation to multiple formats
   *
   * @param data - Conversation data to export
   * @param options - Export options (formats, timestamp, sessionId)
   * @returns Export result with file paths
   */
  async exportConversation(
    data: ConversationData,
    options: ExportOptions = {}
  ): Promise<ExportResult> {
    const formats = options.formats || { json: true, markdown: true, txt: false };
    const timestamp = options.timestamp || this.storage.generateTimestamp();
    const sessionId = options.sessionId || data.sessionId;

    const exportedFiles: string[] = [];

    // Export as JSON
    if (formats.json) {
      const formatted = ConversationFormatters.formatAsJSON(data);
      const filepath = await this.storage.write(sessionId, timestamp, formatted);
      exportedFiles.push(filepath);
    }

    // Export as Markdown
    if (formats.markdown) {
      const formatted = ConversationFormatters.formatAsMarkdown(data);
      const filepath = await this.storage.write(sessionId, timestamp, formatted);
      exportedFiles.push(filepath);
    }

    // Export as plain text
    if (formats.txt) {
      const formatted = ConversationFormatters.formatAsText(data);
      const filepath = await this.storage.write(sessionId, timestamp, formatted);
      exportedFiles.push(filepath);
    }

    logger.info({ sessionId, files: exportedFiles.length }, 'conversation_exported');

    return {
      files: exportedFiles,
      sessionId,
      timestamp,
    };
  }

  /**
   * List exported conversations
   */
  async listExportedConversations(limit = 50) {
    return this.manager.listConversations(limit);
  }

  /**
   * Load exported conversation
   */
  async loadConversation(sessionId: string, timestamp?: string) {
    return this.manager.loadConversation(sessionId, timestamp);
  }

  /**
   * Delete exported conversation
   */
  async deleteConversation(sessionId: string, timestamp?: string) {
    return this.manager.deleteConversation(sessionId, timestamp);
  }

  /**
   * Clear all exported conversations
   */
  async clearAllConversations(): Promise<number> {
    return this.storage.clearAll();
  }

  /**
   * Get conversation statistics
   */
  async getStats() {
    return this.manager.getStats();
  }

  /**
   * Search conversations by task
   */
  async searchByTask(searchTerm: string, limit = 20) {
    return this.manager.searchByTask(searchTerm, limit);
  }

  /**
   * Generate unique session ID
   */
  generateSessionId(): string {
    return randomUUID();
  }

  /**
   * Get export directory path
   */
  getExportDir(): string {
    return this.storage.getExportDir();
  }

  /**
   * Format conversation summary
   */
  formatSummary(data: ConversationData): string {
    return ConversationFormatters.formatSummary(data);
  }

  /**
   * Get available export formats
   */
  getAvailableFormats() {
    return ConversationFormatters.getAvailableFormats();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a conversation exporter instance
 */
export function createConversationExporter(): ConversationExporter {
  return new ConversationExporter();
}

// ============================================================================
// Re-export classes for direct use
// ============================================================================

export { ConversationFormatters, ConversationStorage, ConversationManager };
