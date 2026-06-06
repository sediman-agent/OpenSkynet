/**
 * T800Agent - Direct execution agent with comprehensive tool suite
 *
 * Based on kimi-code's architecture with:
 * - All tools (Browser, Shell, File, Web, Skills, Document, Coding)
 * - Direct task execution
 * - Tool-based execution system
 * - Proper tool lifecycle management
 */

import type { AgentResult, StepEvent } from '../../core/types';
import type { LLMProvider } from '../../llm/provider';
import type { BaseMemoryStrategy } from '../../memory/strategy';
import type { SkillEngine } from '../../skills/engine';
import type { SkillSearchEngine } from '../../skills/search';
import { ToolBus } from '../../agent/tools/bus';
import { loadSoul } from '../../agent/soul';
import logger from '../../core/logging';
import { getConfig } from '../../core/config';
import { initializeT800Tools } from '../tools';
import type { AgentLoop } from '../../agent/loop';

type Message = { role: string; content: string };

export interface T800AgentOpts {
  llmProvider: LLMProvider;
  memory?: BaseMemoryStrategy;
  skillEngine?: SkillEngine;
  skillSearch?: SkillSearchEngine;
  agentLoop?: AgentLoop; // For skill execution
  toolBus?: ToolBus;
  headless?: boolean;
  workingDirectory?: string;
  enableShellTools?: boolean;
  enableBrowserTools?: boolean;
  enableFileTools?: boolean;
  enableWebTools?: boolean;
  enableSkillsTools?: boolean;
  enableDocumentTools?: boolean;
  enableCodingTools?: boolean;
}

/**
 * T800Agent - Comprehensive agent for direct task execution
 *
 * This agent follows kimi-code's architecture with all available tools:
 * - Browser: navigate_and_screenshot, navigate_and_extract, click_and_wait, fill_and_submit
 * - Shell: command execution with timeout protection
 * - File: read, write, list, create_dir, delete, move, search
 * - Web: fetch_url, search_web
 * - Skills: list, run, create, delete, search
 * - Document: pdf_to_text, docx_to_text, image_ocr, convert
 * - Coding: edit, search, find_refs, verify
 *
 * The agent is designed for direct, single-step task execution with full tool access.
 */
export class T800Agent {
  private llmProvider: LLMProvider;
  private memory: BaseMemoryStrategy | null;
  private skillEngine: SkillEngine | null;
  private skillSearch: SkillSearchEngine | null;
  private agentLoop: AgentLoop | null;
  private toolBus: ToolBus;
  private conversation: Message[];
  private maxIterations: number;
  private soul: string;
  private workingDirectory: string;
  private headless: boolean;
  private toolsInitialized = false;
  private cancelled = false;

  constructor(opts: T800AgentOpts) {
    const config = getConfig();
    this.llmProvider = opts.llmProvider;
    this.memory = opts.memory ?? null;
    this.skillEngine = opts.skillEngine ?? null;
    this.skillSearch = opts.skillSearch ?? null;
    this.agentLoop = opts.agentLoop ?? null;
    this.toolBus = opts.toolBus ?? new ToolBus();
    this.conversation = [];
    this.maxIterations = config.compressThreshold * 2 + 10;
    this.soul = '';
    this.workingDirectory = opts.workingDirectory ?? process.cwd();
    this.headless = opts.headless ?? true;

    // Initialize all T-800 tools
    this.initializeTools(opts);
  }

  private initializeTools(opts: T800AgentOpts): void {
    if (this.toolsInitialized) return;

    initializeT800Tools(this.toolBus, {
      cwd: this.workingDirectory,
      enableShellTools: opts.enableShellTools ?? true,
      enableBrowserTools: opts.enableBrowserTools ?? true,
      enableFileTools: opts.enableFileTools ?? true,
      enableWebTools: opts.enableWebTools ?? true,
      enableSkillsTools: opts.enableSkillsTools ?? true,
      enableDocumentTools: opts.enableDocumentTools ?? true,
      enableCodingTools: opts.enableCodingTools ?? true,
      skillDeps: {
        skillEngine: this.skillEngine ?? undefined,
        skillSearch: this.skillSearch ?? undefined,
        runSkill: this.agentLoop
          ? (name: string) => {
              // Run skill via agentLoop
              const skill = this.skillEngine?.getSkill(name);
              if (!skill) return Promise.reject(new Error(`Skill "${name}" not found`));
              return this.agentLoop!.run((skill.description as string) ?? name);
            }
          : undefined,
      },
    });

    this.toolsInitialized = true;
  }

