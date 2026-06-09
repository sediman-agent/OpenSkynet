import type { AgentResult, StepEvent, ToolDefinition } from "../../core/types";
import type { LLMProvider } from "../../llm/provider";
import type { BaseMemoryStrategy } from "../../memory/strategy";
import type { SkillEngine } from "../../skills/engine";
import { ToolBus } from "../tools/bus";
import { AgentInterruptedError, InterruptSignal } from "../core/interrupt";
import { ContextCompressor } from "../memory/compressor";
import { ProgressTracker } from "../memory/progress";
import { AuditLog, SharedScratchpad, checkBudget, type Budget } from "../monitoring/guardrails";
import { loadSoul } from "../prompts/soul";
import logger from "../../core/logging";
import { getConfig } from "../../core/config";

import { StreamEmitter } from "../streaming";
import { LoopDetector } from "../monitoring/loop-detector";
import { CheckpointManager } from "../monitoring/checkpoint";
import { ConversationManager } from "./conversation-manager";
import { BrowserOperations } from "./browser-operations";
import { buildSystemPrompt, buildFlashBrowserPrompt } from "./system-prompt-builder";
import { detectLoop, reflect, generateRecoveryHint } from "./reflection-handler";
import { processLLMResponse, extractToolCalls, formatToolResult, buildAssistantMessage, hasBrowserCommands } from "./llm-response-handler";
import { classifyTask, createPlan, detectFlashMode } from "./task-classifier";
import { setOnInterventionRequested } from "../tools/browser-tools";

import type { AgentMessage, TaskCategory, TaskPlan } from "./types";

export interface AgentLoopOpts {
  llmProvider: LLMProvider;
  browserSession?: any;
  memory?: BaseMemoryStrategy;
  skillEngine?: SkillEngine;
  toolBus?: ToolBus;
  headless?: boolean;
  terminalAllowed?: boolean;
}

export class AgentLoop {
  private llmProvider: LLMProvider;
  private browserSession: any;
  private memory: BaseMemoryStrategy | null;
  private skillEngine: SkillEngine | null;
  private toolBus: ToolBus;
  private conversationManager: ConversationManager;
  private interrupt: InterruptSignal;
  private auditLog: AuditLog;
  private scratchpad: SharedScratchpad;
  private progress: ProgressTracker;
  private budget: Budget;
  private thinkParser: ThinkTagParser;
  private soul: string;
  private compressor: ContextCompressor;
  private maxIterations: number;
  private compressThreshold: number;
  private streamEmitter: StreamEmitter;
  private steps: StepEvent[] = [];
  private actionHistory: Map<string, number> = new Map();
  private currentTask: string = '';

  // New components for robustness
  private loopDetector: LoopDetector;
  private checkpointManager: CheckpointManager;
  private currentUrl: string = '';
  private currentTitle: string = '';
  private conversationExporter: any = null;
  private historyManager: any = null;
  private browserOps: BrowserOperations;

  constructor(opts: AgentLoopOpts) {
    const config = getConfig();
    this.llmProvider = opts.llmProvider;
    this.browserSession = opts.browserSession ?? null;
    this.memory = opts.memory ?? null;
    this.skillEngine = opts.skillEngine ?? null;
    // Create ToolBus with retry and timeout enabled
    this.toolBus = opts.toolBus ?? new ToolBus({
      enableRetry: true,
      maxRetries: 3,
      defaultTimeoutMs: 30000
    });
    this.conversationManager = new ConversationManager();
    this.interrupt = new InterruptSignal();
    this.auditLog = new AuditLog();
    this.scratchpad = new SharedScratchpad();
    this.progress = new ProgressTracker();
    this.compressor = new ContextCompressor();
    this.thinkParser = new ThinkTagParser();
    this.soul = "";
    // Ensure at least 50 iterations, but use more if compressThreshold suggests it
    const calculatedMax = config.compressThreshold * 2 + 10;
    this.maxIterations = Math.max(calculatedMax, 50);
    this.compressThreshold = config.compressThreshold;
    this.streamEmitter = new StreamEmitter({ batchSize: 10, flushIntervalMs: 50 });
    this.budget = {
      maxTokens: 200_000,
      maxIterations: this.maxIterations,
      maxTimeMs: 600_000,
      usedTokens: 0,
      usedIterations: 0,
      usedTimeMs: 0,
    };

    // Initialize new robustness components
    this.loopDetector = new LoopDetector();
    this.checkpointManager = new CheckpointManager({
      enabled: true,
      checkpointInterval: 1 // Save after every step
    });

    // Initialize browser operations
    this.browserOps = new BrowserOperations({
      onInterventionRequested: (message, id) => {
        this.streamEmitter.emitIntervention(message, id);
      }
    });
  }

  /**
   * Initialize conversation exporter and history manager lazily
   */
  private async initializeExporters(config: any): Promise<void> {
    // Initialize conversation exporter if enabled
    if (config.autoExportConversations && !this.conversationExporter) {
      const { ConversationExporter } = await import('../export');
      this.conversationExporter = new ConversationExporter();
    }

    // Initialize history manager if enabled
    if (config.autoSaveHistory && !this.historyManager) {
      const { AgentHistoryManager } = await import('../history');
      this.historyManager = new AgentHistoryManager();
    }
  }

