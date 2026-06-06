import type { AgentResult, StepEvent, ToolDefinition } from "../core/types";
import type { LLMProvider } from "../llm/provider";
import type { BaseMemoryStrategy } from "../memory/strategy";
import type { SkillEngine } from "../skills/engine";
import { ToolBus } from "./tools/bus";
import { AgentInterruptedError, InterruptSignal } from "./interrupt";
import { ContextCompressor } from "./compressor";
import { ProgressTracker } from "./progress";
import { AuditLog, SharedScratchpad, checkBudget, type Budget } from "./guardrails";
import { loadSoul } from "./soul";
import logger from "../core/logging";
import { getConfig } from "../core/config";
import {
  IterationManager,
  ToolExecutor,
  ResponseProcessor,
  CompressionHandler,
  ReflectionHandler,
  type IterationState,
  type ProcessedResponse,
  type ReflectionResult,
} from "./loop/index";

type Message = { role: string; content: string };
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
  private soul: string;
  private promptBuilder: PromptBuilder;
  private compressor: ContextCompressor;
  private maxIterations: number;
  private compressThreshold: number;

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
    this.promptBuilder = new PromptBuilder();
    this.soul = "";
    this.maxIterations = config.compressThreshold * 2 + 10;
    this.compressThreshold = config.compressThreshold;
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
    const steps: StepEvent[] = [];
    const actionsTaken: string[] = [];
    let strategyUsed = "direct";
    let finalResult = "";
    let success = false;

    try {
      this.soul = loadSoul();
      this.interrupt.reset();
      this.progress = new ProgressTracker();

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

      this.addUserMessage(task);

      let iteration = 0;
      let done = false;

      while (iteration < this.maxIterations && !done) {
        iteration++;
        this.interrupt.check();

        const budgetCheck = checkBudget(this.budget);
        if (budgetCheck.exceeded) {
          finalResult = `Stopped: ${budgetCheck.reason}`;
          break;
        }

        const systemPrompt = this.buildSystemPrompt(task, category, plan, iteration);
        const messages = this.compressor.compress(this.conversation, 100_000);
        const tools = this.toolBus.getDefinitions();

        let response;
        try {
          response = await this.llmProvider.chat(messages, tools, systemPrompt);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error({ err: errorMsg, iteration }, "llm_call_failed");
          steps.push({ phase: "executing", action: "llm_error", detail: errorMsg });
          finalResult = `LLM error: ${errorMsg}`;
          break;
        }

        if (response.tool_calls.length > 0) {
          for (const tc of response.tool_calls) {
            this.interrupt.check();

            const step: StepEvent = {
              phase: "executing",
              action: tc.name,
              detail: JSON.stringify(tc.arguments),
            };
            steps.push(step);
            actionsTaken.push(tc.name);

            this.auditLog.add(tc.name, JSON.stringify(tc.arguments), { level: "low", reasons: [] });

            try {
              const result = await this.toolBus.execute(tc.name, tc.arguments);
              step.observation = result.success ? result.output : result.error;
              this.addToolResult(tc.id, tc.name, result.success ? result.output : result.error ?? "Tool failed");
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              step.observation = errMsg;
              this.addToolResult(tc.id, tc.name, `Error: ${errMsg}`);
            }
          }

          if (response.text) {
            const parsed = this.thinkParser.parse(response.text);
            if (parsed.visible) {
              this.addAssistantMessage(parsed.visible);
            }
          }
        } else {
          const text = response.text ?? "";
          const parsed = this.thinkParser.parse(text);

          if (parsed.visible) {
            this.addAssistantMessage(parsed.visible);
          }

          finalResult = parsed.visible ?? text;
          done = true;

          steps.push({
            phase: "done",
            action: "response",
            detail: finalResult,
          });
        }

        this.budget.usedIterations = iteration;
        this.budget.usedTimeMs = Date.now() - startTime;

        if (iteration % this.compressThreshold === 0 && this.conversation.length > this.compressThreshold) {
          this.conversation = this.compressor.compress(this.conversation, 80_000);
        }

        if (!done && iteration < this.maxIterations) {
          const reflection = this.reflect(task, steps, iteration);
          if (!reflection.success && reflection.recoveryHint) {
            this.addSystemMessage(`Self-correction: ${reflection.recoveryHint}`);
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
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err: errorMsg }, "agent_loop_error");
        finalResult = `Error: ${errorMsg}`;
        success = false;
      }
    }

    const elapsedSecs = (Date.now() - startTime) / 1000;

    return {
      task,
      result: finalResult,
      success,
      steps,
      actions_taken: actionsTaken,
      iterations: this.budget.usedIterations || 1,
      strategy_used: strategyUsed,
      elapsed_secs: Math.round(elapsedSecs * 100) / 100,
    };
  }

  cancel(): void {
    this.interrupt.trigger("User cancelled");
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

      const response = await this.llmProvider.chat(messages, tools, systemPrompt);

      if (response.tool_calls.length === 0 && response.text) {
        const parsed = this.thinkParser.parse(response.text);
        return {
          task,
          result: parsed.visible ?? response.text,
          success: true,
          steps: [{ phase: "done", action: "turbo_response", detail: parsed.visible ?? response.text }],
          actions_taken: [],
          iterations: 1,
          strategy_used: "turbo",
          elapsed_secs: 0,
        };
      }
    } catch {
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
    const browserKeywords = ["browse", "navigate", "click", "open website", "open page", "web page", "screenshot", "scroll"];
    const researchKeywords = ["research", "find information", "compare", "analyze", "gather data", "summarize"];
    const creativeKeywords = ["write", "create", "compose", "design", "draft", "generate content"];

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

  private createPlan(task: string, category: TaskCategory): TaskPlan {
    const stepsByCategory: Record<TaskCategory, Array<{ description: string; strategy: string }>> = {
      simple: [{ description: "Execute task directly", strategy: "direct" }],
      complex: [
        { description: "Analyze task requirements", strategy: "direct" },
        { description: "Execute subtasks", strategy: "direct" },
        { description: "Verify and synthesize results", strategy: "direct" },
      ],
      browser: [
        { description: "Navigate to target", strategy: "direct" },
        { description: "Perform browser actions", strategy: "direct" },
        { description: "Extract results", strategy: "direct" },
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

  private async runPostTask(task: string, result: string, success: boolean, category: TaskCategory): Promise<void> {
    try {
      if (this.memory && success) {
        this.memory.write("memory", `Task: ${task}\nResult: ${result.slice(0, 500)}`, { category, success });
      }

      if (this.memory) {
        await this.memory.onSessionEnd();
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "post_task_error");
    }
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
