/**
 * Agent State Manager
 * Manages agent state, mode, and progress tracking
 */

import type { AgentMode, AgentModeEntry, AgentState } from './types.js';
import { DEFAULT_MODES } from './constants.js';

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Agent State Manager
 * This is extracted from tui/app.ts
 */
export class AgentStateManager {
  private state: AgentState = {
    running: false,
    startTime: 0,
    mode: 'Browser',
    modes: [...DEFAULT_MODES],
    currentModeIndex: 0,
    spinnerFrame: 0,
    streamingPhase: '',
    taskCount: 0,
    retryAttempt: null,
    retryMax: null,
    retryCountdown: null,
    validationConfidence: null,
    validationIssues: null,
    reflectionStatus: false,
  };

  /**
   * Get current state
   */
  getState(): AgentState {
    return this.state;
  }

  /**
   * Check if agent is running
   */
  isRunning(): boolean {
    return this.state.running;
  }

  /**
   * Start agent
   */
  start(): void {
    this.state.running = true;
    this.state.startTime = Date.now();
  }

  /**
   * Stop agent
   */
  stop(): void {
    this.state.running = false;
    this.state.streamingPhase = '';
    this.resetProgress();
  }

  /**
   * Get current mode
   */
  getMode(): AgentMode {
    return this.state.mode;
  }

  /**
   * Cycle to next agent mode
   */
  cycleMode(): void {
    this.state.currentModeIndex = (this.state.currentModeIndex + 1) % this.state.modes.length;
    const entry = this.state.modes[this.state.currentModeIndex];
    this.state.mode = (entry.mode === 'browser' ? 'Browser' : entry.mode === 'terminator' ? 'Terminator' : 'Browser') as AgentMode;
  }

  /**
   * Get current mode label
   */
  getModeLabel(): string {
    return this.state.modes[this.state.currentModeIndex]?.label ?? 'Mgr';
  }

  /**
   * Get current mode name
   */
  getModeName(): string {
    return this.state.modes[this.state.currentModeIndex]?.mode ?? 'manager';
  }

  /**
   * Get current mode entry
   */
  getModeEntry(): AgentModeEntry | undefined {
    return this.state.modes[this.state.currentModeIndex];
  }

  /**
   * Get spinner character
   */
  getSpinnerChar(): string {
    return SPINNER_FRAMES[this.state.spinnerFrame % SPINNER_FRAMES.length];
  }

  /**
   * Advance spinner frame
   */
  advanceSpinner(): void {
    this.state.spinnerFrame = (this.state.spinnerFrame + 1) % SPINNER_FRAMES.length;
  }

  /**
   * Get streaming phase
   */
  getStreamingPhase(): string {
    return this.state.streamingPhase;
  }

  /**
   * Set streaming phase
   */
  setStreamingPhase(phase: string): void {
    this.state.streamingPhase = phase;
  }

  /**
   * Increment task count
   */
  incrementTaskCount(): void {
    this.state.taskCount++;
  }

  /**
   * Get task count
   */
  getTaskCount(): number {
    return this.state.taskCount;
  }

  /**
   * Update progress data
   */
  updateProgress(data: {
    kind?: string;
    currentAttempt?: number;
    maxAttempts?: number;
    countdownSeconds?: number;
    confidence?: number;
    issuesCount?: number;
  }): void {
    if (data.kind === 'retry') {
      this.state.retryAttempt = data.currentAttempt ?? null;
      this.state.retryMax = data.maxAttempts ?? null;
      this.state.retryCountdown = data.countdownSeconds ?? null;
      this.state.streamingPhase = 'retrying';
    } else if (data.kind === 'validation') {
      this.state.validationConfidence = data.confidence ?? null;
      this.state.validationIssues = data.issuesCount ?? null;
    } else if (data.kind === 'reflection') {
      this.state.reflectionStatus = true;
      this.state.streamingPhase = 'reflecting';
    }
  }

  /**
   * Reset progress tracking
   */
  private resetProgress(): void {
    this.state.retryAttempt = null;
    this.state.retryMax = null;
    this.state.retryCountdown = null;
    this.state.validationConfidence = null;
    this.state.validationIssues = null;
    this.state.reflectionStatus = false;
  }

  /**
   * Get elapsed time since start
   */
  getElapsedSeconds(): number {
    if (!this.state.running) return 0;
    return Math.round((Date.now() - this.state.startTime) / 1000);
  }

  /**
   * Get retry status
   */
  getRetryStatus(): { attempt: number | null; max: number | null; countdown: number | null } {
    return {
      attempt: this.state.retryAttempt,
      max: this.state.retryMax,
      countdown: this.state.retryCountdown,
    };
  }

  /**
   * Get validation status
   */
  getValidationStatus(): { confidence: number | null; issues: number | null } {
    return {
      confidence: this.state.validationConfidence,
      issues: this.state.validationIssues,
    };
  }
}
