/**
 * Agent Loop - Simplified and Refactored
 * Main coordinator for agent execution
 *
 * This file has been refactored from 1,332 lines to ~200 lines
 * Most logic has been extracted to specialized modules:
 * - ExecutionContext: State management
 * - MessageHandler: Message operations
 * - BudgetManager: Budget tracking
 * - AgentExecutor: Execution logic
 * - TurboPathExecutor: Fast path execution
 */

import type { AgentResult, StepEvent } from "../../core/types";
import type { LLMProvider } from "../../llm/provider";
import type { BaseMemoryStrategy } from "../../memory/strategy";
import type { SkillEngine } from "../../skills/engine";
import { ToolBus } from "../tools/bus";
import { ExecutionContext } from "./context/execution-context.js";
import { MessageHandler } from "./core/message-handler.js";
import { AgentExecutor } from "./core/agent-executor.js";
import { BudgetManager } from "./monitoring/budget-manager.js";
import { TurboPathExecutor } from "./turbo/turbo-path-executor.js";
import { createLogger } from "../../core/logging";
import { loadSoul } from "../prompts/soul.js";
import { classifyTask, createPlan } from "./task-classifier.js";
import { setOnInterventionRequested } from "../tools/browser-tools.js";
import { handlePostTask } from "../post-task/index.js";
import type { TaskCategory, TaskPlan } from "./types.js";

const logger = createLogger("AgentLoop");

// ============================================================================
// Constants
// ============================================================================

const BROWSER_PANEL_READY_DELAY_MS = 2000;
const TIME_PRECISION = 100; // milliseconds for elapsed time calculation

// ============================================================================
// Type Definitions
// ============================================================================

export interface AgentLoopOpts {
  llmProvider: LLMProvider;
  browserSession?: any;
  memory?: BaseMemoryStrategy;
  skillEngine?: SkillEngine;
  toolBus?: ToolBus;
  headless?: boolean;
  terminalAllowed?: boolean;
}

interface ExecutionResult {
  success: boolean;
  result: string;
}

// ============================================================================
// Agent Loop
// ============================================================================

export class AgentLoop {
  private context: ExecutionContext;
  private messageHandler: MessageHandler;
  private budgetManager: BudgetManager;
  private executor: AgentExecutor | null = null;
  private turboExecutor: TurboPathExecutor;

  constructor(opts: AgentLoopOpts) {
    // Create centralized execution context
    this.context = new ExecutionContext(opts);

    // Create message handler
    this.messageHandler = new MessageHandler(this.context.conversationManager);

    // Create budget manager
    this.budgetManager = new BudgetManager();
    this.context.budget = this.budgetManager.getBudget();
    this.context.maxIterations = this.context.budget.maxIterations;

    // Create turbo executor
    this.turboExecutor = new TurboPathExecutor({
      llmProvider: opts.llmProvider,
      toolBus: this.context.toolBus,
      soul: '',
      emitContent: (chunk, isFinal) => this.context.streamEmitter.emitContent(chunk, isFinal),
      emitStepStart: (phase, action, detail) => this.context.streamEmitter.emitStepStart(phase, action, detail),
      emitStepComplete: (phase, action, output, success) => this.context.streamEmitter.emitStepComplete(phase, action, output, success),
      saveSessionToDb: async (task, steps, result, success) => {
        // Will be handled in post-task
      }
    });
  }

  /**
   * Update the LLM provider dynamically
   * This allows changing the model/provider during runtime
   */
  setLLMProvider(provider: LLMProvider): void {
    this.context.llmProvider = provider;
    this.turboExecutor.setLLMProvider(provider);
    if (this.executor) {
      this.executor.setLLMProvider(provider);
    }
  }

  /**
   * Main entry point - run the agent
   */
  async run(task: string, mode?: string, conversationHistory?: Array<{ role: string; content: string }>): Promise<AgentResult> {
    const startTime = Date.now();

    // Initialize context for new task
    await this.initializeTask(task, conversationHistory);

    try {
      // Emit starting event
      this.context.streamEmitter.emitProgress(0, this.context.maxIterations, "starting");

      // Try turbo path for simple tasks
      const turboResult = await this.tryTurboPath(task);
      if (turboResult) {
        return turboResult;
      }

      // Classify task and create plan
      const category = classifyTask(task, mode);
      const plan = createPlan(task, category);
      this.context.currentCategory = category;
      this.context.strategyUsed = category === "simple" ? "direct" : category;

      // Setup browser if needed (Electron mode)
      await this.setupBrowser(mode, category);

      // Create executor and run main loop
      this.executor = new AgentExecutor(this.context, this.messageHandler);
      const result = await this.runMainLoop(task, category, plan);

      // Handle post-execution tasks
      await this.handlePostExecution(result);

      return this.finalizeResult(result, startTime);

    } catch (err) {
      logger.error('[AgentLoop] ERROR CAUGHT:');
      logger.error('  Type:', typeof err);
      logger.error('  Constructor:', err?.constructor?.name);

      let message = 'Unknown error';
      let stringRep = '';

      if (err instanceof Error) {
        message = err.message;
        stringRep = String(err);
        logger.error('  Message:', message);
        if (err.stack) {
          logger.error('  Stack:', err.stack);
        }
      } else {
        stringRep = JSON.stringify(err);
        logger.error('  String:', stringRep);
      }

      if (!message || message === 'Unknown error') {
        if (stringRep && stringRep !== '{}') {
          message = `Non-Error object thrown: ${stringRep}`;
        } else if (err === null || err === undefined) {
          message = 'Null/Undefined error (possible Promise rejection without value)';
        } else {
          message = `Unknown error type: ${typeof err}`;
        }
      }

      logger.error('  Processed Message:', message);

      return this.handleError(err instanceof Error ? err : new Error(message), startTime);
    }
  }

