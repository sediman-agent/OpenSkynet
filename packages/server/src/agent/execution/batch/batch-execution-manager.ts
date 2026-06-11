/**
 * Batch Execution Manager
 * Handles batch tool execution with page change detection
 */

import type { ToolCall } from '../../../core/types';
import type { ToolBus } from '../../tools/bus';
import type { PageSnapshot } from '../../../browser/controller';
import { createLogger } from '../../../core/logging.js';

const logger = createLogger('BatchExecutionManager');

export interface BatchExecutionResult {
  executed: ToolCall[];
  results: Array<{ success: boolean; output?: string; error?: string }>;
  stoppedEarly: boolean;
  stopReason?: string;
  totalActions: number;
}

export interface PageChangeDetector {
  detect(): Promise<{ changed: boolean; reason?: string }>;
}

export interface BatchExecutionOptions {
  maxActions?: number;
  continueOnError?: boolean;
}

/**
 * Manages batch execution of tools with page change detection
 */
export class BatchExecutionManager {
  constructor(private toolBus: ToolBus) {}

  /**
   * Execute tools until page changes or all actions complete
   */
  async executeUntilChange(
    actions: ToolCall[],
    changeDetector: PageChangeDetector,
    options: BatchExecutionOptions = {}
  ): Promise<BatchExecutionResult> {
    const maxActions = options.maxActions || actions.length;
    const continueOnError = options.continueOnError ?? false;

    const executed: ToolCall[] = [];
    const results: Array<{ success: boolean; output?: string; error?: string }> = [];

    logger.info({ toolCount: actions.length, maxActions }, 'batch_execution_start');

    for (let i = 0; i < Math.min(actions.length, maxActions); i++) {
      const action = actions[i];

      logger.debug(`[BatchExecution] Executing action ${i + 1}/${actions.length}: ${action.name}`);

      try {
        const result = await this.toolBus.execute(action.name || '', action.arguments || {});

        executed.push(action);
        results.push({
          success: result.success,
          output: result.success ? result.output : undefined,
          error: !result.success ? result.error : undefined
        });

        logger.debug(`[BatchExecution] Action ${action.name} completed: ${result.success ? 'success' : 'failed'}`);

        // Check for page change after successful action
        if (result.success) {
          const changeResult = await changeDetector.detect();

          if (changeResult.changed) {
            logger.info({
              executed: executed.length,
              total: actions.length,
              reason: changeResult.reason
            }, 'batch_execution_stopped_early');

            return {
              executed,
              results,
              stoppedEarly: true,
              stopReason: changeResult.reason || 'Page changed',
              totalActions: actions.length
            };
          }
        }

        // Stop on error if not continuing
        if (!result.success && !continueOnError) {
          logger.info({ executed: executed.length, error: result.error }, 'batch_execution_stopped_error');
          return {
            executed,
            results,
            stoppedEarly: true,
            stopReason: `Action ${action.name} failed: ${result.error}`,
            totalActions: actions.length
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ action: action.name, error: message }, 'batch_execution_error');

        executed.push(action);
        results.push({ success: false, error: message });

        if (!continueOnError) {
          return {
            executed,
            results,
            stoppedEarly: true,
            stopReason: `Exception in ${action.name}: ${message}`,
            totalActions: actions.length
          };
        }
      }
    }

    logger.info({ executed: executed.length, total: actions.length }, 'batch_execution_complete');

    return {
      executed,
      results,
      stoppedEarly: false,
      totalActions: actions.length
    };
  }

  /**
   * Execute all tools without page change detection
   */
  async executeAll(
    actions: ToolCall[],
    options: BatchExecutionOptions = {}
  ): Promise<BatchExecutionResult> {
    const continueOnError = options.continueOnError ?? false;

    const executed: ToolCall[] = [];
    const results: Array<{ success: boolean; output?: string; error?: string }> = [];

    for (const action of actions) {
      try {
        const result = await this.toolBus.execute(action.name || '', action.arguments || {});

        executed.push(action);
        results.push({
          success: result.success,
          output: result.success ? result.output : undefined,
          error: !result.success ? result.error : undefined
        });

        if (!result.success && !continueOnError) {
          return {
            executed,
            results,
            stoppedEarly: true,
            stopReason: `Action ${action.name} failed: ${result.error}`,
            totalActions: actions.length
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        executed.push(action);
        results.push({ success: false, error: message });

        if (!continueOnError) {
          return {
            executed,
            results,
            stoppedEarly: true,
            stopReason: `Exception in ${action.name}: ${message}`,
            totalActions: actions.length
          };
        }
      }
    }

    return {
      executed,
      results,
      stoppedEarly: false,
      totalActions: actions.length
    };
  }

  /**
   * Execute tools sequentially with delay between each
   */
  async executeSequential(
    actions: ToolCall[],
    delayMs: number = 0,
    options: BatchExecutionOptions = {}
  ): Promise<BatchExecutionResult> {
    const results: Array<{ success: boolean; output?: string; error?: string }> = [];
    const executed: ToolCall[] = [];

    for (const action of actions) {
      try {
        const result = await this.toolBus.execute(action.name || '', action.arguments || {});

        executed.push(action);
        results.push({
          success: result.success,
          output: result.success ? result.output : undefined,
          error: !result.success ? result.error : undefined
        });

        if (delayMs > 0 && executed.length < actions.length) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        if (!result.success && !options.continueOnError) {
          return {
            executed,
            results,
            stoppedEarly: true,
            stopReason: `Action ${action.name} failed`,
            totalActions: actions.length
          };
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        executed.push(action);
        results.push({ success: false, error: message });

        if (!options.continueOnError) {
          return {
            executed,
            results,
            stoppedEarly: true,
            stopReason: `Exception in ${action.name}: ${message}`,
            totalActions: actions.length
          };
        }
      }
    }

    return {
      executed,
      results,
      stoppedEarly: false,
      totalActions: actions.length
    };
  }
}

/**
 * Factory function to create a batch execution manager
 */
export function createBatchExecutionManager(toolBus: ToolBus): BatchExecutionManager {
  return new BatchExecutionManager(toolBus);
}
