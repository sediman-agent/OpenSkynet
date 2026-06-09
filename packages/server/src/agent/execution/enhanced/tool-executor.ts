/**
 * Enhanced Loop Tool Executor
 * Handles tool execution with retry logic and error handling
 */

import type { ToolBus } from '../../tools/bus';
import type { ToolCall } from '../../schemas';
import { createLogger } from '../../core/logging';

const logger = createLogger('enhanced-loop-tool-executor');

export interface ToolExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  action: string;
}

export interface ToolExecutionOptions {
  maxRetries?: number;
  retryDelay?: number;
  onStepStart?: (action: string, detail: string) => void;
  onStepComplete?: (action: string, observation: string, success: boolean) => void;
}

/**
 * Execute a single tool call with retry logic
 */
export async function executeToolCall(
  toolBus: ToolBus,
  toolCall: ToolCall,
  options: ToolExecutionOptions = {}
): Promise<ToolExecutionResult> {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    onStepStart,
    onStepComplete
  } = options;

  const { name, arguments: args } = toolCall;

  if (onStepStart) {
    onStepStart(name, JSON.stringify(args));
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      logger.info(`[ToolExecutor] Executing ${name} (attempt ${attempt + 1}/${maxRetries})`);

      const result = await toolBus.execute(name, args);

      if (result.success) {
        logger.info(`[ToolExecutor] ${name} succeeded`);
        if (onStepComplete) {
          onStepComplete(name, result.output || '', true);
        }

        return {
          success: true,
          output: result.output || '',
          action: name
        };
      } else {
        // Tool returned failure
        const error = result.error || 'Tool execution failed';
        logger.warn(`[ToolExecutor] ${name} failed: ${error}`);

        // Don't retry on certain failures
        if (error.includes('not found') || error.includes('timeout') || error.includes('cancelled')) {
          if (onStepComplete) {
            onStepComplete(name, error, false);
          }

          return {
            success: false,
            output: error,
            error,
            action: name
          };
        }

        lastError = new Error(error);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.error(`[ToolExecutor] ${name} error (attempt ${attempt + 1}):`, lastError.message);

      // Don't retry on certain errors
      if (lastError.message.includes('cancelled') || lastError.message.includes('aborted')) {
        if (onStepComplete) {
          onStepComplete(name, lastError.message, false);
        }

        return {
          success: false,
          output: lastError.message,
          error: lastError.message,
          action: name
        };
      }

      // Wait before retry (except for last attempt)
      if (attempt < maxRetries - 1 && retryDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
      }
    }
  }

  // All retries exhausted
  const errorMsg = lastError?.message || `Failed after ${maxRetries} attempts`;

  if (onStepComplete) {
    onStepComplete(name, errorMsg, false);
  }

  return {
    success: false,
    output: errorMsg,
    error: errorMsg,
    action: name
  };
}

/**
 * Execute multiple tool calls in sequence
 */
export async function executeToolCalls(
  toolBus: ToolBus,
  toolCalls: ToolCall[],
  options: ToolExecutionOptions = {}
): Promise<ToolExecutionResult[]> {
  const results: ToolExecutionResult[] = [];

  for (const toolCall of toolCalls) {
    const result = await executeToolCall(toolBus, toolCall, options);
    results.push(result);

    // Stop on critical failures
    if (!result.success && result.error?.includes('cancelled')) {
      logger.warn('[ToolExecutor] Execution cancelled, stopping remaining tools');
      break;
    }
  }

  return results;
}

/**
 * Build tool result message for conversation
 */
export function buildToolResultMessage(
  toolCall: ToolCall,
  result: ToolExecutionResult
): {
  role: 'tool';
  tool_call_id: string;
  content: string;
  name: string;
} {
  return {
    role: 'tool',
    tool_call_id: toolCall.id,
    content: result.success ? (result.output || '') : (result.error || 'Tool failed'),
    name: toolCall.name
  };
}