  async run(task: string): Promise<AgentResult> {
    const startTime = Date.now();
    const steps: StepEvent[] = [];
    const actionsTaken: string[] = [];
    let finalResult = '';
    let success = false;
    this.cancelled = false;
    let iteration = 0;

    try {
      this.soul = loadSoul();

      if (this.memory) {
        await this.memory.onTurnStart();
      }

      this.addUserMessage(task);

      let done = false;

      while (iteration < this.maxIterations && !done && !this.cancelled) {
        iteration++;

        const systemPrompt = this.buildSystemPrompt(task, iteration);
        const messages = this.conversation.slice(-50); // Keep last 50 messages
        const tools = this.toolBus.getDefinitions();

        let response;
        try {
          response = await this.llmProvider.chat(messages, tools, systemPrompt);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error({ err: errorMsg, iteration }, 't800_agent_llm_failed');
          steps.push({
            phase: 'executing',
            action: 'llm_error',
            detail: errorMsg
          });
          finalResult = `LLM error: ${errorMsg}`;
          break;
        }

        if (response.tool_calls && response.tool_calls.length > 0) {
          for (const tc of response.tool_calls) {
            if (this.cancelled) break;

            const step: StepEvent = {
              phase: 'executing',
              action: tc.name,
              detail: JSON.stringify(tc.arguments),
            };
            steps.push(step);
            actionsTaken.push(tc.name);

            try {
              const result = await this.toolBus.execute(tc.name, tc.arguments);
              step.observation = result.success ? result.output : result.error;
              this.addToolResult(tc.id, tc.name,
                result.success ? result.output : result.error ?? 'Tool failed'
              );
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              step.observation = errMsg;
              this.addToolResult(tc.id, tc.name, `Error: ${errMsg}`);
            }
          }

          if (response.text) {
            this.addAssistantMessage(response.text);
          }
        } else {
          const text = response.text ?? '';
          finalResult = text;
          done = true;

          this.addAssistantMessage(text);

          steps.push({
            phase: 'done',
            action: 'response',
            detail: finalResult,
          });
        }

        if (!done && iteration < this.maxIterations && !this.cancelled) {
          // Simple reflection logic
          const recentSteps = steps.slice(-3);
          const failedSteps = recentSteps.filter((s) =>
            s.observation && typeof s.observation === 'string' && s.observation.includes('Error')
          );

          if (failedSteps.length >= 2) {
            this.addSystemMessage('Multiple errors detected. Consider trying alternative approach.');
          }
        }
      }

      if (!done && !finalResult && !this.cancelled) {
        finalResult = 'Max iterations reached without completion.';
      }

      success = !this.cancelled &&
                finalResult.length > 0 &&
                !finalResult.startsWith('Stopped:') &&
                !finalResult.startsWith('LLM error:');

      await this.runPostTask(task, finalResult, success);

    } catch (err) {
      if (this.cancelled) {
        finalResult = 'Task was cancelled';
        success = false;
      } else {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err: errorMsg }, 't800_agent_loop_error');
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
      iterations: iteration,
      strategy_used: 't800_agent',
      elapsed_secs: Math.round(elapsedSecs * 100) / 100,
    };
  }

  cancel(): void {
    this.cancelled = true;
  }

  getConversation(): Message[] {
    return [...this.conversation];
  }

  getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  async setWorkingDirectory(dir: string): Promise<void> {
    const { exec } = await import('node:child_process');
    await new Promise((resolve, reject) => {
      exec(`test -d "${dir}"`, (error: any) => {
        if (error) reject(new Error(`Directory does not exist: ${dir}`));
        else resolve(void 0);
      });
    });
    this.workingDirectory = dir;
  }

  private buildSystemPrompt(task: string, iteration: number): string {
    const parts: string[] = [];

    if (this.soul) {
      parts.push(this.soul);
    }

    parts.push('\nT-800 Agent - Direct Task Execution');
    parts.push(`Iteration: ${iteration}/${this.maxIterations}`);
    parts.push(`Workspace: ${this.workingDirectory}`);

    parts.push('\nAvailable Tools:');
    parts.push('1. Browser - Web automation (navigate, click, fill forms, screenshots)');
    parts.push('2. Shell - Execute shell commands');
    parts.push('3. File - Read, write, list, create, delete, move, search files');
    parts.push('4. Web - Fetch URLs, search the web');
    parts.push('5. Skills - Manage and execute skills');
    parts.push('6. Document - Extract text from PDF, DOCX, images; convert documents');
    parts.push('7. Coding - Edit files, search code, find references, verify syntax');

    if (this.memory) {
      const memoryContext = this.memory.context(task);
      if (memoryContext) {
        parts.push(`\nRelevant memories:\n${memoryContext}`);
      }
    }

    if (this.skillEngine) {
      const skillSummaries = this.skillEngine.getSkillSummaries();
      if (skillSummaries && skillSummaries !== 'No skills available.') {
        parts.push(`\nAvailable skills:\n${skillSummaries}`);
      }
    }

    parts.push('\nSelect the appropriate tool for each step of the task. Use tools efficiently to complete the task.');

    return parts.join('\n');
  }

  private async runPostTask(
    task: string,
    result: string,
    success: boolean
  ): Promise<void> {
    try {
      if (this.memory && success) {
        this.memory.write('memory', `Task: ${task}\nResult: ${result.slice(0, 500)}`, {
          category: 't800_task',
          success
        });
      }

      if (this.memory) {
        await this.memory.onSessionEnd();
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'kimi_agent_post_task_error');
    }
  }

  private addUserMessage(content: string): void {
    this.conversation.push({ role: 'user', content });
  }

  private addAssistantMessage(content: string): void {
    this.conversation.push({ role: 'assistant', content });
  }

  private addSystemMessage(content: string): void {
    this.conversation.push({ role: 'system', content });
  }

  private addToolResult(toolCallId: string, toolName: string, content: string): void {
    this.conversation.push({
      role: 'tool',
      content: JSON.stringify({ tool_call_id: toolCallId, name: toolName, content }),
    } as any);
  }
}
