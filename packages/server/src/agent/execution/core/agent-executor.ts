/**
 * Agent Executor
 * Core execution logic extracted from AgentLoop
 */

import type { LLMProvider } from '../../../llm/provider.js';
import type { ToolCall } from '../../../core/types.js';
import { ExecutionContext } from '../context/execution-context.js';
import { MessageHandler } from './message-handler.js';
import { detectLoop } from '../reflection-handler.js';
import { reflect } from '../reflection-handler.js';
import { createLogger } from '../../../core/logging.js';
import { LoopDetector } from '../../monitoring/loop-detector.js';
import { CheckpointManager } from '../../monitoring/checkpoint.js';
import { compressText } from '../../memory/compressor.js';
import { injectBrowserVision } from '../browser-operations.js';
import { updatePageState, getLastPageState } from '../../tools/browser-tools.js';
import type { PageSnapshot } from '../../../browser/controller.js';

const logger = createLogger('AgentExecutor');

export interface IterationResult {
  done: boolean;
  result: string;
  success: boolean;
  steps: any[];
}

/**
 * Agent Executor handles the main execution loop logic
 * This is the core coordination module extracted from AgentLoop.run()
 */
export class AgentExecutor {
  private loopDetector: LoopDetector;
  private checkpointManager: CheckpointManager;
  private compressor: any;

  constructor(
    private context: ExecutionContext,
    private messageHandler: MessageHandler
  ) {
    this.loopDetector = new LoopDetector();
    this.checkpointManager = new CheckpointManager({ enabled: true, checkpointInterval: 1 });
    this.compressor = compressText;
  }

  /**
   * Update the LLM provider dynamically
   */
  setLLMProvider(provider: LLMProvider): void {
    this.context.llmProvider = provider;
  }

  /**
   * Execute a single iteration of the agent loop
   */
  async executeIteration(systemPrompt: string, tools: any[]): Promise<IterationResult> {
    const { iteration, maxIterations, budget, currentTask } = this.context;

    // Emit iteration progress
    this.context.streamEmitter.emitProgress(iteration, maxIterations, 'executing');

    // Check budget
    const budgetCheck = await this.checkBudget();
    if (budgetCheck.exceeded) {
      const result = `Stopped: ${budgetCheck.reason}`;
      this.context.streamEmitter.emitError(result, true);
      return { done: true, result, success: false, steps: this.context.steps };
    }

    // Get messages and build prompt
    const messages = await this.getMessages();
    const response = await this.callLLM(messages, tools, systemPrompt);

    // Process tool calls or text response
    if (response.tool_calls && response.tool_calls.length > 0) {
      await this.processToolCalls(response, messages);
    } else {
      await this.processTextResponse(response);
    }

    // Update budget
    this.context.updateElapsedTime();

    // Check for done condition
    if (this.context.done || this.context.isMaxIterationsReached()) {
      if (!this.context.finalResult) {
        this.context.complete('Max iterations reached without completion', false);
      }
      return {
        done: true,
        result: this.context.finalResult,
        success: this.context.success,
        steps: this.context.steps
      };
    }

    // Loop detection and reflection
    await this.performLoopDetection();
    await this.performReflection();

    return {
      done: false,
      result: '',
      success: true,
      steps: this.context.steps
    };
  }

  /**
   * Get messages for LLM call
   */
  private async getMessages(): Promise<any[]> {
    // Apply compression if needed
    if (this.context.iteration % 15 === 0 && this.messageHandler.getLength() > 15) {
      const compressed = this.compressor(this.messageHandler.getConversation(), 10000);
      this.context.conversationManager = new (await import('../conversation-manager.js')).ConversationManager();
      compressed.forEach((msg: any) => {
        if (msg.role === 'user') this.messageHandler.addUserMessage(msg.content);
        else if (msg.role === 'assistant') this.messageHandler.addAssistantMessage(msg.content);
        else if (msg.role === 'system') this.messageHandler.addSystemMessage(msg.content);
      });
      logger.info(`[AgentExecutor] Compressed conversation to ${this.messageHandler.getLength()} messages`);
    }
    return this.messageHandler.getConversation();
  }

  /**
   * Call LLM with streaming
   */
  private async callLLM(messages: any[], tools: any[], systemPrompt: string): Promise<any> {
    let fullContent = '';
    const stream = this.context.llmProvider.chatStreamWithTools(
      messages,
      tools,
      systemPrompt,
      (chunk: string) => {
        fullContent += chunk;
        this.context.streamEmitter.emitContent(chunk, false);
      }
    );

    const response = await stream;
    response.text = fullContent;
    return response;
  }

  /**
   * Process tool calls from LLM response
   */
  private async processToolCalls(response: any, messages: any[]): Promise<void> {
    const { tool_calls } = response;

    // Format tool calls for conversation
    const formattedToolCalls = this.formatToolCalls(tool_calls);
    this.messageHandler.addToolCallMessage(response.text || '', formattedToolCalls);

    // Check if batch execution should be used
    const isBrowserAction = tool_calls.some((tc: any) => tc.name.startsWith('browser_'));
    const config = (await import('../../../core/config.js')).getConfig();
    const useBatch = config.enableBatchExecution && isBrowserAction && tool_calls.length > 1;

    if (useBatch) {
      await this.executeBatch(tool_calls, formattedToolCalls);
    } else {
      await this.executeSequential(tool_calls, formattedToolCalls);
    }

    // Inject browser vision if needed
    if (isBrowserAction) {
      await this.injectBrowserVision();
    }
  }

