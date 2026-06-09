/**
 * Task Planner - Simplified
 *
 * Refactored from 352 lines to ~150 lines
 * Execution order calculation extracted to ExecutionOrderCalculator
 * Plan execution extracted to PlanExecutor
 * Plan analysis extracted to PlanAnalyzer
 */

import { createLogger } from '../../core/logging';
import type { LLMProvider } from '../../llm/provider';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

// Re-export types
export type { SubTask, TaskPlan, SubTaskResult };

// Import extracted modules
import { ExecutionOrderCalculator } from './execution/index.js';
import { PlanExecutor } from './execution/index.js';
import { PlanAnalyzer } from './analysis/index.js';

const logger = createLogger('task-planner');

// ============================================================================
// Type Definitions
// ============================================================================

export interface SubTask {
  id: string;
  description: string;
  dependencies: string[];
  canParallelize: boolean;
  difficulty: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  result?: any;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskPlan {
  original: string;
  subtasks: SubTask[];
  executionOrder: string[][];
  estimatedIterations: number;
  reasoning: string;
  estimatedDuration?: number;
}

export interface SubTaskResult {
  subtaskId: string;
  success: boolean;
  result?: any;
  error?: string;
  duration: number;
}

// ============================================================================
// Zod Schemas
// ============================================================================

const SubTaskSchema = z.object({
  description: z.string().min(1),
  dependencies: z.array(z.string()).default([]),
  canParallelize: z.boolean().default(false),
  difficulty: z.number().min(1).max(5).default(3)
});

const TaskDecompositionOutputSchema = z.object({
  subtasks: z.array(SubTaskSchema).min(1).max(20),
  estimatedIterations: z.number().min(1),
  reasoning: z.string()
});

// ============================================================================
// Task Planner (Simplified)
// ============================================================================

/**
 * Task Planner coordinates task decomposition and execution
 * This is the simplified main file that delegates to specialized modules
 */
export class TaskPlanner {
  private orderCalculator: ExecutionOrderCalculator;
  private planExecutor: PlanExecutor;
  private planAnalyzer: PlanAnalyzer;

  constructor(private llm: LLMProvider) {
    this.orderCalculator = new ExecutionOrderCalculator();
    this.planExecutor = new PlanExecutor();
    this.planAnalyzer = new PlanAnalyzer();
    logger.info('[TaskPlanner] Initialized');
  }

  /**
   * Decompose complex task into subtasks
   */
  async decompose(task: string): Promise<TaskPlan> {
    logger.info({ task }, '[TaskPlanner] Decomposing task');

    const systemPrompt = `You are a task planning expert. Break down complex tasks into clear, executable subtasks.

<rules>
1. Each subtask should be specific and actionable
2. Identify dependencies between subtasks
3. Mark subtasks that can run in parallel
4. Estimate difficulty (1=easy, 5=hard)
5. Provide reasoning for your decomposition
</rules>

<output_format>
Respond with JSON matching this schema:
{
  "subtasks": [
    {
      "description": "Specific actionable step",
      "dependencies": ["id1", "id2"], // Empty if no dependencies
      "canParallelize": true/false,
      "difficulty": 1-5
    }
  ],
  "estimatedIterations": total_estimate,
  "reasoning": "Why you decomposed this way"
}
</output_format>`;

    try {
      const response = await this.llm.chat(
        [{ role: 'user', content: `Break this task into subtasks: "${task}"` }],
        [],
        systemPrompt
      );

      // Parse and validate response
      const data = await this.parseDecompositionResponse(response);

      // Create subtask objects
      const subtasks: SubTask[] = (data.subtasks || []).map((st: any, i: number) => ({
        id: `subtask-${randomUUID().slice(0, 8)}`,
        description: st.description,
        dependencies: st.dependencies || [],
        canParallelize: st.canParallelize || false,
        difficulty: st.difficulty || 3,
        status: 'pending' as const
      }));

      // Calculate execution order
      const executionOrder = this.orderCalculator.calculateExecutionOrder(subtasks);

      const plan: TaskPlan = {
        original: task,
        subtasks,
        executionOrder,
        estimatedIterations: data.estimatedIterations || subtasks.length * 3,
        reasoning: data.reasoning || 'Task decomposition complete'
      };

      logger.info({
        subtaskCount: subtasks.length,
        parallelGroups: executionOrder.length
      }, '[TaskPlanner] Task decomposed');

      return plan;
    } catch (error) {
      logger.error({ err: error as Error }, '[TaskPlanner] Decomposition failed');

      // Fallback to single subtask
      return this.createFallbackPlan(task);
    }
  }

  /**
   * Parse decomposition response
   */
  private async parseDecompositionResponse(response: any): Promise<any> {
    let parsed: any;
    try {
      parsed = JSON.parse(response.text || '{}');
    } catch {
      // If not JSON, try to extract JSON from response
      const jsonMatch = (response.text || '').match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not extract JSON from response');
      }
    }

    // Validate against schema
    const validated = TaskDecompositionOutputSchema.safeParse(parsed);
    if (!validated.success) {
      logger.warn({ errors: validated.error.errors }, '[TaskPlanner] Validation failed, using raw data');
    }

    return validated.success ? validated.data : parsed;
  }

  /**
   * Create fallback plan when decomposition fails
   */
  private createFallbackPlan(task: string): TaskPlan {
    return {
      original: task,
      subtasks: [{
        id: `subtask-${randomUUID().slice(0, 8)}`,
        description: task,
        dependencies: [],
        canParallelize: false,
        difficulty: 3,
        status: 'pending'
      }],
      executionOrder: [['fallback']],
      estimatedIterations: 10,
      reasoning: 'Fallback to single subtask due to decomposition failure'
    };
  }

  /**
   * Execute plan with parallel execution where possible
   */
  async executePlan(
    plan: TaskPlan,
    executor: (subtask: SubTask) => Promise<any>
  ): Promise<SubTaskResult[]> {
    return this.planExecutor.executePlan(plan, executor);
  }

  /**
   * Get plan statistics
   */
  getPlanStats(plan: TaskPlan): ReturnType<PlanAnalyzer['getPlanStats']> {
    return this.planAnalyzer.getPlanStats(plan);
  }

  /**
   * Check if task needs decomposition
   */
  shouldDecompose(task: string): boolean {
    return this.planAnalyzer.shouldDecompose(task);
  }

  /**
   * Get complexity score
   */
  getComplexityScore(task: string): number {
    return this.planAnalyzer.getComplexityScore(task);
  }

  /**
   * Validate plan integrity
   */
  validatePlan(plan: TaskPlan): ReturnType<PlanAnalyzer['validatePlan']> {
    return this.planAnalyzer.validatePlan(plan);
  }
}

/**
 * Create task planner
 */
export function createTaskPlanner(llm: LLMProvider): TaskPlanner {
  return new TaskPlanner(llm);
}

// Re-export classes for direct use
export { ExecutionOrderCalculator, PlanExecutor, PlanAnalyzer };
