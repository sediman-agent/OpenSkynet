/**
 * Streaming Event System - Simplified
 *
 * Refactored from 377 lines to ~150 lines
 * Event types extracted to event-types.ts
 * Emitter core extracted to EventEmitterCore
 * Event builders extracted to EventBuilders
 * Event converters extracted to EventConverters
 */

import type { StepEvent } from './core/types.js';

// Extracted modules
import {
  type AgentStreamEvent,
  type StreamEventListener,
  type StreamEventType
} from './streaming/event-types.js';
import { EventEmitterCore, type EmitterOptions } from './streaming/event-emitter-core.js';
import { EventBuilders } from './streaming/event-builders.js';
import { EventConverters } from './streaming/event-converters.js';

// ============================================================================
// Stream Emitter - Simplified
// ============================================================================

/**
 * Stream Emitter allows agents to emit events during execution
 * This is the simplified main file that delegates to specialized modules
 */
export class StreamEmitter {
  private core: EventEmitterCore;

  constructor(options: EmitterOptions = {}) {
    this.core = new EventEmitterCore(options);
  }

  /**
   * Subscribe to streaming events
   */
  onEvent(listener: StreamEventListener): () => void {
    return this.core.onEvent(listener);
  }

  /**
   * Emit a step start event
   */
  emitStepStart(
    phase: 'planning' | 'executing' | 'done',
    action: string,
    detail: string,
    url?: string
  ): void {
    const event = EventBuilders.stepStart(phase, action, detail, url);
    this.core.enqueue(event);
  }

  /**
   * Emit a step complete event
   */
  emitStepComplete(
    phase: 'planning' | 'executing' | 'done',
    action: string,
    observation: string | undefined,
    success: boolean
  ): void {
    const event = EventBuilders.stepComplete(phase, action, observation, success);
    this.core.enqueue(event);
  }

  /**
   * Emit a thinking event
   */
  emitThinking(content: string, phase: 'thinking' | 'planning' | 'reflection' = 'thinking'): void {
    const event = EventBuilders.thinking(content, phase);
    this.core.enqueue(event);
  }

  /**
   * Emit a content event (for streaming response text)
   */
  emitContent(content: string, isFinal = false): void {
    const event = EventBuilders.content(content, isFinal);
    this.core.enqueue(event);
  }

  /**
   * Emit a progress event
   */
  emitProgress(iteration: number, maxIterations: number, phase: string): void {
    const event = EventBuilders.progress(iteration, maxIterations, phase);
    this.core.enqueue(event);
  }

  /**
   * Emit an error event
   */
  emitError(error: string, recoverable = true): void {
    const event = EventBuilders.error(error, recoverable);
    this.core.enqueue(event);
  }

  /**
   * Emit an intervention event
   */
  emitIntervention(message: string, id: number): void {
    const event = EventBuilders.intervention(message, id);
    this.core.enqueue(event);
  }

  /**
   * Emit a browser open required event
   */
  emitBrowserOpenRequired(reason: string, task: string): void {
    const event = EventBuilders.browserOpenRequired(reason, task);
    this.core.enqueue(event);
  }

  /**
   * Flush any remaining events
   */
  flush(): void {
    this.core.flush();
  }

  /**
   * Force immediate flush
   */
  forceFlush(): void {
    this.core.forceFlush();
  }

  /**
   * Get emitter statistics
   */
  getStats(): {
    listenerCount: number;
    queuedCount: number;
    hasQueued: boolean;
  } {
    return {
      listenerCount: this.core.getListenerCount(),
      queuedCount: this.core.getQueuedCount(),
      hasQueued: this.core.hasQueuedEvents()
    };
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.core.destroy();
  }
}

// ============================================================================
// Exported Utility Functions (for backward compatibility)
// ============================================================================

/**
 * Convert streaming events to StepEvent for backward compatibility
 */
export function streamEventToStepEvent(event: any): StepEvent {
  return EventConverters.toStepEvent(event);
}

/**
 * Convert streaming event to RPC notification params
 */
export function streamEventToNotification(event: AgentStreamEvent): Record<string, unknown> {
  return EventConverters.toNotification(event);
}

// Re-export types
export type {
  AgentStreamEvent,
  StreamEventListener,
  StreamEventType,
  EmitterOptions
};

// Re-export classes for direct use
export { EventBuilders, EventConverters, EventEmitterCore };
