/**
 * Streaming Event Type Definitions
 * All event type interfaces for the streaming system
 */

/**
 * Event types that can be streamed during agent execution
 */
export type StreamEventType =
  | 'step_start'
  | 'step_complete'
  | 'step_error'
  | 'thinking'
  | 'content'
  | 'progress'
  | 'error'
  | 'intervention'
  | 'browser_open_required';

/**
 * Base interface for all streaming events
 */
export interface StreamEvent {
  type: StreamEventType;
  timestamp: number;
}

/**
 * Step start event - emitted when a tool/action starts
 */
export interface StepStartEvent extends StreamEvent {
  type: 'step_start';
  phase: 'planning' | 'executing' | 'done';
  action: string;
  detail: string;
  url?: string;
}

/**
 * Step complete event - emitted when a step completes
 */
export interface StepCompleteEvent extends StreamEvent {
  type: 'step_complete';
  phase: 'planning' | 'executing' | 'done';
  action: string;
  observation?: string;
  success: boolean;
}

/**
 * Thinking event - emitted during LLM reasoning
 */
export interface ThinkingEvent extends StreamEvent {
  type: 'thinking';
  content: string;
  phase: 'thinking' | 'planning' | 'reflection';
}

/**
 * Content event - emitted when streaming response content
 */
export interface ContentEvent extends StreamEvent {
  type: 'content';
  content: string;
  isFinal: boolean;
}

/**
 * Progress event - emitted for general progress updates
 */
export interface ProgressEvent extends StreamEvent {
  type: 'progress';
  iteration: number;
  maxIterations: number;
  phase: string;
}

/**
 * Error event - emitted when an error occurs
 */
export interface ErrorEvent extends StreamEvent {
  type: 'error';
  error: string;
  recoverable: boolean;
}

/**
 * Intervention event - emitted when human intervention is needed
 */
export interface InterventionEvent extends StreamEvent {
  type: 'intervention';
  message: string;
  id: number;
}

/**
 * Browser open required event - emitted when agent needs browser panel
 */
export interface BrowserOpenRequiredEvent extends StreamEvent {
  type: 'browser_open_required';
  reason: string;
  task: string;
}

/**
 * Union type of all agent stream events
 */
export type AgentStreamEvent =
  | StepStartEvent
  | StepCompleteEvent
  | ThinkingEvent
  | ContentEvent
  | ProgressEvent
  | ErrorEvent
  | InterventionEvent
  | BrowserOpenRequiredEvent;

/**
 * Listener for streaming events
 */
export type StreamEventListener = (event: AgentStreamEvent) => void;
