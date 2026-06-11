/**
 * Circuit Breaker System
 * Prevents cascading failures and improves system stability
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('CircuitBreaker');

export enum CircuitState {
  CLOSED = 'closed',   // Normal operation
  OPEN = 'open',       // Failed, rejecting requests
  HALF_OPEN = 'half_open' // Testing if service has recovered
}

interface CircuitBreakerConfig {
  failureThreshold: number;    // Failures before opening
  successThreshold: number;    // Successes to close circuit
  timeoutMs: number;           // Time to wait before half-open
  monitoringPeriodMs: number;  // Time window for failure counting
}

interface CircuitStats {
  failures: number;
  successes: number;
  lastFailureTime: number;
  lastSuccessTime: number;
  rejectionCount: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private stats: CircuitStats = {
    failures: 0,
    successes: 0,
    lastFailureTime: 0,
    lastSuccessTime: 0,
    rejectionCount: 0
  };
  private failureWindow: number[] = [];
  private config: CircuitBreakerConfig;
  private nextAttemptTime: number = 0;

  constructor(
    private name: string,
    config: Partial<CircuitBreakerConfig> = {}
  ) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      timeoutMs: config.timeoutMs ?? 60000,    // 1 minute
      monitoringPeriodMs: config.monitoringPeriodMs ?? 10000  // 10 seconds
    };
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        this.stats.rejectionCount++;
        logger.warn(`[CircuitBreaker] ${this.name} circuit OPEN, rejecting request`);

        if (fallback) {
          return Promise.resolve(fallback());
        }
        throw new Error(`Circuit breaker ${this.name} is OPEN`);
      }

      // Transition to half-open
      logger.info(`[CircuitBreaker] ${this.name} transitioning to HALF_OPEN`);
      this.state = CircuitState.HALF_OPEN;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.stats.successes++;
    this.stats.lastSuccessTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      if (this.stats.successes >= this.config.successThreshold) {
        logger.info(`[CircuitBreaker] ${this.name} circuit closing after ${this.stats.successes} successes`);
        this.state = CircuitState.CLOSED;
        this.resetStats();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Clear failures in success case
      this.failureWindow = this.failureWindow.filter(t => Date.now() - t < this.config.monitoringPeriodMs);
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(): void {
    this.stats.failures++;
    this.stats.lastFailureTime = Date.now();
    this.failureWindow.push(Date.now());

    // Clean old failures outside monitoring window
    this.failureWindow = this.failureWindow.filter(
      t => Date.now() - t < this.config.monitoringPeriodMs
    );

    // Check if threshold exceeded
    if (this.state === CircuitState.CLOSED &&
        this.failureWindow.length >= this.config.failureThreshold) {
      logger.warn(`[CircuitBreaker] ${this.name} circuit OPEN after ${this.failureWindow.length} failures`);
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.timeoutMs;
      this.stats.rejectionCount = 0;
    } else if (this.state === CircuitState.HALF_OPEN) {
      logger.warn(`[CircuitBreaker] ${this.name} circuit re-OPEN from HALF_OPEN`);
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.config.timeoutMs;
    }
  }

  /**
   * Reset circuit statistics
   */
  private resetStats(): void {
    this.stats = {
      failures: 0,
      successes: 0,
      lastFailureTime: 0,
      lastSuccessTime: Date.now(),
      rejectionCount: 0
    };
    this.failureWindow = [];
  }

  /**
   * Get current state and statistics
   */
  getState(): { state: CircuitState; stats: CircuitStats } {
    return {
      state: this.state,
      stats: { ...this.stats }
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.resetStats();
    logger.info(`[CircuitBreaker] ${this.name} manually reset`);
  }

  /**
   * Force circuit open (for testing)
   */
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttemptTime = Date.now() + this.config.timeoutMs;
    logger.warn(`[CircuitBreaker] ${this.name} forced OPEN`);
  }
}

/**
 * Circuit Breaker Registry
 * Manages multiple circuit breakers
 */
class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  get(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  getAllStates(): Record<string, { state: CircuitState; stats: CircuitStats }> {
    const result: Record<string, any> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      result[name] = breaker.getState();
    }
    return result;
  }

  reset(name?: string): void {
    if (name) {
      this.breakers.get(name)?.reset();
    } else {
      for (const breaker of this.breakers.values()) {
        breaker.reset();
      }
    }
  }
}

// Global registry
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
