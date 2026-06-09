/**
 * IPC Browser Executor
 * Handles IPC-based browser execution for Electron mode with retry logic
 */

import { createLogger } from '../../../core/logging.js';

const logger = createLogger('IPCBrowserExecutor');

export interface IPCExecutionOptions {
  endpoint?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface IPCExecutionResult {
  success: boolean;
  result?: string;
  error?: string;
}

/**
 * IPC Browser Executor handles browser tool execution via IPC in Electron mode
 * This is extracted from browser-tools.ts
 */
export class IPCBrowserExecutor {
  private endpoint: string;
  private timeout: number;
  private maxRetries: number;

  constructor(options: IPCExecutionOptions = {}) {
    this.endpoint = options.endpoint ?? 'http://localhost:3001/api/browser/exec';
    this.timeout = options.timeout ?? 30000;
    this.maxRetries = options.maxRetries ?? 3;
  }

  /**
   * Execute a browser command via IPC
   */
  async execute(toolName: string, args: Record<string, any>): Promise<IPCExecutionResult> {
    logger.info(`[IPC-Browser] Executing: ${toolName}`);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await this.executeWithRetry(toolName, args, attempt);
        if (result.success) {
          return result;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Retry on network errors with exponential backoff
        if (attempt < this.maxRetries - 1) {
          const delay = 1000 * Math.pow(2, attempt);
          logger.warn({ attempt: attempt + 1, maxRetries: this.maxRetries, error: lastError.message }, "ipc_browser_retry");
          await this.delay(delay);
          continue;
        }

        logger.error({ maxRetries: this.maxRetries, error: lastError.message }, "ipc_browser_all_attempts_failed");
        break;
      }
    }

    // All retries exhausted
    return {
      success: false,
      error: `Failed to execute ${toolName} after ${this.maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
    };
  }

  /**
   * Execute with retry logic
   */
  private async executeWithRetry(
    toolName: string,
    args: Record<string, any>,
    attempt: number
  ): Promise<IPCExecutionResult> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // Step 1: Submit command to backend
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: toolName.replace('browser_', ''),
          ...args // Flatten params to top level
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        logger.info(`[IPC-Browser] Command submitted: ${toolName}`, data);

        // Step 2: If command was queued, poll for actual result
        if (data.result && data.result.includes('queued for execution')) {
          logger.info(`[IPC-Browser] Command queued, polling for result...`);
          return await this.pollForResult(toolName, args);
        }

        // Step 3: Return direct result if available
        const rawResult = data.result ?? data.message ?? `Executed ${toolName}`;
        const result = this.formatResult(rawResult);

        return { success: true, result };
      } else {
        logger.error(`[IPC-Browser] Command failed: ${response.status}`);

        // For 5xx errors, allow retry
        if (response.status >= 500 && attempt < this.maxRetries - 1) {
          await this.delay(1000 * (attempt + 1));
          throw new Error(`HTTP ${response.status}: Server error, retrying...`);
        }

        // For 4xx errors, don't retry
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Poll for actual command result after it was queued
   */
  private async pollForResult(toolName: string, args: Record<string, any>): Promise<IPCExecutionResult> {
    const pollEndpoint = this.endpoint.replace('/exec', '/exec/poll');
    const maxPollTime = 10000; // 10 seconds max polling time
    const pollInterval = 200; // Poll every 200ms
    const startTime = Date.now();
    const actionName = toolName.replace('browser_', '');

    while (Date.now() - startTime < maxPollTime) {
      try {
        const pollResponse = await fetch(pollEndpoint);
        if (pollResponse.ok) {
          const pollData = await pollResponse.json();

          // Check for command results first (highest priority)
          if (pollData.commandResults && pollData.commandResults[actionName]) {
            logger.info(`[IPC-Browser] Got command result for ${toolName}:`, pollData.commandResults[actionName]);
            return { success: true, result: pollData.commandResults[actionName] };
          }

          // Fallback to checking for snapshot/screenshot if available
          if (pollData.snapshot && Object.keys(pollData.snapshot).length > 0) {
            logger.info(`[IPC-Browser] Got snapshot result for ${toolName}`);
            return { success: true, result: pollData.snapshot };
          }

          if (pollData.screenshot) {
            logger.info(`[IPC-Browser] Got screenshot result for ${toolName}`);
            return { success: true, result: pollData.screenshot };
          }

          // If no results yet, wait and poll again
          await this.delay(pollInterval);
        }
      } catch (error) {
        logger.warn(`[IPC-Browser] Poll error: ${error}`);
        await this.delay(pollInterval);
      }
    }

    // Timeout waiting for results
    return {
      success: false,
      error: `Timeout waiting for result from ${toolName}`
    };
  }

  /**
   * Format result to ensure it's a string
   */
  private formatResult(rawResult: any): string {
    if (typeof rawResult === 'object' && rawResult !== null) {
      return JSON.stringify(rawResult);
    }
    return String(rawResult);
  }

  /**
   * Delay helper
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if IPC endpoint is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.endpoint.replace('/exec', '/health'), {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get endpoint URL
   */
  getEndpoint(): string {
    return this.endpoint;
  }

  /**
   * Update endpoint URL
   */
  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
  }
}
