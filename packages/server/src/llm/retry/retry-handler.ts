/**
 * Retry Handler
 * Handles retry logic with exponential backoff for LLM requests
 */

import type { LLMError, RateLimitError } from "../../core/errors.js";
import logger from "../../core/logging.js";

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface RetryResult {
  success: boolean;
  attempts: number;
  lastError?: Error;
}

/**
 * Retry Handler manages retry logic with exponential backoff
 * This is extracted from llm/provider.ts
 */
export class RetryHandler {
  private maxRetries: number;
  private baseDelayMs: number;
  private maxDelayMs: number;

  constructor(options: RetryOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30000;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(err: any): boolean {
    if (err instanceof RateLimitError) return true;
    if (err?.status === 429 || (err?.status ?? 0) >= 500) return true;

    const name = err?.constructor?.name ?? "";
    const msg = (err?.message ?? "").toLowerCase();

    // Check for connection/timeout errors
    if (name.includes("ConnectionError") || name.includes("TimeoutError")) {
      return true;
    }

    // Check for connection/timeout in message
    if (msg.includes("connection") || msg.includes("timeout")) {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay for retry attempt
   */
  calculateDelay(attempt: number): number {
    const delay = this.baseDelayMs * Math.pow(2, attempt);
    return Math.min(delay, this.maxDelayMs);
  }

  /**
   * Execute function with retry logic
   */
  async executeWithRetry<T>(
    fn: (attempt: number) => Promise<T>,
    onRetry?: (attempt: number, delay: number) => void
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn(attempt);
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (!this.isRetryable(error)) {
          throw error;
        }

        // Check for auth errors (non-retryable)
        if (error?.status === 401 || error?.status === 403) {
          throw error;
        }

        // Calculate delay and retry
        const delay = this.calculateDelay(attempt);

        logger.warn({
          attempt,
          delay,
          error: (error as Error).message
        }, "llm_retry");

        if (onRetry) {
          onRetry(attempt + 1, delay);
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted
    if (lastError?.status === 429) {
      throw new RateLimitError(lastError?.message ?? "Rate limited");
    }

    throw lastError;
  }

  /**
   * Get retry statistics
   */
  getStats(): {
    maxRetries: this.maxRetries;
    baseDelay: this.baseDelayMs;
    maxDelay: this.maxDelayMs;
  }

  /**
   * Update retry options
   */
  updateOptions(options: Partial<RetryOptions>): void {
    if (options.maxRetries !== undefined) {
      this.maxRetries = options.maxRetries;
    }
    if (options.baseDelayMs !== undefined) {
      this.baseDelayMs = options.baseDelayMs;
    }
    if (options.maxDelayMs !== undefined) {
      this.maxDelayMs = options.maxDelayMs;
    }
  }
}
