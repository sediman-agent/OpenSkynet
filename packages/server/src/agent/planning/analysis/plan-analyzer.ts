/**
 * Plan Analyzer
 * Analyzes task plans and provides statistics
 */

import type { SubTask, TaskPlan } from '../task-planner.js';

/**
 * Plan Analyzer provides analysis and statistics for task plans
 * This is extracted from agent/planning/task-planner.ts
 */
export class PlanAnalyzer {
  /**
   * Get plan statistics
   */
  getPlanStats(plan: TaskPlan): {
    totalSubtasks: number;
    parallelGroups: number;
    maxParallelism: number;
    estimatedDuration: number;
    avgDifficulty: number;
    completionByDependency: Map<number, number>;
  } {
    const maxParallelism = Math.max(...plan.executionOrder.map(g => g.length));
    const avgDifficulty = plan.subtasks.reduce((sum, st) => sum + st.difficulty, 0) / plan.subtasks.length;

    // Calculate completion by dependency level
    const completionByDependency = new Map<number, number>();
    for (let i = 0; i < plan.executionOrder.length; i++) {
      completionByDependency.set(i, plan.executionOrder[i].length);
    }

    // Rough estimate: 30 seconds * difficulty * (1 + parallelism * 0.3)
    const estimatedDuration = plan.estimatedIterations * avgDifficulty * 30;

    return {
      totalSubtasks: plan.subtasks.length,
      parallelGroups: plan.executionOrder.length,
      maxParallelism,
      estimatedDuration: Math.floor(estimatedDuration),
      avgDifficulty,
      completionByDependency
    };
  }

  /**
   * Check if task needs decomposition
   */
  shouldDecompose(task: string): boolean {
    const words = task.split(/\s+/);
    const andCount = (task.match(/\sand\s/gi) || []).length;
    const commaCount = (task.match(/,/g) || []).length;

    // Decompose if:
    // - Contains "and" multiple times
    // - Contains multiple commas
    // - Word count > 15
    return words.length > 15 || andCount >= 2 || commaCount >= 2;
  }

  /**
   * Get complexity score
   */
  getComplexityScore(task: string): number {
    let score = 0;

    // Length score
    const words = task.split(/\s+/);
    score += Math.min(words.length / 10, 5);

    // Conjunction count
    const andCount = (task.match(/\sand\s/gi) || []).length;
    score += andCount * 2;

    // Punctuation complexity
    const commaCount = (task.match(/,/g) || []).length;
    const semicolonCount = (task.match(/;/g) || []).length;
    score += commaCount + semicolonCount * 2;

    // Nested structure indicators
    const parenthesisDepth = (task.match(/\(/g) || []).length;
    score += parenthesisDepth;

    return Math.min(score, 10);
  }

  /**
   * Analyze subtask dependencies
   */
  analyzeDependencies(subtasks: SubTask[]): {
    hasCircularDeps: boolean;
    maxChainLength: number;
    independentCount: number;
    coupledCount: number;
  } {
    const buildDependencyMap = () => {
      const map = new Map<string, string[]>();
      for (const st of subtasks) {
        map.set(st.id, st.dependencies);
      }
      return map;
    };

    const dependencyMap = buildDependencyMap();

    // Find max chain length
    const getChainLength = (id: string, visited = new Set<string>()): number => {
      if (visited.has(id)) return 0;
      visited.add(id);

      const deps = dependencyMap.get(id) || [];
      let maxLen = 0;
      for (const depId of deps) {
        maxLen = Math.max(maxLen, 1 + getChainLength(depId, visited));
      }
      return maxLen;
    };

    let maxChainLength = 0;
    for (const subtask of subtasks) {
      maxChainLength = Math.max(maxChainLength, getChainLength(subtask.id));
    }

    // Check for circular dependencies
    const hasCircularDeps = this.detectCircularDeps(subtasks);

    // Count independent vs coupled tasks
    const independentCount = subtasks.filter(st => st.dependencies.length === 0).length;
    const coupledCount = subtasks.length - independentCount;

    return {
      hasCircularDeps,
      maxChainLength,
      independentCount,
      coupledCount
    };
  }

  /**
   * Detect circular dependencies
   */
  private detectCircularDeps(subtasks: SubTask[]): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detect = (id: string): boolean => {
      if (recursionStack.has(id)) return true;
      if (visited.has(id)) return false;

      visited.add(id);
      recursionStack.add(id);

      const subtask = subtasks.find(st => st.id === id);
      if (subtask) {
        for (const depId of subtask.dependencies) {
          if (detect(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(id);
      return false;
    };

    for (const subtask of subtasks) {
      if (!visited.has(subtask.id)) {
        if (detect(subtask.id)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get execution efficiency score
   */
  getEfficiencyScore(plan: TaskPlan): number {
    const stats = this.getPlanStats(plan);

    // Higher score for better parallelization
    let score = 0.5;

    // Bonus for parallelism
    const parallelRatio = stats.parallelGroups > 0
      ? (stats.totalSubtasks / stats.parallelGroups)
      : 1;
    score += Math.min(parallelRatio / 10, 0.3);

    // Penalty for many sequential phases
    if (stats.parallelGroups > stats.totalSubtasks / 2) {
      score -= 0.2;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Validate plan integrity
   */
  validatePlan(plan: TaskPlan): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check if all subtasks have unique IDs
    const ids = plan.subtasks.map(st => st.id);
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      errors.push('Duplicate subtask IDs detected');
    }

    // Check if all dependencies exist
    for (const subtask of plan.subtasks) {
      for (const depId of subtask.dependencies) {
        if (!uniqueIds.has(depId)) {
          errors.push(`Subtask ${subtask.id} depends on non-existent ${depId}`);
        }
      }
    }

    // Check for circular dependencies
    if (this.detectCircularDeps(plan.subtasks)) {
      errors.push('Circular dependencies detected');
    }

    // Check execution order
    if (plan.executionOrder.length === 0) {
      errors.push('Empty execution order');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
