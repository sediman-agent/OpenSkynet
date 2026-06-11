/**
 * Execution Order Calculator
 * Calculates optimal execution order for subtasks with dependencies
 */

import type { SubTask } from '../task-planner.js';

/**
 * Execution Order Calculator handles dependency resolution and parallelization
 * This is extracted from agent/planning/task-planner.ts
 */
export class ExecutionOrderCalculator {
  /**
   * Calculate which subtasks can run in parallel
   */
  calculateExecutionOrder(subtasks: SubTask[]): string[][] {
    const order: string[][] = [];
    const completed = new Set<string>();
    const remaining = new Set(subtasks.map(st => st.id));

    // Build dependency map
    const dependencyMap = new Map<string, Set<string>>();
    for (const st of subtasks) {
      dependencyMap.set(st.id, new Set(st.dependencies));
    }

    while (remaining.size > 0) {
      // Find all subtasks whose dependencies are satisfied
      const ready = [...remaining].filter(id => {
        const deps = dependencyMap.get(id);
        return deps && [...deps].every(depId => completed.has(depId));
      });

      if (ready.length === 0) {
        // Circular dependency or just no more dependencies
        order.push([...remaining]);
        break;
      }

      order.push(ready);

      // Mark as completed
      for (const id of ready) {
        completed.add(id);
        remaining.delete(id);
      }
    }

    return order;
  }

  /**
   * Get critical path (longest dependency chain)
   */
  getCriticalPath(subtasks: SubTask[]): string[] {
    const dependencyMap = new Map<string, string[]>();
    for (const st of subtasks) {
      dependencyMap.set(st.id, st.dependencies);
    }

    // Find all root nodes (no dependencies)
    const roots = subtasks.filter(st => st.dependencies.length === 0);
    const paths: string[][] = roots.map(root => this.findLongestPath(root.id, dependencyMap, subtasks));

    // Return longest path
    return paths.reduce((longest, path) =>
      path.length > longest.length ? path : longest
    , []);
  }

  /**
   * Find longest path from a starting node
   */
  private findLongestPath(
    startId: string,
    dependencyMap: Map<string, string[]>,
    subtasks: SubTask[]
  ): string[] {
    const visited = new Set<string>();
    const path: string[] = [];

    const traverse = (id: string): number => {
      if (visited.has(id)) return 0;
      visited.add(id);
      path.push(id);

      // Find dependents (tasks that depend on this one)
      const dependents = subtasks
        .filter(st => st.dependencies.includes(id))
        .map(st => st.id);

      let maxLength = 0;
      for (const depId of dependents) {
        maxLength = Math.max(maxLength, traverse(depId));
      }

      return path.length;
    };

    traverse(startId);
    return path;
  }

  /**
   * Detect circular dependencies
   */
  detectCircularDependencies(subtasks: SubTask[]): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const detect = (id: string, path: string[]): boolean => {
      if (recursionStack.has(id)) {
        // Found a cycle
        const cycleStart = path.indexOf(id);
        cycles.push(path.slice(cycleStart));
        return true;
      }

      if (visited.has(id)) return false;

      visited.add(id);
      recursionStack.add(id);
      path.push(id);

      const subtask = subtasks.find(st => st.id === id);
      if (subtask) {
        for (const depId of subtask.dependencies) {
          if (detect(depId, [...path])) {
            return true;
          }
        }
      }

      recursionStack.delete(id);
      path.pop();
      return false;
    };

    for (const subtask of subtasks) {
      if (!visited.has(subtask.id)) {
        detect(subtask.id, []);
      }
    }

    return cycles;
  }

  /**
   * Get parallelization metrics
   */
  getParallelizationMetrics(executionOrder: string[][]): {
    maxParallelism: number;
    avgParallelism: number;
    sequentialPhases: number;
    parallelizableRatio: number;
  } {
    const maxParallelism = Math.max(...executionOrder.map(g => g.length));
    const avgParallelism = executionOrder.reduce((sum, g) => sum + g.length, 0) / executionOrder.length;
    const parallelizableTasks = executionOrder.filter(g => g.length > 1).reduce((sum, g) => sum + g.length, 0);
    const totalTasks = executionOrder.reduce((sum, g) => sum + g.length, 0);

    return {
      maxParallelism,
      avgParallelism,
      sequentialPhases: executionOrder.length,
      parallelizableRatio: totalTasks > 0 ? parallelizableTasks / totalTasks : 0
    };
  }
}
