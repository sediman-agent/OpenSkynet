/**
 * Event Builders
 * Helper functions for creating streaming events
 */

import type {
  AgentStreamEvent,
  StepStartEvent,
  StepCompleteEvent,
  ThinkingEvent,
  ContentEvent,
  ProgressEvent,
  ErrorEvent,
  InterventionEvent,
  BrowserOpenRequiredEvent
} from './event-types.js';

/**
 * Event Builders provides convenient methods for creating events
 * This is extracted from agent/streaming.ts
 */
export class EventBuilders {
  /**
   * Create a step start event
   */
  static stepStart(
    phase: StepStartEvent['phase'],
    action: string,
    detail: string,
    url?: string
  ): StepStartEvent {
    return {
      type: 'step_start',
      timestamp: Date.now(),
      phase,
      action,
      detail,
      url,
    };
  }

  /**
   * Create a step complete event
   */
  static stepComplete(
    phase: StepCompleteEvent['phase'],
    action: string,
    observation: string | undefined,
    success: boolean
  ): StepCompleteEvent {
    return {
      type: 'step_complete',
      timestamp: Date.now(),
      phase,
      action,
      observation,
      success,
    };
  }

  /**
   * Create a thinking event
   */
  static thinking(
    content: string,
    phase: ThinkingEvent['phase'] = 'thinking'
  ): ThinkingEvent {
    return {
      type: 'thinking',
      timestamp: Date.now(),
      content,
      phase,
    };
  }

  /**
   * Create a content event
   */
  static content(content: string, isFinal = false): ContentEvent {
    return {
      type: 'content',
      timestamp: Date.now(),
      content,
      isFinal,
    };
  }

  /**
   * Create a progress event
   */
  static progress(
    iteration: number,
    maxIterations: number,
    phase: string
  ): ProgressEvent {
    return {
      type: 'progress',
      timestamp: Date.now(),
      iteration,
      maxIterations,
      phase,
    };
  }

  /**
   * Create an error event
   */
  static error(error: string, recoverable = true): ErrorEvent {
    return {
      type: 'error',
      timestamp: Date.now(),
      error,
      recoverable,
    };
  }

  /**
   * Create an intervention event
   */
  static intervention(message: string, id: number): InterventionEvent {
    return {
      type: 'intervention',
      timestamp: Date.now(),
      message,
      id,
    };
  }

  /**
   * Create a browser open required event
   */
  static browserOpenRequired(reason: string, task: string): BrowserOpenRequiredEvent {
    return {
      type: 'browser_open_required',
      timestamp: Date.now(),
      reason,
      task,
    };
  }

  /**
   * Create event from generic object
   */
  static fromObject(obj: any): AgentStreamEvent | null {
    if (!obj.type || !obj.timestamp) return null;

    // Ensure timestamp is present
    if (!obj.timestamp) {
      obj.timestamp = Date.now();
    }

    return obj as AgentStreamEvent;
  }

  /**
   * Clone event with new timestamp
   */
  static withTimestamp(event: AgentStreamEvent, timestamp?: number): AgentStreamEvent {
    return {
      ...event,
      timestamp: timestamp ?? Date.now()
    };
  }
}
