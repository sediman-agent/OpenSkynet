/**
 * Element Resolver
 * Coordinates multiple element resolution strategies
 */

import type { Page, Locator } from "playwright";
import type { ElementResolutionStrategy } from './types.js';
import { ByRefIdStrategy } from './by-ref-id-strategy.js';
import { ByAttributeStrategy } from './by-attribute-strategy.js';
import { createLogger } from '../../core/logging.js';

const logger = createLogger('ElementResolver');

export class ElementResolver {
  private strategies: ElementResolutionStrategy[];

  constructor() {
    // Order matters - try by refId first (fastest), then fall back to attribute search
    this.strategies = [
      new ByRefIdStrategy(),
      new ByAttributeStrategy(),
    ];
  }

  /**
   * Resolve an element by refId using available strategies
   */
  async resolve(page: Page, refId: number): Promise<Locator | null> {
    logger.debug(`[ElementResolver] Resolving refId ${refId}`);

    for (const strategy of this.strategies) {
      logger.debug(`[ElementResolver] Trying ${strategy.name} strategy`);

      const result = await strategy.resolve(page, refId);
      if (result) {
        logger.info(`[ElementResolver] Resolved refId ${refId} using ${strategy.name}`);
        return result;
      }
    }

    logger.warn(`[ElementResolver] Failed to resolve refId ${refId} with any strategy`);
    return null;
  }

  /**
   * Register a custom resolution strategy
   */
  registerStrategy(strategy: ElementResolutionStrategy, priority: 'first' | 'last' = 'last'): void {
    if (priority === 'first') {
      this.strategies.unshift(strategy);
    } else {
      this.strategies.push(strategy);
    }
    logger.info(`[ElementResolver] Registered strategy: ${strategy.name} (${priority} priority)`);
  }

  /**
   * Remove a strategy by name
   */
  unregisterStrategy(name: string): void {
    const initialLength = this.strategies.length;
    this.strategies = this.strategies.filter(s => s.name !== name);

    if (this.strategies.length < initialLength) {
      logger.info(`[ElementResolver] Unregistered strategy: ${name}`);
    }
  }

  /**
   * Get all registered strategies
   */
  getStrategies(): ElementResolutionStrategy[] {
    return [...this.strategies];
  }

  /**
   * Check if a strategy is registered
   */
  hasStrategy(name: string): boolean {
    return this.strategies.some(s => s.name === name);
  }
}

/**
 * Factory function to create an element resolver
 */
export function createElementResolver(): ElementResolver {
  return new ElementResolver();
}

/**
 * Singleton instance
 */
export const elementResolver = createElementResolver();
