/**
 * Enhanced Agent Loop - Simplified
 *
 * Refactored from 572 lines to ~150 lines
 * State capture extracted to execution/state-capture-new.ts
 * Prompt building extracted to execution/prompt-builder-new.ts
 * Action execution extracted to execution/action-executor-new.ts
 * Response handling extracted to execution/response-handler-new.ts
 */

import type { LLMProvider } from '../../llm/provider';
import type { StructuredProvider } from '../../llm/structured/index';
import type { BaseMemoryStrategy } from '../../memory/strategy';
import type { SkillEngine } from '../../skills/engine';
import type { BrowserSession } from '../../browser';
import { ToolBus } from '../tools/bus';
import { StreamEmitter } from '../streaming';
import { getConfig } from '../../core/config';
import { createLogger } from '../../core/logging';
import type { AgentResponse, ToolCall } from '../schemas';

import { StateCaptureManager, type CapturedState, type StateCaptureOptions } from './state-capture';
import { PromptBuilder, type PromptBuilderOptions } from './prompt-builder';
import { ActionExecutor, type BatchExecutionResult } from './action-executor';
import { ResponseHandler, type ResponseHandlerOptions } from './response-handler';

const logger = createLogger('enhanced-agent-loop');

// ============================================================================
// Type Definitions
// ============================================================================

export interface EnhancedAgentLoopOpts {
  llmProvider: LLMProvider;
  structuredLLMProvider?: StructuredProvider;
  browserSession?: BrowserSession;
  memory?: BaseMemoryStrategy;
  skillEngine?: SkillEngine;
  toolBus?: ToolBus;
  headless?: boolean;
  workingDirectory?: string;
  useVision?: boolean;
  useSmartPerception?: boolean;
  maxIterations?: number;
}

export interface EnhancedAgentResult {
  task: string;
  result: string;
  success: boolean;
  actions_taken: string[];
  iterations: number;
  strategy_used: string;
  elapsed_secs: number;
  final_response?: AgentResponse;
  error?: string;
}

// ============================================================================
// Enhanced Agent Loop
// ============================================================================

export class EnhancedAgentLoop {
  private llmProvider: LLMProvider;
  private browserSession?: BrowserSession;
  private memory?: BaseMemoryStrategy;
  private streamEmitter: StreamEmitter;

  // Extracted modules
  private stateCapture: StateCaptureManager;
  private promptBuilder: PromptBuilder;
  private actionExecutor: ActionExecutor;
  private responseHandler: ResponseHandler;

  // Conversation state
  private conversation: Array<any> = [];
  private maxIterations: number;
  private agentMemory = '';
  private cancelled = false;
  private workingDirectory: string;

  constructor(opts: EnhancedAgentLoopOpts) {
    const config = getConfig();

    this.llmProvider = opts.llmProvider;
    this.browserSession = opts.browserSession;
    this.memory = opts.memory;
    this.workingDirectory = opts.workingDirectory ?? process.cwd();

    const calculatedMax = config.compressThreshold * 2 + 10;
    this.maxIterations = opts.maxIterations ?? Math.max(calculatedMax, 50);

    // Optimized for fast first token - content flushes immediately
    this.streamEmitter = new StreamEmitter({ batchSize: 1, flushIntervalMs: 5 });

    const toolBus = opts.toolBus || new ToolBus();

    // Initialize extracted modules
    this.stateCapture = new StateCaptureManager({
      useVision: opts.useVision ?? true,
      useSmartPerception: opts.useSmartPerception ?? false
    });

    this.promptBuilder = new PromptBuilder();

    this.actionExecutor = new ActionExecutor(toolBus, this.streamEmitter);

    this.responseHandler = new ResponseHandler(
      opts.llmProvider,
      opts.structuredLLMProvider
    );

    if (opts.structuredLLMProvider) {
      logger.info('[EnhancedAgentLoop] Structured LLM provider set');
    }
  }

  /**
   * Set structured LLM provider
   */
  setStructuredProvider(provider: StructuredProvider): void {
    this.responseHandler.setStructuredProvider(provider);
    logger.info('[EnhancedAgentLoop] Structured LLM provider set');
  }

  /**
   * Enable smart perception
   */
  enableSmartPerception(): void {
    this.stateCapture.enableSmartPerception();
    logger.info('[EnhancedAgentLoop] Smart perception enabled');
  }

