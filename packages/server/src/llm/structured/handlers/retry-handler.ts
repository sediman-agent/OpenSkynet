/**
 * Retry Handler for Structured Provider
 * Manages retry logic with exponential backoff
 */

import { createLogger } from '../../../core/logging.js';

const logger = createLogger('RetryHandler');

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  attempts: number;
}

/**
 * Retry Handler manages retry logic with exponential backoff
 * This is extracted from structured-provider.ts
 */
export class RetryHandler {
  private readonly defaultOptions: Required<RetryOptions> = {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2
  };

  constructor(private options: RetryOptions = {}) {}

  /**
   * Execute an operation with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    shouldRetry: (error: any) => boolean = () => true
  ): Promise<RetryResult<T>> {
    const opts = { ...this.defaultOptions, ...this.options };
    let lastError: any = null;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      try {
        const data = await operation();
        logger.debug(`[RetryHandler] Operation succeeded on attempt ${attempt}`);
        return {
          success: true,
          data,
          attempts: attempt
        };
      } catch (error) {
        lastError = error;
        const shouldRetryError = shouldRetry(error);

        if (!shouldRetryError || attempt >= opts.maxAttempts) {
          logger.warn(`[RetryHandler] Operation failed after ${attempt} attempts`);
          break;
        }

        const delay = this.calculateDelay(attempt, opts);
        logger.debug(`[RetryHandler] Retrying after ${delay}ms (attempt ${attempt}/${opts.maxAttempts})`);

        await this.delay(delay);
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError);
    return {
      success: false,
      error: message,
      attempts: opts.maxAttempts
    };
  }

  /**
   * Execute operation with validation-based retry
   */
  async executeWithValidation<T>(
    operation: () => Promise<T>,
    validate: (result: T) => { valid: boolean; error?: string }
  ): Promise<RetryResult<T>> {
    const opts = { ...this.defaultOptions, ...this.options };

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
      try {
        const data = await operation();
        const validation = validate(data);

        if (validation.valid) {
          logger.debug(`[RetryHandler] Validation succeeded on attempt ${attempt}`);
          return {
            success: true,
            data,
            attempts: attempt
          };
        }

        logger.warn(`[RetryHandler] Validation failed: ${validation.error}`);

        if (attempt >= opts.maxAttempts) {
          break;
        }

        const delay = this.calculateDelay(attempt, opts);
        await this.delay(delay);
      } catch (error) {
        logger.warn(`[RetryHandler] Operation failed: ${error}`);

        if (attempt >= opts.maxAttempts) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: message,
            attempts: opts.maxAttempts
          };
        }

        const delay = this.calculateDelay(attempt, opts);
        await this.delay(delay);
      }
    }

    return {
      success: false,
      error: 'Max retry attempts reached',
      attempts: opts.maxAttempts
    };
  }

  /**
   * Calculate delay for retry
   */
  private calculateDelay(attempt: number, opts: Required<RetryOptions>): number {
    const delay = opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt - 1);
    return Math.min(delay, opts.maxDelay);
  }

  /**
   * Delay helper
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a timeout promise
   */
  createTimeoutPromise<T>(timeoutMs: number): { promise: Promise<T>; timeout: NodeJS.Timeout } {
    let timeoutHandle: NodeJS.Timeout;
    const promise = new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
    return { promise, timeout: timeoutHandle! };
  }
}
