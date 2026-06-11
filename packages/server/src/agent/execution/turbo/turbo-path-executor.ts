/**
 * Turbo Path Executor
 * Handles fast-path execution for simple tasks
 */

import type { LLMProvider } from '../../../llm/provider.js';
import type { ToolBus } from '../../tools/bus.js';
import type { AgentResult, StepEvent, ToolDefinition } from '../../../core/types.js';
import type { Message } from '../../../llm/provider.js';
import { createLogger } from '../../../core/logging.js';
import { takeBrowserScreenshot } from '../../tools/browser-tools.js';
import { setLatestScreenshot } from '../../../api/routes/browser.js';
import { ThinkTagParser } from '../loop.js';

const logger = createLogger('TurboPathExecutor');

export interface TurboPathContext {
  llmProvider: LLMProvider;
  toolBus: ToolBus;
  soul?: string;
  emitContent?: (chunk: string, isFinal: boolean) => void;
  emitStepStart?: (phase: 'planning' | 'executing' | 'done', action: string, detail: string) => void;
  emitStepComplete?: (phase: 'planning' | 'executing' | 'done', action: string, output: string, success: boolean) => void;
  saveSessionToDb?: (task: string, steps: string[], result: string, success: boolean) => Promise<void>;
}

/**
 * Executes tasks using turbo path for simple queries
 */
export class TurboPathExecutor {
  private thinkParser = new ThinkTagParser();

  constructor(private context: TurboPathContext) {}

  /**
   * Update the LLM provider dynamically
   */
  setLLMProvider(provider: LLMProvider): void {
    this.context.llmProvider = provider;
  }

