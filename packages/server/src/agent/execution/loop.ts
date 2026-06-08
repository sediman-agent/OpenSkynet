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
import { takeBrowserScreenshot } from "../tools/browser-tools";
import { setLatestScreenshot } from "../../api/routes/browser";
import logger from "../../core/logging";
import { getConfig } from "../../core/config";
import {
  IterationManager,
  ToolExecutor,
  ResponseProcessor,
  CompressionHandler,
  ReflectionHandler,
  type IterationState,
  type ProcessedResponse,
  type ReflectionResult,
} from "../loop/index";
import { StreamEmitter } from "../streaming";

const BROWSER_SYSTEM_PROMPT = `You are an expert web browsing agent. You operate a real Chromium browser to accomplish tasks. You can see the page through screenshots AND interact with elements using refId numbers from browser_snapshot.

<language>
Respond in the same language as the user request. Default: English.
</language>

<workflow>
Follow this loop for EVERY step:
1. OBSERVE — Check the screenshot (injected after each action) and/or call browser_snapshot to get interactive elements with their refId numbers.
2. THINK — Reason about what you see, what the user wants, and what to do next.
3. ACT — Call the appropriate tool. You may call multiple tools in one response when they are independent.
4. VERIFY — After your action, check the next screenshot/snapshot to confirm the action succeeded.

ALWAYS call browser_snapshot after navigation, scrolling, or when you need to find elements.
NEVER guess refId numbers — always get them from a fresh snapshot.
</workflow>

<element_interaction>
Elements are identified by refId numbers from browser_snapshot. Example snapshot output:
  [1]<input name="q" placeholder="Search..." />
  [2]<button>Search</button>
  [5]<a href="/about">About Us</a>

To interact: use the number in brackets. Example: browser_click with refId=2 clicks the Search button.

Rules:
- Only use refId numbers that appear in the MOST RECENT snapshot. Old refIds may be stale after page changes.
- If a snapshot returns 0 elements, try scrolling or waiting — some pages load dynamically.
- For iframes: elements inside iframes may not appear in snapshots. Try clicking into the iframe area first.
- For shadow DOM: elements inside shadow roots may not be directly accessible. Try interacting with the host element.
</element_interaction>

<action_strategies>
Navigation:
- browser_navigate(url) — always start with https:// unless the user specifies otherwise.
- After navigation, ALWAYS call browser_snapshot to see what loaded.

Searching:
- Navigate to search engine → snapshot → browser_type in search box → submit (use submit=true or browser_press_key "Enter") → snapshot results.

Form filling:
- Snapshot to find fields → browser_type each field → browser_click submit button.
- For dropdowns: browser_select_option with the option value.
- For autocomplete: browser_type text, WAIT for suggestions, then click the suggestion.

Scrolling:
- Use browser_scroll("down") to reveal more content. Default scroll: 500px.
- Check if there is content below fold with browser_snapshot after scrolling.

Keyboard:
- browser_press_key for Enter, Tab, Escape, ArrowDown, Backspace, etc.
- Use Tab to move between form fields. Use Enter to submit forms.
- Use Escape to close modals/popups.

Tab management:
- If a click opens a new tab, use browser_list_tabs then browser_switch_tab.
- Some sites open popups — close unwanted tabs with browser_switch_tab back to the main tab.

Hover:
- Use browser_hover to trigger dropdown menus, tooltips, hover cards.
- After hovering, call browser_snapshot to see newly revealed elements.
</action_strategies>

<error_recovery>
If an action fails:
1. Element not found → Take a fresh browser_snapshot. The page may have changed or not finished loading.
2. Click had no effect → The element might be obscured by a popup/modal/cookie banner. Dismiss overlays first.
3. Navigation failed / 403 / blocked → Do NOT retry the same URL. Try an alternative URL or approach.
4. Timeout / page loading → Use browser_wait with a CSS selector to wait for content.
5. Login required → Use request_human_help to ask the user to log in manually.

Loop detection — if you take the same action 3 times with the same result:
- STOP and change approach.
- Try a different element, different URL, scroll to find alternatives, or use request_human_help.
</error_recovery>

<popups_and_overlays>
Many websites show these on first visit. Handle them FIRST:
- Cookie consent: Click "Accept" or "Reject All" button.
- Newsletter popups: Close with X button or press Escape.
- Login walls: Try dismissing, or use request_human_help.
- Ad overlays: Close or scroll past.
</popups_and_overlays>

<task_completion>
Call browser_end when:
- The task is FULLY completed (all parts done).
- It is impossible to continue (explain why in summary).
- You've reached your iteration limit.

Before calling browser_end, verify:
- Did you find the correct number of items?
- Did you apply all specified filters?
- Can you confirm results from what you SEE on the page?

In browser_end summary: include ALL relevant findings — URLs, text, data, counts. Be specific.
</task_completion>

<common_patterns>
"Go to X and find Y" → navigate → snapshot → type search → submit → snapshot → extract results → browser_end
"Fill out this form" → navigate → snapshot → type each field → select dropdowns → click submit → verify → browser_end
"Compare X and Y on site Z" → navigate → search for X → extract → go back → search for Y → extract → compare → browser_end
"Take a screenshot of X" → navigate → wait for load → browser_screenshot → browser_end
"Download X from Y" → navigate → find download button → click → handle any prompts → browser_end
</common_patterns>

IMPORTANT: You MUST keep executing tools until the task is complete. DO NOT stop after one action. DO NOT respond with text when you should be calling tools. Keep going until browser_end.
`;

