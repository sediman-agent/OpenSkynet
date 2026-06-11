/**
 * Agent Executor
 * Core execution logic extracted from AgentLoop
 * Enhanced with performance optimizations and stability improvements
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
import { updatePageState, getLastPageState } from '../../tools/browser-tools.js';
import type { PageSnapshot } from '../../../browser/controller.js';
import { getMultiLevelCache } from '../../cache/multi-level-cache.js';
import { circuitBreakerRegistry } from '../../stability/circuit-breaker.js';
import { getPerformanceMonitor } from '../../performance/monitor.js';

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
  private perfMonitor = getPerformanceMonitor();
  private llmCircuitBreaker = circuitBreakerRegistry.get('LLM', {
    failureThreshold: 3,
    successThreshold: 2,
    timeoutMs: 30000
  });

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

    // === PHASE 1: Force reasoning text WITHOUT tools ===
    const messages = await this.getMessages();

    // Call LLM WITHOUT tools to force text-only reasoning
    const reasoningPrompt = `Based on the current context and messages, provide your next step reasoning. What will you do next? Keep it brief (1-2 sentences).`;

    const reasoningMessages = [
      ...messages.slice(-5), // Include last 5 messages for context
      { role: 'user', content: reasoningPrompt }
    ];

    const reasoningResponse = await this.context.llmProvider.chatStreamWithTools(
      reasoningMessages,
      [], // NO tools - forces text-only response
      systemPrompt,
      (chunk: string) => {
        this.context.streamEmitter.emitContent(chunk, false);
        this.context.streamEmitter.forceFlush();
      }
    );

    const reasoningText = reasoningResponse.text || '';

    logger.info(`[AgentExecutor] Phase 1 (Reasoning): Generated ${reasoningText.length} chars of reasoning text`);

    // Emit spacing if we got reasoning
    if (reasoningText) {
      this.context.streamEmitter.emitContent('\n\n', false);
    }

    // === PHASE 2: Execute tools with full context ===
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
    const messages = this.messageHandler.getConversation();

    logger.info(`[AgentExecutor] ========== GETTING MESSAGES FOR LLM ==========`);
    logger.info(`[AgentExecutor] Total messages: ${messages.length}`);

    // Log each message to see if vision is included
    messages.forEach((msg: any, idx: number) => {
      const contentType = Array.isArray(msg.content) ? 'array' : typeof msg.content;
      const hasVision = Array.isArray(msg.content) && msg.content.some((item: any) => item.type === 'image_url');
      logger.info(`[AgentExecutor] Message ${idx}: role=${msg.role}, contentType=${contentType}, hasVision=${hasVision}`);

      if (hasVision) {
        logger.info(`[AgentExecutor] ✓ Vision message found at index ${idx}!`);
      }
    });

    // Apply compression if needed
    if (this.context.iteration % 15 === 0 && this.messageHandler.getLength() > 15) {
      const compressed = this.compressor(messages, 10000);
      this.context.conversationManager = new (await import('../conversation-manager.js')).ConversationManager();
      compressed.forEach((msg: any) => {
        if (msg.role === 'user') this.messageHandler.addUserMessage(msg.content);
        else if (msg.role === 'assistant') this.messageHandler.addAssistantMessage(msg.content);
        else if (msg.role === 'system') this.messageHandler.addSystemMessage(msg.content);
      });
      logger.info(`[AgentExecutor] Compressed conversation to ${this.messageHandler.getLength()} messages`);
      return this.messageHandler.getConversation();
    }

    return messages;
  }

  /**
   * Call LLM with streaming and performance optimizations
   */
  private async callLLM(messages: any[], tools: any[], systemPrompt: string): Promise<any> {
    logger.info(`[AgentExecutor] ========== CALLING LLM ==========`);
    logger.info(`[AgentExecutor] Messages count: ${messages.length}`);
    logger.info(`[AgentExecutor] Tools count: ${tools.length}`);
    logger.info(`[AgentExecutor] System prompt length: ${systemPrompt?.length || 0}`);

    const startTime = performance.now();

    // Check if any message has vision
    const hasVision = messages.some((msg: any) =>
      Array.isArray(msg.content) && msg.content.some((item: any) => item.type === 'image_url')
    );

    // Check multi-level cache first (only for non-vision queries)
    if (!hasVision) {
      const cache = getMultiLevelCache();
      const cached = cache.get({ messages, systemPrompt, tools });
      if (cached) {
        this.perfMonitor.recordCacheHit();
        logger.info('[AgentExecutor] Using cached response (multi-level cache hit)');
        return cached;
      } else {
        this.perfMonitor.recordCacheMiss();
      }
    }

    logger.info(`[AgentExecutor] Has vision in messages: ${hasVision}`);

    if (hasVision) {
      const visionMsg = messages.find((msg: any) =>
        Array.isArray(msg.content) && msg.content.some((item: any) => item.type === 'image_url')
      );
      logger.info(`[AgentExecutor] Vision message role: ${visionMsg?.role}`);
      logger.info(`[Vision message]: ${JSON.stringify(visionMsg, null, 2).substring(0, 800)}`);
    }

    // Use circuit breaker for LLM calls
    return this.llmCircuitBreaker.execute(
      async () => {
        let fullContent = '';
        let hasEmittedContent = false;

        const stream = this.context.llmProvider.chatStreamWithTools(
          messages,
          tools,
          systemPrompt,
          (chunk: string) => {
            // Emit content immediately for real-time display
            // This ensures tokens appear before tool calls execute
            if (!hasEmittedContent) {
              hasEmittedContent = true;
              logger.info('[AgentExecutor] First token received, emitting immediately');
            }
            fullContent += chunk;
            this.context.streamEmitter.emitContent(chunk, false);
            // Force flush to ensure immediate delivery
            this.context.streamEmitter.forceFlush();
          }
        );

        const response = await stream;
        response.text = fullContent;

        // Record performance
        const duration = performance.now() - startTime;
        this.perfMonitor.recordLLMCall(duration);

        // Cache successful responses (multi-level cache)
        if (!hasVision && response) {
          getMultiLevelCache().set({ messages, systemPrompt, tools }, response);
        }

        return response;
      },
      // Fallback: return cached response or throw
      () => {
        const fallbackCache = getMultiLevelCache();
        const cached = fallbackCache.get({ messages, systemPrompt, tools });
        if (cached) {
          logger.warn('[AgentExecutor] Using cached fallback due to circuit breaker');
          return cached;
        }
        throw new Error('LLM service unavailable (circuit breaker open)');
      }
    );
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
      // Use parallel execution for independent tools when enabled
      const useParallel = config.enableParallelExecution && tool_calls.length > 1;
      if (useParallel && this.canExecuteParallel(tool_calls)) {
        await this.executeParallel(tool_calls, formattedToolCalls);
      } else {
        await this.executeSequential(tool_calls, formattedToolCalls);
      }
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
    // Format tool_calls for conversation
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

      // Emit step start event
      this.context.streamEmitter.emitStepStart('executing', tc.name, JSON.stringify(tc.arguments));

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

      // Emit step complete event
      this.context.streamEmitter.emitStepComplete('executing', tc.name, output, result.success);

      // Check for browser_end
      if (tc.name === 'browser_end') {
        const summaryMatch = output.match(/Task completed:\s*(.*)/s);
        this.context.complete(summaryMatch?.[1] || output, true);
        break;
      }
    }
  }

  /**
   * Check if tools can be executed in parallel
   * Tools can be parallel if they don't depend on each other and are read-only
   */
  private canExecuteParallel(tool_calls: any[]): boolean {
    // Tools that modify state or should run sequentially
    const sequentialTools = new Set([
      'browser_click',
      'browser_type',
      'browser_press_key',
      'browser_drag_and_drop',
      'browser_select',
      'browser_upload',
      'browser_go_back',
      'browser_go_forward',
      'browser_refresh',
      'browser_close_tab',
      'browser_end'
    ]);

    // Check if any tool requires sequential execution
    for (const tc of tool_calls) {
      if (sequentialTools.has(tc.name)) {
        return false;
      }
    }

    // All tools are read-only and can run in parallel
    return true;
  }

  /**
   * Execute tools in parallel for better performance
   */
  private async executeParallel(tool_calls: any[], formattedCalls: any[]): Promise<void> {
    logger.debug(`[AgentExecutor] Executing ${tool_calls.length} tools in parallel`);

    // Execute all tools in parallel
    const results = await Promise.all(
      tool_calls.map(async (tc, index) => {
        const convTc = formattedCalls[index];

        // Emit step start event
        this.context.streamEmitter.emitStepStart('executing', tc.name, JSON.stringify(tc.arguments));

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

        // Emit step complete event
        this.context.streamEmitter.emitStepComplete('executing', tc.name, output, result.success);

        // Check for browser_end (even though it's sequential, handle it)
        if (tc.name === 'browser_end') {
          const summaryMatch = output.match(/Task completed:\s*(.*)/s);
          this.context.complete(summaryMatch?.[1] || output, true);
        }

        return { index, result, output };
      })
    );

    logger.debug(`[AgentExecutor] Parallel execution completed for ${results.length} tools`);
  }

  /**
   * Execute tools as batch until page change
   */
  private async executeBatch(tool_calls: any[], formattedCalls: any[]): Promise<void> {
    const { BatchExecutionManager } = await import('../batch/index.js');
    const batchManager = new BatchExecutionManager(this.context.toolBus);

    const batchResult = await batchManager.executeUntilChange(
      tool_calls.map((tc: any) => ({ id: tc.id, name: tc.name, arguments: tc.arguments })),
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

      // Emit step start event
      this.context.streamEmitter.emitStepStart('executing', action.name || '', JSON.stringify(action.arguments || {}));

      this.context.recordAction(action.name || '');
      this.context.steps.push({
        phase: 'executing',
        action: action.name || '',
        detail: JSON.stringify(action.arguments || {}),
        observation: result.success ? result.output : result.error,
      });

      const resultToolCallId = formattedCalls[i]?.id;
      this.messageHandler.addToolResult(
        resultToolCallId || action.id || action.name || '',
        action.name || '',
        result.success ? (result.output ?? '') : (result.error ?? 'Tool failed')
      );

      // Emit step complete event
      this.context.streamEmitter.emitStepComplete('executing', action.name || '', result.success ? result.output : result.error, result.success);

      // Check for browser_end
      if (action.name === 'browser_end') {
        const output = (result.success ? result.output : result.error) || '';
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
    logger.info('[AgentExecutor] Starting vision injection...');

    // Delay to ensure frontend screenshot is captured and sent to backend
    // Frontend waits 2-3 seconds for page load + screenshot capture
    await new Promise(resolve => setTimeout(resolve, 3000));

    const { visionInjector } = await import('../../vision/index.js');
    logger.info('[AgentExecutor] Calling vision injector...');

    await visionInjector.injectAfterBrowserAction(
      (content) => {
        logger.info('[AgentExecutor] Vision injector returned content, adding to conversation');
        this.messageHandler.addUserMessage(content);
      },
      { url: this.context.currentUrl, title: this.context.currentTitle }
    );

    // Update current state - try to get current URL from browser controller
    try {
      const { getBrowserController } = await import('../../tools/browser-tools.js');
      const controller = getBrowserController();
      if (controller) {
        const session = controller.getSession();
        const pages = session?.context?.pages();
        if (pages && pages.length > 0) {
          this.context.currentUrl = pages[0].url();
        }
      }
    } catch {
      // Keep existing URL if we can't get it
    }

    logger.info('[AgentExecutor] Vision injection complete');
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
      logger.warn(`[AgentExecutor] Failed to capture page state: ${String(error)}`);
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
