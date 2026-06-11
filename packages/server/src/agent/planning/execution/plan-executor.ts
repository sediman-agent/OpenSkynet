/**
 * Plan Executor
 * Executes task plans with parallel execution support
 */

import type { SubTask, SubTaskResult, TaskPlan } from '../task-planner.js';
import { createLogger } from '../../../../core/logging';

const logger = createLogger('PlanExecutor');

/**
 * Plan Executor handles execution of task plans with parallelization
 * This is extracted from agent/planning/task-planner.ts
 */
export class PlanExecutor {
  /**
   * Execute plan with parallel execution where possible
   */
  async executePlan(
    plan: TaskPlan,
    executor: (subtask: SubTask) => Promise<any>
  ): Promise<SubTaskResult[]> {
    logger.info({ subtaskCount: plan.subtasks.length }, '[PlanExecutor] Executing plan');

    const results: Map<string, SubTaskResult> = new Map();

    for (const group of plan.executionOrder) {
      logger.info({ groupSize: group.length, parallel: group.length > 1 }, '[PlanExecutor] Executing group');

      // Execute group (potentially in parallel)
      const groupResults = await this.executeGroup(group, plan.subtasks, executor);

      // Store results
      for (const result of groupResults) {
        results.set(result.subtaskId, result);
      }

      // Check if we should continue
      const failedCount = [...results.values()].filter(r => !r.success).length;
      if (failedCount > group.length / 2) {
        logger.warn({ failedCount }, '[PlanExecutor] Too many failures, stopping execution');
        break;
      }
    }

    return [...results.values()];
  }

  /**
   * Execute a group of subtasks in parallel
   */
  private async executeGroup(
    group: string[],
    subtasks: SubTask[],
    executor: (subtask: SubTask) => Promise<any>
  ): Promise<SubTaskResult[]> {
    return Promise.all(
      group.map(async (id) => this.executeSubtask(id, subtasks, executor))
    );
  }

  /**
   * Execute a single subtask
   */
  private async executeSubtask(
    id: string,
    subtasks: SubTask[],
    executor: (subtask: SubTask) => Promise<any>
  ): Promise<SubTaskResult> {
    const subtask = subtasks.find(st => st.id === id);
    if (!subtask) {
      return {
        subtaskId: id,
        success: false,
        error: 'Subtask not found',
        duration: 0
      };
    }

    subtask.status = 'in_progress';
    subtask.startedAt = Date.now();

    try {
      const result = await executor(subtask);

      subtask.status = 'completed';
      subtask.completedAt = Date.now();
      subtask.result = result;

      const duration = (subtask.completedAt - subtask.startedAt) / 1000;

      logger.info({ id, duration }, '[PlanExecutor] Subtask completed');

      return {
        subtaskId: id,
        success: true,
        result,
        duration
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      subtask.status = 'failed';
      subtask.completedAt = Date.now();
      subtask.error = errMsg;

      logger.error({ id, error: errMsg }, '[PlanExecutor] Subtask failed');

      return {
        subtaskId: id,
        success: false,
        error: errMsg,
        duration: (subtask.completedAt - (subtask.startedAt || Date.now())) / 1000
      };
    }
  }

  /**
   * Get execution summary
   */
  getExecutionSummary(results: SubTaskResult[]): {
    total: number;
    successful: number;
    failed: number;
    totalDuration: number;
    avgDuration: number;
  } {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => r.success === false).length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const avgDuration = results.length > 0 ? totalDuration / results.length : 0;

    return {
      total: results.length,
      successful,
      failed,
      totalDuration,
      avgDuration
    };
  }

  /**
   * Check if execution can continue based on results so far
   */
  shouldContinueExecution(
    results: SubTaskResult[],
    currentGroupSize: number,
    failureThreshold: number = 0.5
  ): boolean {
    const failedCount = results.filter(r => !r.success).length;
    const failureRate = failedCount / (results.length + currentGroupSize);

    return failureRate < failureThreshold;
  }

  /**
   * Get failed subtasks
   */
  getFailedSubtasks(results: SubTaskResult[]): SubTaskResult[] {
    return results.filter(r => !r.success);
  }

  /**
   * Retry failed subtasks
   */
  async retryFailed(
    results: SubTaskResult[],
    subtasks: SubTask[],
    executor: (subtask: SubTask) => Promise<any>,
    maxRetries: number = 3
  ): Promise<SubTaskResult[]> {
    const failed = this.getFailedSubtasks(results);
    const retryResults: SubTaskResult[] = [];

    for (const result of failed) {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const subtask = subtasks.find(st => st.id === result.subtaskId);
        if (!subtask) continue;

        // Reset subtask status
        subtask.status = 'pending';
        subtask.startedAt = undefined;
        subtask.completedAt = undefined;
        subtask.error = undefined;

        logger.info({ subtaskId: result.subtaskId, attempt }, '[PlanExecutor] Retrying subtask');

        const retryResult = await this.executeSubtask(result.subtaskId, subtasks, executor);
        retryResults.push(retryResult);

        if (retryResult.success) {
          logger.info({ subtaskId: result.subtaskId }, '[PlanExecutor] Retry succeeded');
          break;
        }
      }
    }

    return retryResults;
  }
}
