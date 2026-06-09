/**
 * Agent Coordinator Module
 * Main orchestration logic for browser agent execution loop
 */

import type { StepEvent } from '../../core/types';
import type { LLMProvider } from '../../llm/provider';
import type { ToolBus } from '../tools/bus';
import type { ParsedAgentResponse } from '../schemas/parser';
import { StreamEmitter } from '../streaming';
import { buildSystemPrompt } from './system-prompt-builder';

// ============================================================================
// Types
// ============================================================================

export interface AgentCoordinatorOpts {
  llmProvider: LLMProvider;
  toolBus: ToolBus;
  maxIterations: number;
  systemPrompt: string;
  agentMemory: string;
  conversation: any[];
  cancelled: boolean;
  useVision: boolean;
  browserController?: any;
}

export interface ExecutionResult {
  success: boolean;
  finalResult: string;
  actionsTaken: string[];
  iterations: number;
  conversation: any[];
  consecutiveFailures?: number;
}

export interface ToolExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  consecutiveFailures: number;
}

// ============================================================================
// Main Loop Orchestration
// ============================================================================

/**
 * Execute the main agent loop with retry logic
 */
export async function executeAgentLoop(
  opts: AgentCoordinatorOpts,
  task: string,
  parseAgentResponse: (text: string, toolCalls?: any[]) => ParsedAgentResponse,
  captureState: () => Promise<any>,
  buildStateMessage: (task: string, state: any, screenshot: string | null, url: string) => any,
  executeToolCall: (toolName: string, toolArgs: any, actionsTaken: string[], iteration: number) => Promise<ToolExecutionResult>,
  streamEmitter: StreamEmitter,
  steps: StepEvent[]
): Promise<ExecutionResult> {
  let { conversation, cancelled, maxIterations, agentMemory, useVision, browserController } = opts;

  const actionsTaken: string[] = [];
  let finalResult = '';
  let success = false;
  let iteration = 0;
  let consecutiveFailures = 0;

  try {
    // Initial state capture
    streamEmitter.emitProgress(0, maxIterations, 'capturing initial state');

    const initialState = await captureState();
    const initialMsg = buildStateMessage(
      task,
      initialState.output,
      initialState.screenshot,
      initialState.url
    );
    conversation.push(initialMsg);

    streamEmitter.emitProgress(0, maxIterations, 'starting');

    const TOOLS = opts.toolBus.getDefinitions();

    // Main execution loop
    while (iteration < maxIterations && !cancelled) {
      iteration++;
      streamEmitter.emitProgress(iteration, maxIterations, 'thinking');

      // Build messages for LLM
      const messages: any[] = [
        { role: 'system', content: opts.systemPrompt },
        ...conversation,
      ];

      // Call LLM with retry logic
      let response;
      let llmRetries = 0;
      while (llmRetries < 3) {
        try {
          response = await opts.llmProvider.chat(messages, TOOLS, opts.systemPrompt);
          break;
        } catch (error: any) {
          llmRetries++;
          console.log(`[AgentCoordinator] LLM error (attempt ${llmRetries}/3):`, error.message);

          if (consecutiveFailures >= 3 && llmRetries >= 3) {
            return {
              success: false,
              finalResult: `LLM failed after ${llmRetries} retries and ${consecutiveFailures} consecutive tool failures`,
              actionsTaken,
              iterations: iteration,
              conversation,
              consecutiveFailures
            };
          }

          await new Promise(r => setTimeout(r, 1000 * llmRetries));
        }
      }

      if (!response) {
        finalResult = 'No response from LLM';
        break;
      }

      // Parse structured output
      const parsed = parseAgentResponse(response.text || '');

      // Update agent memory
      if (parsed.memory) {
        agentMemory = parsed.memory;
      }

      // Log thinking and evaluation
      if (parsed.thinking) {
        console.log(`[AgentCoordinator] Thinking: ${parsed.thinking.slice(0, 150)}...`);
        streamEmitter.emitThinking(parsed.thinking, 'thinking');
      }

      // Add assistant response to conversation
      conversation.push({
        role: 'assistant',
        content: response.text || '',
      });

      // Check for browser_end completion
      const lastAction = actionsTaken[actionsTaken.length - 1];
      if (lastAction?.includes('browser_end')) {
        finalResult = response.text || 'Task completed (browser_end called)';
        success = true;
        break;
      }

      // Check for natural completion with done=true
      if ((response.done || parsed.done) && !response.tool_calls?.length) {
        const hasContent = response.text && response.text.length > 50;
        const isSuccess = parsed.evaluationPreviousGoal?.toLowerCase().includes('success');

        if (hasContent || isSuccess) {
          finalResult = response.text || 'Task completed';
          success = isSuccess || actionsTaken.length > 0;
          break;
        }

        console.log('[AgentCoordinator] LLM paused without completion - continuing loop');
      }

      // Execute tool calls
      if (response.tool_calls && response.tool_calls.length > 0) {
        const toolResult = await executeToolCalls(
          response.tool_calls,
          actionsTaken,
          iteration,
          consecutiveFailures,
          executeToolCall,
          streamEmitter,
          steps
        );

        consecutiveFailures = toolResult.consecutiveFailures;

        // Capture new state after tool execution
        if (!cancelled && browserController) {
          await new Promise(r => setTimeout(r, 500));

          const newState = await captureState();
          let stateMsg = buildStateMessage(
            `Continue working on: ${task}`,
            newState.output,
            newState.screenshot,
            newState.url
          );

          // Inject action results
          stateMsg = injectActionResults(stateMsg, toolResult.combinedOutput);
          conversation.push(stateMsg);

          // Check if browser_end was called
          if (actionsTaken.some(a => a.includes('browser_end'))) {
            console.log('[AgentCoordinator] Agent called browser_end - stopping loop');
            finalResult = toolResult.combinedOutput || 'Task completed (browser_end called)';
            success = true;
            break;
          }

          // Inject reflection for consecutive failures
          if (!toolResult.anySuccess && consecutiveFailures >= 3) {
            conversation.push({
              role: 'user',
              content: '<reflection>\nMultiple consecutive failures. The previous actions did not succeed. Examine the SCREENSHOT carefully to understand the actual page state. Try a completely different approach.\n</reflection>',
            });
          }
        } else {
          // No tool calls - prompt to continue
          conversation.push({
            role: 'user',
            content: 'Please continue. Take the next action to complete the task.',
          });
        }

        // Budget warning
        if (iteration >= maxIterations * 0.75) {
          conversation.push({
            role: 'user',
            content: `<budget_warning>You have used ${iteration}/${maxIterations} steps. Focus on the most important remaining items and wrap up soon.</budget_warning>`,
          });
        }
      }
    }

    if (!finalResult && !cancelled) {
      finalResult = agentMemory || `Completed ${actionsTaken.length} actions`;
      success = actionsTaken.length > 0;
    }

    return {
      success,
      finalResult,
      actionsTaken,
      iterations: iteration,
      conversation,
      consecutiveFailures
    };
  } catch (error) {
    console.error('[AgentCoordinator] Fatal error:', error);
    return {
      success: false,
      finalResult: error instanceof Error ? error.message : String(error),
      actionsTaken,
      iterations: iteration,
      conversation,
      consecutiveFailures: consecutiveFailures
    };
  }
}