  async run(task: string, mode?: string, conversationHistory?: Array<{ role: string; content: string }>): Promise<AgentResult> {
    const startTime = Date.now();
    const config = getConfig();
    this.currentTask = task; // Store task for checkpoints
    this.steps = [];
    this.actionHistory = new Map();
    this.loopDetector.reset(); // Reset loop detector for new task
    this.checkpointManager.reset(); // Reset checkpoint manager
    this.currentUrl = '';
    this.currentTitle = '';
    const actionsTaken: string[] = [];
    let strategyUsed = "direct";
    let finalResult = "";
    let success = false;

    // Store conversation history for context
    this.conversationManager = new ConversationManager({
      initialHistory: conversationHistory || []
    });

    try {
      // Initialize exporters if needed
      await this.initializeExporters(config);
      this.soul = loadSoul();
      this.interrupt.reset();
      this.progress = new ProgressTracker();

      setOnInterventionRequested((message, id) => {
        this.streamEmitter.emitIntervention(message, id);
      });

      this.streamEmitter.emitProgress(0, this.maxIterations, "starting");

      if (this.memory) {
        await this.memory.onTurnStart();
      }

      this.interrupt.check();

      const turboResult = await this.tryTurboPath(task);
      if (turboResult) {
        return turboResult;
      }

      const category = this.classifyTask(task, mode);
      const plan = this.createPlan(task, category);

      // In Electron mode, emit browser open required event for browser tasks
      const RUNNING_IN_ELECTRON = process.env.SEDIMAN_MODE === 'electron';
      if (RUNNING_IN_ELECTRON && (mode === 'browser' || category === 'browser')) {
        logger.info("Running in Electron mode with browser task - requesting browser panel");
        this.streamEmitter.emitBrowserOpenRequired(
          "Agent needs shared browser for task execution",
          task
        );
        // Give frontend time to open panel AND establish CDP connection
        // Frontend waits 1000ms before connecting, so we need more time
        await new Promise(resolve => setTimeout(resolve, 2000));
        logger.info("Wait complete for browser panel to be ready");
      }

      strategyUsed = category === "simple" ? "direct" : category;

      // Emit planning event
      this.streamEmitter.emitStepStart("planning", "plan_create", `Creating plan for ${category} task`);

      this.addUserMessage(task);

      let iteration = 0;
      let done = false;

      while (iteration < this.maxIterations && !done) {
        iteration++;
        this.interrupt.check();

        // Emit iteration progress
        this.streamEmitter.emitProgress(iteration, this.maxIterations, "executing");

        const budgetCheck = checkBudget(this.budget);
        if (budgetCheck.exceeded) {
          finalResult = `Stopped: ${budgetCheck.reason}`;

          // Emit error event
          this.streamEmitter.emitError(finalResult, true);

          break;
        }

        const systemPrompt = this.buildSystemPrompt(task, category, plan, iteration);
        // Re-enable compression with conservative threshold for MiniMax
        const messages = this.compressor.compress(this.conversationManager.getHistory(), 15_000);
        const tools = this.toolBus.getDefinitions();

        // Debug: Log conversation being sent to MiniMax (detailed)
        logger.info(`[AgentLoop] Iteration ${iteration}: Sending ${messages.length} messages to MiniMax`);
        logger.info(`[AgentLoop] Conversation size: ${JSON.stringify(messages).length} bytes`);
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          const hasToolCalls = !!msg.tool_calls;
          const hasToolCallId = !!msg.tool_call_id;
          const contentLength = msg.content ? (typeof msg.content === 'string' ? msg.content.length : JSON.stringify(msg.content).length) : 0;
          logger.info(`[AgentLoop] Message ${i}: role=${msg.role}, has_tool_calls=${hasToolCalls}, has_tool_call_id=${hasToolCallId}, content_length=${contentLength}`);
          if (hasToolCalls && msg.tool_calls) {
            logger.info(`[AgentLoop] Message ${i} tool_calls: ${JSON.stringify(msg.tool_calls).slice(0, 200)}...`);
          }
          if (hasToolCallId) {
            logger.info(`[AgentLoop] Message ${i} tool_call_id: ${msg.tool_call_id}, name: ${msg.name}`);
          }
        }

        let response;
        let fullContent = "";

        try {
          // Use streaming with tool support
          const stream = this.llmProvider.chatStreamWithTools(
            messages,
            tools,
            systemPrompt,
            (chunk) => {
              fullContent += chunk;
              this.streamEmitter.emitContent(chunk, false);
            }
          );

          response = await stream;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error({ err: errorMsg, iteration }, "llm_call_failed");

          this.streamEmitter.emitError(errorMsg, false);

          this.steps.push({ phase: "executing", action: "llm_error", detail: errorMsg });

          if (category === "browser" && iteration < this.maxIterations - 1) {
            await new Promise(r => setTimeout(r, 2000));
            // Don't add error message to conversation - it confuses MiniMax
            // this.addSystemMessage(`LLM error occurred: ${errorMsg}. Retrying...`);
            continue;
          }

          finalResult = `LLM error: ${errorMsg}`;
          break;
        }

        if (response.tool_calls.length > 0) {
          const isBrowserAction = response.tool_calls.some(tc => tc.name.startsWith('browser_'));
          const config = getConfig();

          // Add assistant message with tool_calls to conversation before executing tools
          // This is required for the LLM to associate tool results with tool calls
          logger.info(`[AgentLoop] Adding assistant message with ${response.tool_calls.length} tool_calls`);
          logger.info(`[AgentLoop] Tool call IDs: ${response.tool_calls.map(tc => tc.id).join(', ')}`);
          logger.info(`[AgentLoop] Using provider: ${(this.llmProvider as any).constructor.name}, model: ${(this.llmProvider as any).model || 'unknown'}`);
          logger.info(`[AgentLoop] Response has raw: ${!!response.raw}, Raw keys: ${response.raw ? Object.keys(response.raw).join(', ') : 'N/A'}`);
          logger.info(`[AgentLoop] Raw content: ${response.raw?.content ? JSON.stringify(response.raw.content).slice(0, 200) : 'N/A'}...`);

          // Use raw response tool_calls if available (from MiniMax/OpenAI response)
          // Otherwise format our simplified tool_calls into OpenAI structure
          let toolCallsForConversation: any[];
          let toolCallsForExecution: typeof response.tool_calls;

          const rawToolCalls = response.raw?.tool_calls;
          if (rawToolCalls && Array.isArray(rawToolCalls) && rawToolCalls.length > 0) {
            // Use raw tool_calls from LLM response - these have the correct IDs
            toolCallsForConversation = rawToolCalls;
            // For execution, we still use our simplified format
            toolCallsForExecution = response.tool_calls;
            logger.info(`[AgentLoop] Using raw tool_calls from LLM response for conversation`);
            logger.info(`[AgentLoop] raw.tool_calls sample: ${JSON.stringify(rawToolCalls[0]).slice(0, 200)}...`);
          } else {
            // Format our simplified tool_calls into OpenAI/MiniMax structure
            toolCallsForConversation = response.tool_calls.map(tc => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments)
              }
            }));
            toolCallsForExecution = response.tool_calls;
            logger.info(`[AgentLoop] Using formatted tool_calls for conversation`);
            logger.info(`[AgentLoop] Formatted tool_calls: ${JSON.stringify(toolCallsForConversation).slice(0, 300)}...`);
          }

          const assistantMessage: any = {
            role: 'assistant',
            content: response.text || '',
            tool_calls: toolCallsForConversation
          };

          // Check if content is empty - MiniMax rejects empty content
          if (!assistantMessage.content || assistantMessage.content === '') {
            logger.warn(`[AgentLoop] Assistant message has empty content! Using fallback content.`);
            // Use a minimal content instead of empty
            assistantMessage.content = 'Executing browser action...';
          }

          this.conversationManager.addToolCallMessage(assistantMessage.content || '', assistantMessage.tool_calls || []);

          logger.info(`[AgentLoop] Assistant message fields: ${Object.keys(assistantMessage).join(', ')}`);
          logger.info(`[AgentLoop] Assistant content length: ${assistantMessage.content?.length || 0}`);
          logger.info(`[AgentLoop] Conversation length: ${this.conversationManager.length}`);
          logger.info(`[AgentLoop] Last message role: ${(this.conversationManager.getHistory()[this.conversationManager.length - 1] as any).role}`);
          logger.info(`[AgentLoop] Conversation tool_calls count: ${toolCallsForConversation.length}`);
          logger.info(`[AgentLoop] Execution tool_calls count: ${toolCallsForExecution.length}`);

          // Use batch execution if enabled and we have browser actions
          const useBatchExecution = config.enableBatchExecution && isBrowserAction && response.tool_calls.length > 1;

          if (useBatchExecution) {
            // BATCH EXECUTION MODE - Execute multiple actions until page changes
            logger.info({ toolCount: response.tool_calls.length }, "batch_execution_start");

            try {
              // Map ToolCall[] to format expected by executeBatchUntilChange
              const mappedActions = toolCallsForExecution.map(tc => ({
                name: tc.name,
                args: tc.arguments
              }));

              const batchResult = await this.toolBus.executeBatchUntilChange(
                mappedActions,
                async () => {
                  // Detect page change by comparing snapshots
                  const previousState = getLastPageState();
                  const currentState = await this.captureCurrentPageState();

                  const changeResult = await detectPageChange(previousState, currentState);

                  if (changeResult.changed && currentState) {
                    // Update stored state for next comparison
                    updatePageState(currentState);
                  }

                  return changeResult;
                }
              );

              // Process batch results
              let combinedOutput = '';

              for (let i = 0; i < batchResult.executed.length; i++) {
                const action = batchResult.executed[i];
                const result = batchResult.results[i];

                this.interrupt.check();

                const detail = JSON.stringify(action.args);

                // Record action for loop detection
                this.loopDetector.recordAction(action.name, action.args, iteration, this.currentUrl);

                // Emit step events
                this.streamEmitter.emitStepStart("executing", action.name, detail);

                const step: StepEvent = {
                  phase: "executing",
                  action: action.name,
                  detail,
                };
                this.steps.push(step);
                actionsTaken.push(action.name);
                this.auditLog.add(action.name, detail, { level: "low", reasons: [] });

                // Ensure observation is always a string
                const observation = typeof result.output === 'object' && result.output !== null
                  ? JSON.stringify(result.output)
                  : (result.success ? result.output : result.error) ?? '';
                step.observation = observation;

                this.streamEmitter.emitStepComplete("executing", action.name, observation, result.success);

                // Add tool result to conversation
                // Use the ID from toolCallsForConversation to ensure it matches the LLM's tool_calls
                const toolCallId = toolCallsForConversation[i]?.id;
                logger.info(`[AgentLoop] Adding tool result for ${action.name} with id: ${toolCallId}`);
                this.addToolResult(toolCallId, action.name, result.success ? result.output : result.error ?? "Tool failed");

                combinedOutput += `[${action.name}]: ${result.success ? result.output : result.error}\n`;
              }

              // Log batch completion
              if (batchResult.stoppedEarly) {
                logger.info({
                  executed: batchResult.executed.length,
                  total: response.tool_calls.length,
                  reason: batchResult.stopReason
                }, "batch_execution_stopped_early");
              }

              // Add batch summary to conversation
              this.addSystemMessage(`<batch_execution>\nExecuted ${batchResult.executed.length} action(s)\n${batchResult.stopReason ? `Stopped: ${batchResult.stopReason}` : ''}\n</batch_execution>`);

              // Check if browser_end was called in batch execution
              if (batchResult.executed.some((result: any) => result.name === 'browser_end')) {
                // Extract the actual summary from browser_end result
                const browserEndResult = batchResult.results.find((r: any, i: number) =>
                  batchResult.executed[i]?.name === 'browser_end'
                );
                const endOutput = typeof browserEndResult?.output === 'string' ? browserEndResult.output : '';
                // Extract summary from "Task completed: <summary>" format or use as-is
                const summaryMatch = endOutput.match(/Task completed:\s*(.*)/s);
                finalResult = summaryMatch ? summaryMatch[1].trim() : (endOutput || 'Task completed');
                done = true;

                this.steps.push({
                  phase: "done",
                  action: "task_complete",
                  detail: finalResult,
                });

                logger.info("[AgentLoop] Agent called browser_end in batch - stopping loop");
                logger.info(`[AgentLoop] Extracted summary: ${finalResult.slice(0, 100)}...`);
              }

            } catch (error) {
              const errMsg = error instanceof Error ? error.message : String(error);
              logger.error({ err: errMsg }, "batch_execution_failed");

              // Fall back to sequential execution on error
              logger.info("falling_back_to_sequential_execution");

              // Execute remaining actions sequentially
              for (const tc of toolCallsForExecution) {
                await this.executeToolCall(tc, iteration, actionsTaken);
              }
            }

          } else {
            // SEQUENTIAL EXECUTION MODE - Execute one at a time
            let seqCombinedOutput = '';
            for (let i = 0; i < toolCallsForExecution.length; i++) {
              const tc = toolCallsForExecution[i];
              const convTc = toolCallsForConversation[i];

              // Execute tool and capture result
              const result = await this.toolBus.execute(tc.name, tc.arguments);
              const output = result.success ? result.output : result.error ?? 'Tool failed';
              seqCombinedOutput += `[${tc.name}]: ${output}\n`;

              // Add to conversation and emit events
              this.streamEmitter.emitStepStart("executing", tc.name, JSON.stringify(tc.arguments));
              this.streamEmitter.emitStepComplete("executing", tc.name, output, result.success);

              // Record action
              actionsTaken.push(tc.name);
              this.steps.push({
                phase: "executing",
                action: tc.name,
                detail: JSON.stringify(tc.arguments),
                observation: output,
              });

              // Use the conversation tool_call ID for tool results
              const resultToolCallId = convTc?.id || tc.id;
              this.addToolResult(resultToolCallId, tc.name, output);

              // Update URL if browser action
              if (result.success && tc.name === 'browser_navigate' && tc.arguments.url) {
                this.currentUrl = tc.arguments.url as string;
              }
            }

            // Check if browser_end was called in sequential execution
            if (actionsTaken.some(action => action === 'browser_end')) {
              // Extract the actual summary from seqCombinedOutput
              const endMatch = seqCombinedOutput.match(/\[browser_end\]:\s*(.*)/);
              let extractedSummary = '';
              if (endMatch) {
                const endOutput = endMatch[1].trim();
                // Extract summary from "Task completed: <summary>" format or use as-is
                const summaryMatch = endOutput.match(/Task completed:\s*(.*)/s);
                extractedSummary = summaryMatch ? summaryMatch[1].trim() : endOutput;
              }

              finalResult = extractedSummary || 'Task completed';
              done = true;

              this.steps.push({
                phase: "done",
                action: "task_complete",
                detail: finalResult,
              });

              logger.info("[AgentLoop] Agent called browser_end in sequential mode - stopping loop");
              logger.info(`[AgentLoop] Extracted summary: ${finalResult.slice(0, 100)}...`);
            }
          }

          // Save checkpoint after executing tools
          if (this.checkpointManager.shouldCheckpoint(iteration)) {
            await this.checkpointManager.save({
              iteration,
              timestamp: Date.now(),
              conversation: [...this.conversationManager.getHistory()],
              lastAction: actionsTaken[actionsTaken.length - 1],
              task: this.currentTask,
              metadata: {
                url: this.currentUrl,
                title: this.currentTitle
              }
            });
          }

          // After browser actions, capture screenshot for frontend + inject vision into conversation
          if (isBrowserAction) {
            await this.injectBrowserVision();
          }
        } else {
          // No tool calls, just a text response
          // Content was already streamed and emitted, just parse and finalize
          const parsed = this.thinkParser.parse(fullContent);

          if (parsed.visible) {
            this.addAssistantMessage(parsed.visible);
          }

          // Simplified done detection: if no tool calls and we have some content, we're done
          // This follows browser-use philosophy: "keep going until model stops calling tools"
          if (fullContent.length > 50 || iteration >= this.maxIterations) {
            finalResult = parsed.visible ?? fullContent;
            done = true;

            this.steps.push({
              phase: "done",
              action: "response",
              detail: finalResult,
            });
          } else {
            // For browser tasks, explicitly ask to continue with tools
            if (category === "browser") {
              this.addUserMessage("Please continue with the next step. Call browser_end when you have completed the task.");
            } else {
              // For non-browser tasks, add a generic continue message
              this.addUserMessage("Please continue. Use tools if needed to complete the task.");
            }
          }
        }

        this.budget.usedIterations = iteration;
        this.budget.usedTimeMs = Date.now() - startTime;

        if (iteration % this.compressThreshold === 0 && this.conversationManager.length > this.compressThreshold) {
          const compressed = this.compressor.compress(this.conversationManager.getHistory(), 10_000);
          this.conversationManager = new ConversationManager();
          compressed.forEach(msg => {
            if (msg.role === 'user') this.conversationManager.addUserMessage(msg.content);
            else if (msg.role === 'assistant') this.conversationManager.addAssistantMessage(msg.content);
            else if (msg.role === 'system') this.conversationManager.addSystemMessage(msg.content);
          });
          logger.info({ conversationLength: this.conversationManager.length }, "conversation_compressed");
        }

        if (!done && iteration < this.maxIterations) {
          const loopDetected = this.detectLoop(actionsTaken);
          if (loopDetected) {
            const hint = `LOOP DETECTED: ${loopDetected}. Change your approach — try a different element, scroll, use browser_go_back, or request_human_help.`;
            this.streamEmitter.emitThinking(hint, "reflection");
            this.addSystemMessage(hint);
          } else {
            const reflection = this.reflect(task, this.steps, iteration);
            if (!reflection.success && reflection.recoveryHint) {
              this.streamEmitter.emitThinking(reflection.recoveryHint, "reflection");
              this.addSystemMessage(`Self-correction: ${reflection.recoveryHint}`);
            }
          }
        }
      }

      if (!done && !finalResult) {
        finalResult = "Max iterations reached without completion.";
      }

      success = finalResult.length > 0 && !finalResult.startsWith("Stopped:") && !finalResult.startsWith("LLM error:");

      await this.runPostTask(task, finalResult, success, category);

      // Calculate elapsed time
      const elapsedSecs = (Date.now() - startTime) / 1000;

      // Export conversation if enabled
      if (this.conversationExporter && config.autoExportConversations) {
        try {
          const sessionId = this.conversationExporter.generateSessionId();
          const exportedFiles = await this.conversationExporter.exportConversation({
            sessionId,
            task,
            conversation: this.conversationManager.getHistory(),
            result: finalResult,
            success,
            iterations: this.budget.usedIterations || 0,
            strategyUsed,
            elapsedSecs: Math.round(elapsedSecs * 100) / 100,
            actionsTaken,
            metadata: {
              category,
              startTime: new Date(startTime).toISOString(),
              endTime: new Date().toISOString(),
            }
          }, config.conversationExportFormats);

          logger.info({
            sessionId,
            files: exportedFiles,
            count: exportedFiles.length
          }, "conversation_exported");
        } catch (exportError) {
          logger.warn({ err: (exportError as Error).message }, "conversation_export_failed");
        }
      }

      // Save to history if enabled
      if (this.historyManager && config.autoSaveHistory) {
        try {
          const historyId = await this.historyManager.saveToHistory({
            task,
            steps: this.steps,
            result: finalResult,
            success,
            iterations: this.budget.usedIterations || 0,
            strategyUsed,
            elapsedSecs: Math.round(elapsedSecs),
            actionsTaken,
            conversation: this.conversationManager.getHistory(),
            metadata: {
              category,
              mode,
              startTime: new Date(startTime).toISOString(),
              endTime: new Date().toISOString(),
            }
          });

          logger.info({
            historyId,
            task: task.slice(0, 50)
          }, "history_saved");
        } catch (historyError) {
          logger.warn({ err: (historyError as Error).message }, "history_save_failed");
        }
      }

    } catch (err) {
      if (err instanceof AgentInterruptedError) {
        finalResult = `Interrupted: ${err.message}`;
        success = false;

        this.streamEmitter.emitError(finalResult, false);
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err: errorMsg }, "agent_loop_error");

        this.streamEmitter.emitError(errorMsg, false);

        finalResult = `Error: ${errorMsg}`;
        success = false;
      }
    } finally {
      // Clean up stream emitter
      this.streamEmitter.destroy();
    }

    const elapsedSecs = (Date.now() - startTime) / 1000;

    return {
      task,
      result: finalResult,
      success,
      steps: this.steps,
      actions_taken: actionsTaken,
      iterations: this.budget.usedIterations || 1,
      strategy_used: strategyUsed,
      elapsed_secs: Math.round(elapsedSecs * 100) / 100,
    };
  }

  cancel(): void {
    this.interrupt.trigger("User cancelled");
  }

  /**
   * Subscribe to streaming events during execution
   */
  onStreamEvent(listener: (event: import("../streaming").AgentStreamEvent) => void): () => void {
    return this.streamEmitter.onEvent(listener);
  }

  getConversation(): Message[] {
    return [...this.conversationManager.getHistory()];
  }

  setConversation(messages: Message[]): void {
    this.conversationManager = new ConversationManager({
      initialHistory: messages
    });
  }

  clearConversation(): void {
    this.conversationManager = new ConversationManager();
  }

  private async tryTurboPath(task: string): Promise<AgentResult | null> {
    // Exclude browser tasks from turbo path - they need more iterations
    // Browser tasks need to: navigate → snapshot → interact → verify → continue
    if (!this.isSimple(task)) return null;

    // Check if browser tools are available - if so, this might be a browser task
    // Browser tools include: browser_navigate, browser_click, browser_type, etc.
    const toolDefinitions = this.toolBus.getDefinitions();
    const hasBrowserTools = toolDefinitions.some(tool => tool.name.startsWith('browser_'));
    if (hasBrowserTools) {
      console.log('[AgentLoop] Browser tools available - skipping turbo path to allow full iterations for browser tasks');
      return null;
    }

    // Check if this is a browser task - if so, don't use turbo path
    const lowerTask = task.toLowerCase();
    const browserKeywords = ["browse", "navigate", "click", "open website", "open page", "web page", "screenshot", "scroll", "visit", "go to", "search", "google", "find", "type", "input", "browser_navigate", "browser_click", "browser_type", "stock price", "quote", "ticker"];
    if (browserKeywords.some(k => lowerTask.includes(k))) {
      console.log('[AgentLoop] Browser task detected - skipping turbo path to allow full iterations');
      return null;
    }

    try {
      const tools = this.toolBus.getDefinitions();
      const systemPrompt = this.soul || loadSoul();
      const messages: Message[] = [{ role: "user", content: task }];
      const allSteps: StepEvent[] = [];
      const maxToolRounds = 5; // Allow up to 5 rounds of tool calls
      let toolRound = 0;

      while (toolRound < maxToolRounds) {
        // Use chatStreamWithTools to get tool calls
        console.log('[AgentLoop] Turbo path: Round', toolRound + 1, '- Sending messages:', JSON.stringify(messages, null, 2));
        const response = await this.llmProvider.chatStreamWithTools(
          messages,
          tools,
          systemPrompt,
          (token) => {
            // Only stream content for the first round (user's initial request)
            if (toolRound === 0) {
              this.streamEmitter.emitContent(token, false);
            }
          }
        );

        console.log('[AgentLoop] Turbo path: LLM response:', { text: response.text, toolCalls: response.tool_calls });

        // If no tool calls, we're done
        if (!response.tool_calls || response.tool_calls.length === 0) {
          if (toolRound === 0 && response.text) {
            // First round with just text response
            const parsed = this.thinkParser.parse(response.text);
            const result = {
              task,
              result: parsed.visible ?? response.text,
              success: true,
              steps: [],
              actions_taken: [],
              iterations: 1,
              strategy_used: "turbo",
              elapsed_secs: 0,
            };
            // Save session for turbo path
            await this.saveSessionToDb(task, [], result.result, result.success);
            return result;
          } else if (response.text) {
            // Subsequent rounds with text response
            this.streamEmitter.emitContent(response.text, true);
            const result = {
              task,
              result: response.text,
              success: true,
              steps: allSteps,
              actions_taken: allSteps.map(s => s.action),
              iterations: toolRound + 1,
              strategy_used: "turbo_with_tools",
              elapsed_secs: 0,
            };
            // Save session for turbo path
            await this.saveSessionToDb(task, allSteps, result.result, result.success);
            return result;
          }
          break; // No text either, we're done
        }

        // Execute tool calls
        console.log('[AgentLoop] Turbo path: Round', toolRound + 1, '- Executing tool calls:', response.tool_calls.map(tc => tc.name));

        // Convert tool_calls to OpenAI/Minimax format with arguments as JSON strings
        const formattedToolCalls = response.tool_calls.map(tc => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments)
          }
        }));

        // Add assistant message with tool calls in correct format
        messages.push({
          role: "assistant",
          content: response.text || "",
          tool_calls: formattedToolCalls
        });

        for (const tc of response.tool_calls) {
          const action = tc.name;
          const detail = JSON.stringify(tc.arguments);

          // Emit step start event
          console.log('[AgentLoop] Turbo path: Emitting step_start for tool:', action);
          this.streamEmitter.emitStepStart("executing", action, detail);

          const step: StepEvent = {
            phase: "executing",
            action,
            detail,
          };
          allSteps.push(step);

          try {
            // Retry logic for browser actions
            let result;
            let retries = 0;
            const maxRetries = action.startsWith("browser_") ? 3 : 1; // Browser actions get 3 retries

            while (retries < maxRetries) {
              try {
                result = await this.toolBus.execute(action, tc.arguments);
                if (result.success) break; // Success, exit retry loop

                retries++;
                if (retries < maxRetries) {
                  console.log(`[AgentLoop] Action ${action} failed, retry ${retries}/${maxRetries}`);
                  await new Promise(resolve => setTimeout(resolve, 1000 * retries)); // Wait before retry
                }
              } catch (execErr) {
                retries++;
                if (retries >= maxRetries) throw execErr;
                await new Promise(resolve => setTimeout(resolve, 1000 * retries));
              }
            }

            console.log('[AgentLoop] Tool result:', result?.success);
            // Ensure observation is always a string (not an object)
            const obs = result?.success ? (result?.output ?? "") : (result?.error ?? "");
            const observation = typeof obs === 'object' && obs !== null ? JSON.stringify(obs) : obs;
            step.observation = observation;

            // Emit step complete event
            this.streamEmitter.emitStepComplete("executing", action, observation, result?.success ?? false);

            // Add tool response message using OpenAI/Minimax standard format
            messages.push({
              role: "tool",
              content: observation || "",
              tool_call_id: tc.id
            });

            // Track successful browser actions
            if (result?.success) {
              this.scratchpad.set("last_successful_action", JSON.stringify({
                action,
                args: tc.arguments,
                output: result.output
              }));
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            console.log('[AgentLoop] Turbo path: Tool error:', errMsg);
            step.observation = errMsg;

            this.streamEmitter.emitStepComplete("executing", action, errMsg, false);

            // Add tool response message with error using OpenAI/Minimax standard format
            messages.push({
              role: "tool",
              content: errMsg,
              tool_call_id: tc.id
            });
          }
        }

        // After browser actions, capture screenshot for frontend + inject vision
        const hasBrowserAction = response.tool_calls.some(tc => tc.name.startsWith('browser_'));
        if (hasBrowserAction) {
          try {
            const screenshot = await takeBrowserScreenshot();
            if (screenshot && screenshot.length > 100) {
              let url = 'unknown';
              try {
                const pages = (this.browserSession as any)?.context?.pages?.();
                if (pages && pages.length > 0) url = pages[0].url();
              } catch {}
              setLatestScreenshot(screenshot, url);

              // Inject vision into conversation
              messages.push({
                role: 'user',
                content: [
                  { type: 'text', text: '[Browser screenshot after your last action. Use browser_snapshot for element refIds. Current URL: ' + url + ']' },
                  { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + screenshot, detail: 'low' } },
                ],
              } as any);
            }
          } catch {}
        } else {
          this.captureBrowserState();
        }

        toolRound++;
      }

      // After all tool rounds, get final response
      const finalResponse = await this.llmProvider.chatStreamWithTools(
        messages,
        tools,
        systemPrompt,
        (token) => {
          this.streamEmitter.emitContent(token, true);
        }
      );

      const result = {
        task,
        result: finalResponse.text || "Task completed",
        success: true,
        steps: allSteps,
        actions_taken: allSteps.map(s => s.action),
        iterations: toolRound,
        strategy_used: "turbo_with_tools",
        elapsed_secs: 0,
      };
      // Save session for turbo path
      await this.saveSessionToDb(task, allSteps, result.result, result.success);
      return result;
    } catch (err) {
      console.log('[AgentLoop] Turbo path error:', err);
      return null;
    }
  }

  private classifyTask(task: string, mode?: string): TaskCategory {
    return classifyTask(task, mode);
  }

  private isSimple(task: string): boolean {
    const wordCount = task.split(/\s+/).length;
    return wordCount <= 15 && !/[;|&]/.test(task);
  }

  private createPlan(task: string, category: TaskCategory): TaskPlan {
    const lower = task.toLowerCase();

    // For browser/search tasks, create specific steps
    if (category === "browser" || lower.includes("search") || lower.includes("visit")) {
      // Extract search query if present
      const searchMatch = task.match(/(?:search|find|google|for)?\s*["']?([^"'\n]+)["']?\s*(?:on|at|in|via)?\s*(?:google|search)?/i);
      const searchQuery = searchMatch ? searchMatch[1] : "the target";

      return {
        steps: [
          { description: `Navigate to website`, strategy: "direct" },
          { description: `Take snapshot to find interactive elements`, strategy: "direct" },
          { description: `Type "${searchQuery}" in search box and submit`, strategy: "direct" },
          { description: `Take screenshot of results`, strategy: "direct" },
          { description: `Report findings`, strategy: "direct" },
        ],
      };
    }

    const stepsByCategory: Record<TaskCategory, Array<{ description: string; strategy: string }>> = {
      simple: [{ description: "Execute task directly", strategy: "direct" }],
      complex: [
        { description: "Analyze task requirements", strategy: "direct" },
        { description: "Execute subtasks", strategy: "direct" },
        { description: "Verify and synthesize results", strategy: "direct" },
      ],
      browser: [
        { description: "Navigate to target URL", strategy: "direct" },
        { description: "Take snapshot to find interactive elements", strategy: "direct" },
        { description: "Interact with elements (click, type, scroll)", strategy: "direct" },
        { description: "Verify results and extract information", strategy: "direct" },
        { description: "Call browser_end with summary", strategy: "direct" },
      ],
      research: [
        { description: "Search for information", strategy: "direct" },
        { description: "Analyze findings", strategy: "direct" },
        { description: "Compile results", strategy: "direct" },
      ],
      creative: [
        { description: "Understand requirements", strategy: "direct" },
        { description: "Generate content", strategy: "direct" },
        { description: "Review and refine", strategy: "direct" },
      ],
    };

    return { steps: stepsByCategory[category] ?? stepsByCategory.simple };
  }

  /**
   * Detect if flash mode should be enabled for this task
   * Flash mode skips verbose reasoning for simple, straightforward tasks
   */
  private detectFlashMode(task: string): boolean {
    const config = getConfig();

    if (!config.enableFlashMode) {
      return false;
    }

    const lowerTask = task.toLowerCase();

    // Check for flash mode keywords
    for (const keyword of config.flashModeKeywords) {
      if (lowerTask.includes(keyword.toLowerCase())) {
        return true;
      }
    }

    // Simple tasks detection (under 12 words, no complex reasoning needed)
    const wordCount = task.split(/\s+/).length;
    const isShort = wordCount <= 12;

    // Check for complexity indicators
    const complexityIndicators = [
      'because', 'explain', 'analyze', 'analyze', 'compare', 'evaluate',
      'why', 'how', 'what if', 'versus', 'vs', 'difference', 'best way',
      'recommend', 'should i', 'can you explain', 'figure out'
    ];

    const hasComplexity = complexityIndicators.some(indicator =>
      lowerTask.includes(indicator)
    );

    // Enable flash mode for short tasks without complexity indicators
    if (isShort && !hasComplexity) {
      return true;
    }

    return false;
  }

  private buildSystemPrompt(task: string, category: TaskCategory, plan: TaskPlan, iteration: number): string {
    const config = getConfig();
    const flashMode = this.detectFlashMode(task);

    // For browser tasks in flash mode, use the specialized prompt
    if (category === "browser" && flashMode) {
      return buildFlashBrowserPrompt();
    }

    // For other cases, use the standard prompt builder
    return buildSystemPrompt({
      task,
      category,
      plan,
      iteration,
      soul: this.soul || loadSoul()
    });
  }

  /**
   * Build simplified browser prompt for flash mode
   */
  private buildFlashBrowserPrompt(): string {
    return buildFlashBrowserPrompt();
  }

  private reflect(task: string, steps: StepEvent[], iteration: number): { success: boolean; recoveryHint?: string } {
    return reflect(task, steps, iteration);
  }

  private detectLoop(actionsTaken: string[]): string | null {
    const result = detectLoop(actionsTaken);
    if (result) {
      // Update action history for tracking
      for (let i = 0; i < actionsTaken.length; i++) {
        const key = actionsTaken[i];
        const count = this.actionHistory.get(key) || 0;
        this.actionHistory.set(key, count + 1);
      }
    }
    return result;
  }

  /**
   * Fire-and-forget screenshot for frontend panel (non-vision path).
   */
  private captureBrowserState(): void {
    this.browserOps.takeScreenshot().catch(err => {
      logger.warn({ err: err?.message }, "capture_browser_state_failed");
    });
  }

  /**
   * After browser tool calls: capture screenshot for frontend panel
   * AND inject as vision message so the LLM can see the current page state.
   */
  private async injectBrowserVision(): Promise<void> {
    await this.browserOps.injectBrowserVision((content) => {
      this.conversationManager.addUserMessage(content);
    });

    // Update current URL and title
    this.currentUrl = this.browserOps.getCurrentUrl();
    this.currentTitle = this.browserOps.getCurrentTitle();
  }

  private async runPostTask(task: string, result: string, success: boolean, category: TaskCategory): Promise<void> {
    try {
      if (this.memory && success) {
        this.memory.write("memory", `Task: ${task}\nResult: ${result.slice(0, 500)}`, { category, success });
      }

      if (this.memory) {
        await this.memory.onSessionEnd();
      }

      // Save session to database
      await this.saveSessionToDb(task, this.steps, result, success);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "post_task_error");
    }
  }

  /**
   * Helper method to save session to database
   * Extracted to avoid code duplication in turbo path
   */
  private async saveSessionToDb(
    task: string,
    steps: StepEvent[],
    result: string,
    success: boolean
  ): Promise<void> {
    try {
      const { saveSession } = await import("../../memory/sessions.js");
      await saveSession({
        task,
        steps,
        result: success ? result : undefined,
      });
      logger.info({ task, success }, "session_saved_to_db");
    } catch (saveErr) {
      // Don't fail the task if session save fails
      logger.warn({ err: (saveErr as Error).message }, "session_save_failed");
    }
  }

  /**
   * Execute a single tool call with full event tracking
   * Extracted from sequential execution loop for reuse
   */
  private async executeToolCall(
    tc: any,
    iteration: number,
    actionsTaken: string[],
    toolCallId?: string
  ): Promise<void> {
    this.interrupt.check();

    const action = tc.name;
    const detail = JSON.stringify(tc.arguments);

    // Record action for loop detection
    this.loopDetector.recordAction(action, tc.arguments, iteration, this.currentUrl);

    // Check for loop BEFORE executing (proactive)
    const loopResult = this.loopDetector.detectLoop();
    if (loopResult.isLooping) {
      logger.warn({ pattern: loopResult.pattern }, "loop_detected");

      this.streamEmitter.emitThinking(
        `LOOP DETECTED: ${loopResult.pattern?.description}. ${loopResult.suggestion}`,
        "reflection"
      );

      // Add intervention message to conversation
      this.addSystemMessage(
        `<loop_detected>\n${loopResult.suggestion}\nPattern: ${loopResult.pattern?.description}\n</loop_detected>`
      );

      // Reset detector to avoid repeating the same warning
      this.loopDetector.reset();

      // Don't execute this action - let the agent reconsider
      return;
    }

    console.log('[AgentLoop] Emitting step_start for tool:', action);
    this.streamEmitter.emitStepStart("executing", action, detail);

    const step: StepEvent = {
      phase: "executing",
      action,
      detail,
    };
    this.steps.push(step);
    actionsTaken.push(action);

    this.auditLog.add(action, detail, { level: "low", reasons: [] });

    try {
      const result = await this.toolBus.execute(action, tc.arguments);

      // Ensure observation is always a string (not an object)
      const observation = typeof result.output === 'object' && result.output !== null
        ? JSON.stringify(result.output)
        : (result.success ? result.output : result.error) ?? '';
      step.observation = observation;

      this.streamEmitter.emitStepComplete("executing", action, observation, result.success);

      // Use the conversation tool_call ID for tool results to match MiniMax's expectations
      const resultToolCallId = toolCallId || tc.id;
      logger.info(`[AgentLoop] executeToolCall: Adding tool result for ${action} with id: ${resultToolCallId}`);
      this.addToolResult(resultToolCallId, action, result.success ? result.output : result.error ?? "Tool failed");

      // Update URL if browser action was successful
      if (result.success && action === 'browser_navigate' && tc.arguments.url) {
        this.currentUrl = tc.arguments.url as string;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      step.observation = errMsg;

      this.streamEmitter.emitStepComplete("executing", action, errMsg, false);

      // Use the conversation tool_call ID for tool results to match MiniMax's expectations
      const resultToolCallId = toolCallId || tc.id;
      logger.info(`[AgentLoop] executeToolCall error: Adding tool result for ${action} with id: ${resultToolCallId}`);
      this.addToolResult(resultToolCallId, action, `Error: ${errMsg}`);
    }
  }

  /**
   * Capture current page state for change detection
   * Returns a PageSnapshot-like object for comparison
   */
  private async captureCurrentPageState(): Promise<import('../../browser/controller.js').PageSnapshot | null> {
    try {
      // Try to get current page state via browser snapshot
      const controller = await (async () => {
        const { getBrowserController } = await import("../tools/browser-tools.js");
        return getBrowserController();
      })();

      if (!controller) {
        return null;
      }

      // Return the snapshot directly from controller
      return await controller.snapshot();
    } catch (error) {
      logger.warn({ err: (error as Error).message }, "capture_page_state_failed");
      return null;
    }
  }

  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
  }

  private addUserMessage(content: string): void {
    this.conversationManager.addUserMessage(content);
  }

  private addAssistantMessage(content: string): void {
    this.conversationManager.addAssistantMessage(content);
  }

  private addSystemMessage(content: string): void {
    this.conversationManager.addSystemMessage(content);
  }

  private addToolResult(toolCallId: string, toolName: string, content: string): void {
    this.conversationManager.addToolResult(toolCallId, toolName, content);
  }

  private addToolCallMessage(content: string, toolCalls: any[]): void {
    this.conversationManager.addToolCallMessage(content, toolCalls);
  }
}

class ThinkTagParser {
  parse(text: string): { thinking: string | null; visible: string | null } {
    const thinkMatch = text.match(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/i);
    if (thinkMatch) {
      const thinking = thinkMatch[1].trim();
      const visible = text.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi, "").trim();
      return { thinking, visible: visible || null };
    }
    return { thinking: null, visible: text };
  }
}


