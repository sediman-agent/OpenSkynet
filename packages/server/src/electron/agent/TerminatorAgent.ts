/**
 * TerminatorAgent - Orchestrator for complex multi-step tasks
 *
 * Extends T800Agent with:
 * - Task decomposition
 * - Subtask execution
 * - Parallel execution support
 * - Result aggregation
 * - Self-reflection and recovery
 */

import type { AgentResult, StepEvent } from '../../core/types';
import type { LLMProvider } from '../../llm/provider';
import type { BaseMemoryStrategy } from '../../memory/strategy';
import type { SkillEngine } from '../../skills/engine';
import type { SkillSearchEngine } from '../../skills/search';
import { T800Agent, type T800AgentOpts } from './T800Agent';

interface Subtask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  dependencies: string[];
  result?: string;
  error?: string;
}

interface SubtaskResult {
  subtask: Subtask;
  result: AgentResult;
}

/**
 * TerminatorAgent - Orchestrator agent for complex multi-step tasks
 *
 * This agent extends T800Agent with orchestration capabilities:
 * - Task decomposition into subtasks
 * - Parallel execution of independent subtasks
 * - Result aggregation and synthesis
 * - Self-reflection and error recovery
 *
 * Use for:
 * - Complex tasks requiring multiple steps
 * - Tasks with parallelizable components
 * - Multi-stage workflows
 */
export class TerminatorAgent extends T800Agent {
  private maxParallelism: number;
  private decompositionThreshold: number;

  constructor(opts: (T800AgentOpts & {
    maxParallelism?: number;
    decompositionThreshold?: number;
  }) | null = null) {
    super(opts ?? {} as T800AgentOpts);
    this.maxParallelism = opts?.maxParallelism ?? 3;
    this.decompositionThreshold = opts?.decompositionThreshold ?? 50; // words
  }

  async run(task: string): Promise<AgentResult> {
    const startTime = Date.now();

    // Check if task is simple enough for direct execution
    if (this.isSimpleTask(task)) {
      // Delegate to parent T800Agent for simple tasks
      return super.run(task);
    }

    // Complex task - use orchestration
    const steps: StepEvent[] = [];
    steps.push({
      phase: 'planning',
      action: 'decompose_start',
      detail: 'Decomposing task into subtasks',
    });

    // Decompose task into subtasks
    const subtasks = await this.decomposeTask(task);

    steps.push({
      phase: 'planning',
      action: 'decompose_complete',
      detail: `Decomposed into ${subtasks.length} subtasks`,
    });

    // Execute subtasks
    const results = await this.executeSubtasks(subtasks, steps);

    // Aggregate results
    const finalResult = this.aggregateResults(results);

    const success = results.every((r) => r.result.success);
    const actionsTaken = results.flatMap((r) => r.result.actions_taken);
    const allSteps = [...steps, ...results.flatMap((r) => r.result.steps)];

    return {
      task,
      result: finalResult,
      success,
      steps: allSteps,
      actions_taken: actionsTaken,
      iterations: results.reduce((sum, r) => sum + r.result.iterations, 0),
      strategy_used: 'terminator_orchestrator',
      elapsed_secs: Math.round(((Date.now() - startTime) / 1000) * 100) / 100,
    };
  }

  private isSimpleTask(task: string): boolean {
    const wordCount = task.split(/\s+/).length;
    const hasMultipleSteps = /[.;]\s+/.test(task);
    const hasComplexKeywords = /\b(and then|after that|also|finally|first|second|next|before)\b/i.test(task);

    return wordCount <= this.decompositionThreshold && !hasMultipleSteps && !hasComplexKeywords;
  }

