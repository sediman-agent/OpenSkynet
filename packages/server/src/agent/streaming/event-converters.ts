/**
 * Event Converters
 * Convert streaming events to other formats
 */

import type { StepEvent } from '../../../core/types';
import type {
  AgentStreamEvent,
  StepStartEvent,
  StepCompleteEvent
} from './event-types.js';

/**
 * Event Converters handles conversion between event formats
 * This is extracted from agent/streaming.ts
 */
export class EventConverters {
  /**
   * Convert streaming event to StepEvent for backward compatibility
   */
  static toStepEvent(event: StepStartEvent | StepCompleteEvent): StepEvent {
    if (event.type === 'step_start') {
      return {
        phase: event.phase,
        action: event.action,
        detail: event.detail,
        url: event.url,
      };
    } else {
      return {
        phase: event.phase,
        action: event.action,
        detail: event.observation ?? '',
      };
    }
  }

  /**
   * Convert streaming event to RPC notification params
   */
  static toNotification(event: AgentStreamEvent): Record<string, unknown> {
    switch (event.type) {
      case 'step_start':
        return {
          phase: event.phase,
          action: event.action,
          detail: event.detail,
          url: event.url,
        };
      case 'step_complete':
        return {
          phase: event.phase,
          action: event.action,
          observation: event.observation,
          success: event.success,
        };
      case 'thinking':
        return {
          content: event.content,
          phase: event.phase,
        };
      case 'content':
        return {
          content: event.content,
          is_final: event.isFinal,
        };
      case 'progress':
        return {
          iteration: event.iteration,
          max_iterations: event.maxIterations,
          phase: event.phase,
        };
      case 'error':
        return {
          error: event.error,
          recoverable: event.recoverable,
        };
      case 'intervention':
        return {
          message: event.message,
          id: event.id,
        };
      case 'browser_open_required':
        return {
          reason: event.reason,
          task: event.task,
        };
      default:
        return {};
    }
  }

  /**
   * Convert to JSON string
   */
  static toJSON(event: AgentStreamEvent): string {
    return JSON.stringify(event);
  }

  /**
   * Parse from JSON string
   */
  static fromJSON(json: string): AgentStreamEvent | null {
    try {
      return JSON.parse(json) as AgentStreamEvent;
    } catch {
      return null;
    }
  }

  /**
   * Batch convert events to notifications
   */
  static batchToNotifications(events: AgentStreamEvent[]): Record<string, unknown>[] {
    return events.map(e => this.toNotification(e));
  }

  /**
   * Filter events by type
   */
  static filterByType<T extends AgentStreamEvent['type']>(
    events: AgentStreamEvent[],
    type: T
  ): Extract<AgentStreamEvent, { type: T }>[] {
    return events.filter(e => e.type === type) as any;
  }

  /**
   * Group events by type
   */
  static groupByType(events: AgentStreamEvent[]): Map<AgentStreamEvent['type'], AgentStreamEvent[]> {
    const groups = new Map();

    for (const event of events) {
      const type = event.type;
      if (!groups.has(type)) {
        groups.set(type, []);
      }
      groups.get(type)!.push(event);
    }

    return groups;
  }
}
