/**
 * LLM Retry Handler Module
 * Handles retry logic with exponential backoff for LLM requests
 */

import { LLMError, AuthError, RateLimitError } from '../core/errors';
import { createLogger } from '../core/logging';

const logger = createLogger('llm-retry');

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  onRetry?: (attempt: number, delay: number) => void;
  customDelay?: (attempt: number, error: any) => number;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
}

/**
 * Check if an error is retryable
 */
export function isRetryable(error: any): boolean {
  if (!error) return false;

  // Don't retry authentication errors
  if (error?.status === 401 || error?.status === 403) {
    return false;
  }

  // Don't retry validation errors
  if (error?.code === 'validation_error') {
    return false;
  }

  // Retry rate limit errors
  if (error?.status === 429) {
    return true;
  }

  // Retry server errors
  if (error?.status >= 500) {
    return true;
  }

  // Retry network errors
  if (error?.code === 'ECONNRESET' || error?.code === 'ETIMEDOUT' || error?.code === 'ENOTFOUND') {
    return true;
  }

  // Retry unknown errors that might be transient
  if (error?.message?.includes('timeout') || error?.message?.includes('temporarily')) {
    return true;
  }

  return false;
}

/**
 * Execute function with retry logic
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    onRetry,
    customDelay
  } = options;

  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();

      // Log success after retries
      if (attempt > 0) {
        logger.info({ attempt }, 'retry_success');
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryable(error)) {
        // Don't retry authentication errors
        const err = error as any;
        if (err?.status === 401 || err?.status === 403) {
          throw new AuthError(err?.message ?? 'Authentication failed');
        }

        // Don't retry validation errors
        if (err?.code === 'validation_error') {
          throw error; // Re-throw as-is
        }

        break; // Don't retry non-retryable errors
      }

      // Don't delay after last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Calculate delay
      let delay: number;
      if (customDelay) {
        delay = customDelay(attempt, error);
      } else {
        delay = baseDelay * Math.pow(2, attempt);
      }

      logger.warn({
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        delay,
        error: (error as any)?.message || String(error)
      }, 'retry_attempt');

      // Call retry callback
      if (onRetry) {
        onRetry(attempt + 1, delay);
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Convert final error to appropriate error type
  if (lastError?.status === 429) {
    throw new RateLimitError(lastError?.message ?? 'Rate limited');
  }

  throw new LLMError(lastError?.message ?? 'LLM request failed');
}

/**
 * Calculate delay for retry (faster exponential backoff for browser agents)
 */
export function calculateRetryDelay(attempt: number, baseDelay: number = 200): number {
  // Faster backoff for browser tasks: 200ms, 400ms, 800ms, 1600ms
  return Math.min(baseDelay * Math.pow(2, attempt), 2000); // Cap at 2 seconds
}

/**
 * MiniMax-specific delay calculation (optimized for faster retries)
 */
export function calculateMiniMaxDelay(attempt: number): number {
  // Much faster: 1s, 2s, 3s instead of 10s, 15s, 20s
  return 1000 + (attempt * 1000); // 1s, 2s, 3s
}
