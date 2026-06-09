/**
 * Execution Context
 * Centralized state management for agent execution
 */

import type { LLMProvider } from '../../../llm/provider.js';
import { ToolBus } from '../../tools/bus.js';
import { ConversationManager } from '../conversation-manager.js';
import { StreamEmitter } from '../../streaming.js';
import type { Budget } from '../../monitoring/guardrails.js';
import type { StepEvent } from '../../../core/types.js';

export interface ExecutionContextOptions {
  llmProvider: LLMProvider;
  browserSession?: any;
  memory?: any;
  skillEngine?: any;
  toolBus?: ToolBus;
  headless?: boolean;
  terminalAllowed?: boolean;
}

/**
 * Execution Context holds all state and dependencies for agent execution
 * This replaces 24+ instance variables in AgentLoop with a single cohesive object
 */
export class ExecutionContext {
  // Task information
  public currentTask: string = '';
  public currentCategory: string = '';
  public currentMode: string = '';

  // Browser state
  public currentUrl: string = '';
  public currentTitle: string = '';

  // Execution tracking
  public steps: StepEvent[] = [];
  public actionsTaken: string[] = [];
  public actionHistory: Map<string, number> = new Map();

  // Iteration state
  public iteration: number = 0;
  public maxIterations: number = 50;
  public done: boolean = false;

  // Results
  public finalResult: string = '';
  public success: boolean = false;
  public strategyUsed: string = 'direct';

  // Dependencies (injected)
  public llmProvider: LLMProvider;
  public toolBus: ToolBus;
  public conversationManager: ConversationManager;
  public streamEmitter: StreamEmitter;

  // Optional dependencies
  public browserSession?: any;
  public memory?: any;
  public skillEngine?: any;

  // Budget tracking
  public budget: Budget;

  // Timing
  public startTime: number = 0;
  public elapsedTime: number = 0;

  // Exporters (lazy loaded)
  public conversationExporter: any = null;
  public historyManager: any = null;

  constructor(opts: ExecutionContextOptions) {
    this.llmProvider = opts.llmProvider;
    this.browserSession = opts.browserSession;
    this.memory = opts.memory;
    this.skillEngine = opts.skillEngine;
    this.toolBus = opts.toolBus ?? new ToolBus({
      enableRetry: true,
      maxRetries: 3,
      defaultTimeoutMs: 30000
    });
    this.conversationManager = new ConversationManager();
    this.streamEmitter = new StreamEmitter({ batchSize: 10, flushIntervalMs: 50 });

    // Initialize budget
    this.budget = {
      maxTokens: 200_000,
      maxIterations: 50,
      maxTimeMs: 600_000,
      usedTokens: 0,
      usedIterations: 0,
      usedTimeMs: 0,
    };
  }

  /**
   * Reset context for a new task
   */
  reset(): void {
    this.currentTask = '';
    this.currentCategory = '';
    this.currentMode = '';
    this.currentUrl = '';
    this.currentTitle = '';
    this.steps = [];
    this.actionsTaken = [];
    this.actionHistory = new Map();
    this.iteration = 0;
    this.done = false;
    this.finalResult = '';
    this.success = false;
    this.strategyUsed = 'direct';
    this.startTime = 0;
    this.elapsedTime = 0;
  }

  /**
   * Update elapsed time
   */
  updateElapsedTime(): void {
    this.elapsedTime = Date.now() - this.startTime;
  }

  /**
   * Increment iteration counter
   */
  incrementIteration(): void {
    this.iteration++;
    this.budget.usedIterations = this.iteration;
  }

  /**
   * Add an action to history
   */
  recordAction(action: string): void {
    this.actionsTaken.push(action);
    const count = this.actionHistory.get(action) || 0;
    this.actionHistory.set(action, count + 1);
  }

  /**
   * Check if we've exceeded the maximum iterations
   */
  isMaxIterationsReached(): boolean {
    return this.iteration >= this.maxIterations;
  }

  /**
   * Mark execution as complete
   */
  complete(result: string, success: boolean): void {
    this.finalResult = result;
    this.success = success;
    this.done = true;
    this.updateElapsedTime();
  }
}