  /**
   * Run the agent loop with structured output
   */
  async run(task: string, mode?: string): Promise<EnhancedAgentResult> {
    const startTime = Date.now();
    const actionsTaken: string[] = [];
    let iteration = 0;
    let finalResult = '';
    let success = false;
    let finalResponse: AgentResponse | undefined;

    try {
      this.cancelled = false;
      this.agentMemory = '';
      this.conversation = [];

      if (this.memory) {
        await this.memory.onTurnStart();
      }

      this.streamEmitter.emitProgress(0, this.maxIterations, 'starting');

      // Capture initial state
      const initialState = await this.stateCapture.captureState(this.browserSession);
      const initialMsg = this.promptBuilder.buildStateMessage(
        task,
        initialState,
        this.agentMemory,
        this.stateCapture.getConfig().useVision ?? true
      );
      this.conversation.push(initialMsg);

      while (iteration < this.maxIterations && !this.cancelled) {
        iteration++;
        this.streamEmitter.emitProgress(iteration, this.maxIterations, 'thinking');

        // Build system prompt
        const systemPrompt = this.promptBuilder.buildSystemPrompt(task, { mode });

        // Get LLM response
        let response: AgentResponse;
        try {
          response = await this.responseHandler.getStructuredResponse(
            this.conversation,
            undefined,
            systemPrompt
          );
        } catch (error) {
          logger.error({ err: error as Error, iteration }, '[EnhancedAgentLoop] LLM error');
          // Continue with coerced response
          response = {
            thought: {
              thinking: 'Error occurred, retrying',
              evaluation: 'failure',
              memory: this.agentMemory,
              nextGoal: 'Continue task'
            },
            actions: [],
            done: false
          };
        }

        finalResponse = response;

        // Update memory
        if (response.thought?.memory) {
          this.agentMemory = response.thought.memory;
        }

        // Emit thinking
        if (response.thought?.thinking) {
          this.streamEmitter.emitThinking(response.thought.thinking, 'thinking');
        }

        // Add assistant response
        this.conversation.push({
          role: 'assistant',
          content: JSON.stringify(response)
        });

        // Check if done
        if (response.done) {
          finalResult = this.responseHandler.getFinalResult(response);
          success = this.responseHandler.isSuccess(response) || actionsTaken.length > 0;
          break;
        }

        // Execute actions
        if (response.actions && response.actions.length > 0) {
          const batchResult = await this.actionExecutor.executeBatch(response.actions);

          actionsTaken.push(...batchResult.actionsTaken);

          // Capture new state after actions
          if (!this.cancelled) {
            await new Promise(resolve => setTimeout(resolve, 500));

            const newState = await this.stateCapture.captureState(this.browserSession);
            const stateMsg = this.promptBuilder.buildStateMessage(
              this.promptBuilder.buildActionResultsMessage(batchResult.combinedOutput, task),
              newState,
              this.agentMemory,
              this.stateCapture.getConfig().useVision ?? true
            );

            this.conversation.push(stateMsg);
          }

          // Check if browser_end was called
          if (this.actionExecutor.hasBrowserEnd(batchResult.actionsTaken)) {
            logger.info('[EnhancedAgentLoop] Agent called browser_end - stopping loop');
            break;
          }

          // Handle consecutive failures
          if (this.actionExecutor.shouldTriggerRecovery(3)) {
            this.conversation.push({
              role: 'user',
              content: this.promptBuilder.buildReflectionPrompt(
                'Multiple consecutive failures. Try a completely different approach.'
              )
            });
          }
        } else {
          // No actions - prompt to continue
          this.conversation.push({
            role: 'user',
            content: this.promptBuilder.buildContinuePrompt()
          });
        }

        // Budget warning
        if (iteration >= this.maxIterations * 0.75) {
          this.conversation.push({
            role: 'user',
            content: this.promptBuilder.buildBudgetWarning(iteration, this.maxIterations)
          });
        }
      }

      if (!finalResult && !this.cancelled) {
        finalResult = this.agentMemory || 'Task execution ended';
        success = actionsTaken.length > 0;
      }

      if (this.memory) {
        await this.memory.onSessionEnd();
      }

      return {
        task,
        result: finalResult || 'Task completed',
        success,
        actions_taken: actionsTaken,
        iterations: iteration,
        strategy_used: this.stateCapture.getConfig().useSmartPerception ? 'smart_perception' : 'standard',
        elapsed_secs: Math.round((Date.now() - startTime) / 1000),
        final_response: finalResponse
      };
    } catch (error) {
      logger.error({ err: error as Error }, '[EnhancedAgentLoop] Fatal error');

      return {
        task,
        result: error instanceof Error ? error.message : String(error),
        success: false,
        actions_taken: actionsTaken,
        iterations: iteration,
        strategy_used: 'error',
        elapsed_secs: Math.round((Date.now() - startTime) / 1000),
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Cancel the current execution
   */
  cancel(): void {
    this.cancelled = true;
    this.streamEmitter.emitError('Task cancelled', false);
  }

  /**
   * Subscribe to stream events
   */
  onStreamEvent(listener: (event: any) => void): () => void {
    return this.streamEmitter.onEvent(listener);
  }

  /**
   * Get conversation history
   */
  getConversation(): Array<any> {
    return [...this.conversation];
  }

  /**
   * Set conversation history
   */
  setConversation(messages: Array<any>): void {
    this.conversation = [...messages];
  }

  /**
   * Clear conversation
   */
  clearConversation(): void {
    this.conversation = [];
  }
}

/**
 * Create enhanced agent loop
 */
export function createEnhancedAgentLoop(opts: EnhancedAgentLoopOpts): EnhancedAgentLoop {
  return new EnhancedAgentLoop(opts);
}

// Re-export extracted modules
export { StateCaptureManager, PromptBuilder, ActionExecutor, ResponseHandler };
export type { CapturedState, StateCaptureOptions, PromptBuilderOptions, ResponseHandlerOptions };
