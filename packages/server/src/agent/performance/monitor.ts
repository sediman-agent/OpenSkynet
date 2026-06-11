/**
 * Performance Monitoring System
 * Tracks and reports performance metrics for optimization
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('PerformanceMonitor');

export interface PerformanceMetrics {
  taskStart: number;
  taskEnd?: number;
  llmCalls: number;
  llmTotalTime: number;
  toolExecutions: number;
  toolTotalTime: number;
  screenshotCaptures: number;
  screenshotTotalTime: number;
  cacheHits: number;
  cacheMisses: number;
  parallelExecutions: number;
  errors: number;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    taskStart: Date.now(),
    llmCalls: 0,
    llmTotalTime: 0,
    toolExecutions: 0,
    toolTotalTime: 0,
    screenshotCaptures: 0,
    screenshotTotalTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    parallelExecutions: 0,
    errors: 0
  };

  private operationTimings: Map<string, number[]> = new Map();

  /**
   * Record LLM call
   */
  recordLLMCall(duration: number): void {
    this.metrics.llmCalls++;
    this.metrics.llmTotalTime += duration;
    this.recordTiming('llm_call', duration);
  }

  /**
   * Record tool execution
   */
  recordToolExecution(toolName: string, duration: number, success: boolean): void {
    this.metrics.toolExecutions++;
    if (success) {
      this.metrics.toolTotalTime += duration;
      this.recordTiming(`tool_${toolName}`, duration);
    } else {
      this.metrics.errors++;
    }
  }

  /**
   * Record screenshot capture
   */
  recordScreenshotCapture(duration: number): void {
    this.metrics.screenshotCaptures++;
    this.metrics.screenshotTotalTime += duration;
    this.recordTiming('screenshot', duration);
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(): void {
    this.metrics.cacheHits++;
  }

  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
  }

  /**
   * Record parallel execution
   */
  recordParallelExecution(count: number): void {
    this.metrics.parallelExecutions += count;
  }

  /**
   * Record timing for specific operation
   */
  private recordTiming(operation: string, duration: number): void {
    if (!this.operationTimings.has(operation)) {
      this.operationTimings.set(operation, []);
    }
    this.operationTimings.get(operation)!.push(duration);
  }

  /**
   * Get average timing for operation
   */
  getAverageTiming(operation: string): number {
    const timings = this.operationTimings.get(operation);
    if (!timings || timings.length === 0) return 0;

    const sum = timings.reduce((a, b) => a + b, 0);
    return sum / timings.length;
  }

  /**
   * Get percentile timing
   */
  getPercentileTiming(operation: string, percentile: number): number {
    const timings = this.operationTimings.get(operation);
    if (!timings || timings.length === 0) return 0;

    const sorted = [...timings].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * percentile);
    return sorted[index] || 0;
  }

  /**
   * End task and get summary
   */
  endTask(): {
    metrics: PerformanceMetrics;
    summary: {
      totalDuration: number;
      llmAvgTime: number;
      toolAvgTime: number;
      screenshotAvgTime: number;
      cacheHitRate: number;
      errorRate: number;
      parallelizationRate: number;
      slowestOperation: string;
      fastestOperation: string;
    };
  } {
    this.metrics.taskEnd = Date.now();
    const totalDuration = (this.metrics.taskEnd - this.metrics.taskStart);

    // Calculate averages
    const llmAvgTime = this.metrics.llmCalls > 0
      ? this.metrics.llmTotalTime / this.metrics.llmCalls
      : 0;

    const toolAvgTime = this.metrics.toolExecutions > 0
      ? this.metrics.toolTotalTime / this.metrics.toolExecutions
      : 0;

    const screenshotAvgTime = this.metrics.screenshotCaptures > 0
      ? this.metrics.screenshotTotalTime / this.metrics.screenshotCaptures
      : 0;

    const totalCacheRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    const cacheHitRate = totalCacheRequests > 0
      ? this.metrics.cacheHits / totalCacheRequests
      : 0;

    const totalOperations = this.metrics.toolExecutions + this.metrics.llmCalls;
    const errorRate = totalOperations > 0
      ? this.metrics.errors / totalOperations
      : 0;

    const parallelizationRate = this.metrics.toolExecutions > 0
      ? this.metrics.parallelExecutions / this.metrics.toolExecutions
      : 0;

    // Find slowest/fastest operations
    let slowestOperation = '';
    let fastestOperation = '';
    let slowestTime = 0;
    let fastestTime = Infinity;

    for (const [op, timings] of this.operationTimings.entries()) {
      const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
      if (avg > slowestTime) {
        slowestTime = avg;
        slowestOperation = op;
      }
      if (avg < fastestTime) {
        fastestTime = avg;
        fastestOperation = op;
      }
    }

    const summary = {
      totalDuration,
      llmAvgTime,
      toolAvgTime,
      screenshotAvgTime,
      cacheHitRate,
      errorRate,
      parallelizationRate,
      slowestOperation,
      fastestOperation
    };

    logger.info('[PerformanceMonitor] Task completed: ' + JSON.stringify(summary));

    return {
      metrics: this.metrics,
      summary
    };
  }

  /**
   * Get current metrics without ending task
   */
  getSnapshot(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics = {
      taskStart: Date.now(),
      llmCalls: 0,
      llmTotalTime: 0,
      toolExecutions: 0,
      toolTotalTime: 0,
      screenshotCaptures: 0,
      screenshotTotalTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      parallelExecutions: 0,
      errors: 0
    };
    this.operationTimings.clear();
  }
}

// Global monitor instance
let globalMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}

export function resetPerformanceMonitor(): void {
  globalMonitor = null;
}
