/**
 * BrowserAgent — vision-enabled autonomous browser agent
 *
 * Refactored modular architecture:
 * - Vision logic → vision-handler.ts
 * - Memory logic → memory-integration.ts
 * - Skills → skill-integration.ts
 * - Loop orchestration → agent-coordinator.ts
 * - System prompts → system-prompt-builder.ts
 *
 * The agent now coordinates specialized modules instead of handling everything directly.
 */

import type { AgentResult, StepEvent, ToolDefinition } from '../core/types';
import type { LLMProvider } from '../llm/provider';
import type { BaseMemoryStrategy } from '../memory/strategy';
import type { SkillEngine } from '../skills/engine';
import type { SkillSearchEngine } from '../skills/search';
import type { BrowserController } from '../browser/controller';
import { ToolBus } from './tools/bus';
import { StreamEmitter } from './streaming';
import { getConfig } from '../core/config';
import { buildSystemPrompt } from './execution/system-prompt-builder';
import { parseAgentResponse } from './execution/response-parser';
import type { ParsedAgentResponse } from './schemas/parser';

// Vision handling
import {
  captureVisionState,
  buildVisionMessage,
  extractToolCalls,
  formatActionResults,
  injectActionResults
} from './vision/vision-handler';

// Memory integration
import {
  initializeMemory,
  updateAgentMemory,
  finalizeMemory as finalizeTaskMemory,
  hasMemory,
  getMemoryState
} from './memory/memory-integration';

// Skill integration
import {
  initializeSkillTools,
  canExecuteSkills,
  getSkill,
  searchSkills,
  listSkills
} from './skills/skill-integration';

// Loop coordination
import {
  executeAgentLoop,
  type AgentCoordinatorOpts,
  type ExecutionResult
} from './execution/agent-coordinator';

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: string } };

type AgentMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentPart[];
  tool_call_id?: string;
  name?: string;
};

export interface BrowserAgentOpts {
  llmProvider: LLMProvider;
  browserController?: BrowserController;
  memory?: BaseMemoryStrategy;
  skillEngine?: SkillEngine;
  skillSearch?: SkillSearchEngine;
  toolBus?: ToolBus;
  headless?: boolean;
  workingDirectory?: string;
  enableBrowserTools?: boolean;
  enableShellTools?: boolean;
  enableFileTools?: boolean;
  enableCodingTools?: boolean;
  enableWebTools?: boolean;
  enableSkillsTools?: boolean;
  /** Enable vision: send screenshots to the LLM as image inputs (default: true) */
  useVision?: boolean;
}

/**
 * BrowserAgent - Main coordination class
 *
 * Now serves as a lightweight coordinator that delegates to specialized modules.
 * Much cleaner and easier to understand!
 */
export class BrowserAgent {
  private llmProvider: LLMProvider;
  private browserController: BrowserController | null;
  private memory: BaseMemoryStrategy | null;
  private skillEngine: SkillEngine | null;
  private skillSearch: SkillSearchEngine | null;
  private toolBus: ToolBus;
  private streamEmitter: StreamEmitter;
  private conversation: AgentMessage[] = [];
  private maxIterations: number;
  private cancelled = false;
  private workingDirectory: string;
  private useVision: boolean;
  private agentMemory = '';
  private consecutiveFailures = 0;

  constructor(opts: BrowserAgentOpts) {
    const config = getConfig();
    this.llmProvider = opts.llmProvider;
    this.browserController = opts.browserController ?? null;
    this.memory = opts.memory ?? null;
    this.skillEngine = opts.skillEngine ?? null;
    this.skillSearch = opts.skillSearch ?? null;
    this.toolBus = opts.toolBus ?? new ToolBus();
    this.streamEmitter = new StreamEmitter({ batchSize: 10, flushIntervalMs: 50 });
    this.useVision = opts.useVision ?? true;

    this.conversation = [];
    // Ensure at least 50 iterations
    const calculatedMax = config.compressThreshold * 2 + 10;
    this.maxIterations = Math.max(calculatedMax, 50);
    this.workingDirectory = opts.workingDirectory ?? process.cwd();

    // Initialize tools on the tool bus
    this.initializeTools(opts);
  }

  /**
   * Initialize tools on the tool bus
   */
  private initializeTools(opts: BrowserAgentOpts): void {
    if ((this as any).toolsInitialized) return;

    // Initialize skill tools
    initializeSkillTools(this.toolBus, {
      skillEngine: this.skillEngine ?? undefined,
      skillSearch: this.skillSearch ?? undefined,
      cwd: this.workingDirectory,
      enableBrowserTools: opts.enableBrowserTools ?? true,
      enableShellTools: opts.enableShellTools ?? true,
      enableFileTools: opts.enableFileTools ?? true,
      enableCodingTools: opts.enableCodingTools ?? true,
      enableWebTools: opts.enableWebTools ?? true,
      enableSkillsTools: opts.enableSkillsTools ?? true,
    });

    (this as any).toolsInitialized = true;
  }

