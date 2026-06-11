/**
 * Turbo Executor Module
 * Handles turbo/fast execution path for simple tasks
 */

import type { LLMProvider } from '../../llm/provider';
import type { ToolBus } from '../tools/bus';
import type { AgentResult, StepEvent } from '../../core/types';
import type { Message } from '../../llm/provider';
import { InterruptSignal } from '../core/interrupt';
import { ProgressTracker } from '../memory/progress';
import { StreamEmitter } from '../streaming';
import logger from '../../core/logging';
import { getConfig } from '../../core/config';

export interface TurboExecutorOptions {
  llmProvider: LLMProvider;
  toolBus: ToolBus;
  interrupt: InterruptSignal;
  progress: ProgressTracker;
  streamEmitter: StreamEmitter;
  memory?: any;
}

export interface TurboExecutionResult {
  success: boolean;
  result?: AgentResult;
  reason?: string;
}

/**
 * Execute task in turbo mode (simplified execution for simple tasks)
 */
export async function executeTurboPath(
  task: string,
  conversation: Message[],
  opts: TurboExecutorOptions
): Promise<TurboExecutionResult> {
  const config = getConfig();
  const { llmProvider, toolBus, interrupt, progress, streamEmitter, memory } = opts;

  logger.info('[TurboExecutor] Attempting turbo path for task');

  // Check if turbo mode is enabled (default to true for now)
  const enableTurboMode = (config as any).enableTurboMode ?? true;
  if (!enableTurboMode) {
    return { success: false, reason: 'Turbo mode not enabled' };
  }

  // Check if task is simple enough for turbo path
  const isSimple = isTaskSimple(task);
  if (!isSimple) {
    return { success: false, reason: 'Task too complex for turbo path' };
  }

  try {
    // Build simplified system prompt for turbo execution
    const systemPrompt = buildTurboSystemPrompt();

    // Build user message
    const userMessage: Message = {
      role: 'user',
      content: `<task>${task}</task>\n\nExecute this task directly and efficiently.`
    };

    // Get available tools
    const tools = toolBus.getDefinitions();

    // Call LLM with simplified context
    const response = await llmProvider.chat(
      [{ role: 'system', content: systemPrompt }, userMessage],
      tools
    );

    // Check for tool calls
    if (response.tool_calls && response.tool_calls.length > 0) {
      logger.info(`[TurboExecutor] Got ${response.tool_calls.length} tool calls`);

      // Execute tools directly
      const toolResults: Array<{ success: boolean; output: string }> = [];

      for (const toolCall of response.tool_calls) {
        interrupt.check();

        const toolName = toolCall.name || (typeof toolCall.function?.name === 'string' ? toolCall.function.name : '');
        const toolArgs = toolCall.arguments || (typeof toolCall.function?.arguments === 'string' ? JSON.parse(toolCall.function.arguments) : {});

        streamEmitter.emitStepStart('executing', toolName, JSON.stringify(toolArgs));
        progress.update(1, 5);

        const result = await toolBus.execute(toolName, toolArgs);
        toolResults.push(result);

        streamEmitter.emitStepComplete('executing', toolName, result.output, result.success);

        if (!result.success) {
          logger.warn(`[TurboExecutor] Tool ${toolName} failed: ${result.error}`);
        }
      }

      // Build final result
      const finalOutput = toolResults.map(r => r.output).join('\n');
      const allSuccessful = toolResults.every(r => r.success);

      // Add assistant response to conversation
      conversation.push({
        role: 'assistant',
        content: response.text || 'Executing task...',
        tool_calls: response.tool_calls
      });

      // Add tool results to conversation
      toolResults.forEach((result, idx) => {
        conversation.push({
          role: 'tool',
          tool_call_id: response.tool_calls![idx].id || `call_${idx}`,
          content: result.success ? result.output : 'Tool failed',
          name: response.tool_calls![idx].name
        });
      });

      const steps: StepEvent[] = toolResults.map((r, idx) => ({
        phase: 'executing',
        action: response.tool_calls![idx].name || '',
        detail: r.output,
        observation: r.success ? 'success' : 'failure'
      }));

      const agentResult: AgentResult = {
        task: '',
        result: allSuccessful ? finalOutput : 'Task completed with some errors',
        success: allSuccessful,
        steps,
        actions_taken: response.tool_calls!.map(tc => tc.name || ''),
        iterations: 1,
        strategy_used: 'turbo',
        elapsed_secs: 0
      };

      if (memory) {
        await memory.onTurnEnd();
      }

      return { success: true, result: agentResult };
    }

    // No tool calls - treat as text-only response
    if (response.text) {
      conversation.push({
        role: 'assistant',
        content: response.text
      });

      const agentResult: AgentResult = {
        task: '',
        result: response.text,
        success: true,
        steps: [],
        actions_taken: [],
        iterations: 1,
        strategy_used: 'turbo',
        elapsed_secs: 0
      };

      return { success: true, result: agentResult };
    }

    return { success: false, reason: 'No tool calls or text response from LLM' };
  } catch (error) {
    logger.error(`[TurboExecutor] Turbo path failed: ${error instanceof Error ? error.message : String(error)}`);
    return { success: false, reason: `Turbo execution failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Check if task is simple enough for turbo path
 */
function isTaskSimple(task: string): boolean {
  const config = getConfig();
  const maxLength = (config as any).turboMaxTaskLength || 200;

  if (task.length > maxLength) return false;

  // Check for complex keywords
  const complexKeywords = ['analyze', 'research', 'compare', 'evaluate', 'investigate'];
  const lowerTask = task.toLowerCase();

  if (complexKeywords.some(kw => lowerTask.includes(kw))) {
    return false;
  }

  return true;
}

/**
 * Build simplified system prompt for turbo execution
 */
function buildTurboSystemPrompt(): string {
  return `You are an efficient AI assistant. Execute the given task directly and quickly.

<turbo_mode>
- Think briefly and act decisively
- Use tools when appropriate
- Provide concise results
- Skip extensive explanations unless requested
</turbo_mode>

<execution>
1. Understand the task
2. Choose the right tool(s)
3. Execute efficiently
4. Report results concisely
</execution>`;
}
