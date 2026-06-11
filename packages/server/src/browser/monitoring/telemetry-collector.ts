/**
 * Enterprise Telemetry Collector
 * Production-grade telemetry collection for browser operations
 * Optimized for industrial SaaS monitoring and observability
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('TelemetryCollector');

export interface TelemetryEvent {
  timestamp: number;
  eventType: string;
  sessionId: string;
  userId?: string;
  operation: string;
  duration: number;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
  resourceUsage?: {
    memoryMb: number;
    cpuPercent: number;
    networkBytes: number;
  };
  context?: {
    url?: string;
    userAgent?: string;
    viewport?: { width: number; height: number };
  };
}

export interface TelemetryMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  operationsPerSecond: number;
  errorRate: number;
  topErrors: Array<{ error: string; count: number }>;
  resourceUsage: {
    avgMemoryMb: number;
    avgCpuPercent: number;
    totalNetworkBytes: number;
  };
}

export class TelemetryCollector {
  private events: TelemetryEvent[] = [];
  private maxEvents = 10000; // Keep last 10k events
  private aggregationInterval = 60000; // 1 minute
  private aggregatedMetrics: Map<string, TelemetryMetrics> = new Map();
  private startTime: number;
  private operationCounts = new Map<string, number>();

  constructor() {
    this.startTime = Date.now();
    this.startAggregation();
  }

  /**
   * Record a telemetry event
   */
  recordEvent(event: TelemetryEvent): void {
    // Add event history
    this.events.push(event);

    // Keep only recent events
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Update operation counts
    const key = `${event.sessionId}:${event.operation}`;
    this.operationCounts.set(key, (this.operationCounts.get(key) || 0) + 1);

    // Update aggregated metrics
    this.updateAggregatedMetrics(event);
  }

  /**
   * Record browser operation
   */
  recordBrowserOperation(params: {
    sessionId: string;
    operation: string;
    duration: number;
    success: boolean;
    url?: string;
    errorCode?: string;
    errorMessage?: string;
    metadata?: Record<string, any>;
  }): void {
    const event: TelemetryEvent = {
      timestamp: Date.now(),
      eventType: 'browser_operation',
      sessionId: params.sessionId,
      operation: params.operation,
      duration: params.duration,
      success: params.success,
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
      metadata: params.metadata,
      resourceUsage: this.getResourceUsage(),
      context: {
        url: params.url
      }
    };

    this.recordEvent(event);
  }

  /**
   * Record element resolution
   */
  recordElementResolution(params: {
    sessionId: string;
    elementId: string | number;
    strategy: string;
    duration: number;
    success: boolean;
    attempts: number;
  }): void {
    const event: TelemetryEvent = {
      timestamp: Date.now(),
      eventType: 'element_resolution',
      sessionId: params.sessionId,
      operation: `resolve_element_${params.strategy}`,
      duration: params.duration,
      success: params.success,
      metadata: {
        elementId: params.elementId,
        strategy: params.strategy,
        attempts: params.attempts
      }
    };

    this.recordEvent(event);
  }

  /**
   * Record circuit breaker event
   */
  recordCircuitBreakerEvent(params: {
    sessionId: string;
    breakerName: string;
    state: string;
    operation: string;
    success: boolean;
  }): void {
    const event: TelemetryEvent = {
      timestamp: Date.now(),
      eventType: 'circuit_breaker',
      sessionId: params.sessionId,
      operation: `circuit_breaker_${params.breakerName}`,
      duration: 0,
      success: params.success,
      metadata: {
        breakerName: params.breakerName,
        state: params.state
      }
    };

    this.recordEvent(event);
  }

  /**
   * Get current resource usage
   */
  private getResourceUsage(): TelemetryEvent['resourceUsage'] {
    try {
      const memoryUsage = process.memoryUsage();
      return {
        memoryMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        cpuPercent: 0, // Would need external CPU monitoring
        networkBytes: 0 // Would need network monitoring
      };
    } catch (error) {
      return {
        memoryMb: 0,
        cpuPercent: 0,
        networkBytes: 0
      };
    }
  }

  /**
   * Update aggregated metrics
   */
  private updateAggregatedMetrics(event: TelemetryEvent): void {
    const key = event.operation;
    let metrics = this.aggregatedMetrics.get(key);

    if (!metrics) {
      metrics = {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        operationsPerSecond: 0,
        errorRate: 0,
        topErrors: [],
        resourceUsage: {
          avgMemoryMb: 0,
          avgCpuPercent: 0,
          totalNetworkBytes: 0
        }
      };
      this.aggregatedMetrics.set(key, metrics);
    }

    // Update basic metrics
    metrics.totalOperations++;
    if (event.success) {
      metrics.successfulOperations++;
    } else {
      metrics.failedOperations++;
    }

    // Update average duration
    const totalDuration = metrics.averageDuration * (metrics.totalOperations - 1) + event.duration;
    metrics.averageDuration = totalDuration / metrics.totalOperations;

    // Update error tracking
    if (!event.success && event.errorCode) {
      const errorEntry = metrics.topErrors.find(e => e.error === event.errorCode);
      if (errorEntry) {
        errorEntry.count++;
      } else {
        metrics.topErrors.push({ error: event.errorCode, count: 1 });
      }
    }

    // Update resource usage
    if (event.resourceUsage) {
      metrics.resourceUsage.avgMemoryMb =
        (metrics.resourceUsage.avgMemoryMb * (metrics.totalOperations - 1) + event.resourceUsage.memoryMb) /
        metrics.totalOperations;
    }
  }

  /**
   * Calculate percentiles from recent events
   */
  private calculatePercentiles(operation: string): { p50: number; p95: number; p99: number } {
    const relevantEvents = this.events
      .filter(e => e.operation === operation)
      .map(e => e.duration)
      .sort((a, b) => a - b);

    if (relevantEvents.length === 0) {
      return { p50: 0, p95: 0, p99: 0 };
    }

    const p50Index = Math.floor(relevantEvents.length * 0.5);
    const p95Index = Math.floor(relevantEvents.length * 0.95);
    const p99Index = Math.floor(relevantEvents.length * 0.99);

    return {
      p50: relevantEvents[p50Index],
      p95: relevantEvents[p95Index],
      p99: relevantEvents[p99Index]
    };
  }

  /**
   * Start periodic aggregation
   */
  private startAggregation(): void {
    setInterval(() => {
      this.calculateOperationsPerSecond();
      this.updatePercentiles();
    }, this.aggregationInterval);
  }

  /**
   * Calculate operations per second
   */
  private calculateOperationsPerSecond(): void {
    const now = Date.now();
    const windowStart = now - this.aggregationInterval;

    for (const [operation, metrics] of this.aggregatedMetrics.entries()) {
      const recentEvents = this.events.filter(
        e => e.operation === operation && e.timestamp >= windowStart
      );
      metrics.operationsPerSecond = recentEvents.length / (this.aggregationInterval / 1000);
    }
  }

  /**
   * Update percentiles for all metrics
   */
  private updatePercentiles(): void {
    for (const [operation, metrics] of this.aggregatedMetrics.entries()) {
      const percentiles = this.calculatePercentiles(operation);
      metrics.p50Duration = percentiles.p50;
      metrics.p95Duration = percentiles.p95;
      metrics.p99Duration = percentiles.p99;
    }
  }

  /**
   * Get metrics for specific operation
   */
  getMetrics(operation: string): TelemetryMetrics | undefined {
    return this.aggregatedMetrics.get(operation);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, TelemetryMetrics> {
    const result: Record<string, TelemetryMetrics> = {};
    for (const [operation, metrics] of this.aggregatedMetrics.entries()) {
      result[operation] = { ...metrics };
    }
    return result;
  }

  /**
   * Get system overview
   */
  getSystemOverview(): {
    uptime: number;
    totalEvents: number;
    operationsPerSecond: number;
    averageDuration: number;
    overallSuccessRate: number;
    topOperations: Array<{ operation: string; count: number }>;
    recentErrors: TelemetryEvent[];
  } {
    const now = Date.now();
    const uptime = now - this.startTime;
    const windowStart = now - 60000; // Last minute

    const recentEvents = this.events.filter(e => e.timestamp >= windowStart);
    const operationsPerSecond = recentEvents.length / 60;

    const totalSuccess = this.events.filter(e => e.success).length;
    const overallSuccessRate = this.events.length > 0
      ? totalSuccess / this.events.length
      : 0;

    const avgDuration = this.events.length > 0
      ? this.events.reduce((sum, e) => sum + e.duration, 0) / this.events.length
      : 0;

    // Get top operations
    const operationCounts = new Map<string, number>();
    for (const event of this.events) {
      operationCounts.set(event.operation, (operationCounts.get(event.operation) || 0) + 1);
    }

    const topOperations = Array.from(operationCounts.entries())
      .map(([operation, count]) => ({ operation, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get recent errors
    const recentErrors = this.events
      .filter(e => !e.success && e.timestamp >= windowStart)
      .slice(-20);

    return {
      uptime,
      totalEvents: this.events.length,
      operationsPerSecond,
      averageDuration: avgDuration,
      overallSuccessRate,
      topOperations,
      recentErrors
    };
  }

  /**
   * Get events by session
   */
  getEventsBySession(sessionId: string, limit: number = 100): TelemetryEvent[] {
    return this.events
      .filter(e => e.sessionId === sessionId)
      .slice(-limit);
  }

  /**
   * Get events by time range
   */
  getEventsByTimeRange(startTime: number, endTime: number): TelemetryEvent[] {
    return this.events.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  /**
   * Export telemetry data
   */
  exportTelemetry(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify({
        overview: this.getSystemOverview(),
        metrics: this.getAllMetrics(),
        events: this.events.slice(-1000) // Last 1000 events
      }, null, 2);
    } else {
      // CSV format
      const headers = ['timestamp', 'eventType', 'sessionId', 'operation', 'duration', 'success', 'errorCode'];
      const rows = this.events.map(e => [
        e.timestamp,
        e.eventType,
        e.sessionId,
        e.operation,
        e.duration,
        e.success,
        e.errorCode || ''
      ]);

      return [headers, ...rows]
        .map(row => row.join(','))
        .join('\n');
    }
  }

  /**
   * Clear old events
   */
  clearEvents(olderThanMs: number = 3600000): void {
    const cutoff = Date.now() - olderThanMs;
    this.events = this.events.filter(e => e.timestamp >= cutoff);
    logger.info(`[TelemetryCollector] Cleared events older than ${olderThanMs}ms`);
  }

  /**
   * Reset all telemetry
   */
  reset(): void {
    this.events = [];
    this.aggregatedMetrics.clear();
    this.operationCounts.clear();
    this.startTime = Date.now();
    logger.info('[TelemetryCollector] Telemetry reset');
  }
}

// Global telemetry collector instance
let globalTelemetryCollector: TelemetryCollector | null = null;

/**
 * Get the global telemetry collector
 */
export function getTelemetryCollector(): TelemetryCollector {
  if (!globalTelemetryCollector) {
    globalTelemetryCollector = new TelemetryCollector();
  }
  return globalTelemetryCollector;
}

/**
 * Reset the global telemetry collector
 */
export function resetTelemetryCollector(): void {
  globalTelemetryCollector = null;
}