  /**
   * Format tool calls for conversation
   */
  private formatToolCalls(tool_calls: any[]): any[] {
    // Use raw tool_calls if available from LLM response
    if (this.context.llmProvider?.raw?.tool_calls) {
      return this.context.llmProvider.raw.tool_calls;
    }
    // Otherwise format our tool_calls
    return tool_calls.map((tc: any) => ({
      id: tc.id,
      type: 'function',
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments)
      }
    }));
  }

  /**
   * Execute tools sequentially
   */
  private async executeSequential(tool_calls: any[], formattedCalls: any[]): Promise<void> {
    for (let i = 0; i < tool_calls.length; i++) {
      const tc = tool_calls[i];
      const convTc = formattedCalls[i];

      const result = await this.context.toolBus.execute(tc.name, tc.arguments);
      const output = result.success ? result.output : result.error ?? 'Tool failed';

      // Record action
      this.context.recordAction(tc.name);
      this.context.steps.push({
        phase: 'executing',
        action: tc.name,
        detail: JSON.stringify(tc.arguments),
        observation: output,
      });

      this.messageHandler.addToolResult(convTc?.id || tc.id, tc.name, output);

      // Check for browser_end
      if (tc.name === 'browser_end') {
        const summaryMatch = output.match(/Task completed:\s*(.*)/s);
        this.context.complete(summaryMatch?.[1] || output, true);
        break;
      }
    }
  }

  /**
   * Execute tools as batch until page change
   */
  private async executeBatch(tool_calls: any[], formattedCalls: any[]): Promise<void> {
    const { BatchExecutionManager } = await import('../batch/index.js');
    const batchManager = new BatchExecutionManager(this.context.toolBus);

    const batchResult = await batchManager.executeUntilChange(
      tool_calls.map((tc: any) => ({ name: tc.name, arguments: tc.arguments })),
      {
        detect: async () => {
          const previousState = getLastPageState();
          const currentState = await this.capturePageState();
          const { detectPageChange } = await import('../../tools/browser-tools.js');
          const changeResult = await detectPageChange(previousState, currentState);
          if (changeResult.changed && currentState) {
            updatePageState(currentState);
          }
          return changeResult;
        }
      }
    );

    // Process results
    for (let i = 0; i < batchResult.executed.length; i++) {
      const action = batchResult.executed[i];
      const result = batchResult.results[i];

      this.context.recordAction(action.name);
      this.context.steps.push({
        phase: 'executing',
        action: action.name,
        detail: JSON.stringify(action.arguments),
        observation: result.success ? result.output : result.error,
      });

      const resultToolCallId = formattedCalls[i]?.id;
      this.messageHandler.addToolResult(
        resultToolCallId || action.name,
        action.name,
        result.success ? result.output : result.error ?? 'Tool failed'
      );

      // Check for browser_end
      if (action.name === 'browser_end') {
        const output = result.success ? result.output : result.error || '';
        const summaryMatch = output.match(/Task completed:\s*(.*)/s);
        this.context.complete(summaryMatch?.[1] || output, true);
        break;
      }
    }
  }

  /**
   * Process text-only response (no tool calls)
   */
  private async processTextResponse(response: any): Promise<void> {
    const { ThinkTagParser } = await import('../loop.js');
    const thinkParser = new ThinkTagParser();
    const parsed = thinkParser.parse(response.text);

    if (parsed.visible) {
      this.messageHandler.addAssistantMessage(parsed.visible);
    }

    // If we have meaningful content, we might be done
    if (response.text.length > 50) {
      this.context.complete(parsed.visible || response.text, true);
    }
  }

  /**
   * Inject browser vision into conversation
   */
  private async injectBrowserVision(): Promise<void> {
    const { visionInjector } = await import('../../vision/index.js');
    await visionInjector.injectAfterBrowserVision(
      (content) => this.messageHandler.addUserMessage(content),
      { url: this.context.currentUrl, title: this.context.currentTitle }
    );

    // Update current state
    const state = (await import('../../vision/index.js')).screenshotManager;
    this.context.currentUrl = state?.url || this.context.currentUrl;
  }

  /**
   * Capture current page state
   */
  private async capturePageState(): Promise<PageSnapshot | null> {
    try {
      const { getBrowserController } = await import('../../tools/browser-tools.js');
      const controller = getBrowserController();
      if (!controller) return null;
      return await controller.snapshot();
    } catch (error) {
      logger.warn('[AgentExecutor] Failed to capture page state:', error);
      return null;
    }
  }

  /**
   * Check budget status
   */
  private async checkBudget() {
    const { checkBudget } = await import('../../monitoring/guardrails.js');
    return checkBudget(this.context.budget);
  }

  /**
   * Perform loop detection
   */
  private async performLoopDetection(): Promise<void> {
    const loopDetected = detectLoop(this.context.actionsTaken);
    if (loopDetected) {
      this.context.actionHistory.clear();
      for (const action of this.context.actionsTaken) {
        const count = this.context.actionHistory.get(action) || 0;
        this.context.actionHistory.set(action, count + 1);
      }
    }
  }

  /**
   * Perform reflection on progress
   */
  private async performReflection(): Promise<void> {
    if (!this.context.done && this.context.iteration < this.context.maxIterations) {
      const reflection = reflect(this.context.currentTask, this.context.steps, this.context.iteration);
      if (!reflection.success && reflection.recoveryHint) {
        this.context.streamEmitter.emitThinking(reflection.recoveryHint, 'reflection');
        this.messageHandler.addSystemMessage(`Self-correction: ${reflection.recoveryHint}`);
      }
    }
  }
}
