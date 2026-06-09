/**
 * Tool Execution Strategy Manager
 * Coordinates between different execution strategies (Playwright, IPC)
 */

import type { ToolExecutionStrategy, ToolExecutionArgs, ToolExecutionContext, ToolExecutionResult } from './types.js';
import { PlaywrightExecutionStrategy } from './playwright-strategy.js';
import { IPCExecutionStrategy } from './ipc-strategy.js';
import { createLogger } from '../../../core/logging.js';

const logger = createLogger('StrategyManager');

export class ToolExecutionStrategyManager {
  private strategies: ToolExecutionStrategy[];

  constructor(controller?: any) {
    this.strategies = [
      new PlaywrightExecutionStrategy(controller),
      new IPCExecutionStrategy()
    ];
  }

  /**
   * Execute a tool using the appropriate strategy
   */
  async execute(
    toolName: string,
    args: ToolExecutionArgs,
    context: ToolExecutionContext = {}
  ): Promise<ToolExecutionResult> {
    // Find the first available strategy
    const strategy = this.strategies.find(s => s.isAvailable());

    if (!strategy) {
      logger.error('[StrategyManager] No execution strategy available');
      return {
        success: false,
        output: '',
        error: 'No execution strategy available'
      };
    }

    logger.info(`[StrategyManager] Using ${strategy.name} strategy for ${toolName}`);
    return strategy.execute(toolName, args, context);
  }

  /**
   * Get the currently active strategy
   */
  getActiveStrategy(): ToolExecutionStrategy | null {
    return this.strategies.find(s => s.isAvailable()) || null;
  }

  /**
   * Get all registered strategies
   */
  getAllStrategies(): ToolExecutionStrategy[] {
    return [...this.strategies];
  }

  /**
   * Register a custom strategy
   */
  registerStrategy(strategy: ToolExecutionStrategy): void {
    this.strategies.push(strategy);
    logger.info(`[StrategyManager] Registered custom strategy: ${strategy.name}`);
  }

  /**
   * Remove a strategy by name
   */
  unregisterStrategy(name: string): void {
    this.strategies = this.strategies.filter(s => s.name !== name);
    logger.info(`[StrategyManager] Unregistered strategy: ${name}`);
  }

  /**
   * Check if a specific strategy is available
   */
  isStrategyAvailable(name: string): boolean {
    const strategy = this.strategies.find(s => s.name === name);
    return strategy ? strategy.isAvailable() : false;
  }
}

/**
 * Factory function to create a strategy manager
 */
export function createStrategyManager(controller?: any): ToolExecutionStrategyManager {
  return new ToolExecutionStrategyManager(controller);
}