type Message = { role: string; content: string; tool_calls?: any[]; tool_call_id?: string; name?: string };
type TaskCategory = "simple" | "complex" | "browser" | "research" | "creative";
type TaskPlan = { steps: Array<{ description: string; strategy: string }> };

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
  private conversation: Message[];
  private interrupt: InterruptSignal;
  private auditLog: AuditLog;
  private scratchpad: SharedScratchpad;
  private progress: ProgressTracker;
  private budget: Budget;
  private thinkParser: ThinkTagParser;
  private soul: string;
  private promptBuilder: PromptBuilder;
  private compressor: ContextCompressor;
  private maxIterations: number;
  private compressThreshold: number;
  private streamEmitter: StreamEmitter;
  private steps: StepEvent[] = [];
  private actionHistory: Map<string, number> = new Map();

  // Modular components for future refactoring
  private iterationManager: IterationManager;
  private toolExecutor: ToolExecutor;
  private responseProcessor: ResponseProcessor;
  private compressionHandler: CompressionHandler;
  private reflectionHandler: ReflectionHandler;

  constructor(opts: AgentLoopOpts) {
    const config = getConfig();
    this.llmProvider = opts.llmProvider;
    this.browserSession = opts.browserSession ?? null;
    this.memory = opts.memory ?? null;
    this.skillEngine = opts.skillEngine ?? null;
    this.toolBus = opts.toolBus ?? new ToolBus();
    this.conversation = [];
    this.interrupt = new InterruptSignal();
    this.auditLog = new AuditLog();
    this.scratchpad = new SharedScratchpad();
    this.progress = new ProgressTracker();
    this.compressor = new ContextCompressor();
    this.thinkParser = new ThinkTagParser();
    this.promptBuilder = new PromptBuilder();
    this.soul = "";
    this.maxIterations = config.compressThreshold * 2 + 10;
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

    // Initialize modular components
    this.iterationManager = new IterationManager(this.maxIterations, this.budget);
    this.toolExecutor = new ToolExecutor(this.toolBus, this.auditLog, this.interrupt);
    this.responseProcessor = new ResponseProcessor();
    this.compressionHandler = new CompressionHandler(this.compressor, this.compressThreshold);
    this.reflectionHandler = new ReflectionHandler();
  }

  async run(task: string, mode?: string): Promise<AgentResult> {
    const startTime = Date.now();
    this.steps = [];
    this.actionHistory = new Map();
    const actionsTaken: string[] = [];
    let strategyUsed = "direct";
    let finalResult = "";
    let success = false;

    try {
      this.soul = loadSoul();
      this.interrupt.reset();
      this.progress = new ProgressTracker();

      // Emit initial progress event
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
        const messages = this.compressor.compress(this.conversation, 100_000);
        const tools = this.toolBus.getDefinitions();

        let response;
        let fullContent = "";

        try {
          // Use streaming with tool support
          const stream = this.llmProvider.chatStreamWithTools(
            messages,
            tools,
            systemPrompt,
            (chunk) => {
              // Emit content event for each chunk
              this.streamEmitter.emitContent(chunk, false);
            }
          );

          response = await stream;
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error({ err: errorMsg, iteration }, "llm_call_failed");

          // Emit error event
          this.streamEmitter.emitError(errorMsg, true);

          this.steps.push({ phase: "executing", action: "llm_error", detail: errorMsg });
          finalResult = `LLM error: ${errorMsg}`;
          break;
        }

        if (response.tool_calls.length > 0) {
          const isBrowserAction = response.tool_calls.some(tc => tc.name.startsWith('browser_'));

          for (const tc of response.tool_calls) {
            this.interrupt.check();

            const action = tc.name;
            const detail = JSON.stringify(tc.arguments);

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
              step.observation = result.success ? result.output : result.error;

              this.streamEmitter.emitStepComplete("executing", action, step.observation, result.success);

              this.addToolResult(tc.id, action, result.success ? result.output : result.error ?? "Tool failed");
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              step.observation = errMsg;

              this.streamEmitter.emitStepComplete("executing", action, errMsg, false);

              this.addToolResult(tc.id, action, `Error: ${errMsg}`);
            }
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

          // Only set done if browser_end was called OR if this is a non-browser task
          const browserEndCalled = actionsTaken.includes("browser_end");
          if (browserEndCalled || category !== "browser") {
            finalResult = parsed.visible ?? fullContent;
            done = true;

            this.steps.push({
              phase: "done",
              action: browserEndCalled ? "browser_end" : "response",
              detail: finalResult,
            });
          } else {
            // For browser tasks without browser_end, add a user message to continue
            this.addUserMessage("Please continue with the next step. Call browser_end when you have completed the task.");
          }
        }

        this.budget.usedIterations = iteration;
        this.budget.usedTimeMs = Date.now() - startTime;

        if (iteration % this.compressThreshold === 0 && this.conversation.length > this.compressThreshold) {
          this.conversation = this.compressor.compress(this.conversation, 80_000);
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
    return [...this.conversation];
  }

  setConversation(messages: Message[]): void {
    this.conversation = [...messages];
  }

  clearConversation(): void {
    this.conversation = [];
  }

  private async tryTurboPath(task: string): Promise<AgentResult | null> {
    if (!this.isSimple(task)) return null;

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
            step.observation = result?.success ? (result?.output ?? "") : (result?.error ?? "");

            // Emit step complete event
            this.streamEmitter.emitStepComplete("executing", action, step.observation, result?.success ?? false);

            // Add tool response message using OpenAI/Minimax standard format
            messages.push({
              role: "tool",
              content: step.observation || "",
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

    return null;
  }

  private classifyTask(task: string, mode?: string): TaskCategory {
    if (mode) {
      const modeMap: Record<string, TaskCategory> = {
        browser: "browser",
        research: "research",
        creative: "creative",
        simple: "simple",
        complex: "complex",
      };
      const mapped = modeMap[mode];
      if (mapped) return mapped;
    }

    const lower = task.toLowerCase();
    // Enhanced browser keyword detection
    const browserKeywords = ["browse", "navigate", "click", "open website", "open page", "web page", "screenshot", "scroll", "visit", "go to", "search", "google", "find", "type", "input"];
    const researchKeywords = ["research", "find information", "compare", "analyze", "gather data", "summarize"];
    const creativeKeywords = ["write", "create", "compose", "design", "draft", "generate content"];

    // Check for browser/search tasks first (more specific)
    if (browserKeywords.some((k) => lower.includes(k))) return "browser";
    if (researchKeywords.some((k) => lower.includes(k))) return "research";
    if (creativeKeywords.some((k) => lower.includes(k))) return "creative";
    if (this.isSimple(task)) return "simple";
    return "complex";
  }

  private isSimple(task: string): boolean {
    const wordCount = task.split(/\s+/).length;
    return wordCount <= 15 && !/[;|&]/.test(task);
  }

  private extractSearchQuery(task: string): string {
    const lower = task.toLowerCase();

    // Extract search query from various patterns
    const patterns = [
      /search (?:for|in|on|at)?\s+["']?([^"'\n]+?)["']?(?:\s+(?:on|at|in|via|using|with))?$/i,
      /google (?:for)?\s+["']?([^"'\n]+?)["']?$/i,
      /find (?:information|about|details)?\s+(?:about|for)?\s+["']?([^"'\n]+?)["']?$/i,
      /visit\s+\w+\s+and\s+search\s+(?:for)?\s+["']?([^"'\n]+?)["']?$/i,
    ];

    for (const pattern of patterns) {
      const match = task.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // Fallback: check for common terms
    if (lower.includes("tesla")) return "Tesla official site";
    if (lower.includes("elon")) return "Elon Musk";

    return "";
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

  private buildSystemPrompt(task: string, category: TaskCategory, plan: TaskPlan, iteration: number): string {
    const parts: string[] = [];

    if (this.soul) {
      parts.push(this.soul);
    }

    parts.push(`\nTask category: ${category}`);
    parts.push(`Current iteration: ${iteration}/${this.maxIterations}`);

    const planSummary = plan.steps.map((s, i) => `${i + 1}. ${s.description}`).join("\n");
    parts.push(`Plan:\n${planSummary}`);

    if (category === "browser") {
      parts.push(BROWSER_SYSTEM_PROMPT);
    }

    if (this.memory) {
      const memoryContext = this.memory.context(task);
      if (memoryContext) {
        parts.push(`\nRelevant memories:\n${memoryContext}`);
      }
    }

    if (this.skillEngine) {
      const skillSummaries = this.skillEngine.getSkillSummaries();
      if (skillSummaries && skillSummaries !== "No skills available.") {
        parts.push(`\nAvailable skills:\n${skillSummaries}`);
      }
    }

    const progressInfo = this.progress.getProgress();
    if (progressInfo.total > 0) {
      parts.push(`\nProgress: ${progressInfo.completed}/${progressInfo.total} milestones (${progressInfo.percentage}%)`);
    }

    return parts.join("\n");
  }

  private reflect(task: string, steps: StepEvent[], iteration: number): { success: boolean; recoveryHint?: string } {
    const recentSteps = steps.slice(-3);
    const failedSteps = recentSteps.filter((s) => s.observation && s.observation.includes("Error"));

    if (failedSteps.length >= 2) {
      return {
        success: false,
        recoveryHint: `Multiple errors detected in recent steps. Consider changing approach or breaking task down differently.`,
      };
    }

    const lastStep = recentSteps[recentSteps.length - 1];
    if (lastStep?.observation?.includes("not found") || lastStep?.observation?.includes("failed")) {
      return {
        success: false,
        recoveryHint: `Last action had issues: ${lastStep.observation}. Try an alternative approach.`,
      };
    }

    return { success: true };
  }

  private detectLoop(actionsTaken: string[]): string | null {
    if (actionsTaken.length < 3) return null;
    const last6 = actionsTaken.slice(-6);
    const key = (a: string, i: number) => `${a}:${last6[i + 1] ?? ''}`;
    for (let i = 0; i < last6.length - 2; i++) {
      const pat = key(last6[i], i);
      const count = this.actionHistory.get(pat) ?? 0;
      this.actionHistory.set(pat, count + 1);
      if (count + 1 >= 3) {
        return `Action "${last6[i]}" repeated ${count + 1} times in a similar pattern`;
      }
    }
    const last3 = last6.slice(-3);
    if (last3.length === 3 && last3[0] === last3[2] && last3[0] === last3[1]) {
      return `Same action "${last3[0]}" repeated 3 consecutive times`;
    }
    return null;
  }

  /**
   * Fire-and-forget screenshot for frontend panel (non-vision path).
   */
  private captureBrowserState(): void {
    (async () => {
      try {
        const screenshot = await takeBrowserScreenshot();
        if (screenshot && screenshot.length > 100) {
          let url = 'unknown';
          try {
            const pages = (this.browserSession as any)?.context?.pages?.();
            if (pages && pages.length > 0) url = pages[0].url();
          } catch {}
          setLatestScreenshot(screenshot, url);
        }
      } catch {}
    })();
  }

  /**
   * After browser tool calls: capture screenshot for frontend panel
   * AND inject as vision message so the LLM can see the current page state.
   */
  private async injectBrowserVision(): Promise<void> {
    try {
      const screenshot = await takeBrowserScreenshot();
      if (!screenshot || screenshot.length < 100) return;

      let url = 'unknown';
      try {
        const pages = (this.browserSession as any)?.context?.pages?.();
        if (pages && pages.length > 0) url = pages[0].url();
      } catch {}
      setLatestScreenshot(screenshot, url);

      // Inject vision into conversation so LLM can see the page
      this.conversation.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: '[Browser screenshot after your last action. Use browser_snapshot for element refIds. Current URL: ' + url + ']'
          },
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/jpeg;base64,' + screenshot,
              detail: 'low',
            },
          },
        ],
      } as any);
    } catch {
      // Best effort — don't block the loop
    }
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

  setLLMProvider(provider: LLMProvider): void {
    this.llmProvider = provider;
  }

  private addUserMessage(content: string): void {
    this.conversation.push({ role: "user", content });
  }

  private addAssistantMessage(content: string): void {
    this.conversation.push({ role: "assistant", content });
  }

  private addSystemMessage(content: string): void {
    this.conversation.push({ role: "system", content });
  }

  private addToolResult(toolCallId: string, toolName: string, content: string): void {
    this.conversation.push({
      role: "tool",
      content: JSON.stringify({ tool_call_id: toolCallId, name: toolName, content }),
    } as any);
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

class PromptBuilder {
  buildSystemPrompt(parts: { soul?: string; memory?: string; skills?: string; plan?: string }): string {
    const sections: string[] = [];
    if (parts.soul) sections.push(parts.soul);
    if (parts.memory) sections.push(`\nRelevant memories:\n${parts.memory}`);
    if (parts.skills) sections.push(`\nAvailable skills:\n${parts.skills}`);
    if (parts.plan) sections.push(`\nPlan:\n${parts.plan}`);
    return sections.join("\n");
  }
}
