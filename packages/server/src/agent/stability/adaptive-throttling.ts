/**
 * Adaptive Throttling System
 * Dynamically adjusts request rates based on system performance and load
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('AdaptiveThrottling');

interface ThrottleConfig {
  minDelayMs: number;
  maxDelayMs: number;
  targetSuccessRate: number;
  targetResponseTimeMs: number;
  windowSize: number;
  adaptationIntervalMs: number;
}

interface PerformanceWindow {
  successes: number;
  failures: number;
  responseTimes: number[];
  timestamp: number;
}

export class AdaptiveThrottler {
  private currentDelay: number;
  private performanceHistory: PerformanceWindow[] = [];
  private config: ThrottleConfig;
  private lastAdaptation: number = 0;

  constructor(config: Partial<ThrottleConfig> = {}) {
    this.config = {
      minDelayMs: config.minDelayMs ?? 50,
      maxDelayMs: config.maxDelayMs ?? 5000,
      targetSuccessRate: config.targetSuccessRate ?? 0.95,
      targetResponseTimeMs: config.targetResponseTimeMs ?? 2000,
      windowSize: config.windowSize ?? 10,
      adaptationIntervalMs: config.adaptationIntervalMs ?? 5000
    };
    this.currentDelay = this.config.minDelayMs;
  }

  /**
   * Acquire permission to proceed (throttles if needed)
   */
  async acquire(): Promise<void> {
    if (this.currentDelay > 0) {
      await new Promise(resolve => setTimeout(resolve, this.currentDelay));
    }
  }

  /**
   * Record operation result
   */
  recordResult(success: boolean, responseTime: number): void {
    const now = Date.now();

    // Add to current window or create new window
    let currentWindow = this.performanceHistory[this.performanceHistory.length - 1];
    if (!currentWindow || (now - currentWindow.timestamp) > this.config.adaptationIntervalMs) {
      currentWindow = {
        successes: 0,
        failures: 0,
        responseTimes: [],
        timestamp: now
      };
      this.performanceHistory.push(currentWindow);

      // Keep only recent windows
      if (this.performanceHistory.length > this.config.windowSize) {
        this.performanceHistory.shift();
      }

      // Adapt throttling based on recent performance
      this.adapt();
    }

    // Record result
    if (success) {
      currentWindow.successes++;
    } else {
      currentWindow.failures++;
    }
    currentWindow.responseTimes.push(responseTime);
  }

  /**
   * Adapt throttling based on performance
   */
  private adapt(): void {
    if (this.performanceHistory.length < 2) return;

    const recent = this.performanceHistory.slice(-3);
    let totalSuccesses = 0;
    let totalFailures = 0;
    let totalResponseTime = 0;
    let responseCount = 0;

    for (const window of recent) {
      totalSuccesses += window.successes;
      totalFailures += window.failures;
      for (const rt of window.responseTimes) {
        totalResponseTime += rt;
        responseCount++;
      }
    }

    const totalOperations = totalSuccesses + totalFailures;
    if (totalOperations === 0) return;

    const successRate = totalSuccesses / totalOperations;
    const avgResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;

    // Adjust delay based on performance
    if (successRate < this.config.targetSuccessRate || avgResponseTime > this.config.targetResponseTimeMs) {
      // Increase delay (throttle more)
      const newDelay = Math.min(this.currentDelay * 1.5, this.config.maxDelayMs);
      if (newDelay !== this.currentDelay) {
        logger.debug(`[AdaptiveThrottler] Increasing delay: ${this.currentDelay}ms → ${newDelay}ms (success: ${(successRate * 100).toFixed(1)}%, avg time: ${avgResponseTime.toFixed(0)}ms)`);
        this.currentDelay = newDelay;
      }
    } else if (successRate > this.config.targetSuccessRate && avgResponseTime < this.config.targetResponseTimeMs * 0.8) {
      // Decrease delay (throttle less)
      const newDelay = Math.max(this.currentDelay * 0.8, this.config.minDelayMs);
      if (newDelay !== this.currentDelay) {
        logger.debug(`[AdaptiveThrottler] Decreasing delay: ${this.currentDelay}ms → ${newDelay}ms (success: ${(successRate * 100).toFixed(1)}%, avg time: ${avgResponseTime.toFixed(0)}ms)`);
        this.currentDelay = newDelay;
      }
    }
  }

  /**
   * Get current delay
   */
  getCurrentDelay(): number {
    return this.currentDelay;
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.currentDelay = this.config.minDelayMs;
    this.performanceHistory = [];
    logger.info('[AdaptiveThrottler] Reset to initial state');
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    currentDelay: number;
    successRate: number;
    avgResponseTime: number;
    recentPerformance: PerformanceWindow[];
  } {
    let totalSuccesses = 0;
    let totalFailures = 0;
    let totalResponseTime = 0;
    let responseCount = 0;

    for (const window of this.performanceHistory) {
      totalSuccesses += window.successes;
      totalFailures += window.failures;
      for (const rt of window.responseTimes) {
        totalResponseTime += rt;
        responseCount++;
      }
    }

    const totalOperations = totalSuccesses + totalFailures;
    const successRate = totalOperations > 0 ? totalSuccesses / totalOperations : 1;
    const avgResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;

    return {
      currentDelay: this.currentDelay,
      successRate,
      avgResponseTime,
      recentPerformance: [...this.performanceHistory]
    };
  }
}

// Global instances for different resource types
const throttlers: Map<string, AdaptiveThrottler> = new Map();

export function getAdaptiveThrottler(resourceType: string = 'default'): AdaptiveThrottler {
  if (!throttlers.has(resourceType)) {
    throttlers.set(resourceType, new AdaptiveThrottler());
  }
  return throttlers.get(resourceType)!;
}

export function resetAllThrottlers(): void {
  throttlers.clear();
}
