/**
 * Enterprise Distributed Tracing
 * Production-grade distributed tracing for browser operations
 * Optimized for industrial SaaS observability and debugging
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('DistributedTracing');

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  sampled: boolean;
  baggage: Map<string, string>;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  tags: Map<string, string>;
  logs: Array<{
    timestamp: number;
    message: string;
    fields?: Record<string, any>;
  }>;
  status: {
    code: number;
    message?: string;
  };
  context: TraceContext;
}

export class DistributedTracer {
  private activeSpans = new Map<string, Span>();
  private completedSpans: Span[] = [];
  private maxCompletedSpans = 10000;
  private samplingRate = 1.0; // 100% sampling by default

  /**
   * Generate unique trace ID
   */
  generateTraceId(): string {
    return this.randomBytes(16);
  }

  /**
   * Generate unique span ID
   */
  generateSpanId(): string {
    return this.randomBytes(8);
  }

  /**
   * Generate random bytes for IDs
   */
  private randomBytes(length: number): string {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Create root span
   */
  createRootSpan(operationName: string, tags?: Record<string, string>): Span {
    const traceId = this.generateTraceId();
    const spanId = this.generateSpanId();

    const span: Span = {
      traceId,
      spanId,
      operationName,
      startTime: Date.now(),
      tags: new Map(Object.entries(tags || {})),
      logs: [],
      status: { code: 0 },
      context: {
        traceId,
        spanId,
        sampled: Math.random() < this.samplingRate,
        baggage: new Map()
      }
    };

    this.activeSpans.set(spanId, span);
    logger.debug(`[DistributedTracer] Created root span: ${spanId} for ${operationName}`);

    return span;
  }

  /**
   * Create child span
   */
  createChildSpan(parentSpan: Span, operationName: string, tags?: Record<string, string>): Span {
    const spanId = this.generateSpanId();

    const span: Span = {
      traceId: parentSpan.traceId,
      spanId,
      parentSpanId: parentSpan.spanId,
      operationName,
      startTime: Date.now(),
      tags: new Map(Object.entries(tags || {})),
      logs: [],
      status: { code: 0 },
      context: {
        traceId: parentSpan.traceId,
        spanId,
        parentSpanId: parentSpan.spanId,
        sampled: parentSpan.context.sampled,
        baggage: new Map(parentSpan.context.baggage)
      }
    };

    this.activeSpans.set(spanId, span);
    logger.debug(`[DistributedTracer] Created child span: ${spanId} for ${operationName}`);

    return span;
  }

  /**
   * Finish span
   */
  finishSpan(span: Span, status?: { code: number; message?: string }): void {
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status || span.status;

    this.activeSpans.delete(span.spanId);

    // Only store if sampled
    if (span.context.sampled) {
      this.completedSpans.push(span);

      // Keep only recent spans
      if (this.completedSpans.length > this.maxCompletedSpans) {
        this.completedSpans.shift();
      }
    }

    logger.debug(`[DistributedTracer] Finished span: ${span.spanId} (${span.duration}ms)`);
  }

  /**
   * Add log to span
   */
  logToSpan(span: Span, message: string, fields?: Record<string, any>): void {
    span.logs.push({
      timestamp: Date.now(),
      message,
      fields
    });
  }

  /**
   * Add tags to span
   */
  tagSpan(span: Span, tags: Record<string, string>): void {
    for (const [key, value] of Object.entries(tags)) {
      span.tags.set(key, value);
    }
  }

  /**
   * Set baggage item (propagated to child spans)
   */
  setBaggageItem(span: Span, key: string, value: string): void {
    span.context.baggage.set(key, value);
  }

  /**
   * Get baggage item
   */
  getBaggageItem(span: Span, key: string): string | undefined {
    return span.context.baggage.get(key);
  }

  /**
   * Extract trace context from headers
   */
  extractContext(headers: Record<string, string>): TraceContext | null {
    const traceParent = headers['traceparent'] || headers['uber-trace-id'];
    if (!traceParent) {
      return null;
    }

    // Parse traceparent format: version-traceId-parentId-flags
    const parts = traceParent.split('-');
    if (parts.length < 4) {
      return null;
    }

    const [, traceId, parentSpanId, flags] = parts;

    return {
      traceId,
      spanId: parentSpanId,
      sampled: flags.includes('1'),
      baggage: new Map()
    };
  }

  /**
   * Inject trace context into headers
   */
  injectContext(context: TraceContext): Record<string, string> {
    const flags = context.sampled ? '01' : '00';
    return {
      'traceparent': `00-${context.traceId}-${context.spanId}-${flags}`
    };
  }

  /**
   * Get span by ID
   */
  getSpan(spanId: string): Span | undefined {
    return this.activeSpans.get(spanId);
  }

  /**
   * Get trace by trace ID
   */
  getTrace(traceId: string): Span[] {
    return this.completedSpans.filter(span => span.traceId === traceId);
  }

  /**
   * Get recent spans
   */
  getRecentSpans(limit: number = 100): Span[] {
    return this.completedSpans.slice(-limit);
  }

  /**
   * Get span statistics
   */
  getStatistics(): {
    activeSpans: number;
    completedSpans: number;
    averageDuration: number;
    slowestOperations: Array<{ operation: string; duration: number }>;
    errorRate: number;
  } {
    const durations = this.completedSpans
      .filter(s => s.duration !== undefined)
      .map(s => s.duration!);

    const averageDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    // Get slowest operations
    const slowestOperations = this.completedSpans
      .filter(s => s.duration !== undefined)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 10)
      .map(s => ({
        operation: s.operationName,
        duration: s.duration || 0
      }));

    // Calculate error rate
    const errorSpans = this.completedSpans.filter(s => s.status.code !== 0);
    const errorRate = this.completedSpans.length > 0
      ? errorSpans.length / this.completedSpans.length
      : 0;

    return {
      activeSpans: this.activeSpans.size,
      completedSpans: this.completedSpans.length,
      averageDuration,
      slowestOperations,
      errorRate
    };
  }

  /**
   * Export trace data
   */
  exportTraces(format: 'json' | 'jaeger' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify({
        spans: this.completedSpans.slice(-1000),
        statistics: this.getStatistics()
      }, null, 2);
    } else {
      // Jaeger format
      const traces = new Map<string, Span[]>();

      for (const span of this.completedSpans) {
        if (!traces.has(span.traceId)) {
          traces.set(span.traceId, []);
        }
        traces.get(span.traceId)!.push(span);
      }

      return JSON.stringify({
        data: Array.from(traces.values()).map(spans => ({
          traceID: spans[0]?.traceId,
          spans: spans.map(span => ({
            traceID: span.traceId,
            spanID: span.spanId,
            parentSpanID: span.parentSpanId,
            operationName: span.operationName,
            startTime: span.startTime * 1000, // Microseconds
            duration: (span.duration || 0) * 1000, // Microseconds
            tags: Array.from(span.tags.entries()).map(([key, value]) => ({ key, value })),
            logs: span.logs.map(log => ({
              timestamp: log.timestamp * 1000,
              fields: Object.entries(log.fields || {}).map(([key, value]) => ({ key, value: String(value) }))
            })),
            status: span.status
          }))
        }))
      }, null, 2);
    }
  }

  /**
   * Set sampling rate
   */
  setSamplingRate(rate: number): void {
    this.samplingRate = Math.max(0, Math.min(1, rate));
    logger.info(`[DistributedTracer] Sampling rate set to ${this.samplingRate * 100}%`);
  }

  /**
   * Clear old spans
   */
  clearOldSpans(olderThanMs: number = 3600000): void {
    const cutoff = Date.now() - olderThanMs;
    this.completedSpans = this.completedSpans.filter(span => span.startTime >= cutoff);
    logger.info(`[DistributedTracer] Cleared spans older than ${olderThanMs}ms`);
  }

  /**
   * Reset tracer
   */
  reset(): void {
    this.activeSpans.clear();
    this.completedSpans = [];
    logger.info('[DistributedTracer] Tracer reset');
  }
}

// Global tracer instance
let globalTracer: DistributedTracer | null = null;

/**
 * Get the global distributed tracer
 */
export function getDistributedTracer(): DistributedTracer {
  if (!globalTracer) {
    globalTracer = new DistributedTracer();
  }
  return globalTracer;
}

/**
 * Reset the global distributed tracer
 */
export function resetDistributedTracer(): void {
  globalTracer = null;
}

/**
 * Trace async operation
 */
export async function traceOperation<T>(
  tracer: DistributedTracer,
  operationName: string,
  fn: (span: Span) => Promise<T>,
  parentSpan?: Span,
  tags?: Record<string, string>
): Promise<T> {
  const span = parentSpan
    ? tracer.createChildSpan(parentSpan, operationName, tags)
    : tracer.createRootSpan(operationName, tags);

  try {
    const result = await fn(span);
    tracer.finishSpan(span, { code: 0 });
    return result;
  } catch (error) {
    tracer.finishSpan(span, {
      code: 1,
      message: (error as Error).message
    });
    throw error;
  }
}
