/**
 * Advanced Retry System with Exponential Backoff and Jitter
 * Improves stability through intelligent retry strategies
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('RetrySystem');

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitterMs: number;
  retryableErrors: RegExp[];
  nonRetryableErrors: RegExp[];
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDelay: number;
}

/**
 * Advanced retry system with exponential backoff and jitter
 */
export class RetrySystem {
  constructor(private config: RetryConfig) {}

  /**
   * Execute operation with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    context?: string
  ): Promise<RetryResult<T>> {
    let lastError: Error | undefined;
    let attempts = 0;
    let totalDelay = 0;
    let delay = this.config.initialDelayMs;

    while (attempts <= this.config.maxRetries) {
      attempts++;

      try {
        const result = await operation();

        if (attempts > 1) {
          logger.info(`[RetrySystem] Operation succeeded after ${attempts} attempts (total delay: ${totalDelay}ms)`);
        }

        return {
          success: true,
          result,
          attempts,
          totalDelay
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable
        if (!this.isRetryable(lastError)) {
          logger.error(`[RetrySystem] Non-retryable error: ${lastError.message}`);
          return {
            success: false,
            error: lastError,
            attempts,
            totalDelay
          };
        }

        // Don't retry if we've maxed out
        if (attempts > this.config.maxRetries) {
          logger.error(`[RetrySystem] Max retries (${this.config.maxRetries}) exceeded`);
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const jitter = Math.random() * this.config.jitterMs;
        const waitTime = Math.min(delay + jitter, this.config.maxDelayMs);

        logger.warn(
          `[RetrySystem] Attempt ${attempts}/${this.config.maxRetries + 1} failed: ${lastError.message}. Retrying in ${waitTime.toFixed(0)}ms...`
        );

        await new Promise(resolve => setTimeout(resolve, waitTime));

        totalDelay += waitTime;
        delay = Math.min(delay * this.config.backoffMultiplier, this.config.maxDelayMs);
      }
    }

    return {
      success: false,
      error: lastError,
      attempts,
      totalDelay
    };
  }

  /**
   * Check if error is retryable
   */
  private isRetryable(error: Error): boolean {
    const message = error.message.toLowerCase();

    // Check non-retryable patterns first
    for (const pattern of this.config.nonRetryableErrors) {
      if (pattern.test(message)) {
        return false;
      }
    }

    // Check retryable patterns
    for (const pattern of this.config.retryableErrors) {
      if (pattern.test(message)) {
        return true;
      }
    }

    // Default retryable errors
    const defaultRetryable = [
      /timeout/i,
      /etimedout/i,
      /econnrefused/i,
      /econnreset/i,
      /econnaborted/i,
      /enotfound/i,
      /etimeout/i,
      /socket hang up/i,
      /connection reset/i,
      /connection refused/i,
      /temporarily unavailable/i,
      /rate limit/i,
      /too many requests/i,
      /service unavailable/i,
      /gateway timeout/i,
      /bad gateway/i
    ];

    return defaultRetryable.some(pattern => pattern.test(message));
  }

  /**
   * Create retry system with predefined configurations
   */
  static forLLM(): RetrySystem {
    return new RetrySystem({
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      jitterMs: 500,
      retryableErrors: [
        /timeout/i,
        /rate limit/i,
        /temporarily unavailable/i,
        /service unavailable/i,
        /connection/i
      ],
      nonRetryableErrors: [
        /authentication/i,
        /unauthorized/i,
        /forbidden/i,
        /invalid.*api.*key/i,
        /quota.*exceeded/i,
        /insufficient.*credits/i
      ]
    });
  }

  static forBrowser(): RetrySystem {
    return new RetrySystem({
      maxRetries: 5,
      initialDelayMs: 500,
      maxDelayMs: 5000,
      backoffMultiplier: 1.5,
      jitterMs: 200,
      retryableErrors: [
        /timeout/i,
        /not.*visible/i,
        /not.*attached/i,
        /detached/i,
        /target.*closed/i
      ],
      nonRetryableErrors: [
        /navigation.*failed/i,
        /page.*crashed/i,
        /browser.*closed/i
      ]
    });
  }

  static forHTTP(): RetrySystem {
    return new RetrySystem({
      maxRetries: 4,
      initialDelayMs: 200,
      maxDelayMs: 5000,
      backoffMultiplier: 2,
      jitterMs: 100,
      retryableErrors: [
        /timeout/i,
        /econnrefused/i,
        /econnreset/i,
        /service unavailable/i,
        /too many requests/i,
        /gateway timeout/i
      ],
      nonRetryableErrors: [
        /404/i,
        /not.*found/i,
        /unauthorized/i,
        /forbidden/i
      ]
    });
  }
}

// Global registry
const retrySystems: Map<string, RetrySystem> = new Map();

export function getRetrySystem(type: 'llm' | 'browser' | 'http' | string): RetrySystem {
  if (!retrySystems.has(type)) {
    switch (type) {
      case 'llm':
        retrySystems.set(type, RetrySystem.forLLM());
        break;
      case 'browser':
        retrySystems.set(type, RetrySystem.forBrowser());
        break;
      case 'http':
        retrySystems.set(type, RetrySystem.forHTTP());
        break;
      default:
        retrySystems.set(type, new RetrySystem({
          maxRetries: 3,
          initialDelayMs: 500,
          maxDelayMs: 5000,
          backoffMultiplier: 2,
          jitterMs: 200,
          retryableErrors: [],
          nonRetryableErrors: []
        }));
    }
  }
  return retrySystems.get(type)!;
}