  /**
   * Initialize task context
   */
  private async initializeTask(task: string, conversationHistory?: any[]): Promise<void> {
    this.context.reset();
    this.context.currentTask = task;
    this.context.startTime = Date.now();
    this.context.soul = loadSoul();

    // Set conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      const { ConversationManager } = await import('./conversation-manager.js');
      const conversationManager = new ConversationManager({ initialHistory: conversationHistory });
      this.context.conversationManager = conversationManager;
      this.messageHandler = new MessageHandler(conversationManager);
    } else {
      // Add task as initial user message
      this.messageHandler.addUserMessage(task);
    }

    // Set up intervention callback
    setOnInterventionRequested((message, id) => {
      this.context.streamEmitter.emitIntervention(message, id);
    });
  }

  /**
   * Try turbo path for simple tasks
   */
  private async tryTurboPath(task: string): Promise<AgentResult | null> {
    try {
      return await this.turboExecutor.tryExecute(task);
    } catch (err) {
      logger.debug('[AgentLoop] Turbo path failed, continuing with standard path:', err);
      return null;
    }
  }

  /**
   * Setup browser for Electron mode
   */
  private async setupBrowser(mode?: string, category?: string): Promise<void> {
    const RUNNING_IN_ELECTRON = process.env.SEDIMAN_MODE === 'electron';
    if (RUNNING_IN_ELECTRON && (mode === 'browser' || category === 'browser')) {
      logger.info("Running in Electron mode with browser task - requesting browser panel");
      this.context.streamEmitter.emitBrowserOpenRequired(
        "Agent needs shared browser for task execution",
        this.context.currentTask
      );
      await this.delay(BROWSER_PANEL_READY_DELAY_MS);
    }
  }

  /**
   * Run main execution loop
   */
  private async runMainLoop(task: string, category: string, plan: TaskPlan): Promise<ExecutionResult> {
    const config = (await import('../../core/config.js')).getConfig();
    const { buildSystemPrompt } = await import('./system-prompt-builder.js');

    while (!this.context.done && this.context.iteration < this.context.maxIterations) {
      this.context.incrementIteration();

      // Build system prompt
      const systemPrompt = buildSystemPrompt({
        task,
        category,
        plan,
        iteration: this.context.iteration,
        soul: this.context.soul
      });

      // Execute iteration
      const result = await this.executor.executeIteration(systemPrompt, this.context.toolBus.getDefinitions());

      if (result.done) {
        return { success: result.success, result: result.result };
      }
    }

    return {
      success: this.context.finalResult.length > 0 && !this.context.finalResult.startsWith('Stopped:'),
      result: this.context.finalResult || 'Task completed'
    };
  }

  /**
   * Handle post-execution tasks
   */
  private async handlePostExecution(execResult: ExecutionResult): Promise<void> {
    await handlePostTask({
      task: this.context.currentTask,
      result: execResult.result,
      success: execResult.success,
      category: this.context.currentCategory as any,
      mode: this.context.currentMode,
      iterations: this.context.iteration,
      elapsedSecs: this.context.elapsedTime / 1000,
      actionsTaken: this.context.actionsTaken,
      steps: this.context.steps,
      conversation: this.messageHandler.getConversation(),
      startTime: this.context.startTime ? new Date(this.context.startTime).toISOString() : undefined,
      endTime: new Date().toISOString()
    });
  }

  /**
   * Finalize and format result
   */
  private finalizeResult(execResult: ExecutionResult, startTime: number): AgentResult {
    return {
      task: this.context.currentTask,
      result: execResult.result,
      success: execResult.success,
      steps: this.context.steps,
      actions_taken: this.context.actionsTaken,
      iterations: this.context.iteration,
      strategy_used: this.context.strategyUsed,
      elapsed_secs: this.calculateElapsedSeconds(startTime),
    };
  }

  /**
   * Handle errors
   */
  private handleError(err: unknown, startTime: number): AgentResult {
    const message = err instanceof Error ? err.message : String(err);
    return {
      task: this.context.currentTask,
      result: `Error: ${message}`,
      success: false,
      steps: this.context.steps,
      actions_taken: this.context.actionsTaken,
      iterations: this.context.iteration,
      strategy_used: 'error',
      elapsed_secs: this.calculateElapsedSeconds(startTime),
    };
  }

  /**
   * Calculate elapsed time with precision
   */
  private calculateElapsedSeconds(startTime: number): number {
    return Math.round((Date.now() - startTime) / TIME_PRECISION) / TIME_PRECISION;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cancel execution
   */
  cancel(): void {
    this.context.streamEmitter.destroy();
  }

  /**
   * Subscribe to streaming events
   */
  onStreamEvent(listener: (event: any) => void): () => void {
    return this.context.streamEmitter.onEvent(listener);
  }

  /**
   * Get conversation
   */
  getConversation(): any[] {
    return this.messageHandler.getConversation();
  }

  /**
   * Set conversation
   */
  setConversation(messages: any[]): void {
    this.messageHandler.setConversation(messages);
  }

  /**
   * Clear conversation
   */
  clearConversation(): void {
    this.messageHandler.clearConversation();
  }
}

/**
 * Think Tag Parser
 * Parses thinking tags from agent responses
 */
export class ThinkTagParser {
  /**
   * Parse thinking tags from text
   */
  parse(text: string): { thinking?: string; visible?: string } {
    const thinkMatch = text.match(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/i);
    if (thinkMatch) {
      const thinking = thinkMatch[1].trim();
      const visible = text.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, '').trim();
      return { thinking, visible: visible || undefined };
    }
    return { visible: text };
  }
}