  /**
   * Build system prompt for the agent
   */
  private buildSystemPrompt(): string {
    return buildSystemPrompt({
      task: 'Browser automation',
      category: 'browser',
      iteration: 0,
      soul: '',
      useVision: this.useVision
    });
  }

  /**
   * Main execution method - delegates to agent coordinator
   */
  async execute(task: string, onEvent?: (event: StepEvent) => void): Promise<AgentResult> {
    // Wire up event streaming
    if (onEvent) {
      this.streamEmitter.onEvent((event: any) => {
        switch (event.type) {
          case 'progress':
            onEvent({
              phase: 'executing',
              action: 'progress',
              detail: `${event.iteration}/${event.maxIterations}`
            });
            break;
          case 'step_start':
            onEvent({
              phase: event.phase,
              action: event.action,
              detail: event.detail
            });
            break;
          case 'step_complete':
            onEvent({
              phase: event.phase,
              action: event.action,
              observation: event.observation
            });
            break;
          case 'error':
            onEvent({
              phase: 'executing',
              action: 'error',
              detail: event.error
            });
            break;
        }
      });
    }

    // Initialize memory
    if (hasMemory({ memory: this.memory })) {
      await initializeMemory(this.memory);
    }

    // Prepare coordinator options
    const coordinatorOpts: AgentCoordinatorOpts = {
      llmProvider: this.llmProvider,
      toolBus: this.toolBus,
      maxIterations: this.maxIterations,
      systemPrompt: this.buildSystemPrompt(),
      agentMemory: this.agentMemory,
      conversation: this.conversation,
      cancelled: this.cancelled,
      useVision: this.useVision,
      browserController: this.browserController
    };

    // Execute the main loop
    const result = await executeAgentLoop(
      coordinatorOpts,
      task,
      parseAgentResponse,
      () => captureVisionState(
        this.browserController,
        this.useVision
      ),
      (task, state, screenshot, url) => buildVisionMessage(
        task,
        state,
        screenshot,
        url,
        {
          useVision: this.useVision,
          agentMemory: this.agentMemory
        }
      ),
      (toolName, toolArgs, iteration) => this.executeToolCall(toolName, toolArgs, iteration),
      this.streamEmitter,
      [] // steps array - populated during execution
    );

    // Update state from result
    this.agentMemory = result.finalResult || '';
    this.consecutiveFailures = result.consecutiveFailures ?? 0;
    this.conversation = result.conversation;

    // Finalize memory
    if (hasMemory({ memory: this.memory })) {
      await finalizeTaskMemory(this.memory);
    }

    return {
      task,
      result: result.finalResult,
      success: result.success,
      actions_taken: result.actionsTaken,
      steps: [],
      iterations: result.iterations,
      strategy_used: 'browser_vision',
      elapsed_secs: 0,
    };
  }

  /**
   * Execute a single tool call
   */
  private async executeToolCall(
    toolName: string,
    toolArgs: Record<string, unknown>,
    actionsTaken: string[],
    stepNumber: number
  ): Promise<{ success: boolean; output: string; error?: string }> {
    this.streamEmitter.emitStepStart('executing', toolName, JSON.stringify(toolArgs));

    try {
      const result = await this.toolBus.execute(toolName, toolArgs);

      if (result.success) {
        actionsTaken.push(`${toolName}: success`);
        this.consecutiveFailures = 0;
      } else {
        actionsTaken.push(`${toolName}: failed`);
        this.consecutiveFailures++;
      }

      this.streamEmitter.emitStepComplete(
        'executing',
        toolName,
        result.success ? (result.output || 'Success') : (result.error || 'Failed'),
        result.success
      );

      return {
        success: result.success,
        output: result.output || '',
        error: result.error,
      };
    } catch (error) {
      this.consecutiveFailures++;
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[BrowserAgent] Tool ${toolName} threw:`, errMsg);

      this.streamEmitter.emitStepComplete('executing', toolName, errMsg, false);

      return { success: false, output: '', error: errMsg };
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
   * Get available tool definitions
   */
  getToolDefinitions(): ToolDefinition[] {
    return this.toolBus.getDefinitions();
  }

  /**
   * Get available skills (if skill engine is configured)
   */
  getAvailableSkills(): string[] {
    if (!this.skillEngine) return [];
    return listSkills({
      skillEngine: this.skillEngine,
      skillSearch: this.skillSearch,
      toolBus: this.toolBus
    });
  }

  /**
   * Search for skills matching query
   */
  async searchSkills(query: string): Promise<any[]> {
    if (!this.skillSearch) return [];
    return searchSkills(query, {
      skillEngine: this.skillEngine ?? undefined,
      skillSearch: this.skillSearch ?? undefined,
      toolBus: this.toolBus,
      cwd: this.workingDirectory
    });
  }
}
