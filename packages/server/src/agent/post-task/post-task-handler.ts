/**
 * Post-Task Handler
 * Handles tasks that run after agent execution completes
 */

import type { AgentResult, StepEvent } from '../../core/types.js';
import type { Message } from '../../llm/provider.js';
import { createLogger } from '../../core/logging.js';
import { getConfig } from '../../core/config.js';

const logger = createLogger('PostTaskHandler');

export interface PostTaskContext {
  task: string;
  result: string;
  success: boolean;
  category?: string;
  mode?: string;
  iterations: number;
  elapsedSecs: number;
  actionsTaken: string[];
  steps: StepEvent[];
  conversation: Message[];
  startTime?: number;
  endTime?: number;
}

/**
 * Handles post-execution tasks
 */
export class PostTaskHandler {
  private conversationExporter: any = null;
  private historyManager: any = null;

  /**
   * Handle all post-execution tasks
   */
  async handle(context: PostTaskContext): Promise<void> {
    const tasks = [
      () => this.saveToDatabase(context),
      () => this.exportConversation(context),
      () => this.saveToHistory(context),
    ];

    for (const task of tasks) {
      try {
        await task();
      } catch (error) {
        logger.warn('[PostTaskHandler] Task failed:', error);
      }
    }
  }

  /**
   * Save session to database
   */
  private async saveToDatabase(context: PostTaskContext): Promise<void> {
    try {
      const { saveSession } = await import('../../memory/sessions.js');
      await saveSession({
        task: context.task,
        steps: context.steps,
        result: context.success ? context.result : undefined,
      });
      logger.info({ task: context.task.slice(0, 50), success: context.success }, 'session_saved_to_db');
    } catch (saveErr) {
      logger.warn({ err: (saveErr as Error).message }, 'session_save_failed');
    }
  }

  /**
   * Export conversation if enabled
   */
  private async exportConversation(context: PostTaskContext): Promise<void> {
    const config = getConfig();

    if (!config.autoExportConversations) {
      return;
    }

    try {
      // Lazy load ConversationExporter
      if (!this.conversationExporter) {
        const { ConversationExporter } = await import('../export.js');
        this.conversationExporter = new ConversationExporter();
      }

      const sessionId = this.conversationExporter.generateSessionId();
      const exportedFiles = await this.conversationExporter.exportConversation({
        sessionId,
        task: context.task,
        conversation: context.conversation,
        result: context.result,
        success: context.success,
        iterations: context.iterations,
        strategyUsed: context.mode || 'direct',
        elapsedSecs: context.elapsedSecs,
        actionsTaken: context.actionsTaken,
        metadata: {
          category: context.category,
          startTime: context.startTime ? new Date(context.startTime).toISOString() : undefined,
          endTime: context.endTime ? new Date(context.endTime).toISOString() : undefined,
        }
      }, config.conversationExportFormats);

      logger.info({
        sessionId,
        files: exportedFiles,
        count: exportedFiles.length
      }, 'conversation_exported');
    } catch (exportError) {
      logger.warn({ err: (exportError as Error).message }, 'conversation_export_failed');
    }
  }

  /**
   * Save to history if enabled
   */
  private async saveToHistory(context: PostTaskContext): Promise<void> {
    const config = getConfig();

    if (!config.autoSaveHistory) {
      return;
    }

    try {
      // Lazy load AgentHistoryManager
      if (!this.historyManager) {
        const { AgentHistoryManager } = await import('../history.js');
        this.historyManager = new AgentHistoryManager();
      }

      const historyId = await this.historyManager.saveToHistory({
        task: context.task,
        steps: context.steps,
        result: context.result,
        success: context.success,
        iterations: context.iterations,
        strategyUsed: context.mode || 'direct',
        elapsedSecs: Math.round(context.elapsedSecs),
        actionsTaken: context.actionsTaken,
        conversation: context.conversation,
        metadata: {
          category: context.category,
          mode: context.mode,
          startTime: context.startTime ? new Date(context.startTime).toISOString() : undefined,
          endTime: context.endTime ? new Date(context.endTime).toISOString() : undefined,
        }
      });

      logger.info({
        historyId,
        task: context.task.slice(0, 50)
      }, 'history_saved');
    } catch (historyError) {
      logger.warn({ err: (historyError as Error).message }, 'history_save_failed');
    }
  }

  /**
   * Handle memory write if available
   */
  async handleMemory(
    context: PostTaskContext,
    memory: { write?: (domain: string, data: string, meta?: any) => void; onSessionEnd?: () => Promise<void> } | null
  ): Promise<void> {
    if (!memory) return;

    try {
      if (context.success && memory.write) {
        memory.write('memory', `Task: ${context.task}\nResult: ${context.result.slice(0, 500)}`, {
          category: context.category,
          success: context.success
        });
      }

      if (memory.onSessionEnd) {
        await memory.onSessionEnd();
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'post_task_memory_error');
    }
  }
}

/**
 * Global post-task handler instance
 */
export const postTaskHandler = new PostTaskHandler();

/**
 * Convenience function to handle post-execution tasks
 */
export async function handlePostTask(context: PostTaskContext): Promise<void> {
  return postTaskHandler.handle(context);
}
