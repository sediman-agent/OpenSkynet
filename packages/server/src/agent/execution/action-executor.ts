/**
 * Action Executor
 * Executes actions and handles results
 */

import type { ToolBus } from '../../tools/bus.js';
import type { ToolCall } from '../../schemas/index.js';
import { StreamEmitter } from '../../streaming/index.js';
import { createLogger } from '../../core/logging.js';

const logger = createLogger('action-executor');

/**
 * Action execution result
 */
export interface ActionExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  actionName: string;
}

/**
 * Batch execution result
 */
export interface BatchExecutionResult {
  results: ActionExecutionResult[];
  anySuccess: boolean;
  combinedOutput: string;
  actionsTaken: string[];
}

/**
 * Action Executor
 * This is extracted from agent/execution/enhanced-loop.ts
 */
export class ActionExecutor {
  private consecutiveFailures = 0;

  constructor(
    private toolBus: ToolBus,
    private streamEmitter: StreamEmitter
  ) {}

  /**
   * Execute a single action
   */
  async executeAction(action: ToolCall): Promise<ActionExecutionResult> {
    this.streamEmitter.emitStepStart('executing', action.name, JSON.stringify(action.arguments));

    try {
      const result = await this.toolBus.execute(action.name, action.arguments);

      if (result.success) {
        this.consecutiveFailures = 0;
        this.streamEmitter.emitStepComplete(
          'executing',
          action.name,
          result.output || 'Success',
          true
        );

        return {
          success: true,
          output: result.output || '',
          actionName: action.name
        };
      } else {
        this.consecutiveFailures++;
        this.streamEmitter.emitStepComplete(
          'executing',
          action.name,
          result.error || 'Failed',
          false
        );

        return {
          success: false,
          output: '',
          error: result.error || 'Unknown error',
          actionName: action.name
        };
      }
    } catch (error) {
      this.consecutiveFailures++;
      const errMsg = error instanceof Error ? error.message : String(error);

      this.streamEmitter.emitStepComplete('executing', action.name, errMsg, false);

      return {
        success: false,
        output: '',
        error: errMsg,
        actionName: action.name
      };
    }
  }

  /**
   * Execute multiple actions in batch
   */
  async executeBatch(actions: ToolCall[]): Promise<BatchExecutionResult> {
    const results: ActionExecutionResult[] = [];
    let anySuccess = false;
    let combinedOutput = '';
    const actionsTaken: string[] = [];

    for (const action of actions) {
      const result = await this.executeAction(action);
      results.push(result);

      if (result.success) {
        anySuccess = true;
        combinedOutput += `[${action.name}]: ${result.output}\n`;
        actionsTaken.push(`${action.name}: success`);
      } else {
        combinedOutput += `[${action.name}] FAILED: ${result.error || 'Unknown error'}\n`;
        actionsTaken.push(`${action.name}: failed`);
      }
    }

    return {
      results,
      anySuccess,
      combinedOutput,
      actionsTaken
    };
  }

  /**
   * Get consecutive failure count
   */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * Reset consecutive failure count
   */
  resetConsecutiveFailures(): void {
    this.consecutiveFailures = 0;
  }

  /**
   * Check if should trigger recovery
   */
  shouldTriggerRecovery(threshold = 3): boolean {
    return this.consecutiveFailures >= threshold;
  }

  /**
   * Check if browser_end was called
   */
  hasBrowserEnd(actionsTaken: string[]): boolean {
    return actionsTaken.some(action => action.includes('browser_end'));
  }
}