/**
 * Execute multiple tool calls and return combined results
 */
async function executeToolCalls(
  toolCalls: any[],
  actionsTaken: string[],
  iteration: number,
  consecutiveFailures: number,
  executeToolCall: (toolName: string, toolArgs: any, actionsTaken: string[], iteration: number) => Promise<ToolExecutionResult>,
  streamEmitter: StreamEmitter,
  steps: StepEvent[]
): Promise<ToolExecutionResult> {
  let anySuccess = false;
  let combinedOutput = '';

  for (const toolCall of toolCalls) {
    const result = await executeToolCall(
      toolCall.name,
      toolCall.arguments || {},
      actionsTaken,
      iteration
    );

    if (result.success) {
      anySuccess = true;
      combinedOutput += `[${toolCall.name}]: ${result.output || 'Success'}\n`;
    } else {
      combinedOutput += `[${toolCall.name}] FAILED: ${result.error || 'Unknown error'}\n`;
    }
  }

  return {
    anySuccess,
    combinedOutput,
    consecutiveFailures
  };
}

/**
 * Inject action results into state message
 */
function injectActionResults(
  stateMsg: any,
  combinedOutput: string
): any {
  if (typeof stateMsg.content === 'string') {
    stateMsg.content = `<action_results>\n${combinedOutput.trim()}\n</action_results>\n\n${stateMsg.content}`;
  } else if (Array.isArray(stateMsg.content)) {
    const textPart = stateMsg.content.find((p: any) => p.type === 'text');
    if (textPart && 'text' in textPart) {
      textPart.text = `<action_results>\n${combinedOutput.trim()}\n</action_results>\n\n${textPart.text}`;
    }
  }

  return stateMsg;
}
