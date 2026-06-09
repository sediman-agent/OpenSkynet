/**
 * Budget Manager
 * Manages execution budget tracking and validation
 */

import type { Budget } from '../../monitoring/guardrails.js';
import { createLogger } from '../../../core/logging.js';

const logger = createLogger('BudgetManager');

export interface BudgetConfig {
  maxTokens?: number;
  maxIterations?: number;
  maxTimeMs?: number;
}

export interface BudgetCheckResult {
  exceeded: boolean;
  reason?: string;
}

/**
 * Budget Manager handles all budget tracking and validation
 * This extracts budget logic from AgentLoop
 */
export class BudgetManager {
  private budget: Budget;

  constructor(config: BudgetConfig = {}) {
    this.budget = {
      maxTokens: config.maxTokens ?? 200_000,
      maxIterations: config.maxIterations ?? 50,
      maxTimeMs: config.maxTimeMs ?? 600_000,
      usedTokens: 0,
      usedIterations: 0,
      usedTimeMs: 0,
    };
  }

  /**
   * Check if budget has been exceeded
   */
  check(): BudgetCheckResult {
    if (this.budget.usedIterations >= this.budget.maxIterations) {
      return { exceeded: true, reason: 'Maximum iterations reached' };
    }

    if (this.budget.usedTimeMs >= this.budget.maxTimeMs) {
      return { exceeded: true, reason: 'Maximum time exceeded' };
    }

    if (this.budget.usedTokens >= this.budget.maxTokens) {
      return { exceeded: true, reason: 'Maximum tokens exceeded' };
    }

    return { exceeded: false };
  }

  /**
   * Update used tokens
   */
  updateUsedTokens(tokens: number): void {
    this.budget.usedTokens += tokens;
    logger.debug(`[BudgetManager] Tokens: ${this.budget.usedTokens}/${this.budget.maxTokens}`);
  }

  /**
   * Update used time
   */
  updateUsedTime(ms: number): void {
    this.budget.usedTimeMs += ms;
    logger.debug(`[BudgetManager] Time: ${this.budget.usedTimeMs}/${this.budget.maxTimeMs}ms`);
  }

  /**
   * Update used iterations
   */
  updateUsedIterations(iterations: number): void {
    this.budget.usedIterations = iterations;
    logger.debug(`[BudgetManager] Iterations: ${this.budget.usedIterations}/${this.budget.maxIterations}`);
  }

  /**
   * Check if budget is exceeded
   */
  isExceeded(): boolean {
    return this.check().exceeded;
  }

  /**
   * Get current budget state
   */
  getBudget(): Budget {
    return { ...this.budget };
  }

  /**
   * Reset budget
   */
  reset(): void {
    this.budget.usedTokens = 0;
    this.budget.usedIterations = 0;
    this.budget.usedTimeMs = 0;
    logger.info('[BudgetManager] Budget reset');
  }

  /**
   * Get remaining budget as percentage
   */
  getRemainingPercentage(): number {
    const tokenPercent = ((this.budget.maxTokens - this.budget.usedTokens) / this.budget.maxTokens) * 100;
    const iterationPercent = ((this.budget.maxIterations - this.budget.usedIterations) / this.budget.maxIterations) * 100;
    const timePercent = ((this.budget.maxTimeMs - this.budget.usedTimeMs) / this.budget.maxTimeMs) * 100;

    return Math.min(tokenPercent, iterationPercent, timePercent);
  }
}