  /**
   * Execute task using turbo path if applicable
   */
  async tryExecute(task: string): Promise<AgentResult | null> {
    // Exclude browser tasks from turbo path
    const toolDefinitions = this.context.toolBus.getDefinitions();
    const hasBrowserTools = toolDefinitions.some(tool => tool.name.startsWith('browser_'));
    if (hasBrowserTools) {
      logger.info('[TurboPath] Browser tools available - skipping turbo path');
      return null;
    }

    // Check if this is a browser task by keywords
    const lowerTask = task.toLowerCase();
    const browserKeywords = [
      "browse", "navigate", "click", "open website", "open page", "web page",
      "screenshot", "scroll", "visit", "go to", "search", "google", "find",
      "type", "input", "browser_navigate", "browser_click", "browser_type",
      "stock price", "quote", "ticker"
    ];

    if (browserKeywords.some(k => lowerTask.includes(k))) {
      logger.info('[TurboPath] Browser task detected - skipping turbo path');
      return null;
    }

    // Check if task is simple enough for turbo path
    if (!this.isSimple(task)) {
      logger.info('[TurboPath] Task too complex for turbo path');
      return null;
    }

    logger.info('[TurboPath] Executing task via turbo path');

    try {
      return await this.execute(task);
    } catch (error) {
      logger.error(`[TurboPath] Error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Execute task via turbo path
   */
  private async execute(task: string): Promise<AgentResult> {
    const tools = this.context.toolBus.getDefinitions();
    const systemPrompt = this.context.soul || '';
    const messages: Message[] = [{ role: 'user', content: task }];
    const allSteps: StepEvent[] = [];
    const maxToolRounds = 5;

    for (let toolRound = 0; toolRound < maxToolRounds; toolRound++) {
      logger.info(`[TurboPath] Round ${toolRound + 1}/${maxToolRounds}`);

      const response = await this.context.llmProvider.chatStreamWithTools(
        messages,
        tools,
        systemPrompt,
        (chunk) => {
          if (toolRound === 0) {
            this.context.emitContent?.(chunk, false);
          }
        }
      );

      logger.info(`[TurboPath] LLM response: hasText=${!!response.text}, toolCalls=${response.tool_calls?.length || 0}`);

      // If no tool calls, we're done
      if (!response.tool_calls || response.tool_calls.length === 0) {
        if (toolRound === 0 && response.text) {
          const parsed = this.thinkParser.parse(response.text);
          const result = this.createResult(task, parsed.visible || response.text, allSteps, []);
          await this.context.saveSessionToDb?.(task, [] as string[], result.result, result.success);
          return result;
        } else if (response.text) {
          this.context.emitContent?.(response.text, true);
          const result = this.createResult(task, response.text, allSteps, allSteps.map(s => s.action));
          await this.context.saveSessionToDb?.(task, allSteps.map(s => s.action), result.result, result.success);
          return result;
        }
        break;
      }

      // Format tool calls for conversation
      const formattedToolCalls = response.tool_calls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name || '',
          arguments: JSON.stringify(tc.arguments || {})
        }
      }));

      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: response.text || '',
        tool_calls: formattedToolCalls
      });

      // Execute tool calls
      for (const tc of response.tool_calls) {
        const step = await this.executeToolCall(tc);
        allSteps.push(step);

        const result = step.observation || '';
        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: tc.id
        });
      }

      // Check for browser actions and inject vision if needed
      const hasBrowserAction = response.tool_calls.some(tc => tc.name.startsWith('browser_'));
      if (hasBrowserAction) {
        await this.injectBrowserVision(messages);
      }
    }

    // Get final response after all tool rounds
    const finalResponse = await this.context.llmProvider.chatStreamWithTools(
      messages,
      tools,
      systemPrompt,
      (chunk) => {
        this.context.emitContent?.(chunk, true);
      }
    );

    return this.createResult(
      task,
      finalResponse.text || 'Task completed',
      allSteps,
      allSteps.map(s => s.action)
    );
  }

  /**
   * Execute a single tool call
   */
  private async executeToolCall(tc: any): Promise<StepEvent> {
    this.context.emitStepStart?.('executing', tc.name, JSON.stringify(tc.arguments));

    const step: StepEvent = {
      phase: 'executing',
      action: tc.name,
      detail: JSON.stringify(tc.arguments),
    };

    try {
      // Retry logic for browser actions
      let result;
      const maxRetries = tc.name.startsWith('browser_') ? 3 : 1;

      for (let retry = 0; retry < maxRetries; retry++) {
        try {
          result = await this.context.toolBus.execute(tc.name, tc.arguments);
          if (result.success) break;
          if (retry < maxRetries - 1) {
            await new Promise(r => setTimeout(r, 1000 * (retry + 1)));
          }
        } catch (execErr) {
          if (retry >= maxRetries - 1) throw execErr;
          await new Promise(r => setTimeout(r, 1000 * (retry + 1)));
        }
      }

      const obs = result?.success ? (result?.output ?? '') : (result?.error ?? '');
      step.observation = typeof obs === 'object' ? JSON.stringify(obs) : obs;

      this.context.emitStepComplete?.('executing', tc.name, step.observation || '', result?.success ?? false);

      return step;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      step.observation = message;
      this.context.emitStepComplete?.('executing', tc.name, message, false);
      return step;
    }
  }

  /**
   * Inject browser vision into messages
   */
  private async injectBrowserVision(messages: Message[]): Promise<void> {
    try {
      const screenshot = await takeBrowserScreenshot();
      if (screenshot && screenshot.length > 100) {
        let url = 'unknown';
        try {
          url = 'http://localhost:3001'; // Default URL for turbo path
        } catch {}

        setLatestScreenshot(screenshot, url);

        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: '[Browser screenshot after your last action. Current URL: ' + url + ']'
            },
            {
              type: 'image_url',
              image_url: { url: 'data:image/jpeg;base64,' + screenshot, detail: 'low' }
            }
          ]
        } as any);
      }
    } catch (error) {
      logger.debug(`[TurboPath] Failed to inject browser vision: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create result object
   */
  private createResult(
    task: string,
    resultText: string,
    steps: StepEvent[],
    actionsTaken: string[]
  ): AgentResult {
    return {
      task,
      result: resultText,
      success: true,
      steps,
      actions_taken: actionsTaken,
      iterations: 1,
      strategy_used: 'turbo',
      elapsed_secs: 0
    };
  }

  /**
   * Check if task is simple enough for turbo path
   */
  private isSimple(task: string): boolean {
    const wordCount = task.split(/\s+/).length;
    return wordCount <= 15 && !/[;|&]/.test(task);
  }
}

/**
 * Factory function to create a turbo path executor
 */
export function createTurboPathExecutor(context: TurboPathContext): TurboPathExecutor {
  return new TurboPathExecutor(context);
}
