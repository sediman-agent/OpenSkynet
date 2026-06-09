/**
 * Event Emitter Core
 * Core event emission and batching logic
 */

import type { AgentStreamEvent, StreamEventListener } from './event-types.js';

export interface EmitterOptions {
  batchSize?: number;
  flushIntervalMs?: number;
}

/**
 * Event Emitter Core handles event batching and listener management
 * This is extracted from agent/streaming.ts
 */
export class EventEmitterCore {
  private listeners: Set<StreamEventListener> = new Set();
  private eventQueue: AgentStreamEvent[] = [];
  private batchSize: number;
  private flushIntervalMs: number;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(options: EmitterOptions = {}) {
    this.batchSize = options.batchSize ?? 10;
    this.flushIntervalMs = options.flushIntervalMs ?? 50;
  }

  /**
   * Subscribe to streaming events
   * Returns unsubscribe function
   */
  onEvent(listener: StreamEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get listener count
   */
  getListenerCount(): number {
    return this.listeners.size;
  }

  /**
   * Add event to queue
   */
  enqueue(event: AgentStreamEvent): void {
    this.eventQueue.push(event);

    // Flush if we've reached batch size
    if (this.eventQueue.length >= this.batchSize) {
      this.flush();
    } else {
      // Schedule a flush if not already scheduled
      if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => {
          this.flush();
        }, this.flushIntervalMs);
      }
    }
  }

  /**
   * Flush queued events to listeners
   */
  flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.eventQueue.length === 0) return;

    const events = this.eventQueue.splice(0);

    for (const listener of this.listeners) {
      for (const event of events) {
        try {
          listener(event);
        } catch (err) {
          // Don't let one listener error break others
          console.error('Error in stream listener:', err);
        }
      }
    }
  }

  /**
   * Force immediate flush
   */
  forceFlush(): void {
    this.flush();
  }

  /**
   * Check if there are queued events
   */
  hasQueuedEvents(): boolean {
    return this.eventQueue.length > 0;
  }

  /**
   * Get queued event count
   */
  getQueuedCount(): number {
    return this.eventQueue.length;
  }

  /**
   * Clear all queued events without emitting
   */
  clearQueue(): void {
    this.eventQueue = [];
  }

  /**
   * Update batching options
   */
  updateOptions(options: Partial<EmitterOptions>): void {
    if (options.batchSize !== undefined) {
      this.batchSize = options.batchSize;
    }
    if (options.flushIntervalMs !== undefined) {
      this.flushIntervalMs = options.flushIntervalMs;
    }
  }

  /**
   * Get current options
   */
  getOptions(): EmitterOptions {
    return {
      batchSize: this.batchSize,
      flushIntervalMs: this.flushIntervalMs
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.flush();
    this.listeners.clear();
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