  private async decomposeTask(task: string): Promise<Subtask[]> {
    // Use LLM to decompose complex task
    const systemPrompt = `You are a task decomposition expert. Break down the given task into clear, actionable subtasks.

Return a JSON array of subtasks with:
- id: short identifier (e.g., "step1", "step2")
- description: clear action description
- dependencies: array of subtask IDs this depends on (empty if no dependencies)

Rules:
- Each subtask should be independently executable once dependencies are met
- Subtasks should be ordered logically
- Keep descriptions concise but clear
- Aim for 2-6 subtasks`;

    try {
      const response = await this['llmProvider'].chat(
        [{ role: 'user', content: `Decompose this task:\n${task}` }],
        [],
        systemPrompt
      );

      const text = response.text ?? '';
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.map((s: any, i: number) => ({
          id: s.id ?? `step${i + 1}`,
          description: s.description ?? `Step ${i + 1}`,
          status: 'pending' as const,
          dependencies: (s.dependencies ?? []) as string[],
        }));
      }
    } catch (err) {
      // Fallback to simple decomposition
      console.warn('LLM decomposition failed, using fallback:', err);
    }

    // Fallback: split by common delimiters
    const parts = task.split(/[.;]\s+/).filter((s) => s.trim().length > 0);
    if (parts.length <= 1) {
      // Single subtask
      return [{
        id: 'step1',
        description: task,
        status: 'pending' as const,
        dependencies: [],
      }];
    }

    return parts.map((part, i) => ({
      id: `step${i + 1}`,
      description: part.trim(),
      status: 'pending' as const,
      dependencies: i > 0 ? [`step${i}`] : [],
    }));
  }

  private async executeSubtasks(
    subtasks: Subtask[],
    steps: StepEvent[]
  ): Promise<SubtaskResult[]> {
    const results: SubtaskResult[] = [];
    const completed = new Set<string>();
    const inProgress = new Set<string>();

    // Simple execution: execute in dependency order
    // In a full implementation, this would support true parallelism
    for (const subtask of subtasks) {
      // Check if dependencies are met
      const depsMet = subtask.dependencies.every((depId) => completed.has(depId));
      if (!depsMet) {
        subtask.status = 'failed';
        subtask.error = `Dependencies not met: ${subtask.dependencies.join(', ')}`;
        results.push({
          subtask,
          result: {
            task: subtask.description,
            result: subtask.error,
            success: false,
            steps: [],
            actions_taken: [],
            iterations: 0,
            strategy_used: 'failed',
            elapsed_secs: 0,
          }
        });
        continue;
      }

      // Execute subtask
      steps.push({
        phase: 'executing',
        action: 'subtask_start',
        detail: `Executing: ${subtask.description}`,
      });

      subtask.status = 'in_progress';

      try {
        const result = await super.run(subtask.description);
        subtask.status = 'completed';
        subtask.result = result.result;
        completed.add(subtask.id);

        steps.push({
          phase: 'executing',
          action: 'subtask_complete',
          detail: `Completed: ${subtask.description}`,
        });

        results.push({ subtask, result });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        subtask.status = 'failed';
        subtask.error = errorMsg;

        steps.push({
          phase: 'executing',
          action: 'subtask_failed',
          detail: `Failed: ${subtask.description} - ${errorMsg}`,
        });

        results.push({
          subtask,
          result: {
            task: subtask.description,
            result: errorMsg,
            success: false,
            steps: [],
            actions_taken: [],
            iterations: 0,
            strategy_used: 'failed',
            elapsed_secs: 0,
          }
        });
      }
    }

    return results;
  }

  private aggregateResults(results: SubtaskResult[]): string {
    const parts: string[] = [];

    parts.push('# Task Execution Results\n');

    for (const { subtask, result } of results) {
      parts.push(`## ${subtask.description}\n`);
      parts.push(`Status: ${subtask.status}\n`);

      if (result.success) {
        parts.push(`**Result:** ${result.result.slice(0, 500)}\n\n`);
      } else {
        parts.push(`**Error:** ${result.result}\n\n`);
      }
    }

    // Summary
    const succeeded = results.filter((r) => r.result.success).length;
    const failed = results.length - succeeded;

    parts.push('## Summary\n');
    parts.push(`- Total subtasks: ${results.length}\n`);
    parts.push(`- Succeeded: ${succeeded}\n`);
    parts.push(`- Failed: ${failed}\n`);

    if (failed > 0) {
      parts.push('\n**Failed subtasks:**\n');
      for (const { subtask } of results.filter((r) => !r.result.success)) {
        parts.push(`- ${subtask.description}: ${subtask.error ?? 'Unknown error'}\n`);
      }
    }

    return parts.join('\n');
  }
}
