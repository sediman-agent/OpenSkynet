/**
 * IPC Tool Execution Strategy
 * Handles tool execution via IPC to Electron renderer process
 */

import type {
  ToolExecutionStrategy,
  ToolExecutionArgs,
  ToolExecutionContext,
  ToolExecutionResult
} from './types.js';
import { ToolErrorFormatter } from '../../../core/utils/error-formatter.js';
import { createLogger } from '../../../core/logging.js';

const logger = createLogger('IPCExecutionStrategy');

export class IPCExecutionStrategy implements ToolExecutionStrategy {
  readonly name = 'ipc';

  private readonly apiUrl = 'http://localhost:3001/api/browser/exec';
  private readonly maxRetries = 3;
  private readonly defaultTimeout = 30000;

  isAvailable(): boolean {
    // Available when running in Electron mode
    return process.env.SEDIMAN_MODE === 'electron';
  }

  async execute(
    toolName: string,
    args: ToolExecutionArgs,
    _context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    logger.info(`[IPC] Executing: ${toolName}`);

    const action = toolName.replace('browser_', '');
    const payload = { action, ...args };
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await this.executeWithRetry(payload);

        if (response.ok) {
          const data = await response.json();
          logger.info(`[IPC] Command executed: ${toolName} ->`, data);

          const rawResult = data.result || data.message || `Executed ${toolName}`;
          const result = typeof rawResult === 'object' && rawResult !== null
            ? JSON.stringify(rawResult)
            : String(rawResult);

          return {
            success: true,
            output: result
          };
        }

        logger.error(`[IPC] Command failed: ${response.status}`);
        lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

        // For 5xx errors, retry immediately
        if (response.status >= 500 && attempt < this.maxRetries - 1) {
          await this.backoff(attempt);
          continue;
        }

        // For 4xx errors, don't retry
        break;

      } catch (fetchError) {
        lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));

        // Retry on network errors with exponential backoff
        if (attempt < this.maxRetries - 1) {
          logger.warn({ attempt: attempt + 1, maxRetries: this.maxRetries, error: lastError.message }, 'ipc_retry');
          await this.backoff(attempt);
          continue;
        }

        logger.error({ maxRetries: this.maxRetries, error: lastError.message }, 'ipc_all_attempts_failed');
        break;
      }
    }

    // All retries exhausted
    const errorMessage = `Failed to execute ${toolName} after ${this.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`;
    logger.error(errorMessage);

    return {
      success: false,
      output: '',
      error: errorMessage
    };
  }

  private async executeWithRetry(payload: any): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.defaultTimeout);

    try {
      return await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async backoff(attempt: number): Promise<void> {
    const delay = 1000 * Math.pow(2, attempt);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}
