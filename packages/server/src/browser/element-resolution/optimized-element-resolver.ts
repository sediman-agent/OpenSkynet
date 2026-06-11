/**
 * Optimized Element Resolver
 * Enhanced element resolution with multiple fallback strategies
 * Designed to fix common Playwright element resolution issues
 */

import type { Page, Locator } from "playwright";
import { createLogger } from '../../core/logging.js';
import { getRetrySystem } from '../../agent/stability/retry-system.js';

const logger = createLogger('OptimizedElementResolver');

interface ResolutionStrategy {
  name: string;
  priority: number;
  resolve: (page: Page, identifier: string | number) => Promise<Locator | null>;
}

interface ResolutionResult {
  locator: Locator | null;
  strategy: string;
  attempts: number;
  duration: number;
}

/**
 * Optimized element resolver with multiple fallback strategies
 */
export class OptimizedElementResolver {
  private strategies: ResolutionStrategy[] = [];
  private cache = new Map<string, { locator: Locator; timestamp: number }>();
  private cacheTTL = 30000; // 30 seconds
  private retrySystem = getRetrySystem('browser');
  private resolutionStats = new Map<string, { success: number; failure: number }>();

  constructor() {
    this.initializeStrategies();
  }

  /**
   * Initialize resolution strategies
   */
  private initializeStrategies(): void {
    // Strategy 1: Direct refId (highest priority)
    this.strategies.push({
      name: 'direct-ref-id',
      priority: 1,
      resolve: async (page, identifier) => {
        const refId = typeof identifier === 'number' ? identifier : parseInt(identifier.toString());
        if (isNaN(refId)) return null;

        const locator = page.locator(`[data-sediman-ref-id="${refId}"]`).first();
        if ((await locator.count()) > 0) return locator;
        return null;
      }
    });

    // Strategy 2: CSS selector with text content
    this.strategies.push({
      name: 'css-with-text',
      priority: 2,
      resolve: async (page, identifier) => {
        if (typeof identifier !== 'string') return null;

        try {
          // Try as CSS selector
          const locator = page.locator(identifier).first();
          if ((await locator.count()) > 0) return locator;
        } catch {
          // Invalid selector
        }
        return null;
      }
    });

    // Strategy 3: Text content matching
    this.strategies.push({
      name: 'text-match',
      priority: 3,
      resolve: async (page, identifier) => {
        if (typeof identifier !== 'string') return null;

        try {
          // Try exact text match
          const locator = page.locator(`text=${identifier}`).first();
          if ((await locator.count()) > 0) return locator;
        } catch {
          // Text matching failed
        }
        return null;
      }
    });

    // Strategy 4: XPath fallback
    this.strategies.push({
      name: 'xpath',
      priority: 4,
      resolve: async (page, identifier) => {
        if (typeof identifier !== 'string') return null;

        try {
          // Try XPath if it looks like one
          if (identifier.startsWith('//') || identifier.startsWith('(//')) {
            const locator = page.locator(`xpath=${identifier}`).first();
            if ((await locator.count()) > 0) return locator;
          }
        } catch {
          // XPath failed
        }
        return null;
      }
    });

    // Strategy 5: ARIA label matching
    this.strategies.push({
      name: 'aria-label',
      priority: 5,
      resolve: async (page, identifier) => {
        if (typeof identifier !== 'string') return null;

        try {
          const locator = page.locator(`[aria-label="${identifier}"]`).first();
          if ((await locator.count()) > 0) return locator;
        } catch {
          // ARIA matching failed
        }
        return null;
      }
    });

    // Strategy 6: Placeholder matching (for inputs)
    this.strategies.push({
      name: 'placeholder',
      priority: 6,
      resolve: async (page, identifier) => {
        if (typeof identifier !== 'string') return null;

        try {
          const locator = page.locator(`[placeholder="${identifier}"]`).first();
          if ((await locator.count()) > 0) return locator;
        } catch {
          // Placeholder matching failed
        }
        return null;
      }
    });

    // Strategy 7: Name attribute matching
    this.strategies.push({
      name: 'name-attribute',
      priority: 7,
      resolve: async (page, identifier) => {
        if (typeof identifier !== 'string') return null;

        try {
          const locator = page.locator(`[name="${identifier}"]`).first();
          if ((await locator.count()) > 0) return locator;
        } catch {
          // Name matching failed
        }
        return null;
      }
    });

    // Strategy 8: ID attribute matching
    this.strategies.push({
      name: 'id-attribute',
      priority: 8,
      resolve: async (page, identifier) => {
        if (typeof identifier !== 'string') return null;

        try {
          const locator = page.locator(`#${identifier}`).first();
          if ((await locator.count()) > 0) return locator;
        } catch {
          // ID matching failed
        }
        return null;
      }
    });

    // Strategy 9: Partial text match (last resort)
    this.strategies.push({
      name: 'partial-text',
      priority: 9,
      resolve: async (page, identifier) => {
        if (typeof identifier !== 'string') return null;

        try {
          const locator = page.locator(`text=${identifier}`).or(page.locator(`text=${identifier}`)).first();
          if ((await locator.count()) > 0) return locator;
        } catch {
          // Partial matching failed
        }
        return null;
      }
    });

    // Sort by priority
    this.strategies.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Resolve element with multiple fallback strategies
   */
  async resolve(page: Page, identifier: string | number): Promise<ResolutionResult> {
    const startTime = Date.now();
    const cacheKey = `${typeof identifier === 'number' ? 'refId' : 'other'}:${identifier}`;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      try {
        // Verify cached element is still valid
        if ((await cached.locator.count()) > 0) {
          logger.debug(`[OptimizedElementResolver] Cache hit for ${identifier}`);
          return {
            locator: cached.locator,
            strategy: 'cache',
            attempts: 1,
            duration: Date.now() - startTime
          };
        }
      } catch {
        // Cache entry is invalid, remove it
        this.cache.delete(cacheKey);
      }
    }

    // Try each strategy with retry logic
    for (const strategy of this.strategies) {
      logger.debug(`[OptimizedElementResolver] Trying ${strategy.name} for ${identifier}`);

      const result = await this.retrySystem.execute(
        async () => {
          const locator = await strategy.resolve(page, identifier);
          if (locator) {
            // Cache the result
            this.cache.set(cacheKey, {
              locator,
              timestamp: Date.now()
            });

            // Record success
            const stats = this.resolutionStats.get(strategy.name) || { success: 0, failure: 0 };
            stats.success++;
            this.resolutionStats.set(strategy.name, stats);

            return { success: true, locator, strategy: strategy.name };
          }
          return { success: false, locator: null, strategy: strategy.name };
        },
        `element-resolve-${strategy.name}`
      );

      if (result.success && result.result) {
        logger.info(`[OptimizedElementResolver] Resolved ${identifier} using ${strategy.name}`);
        return {
          locator: result.result.locator,
          strategy: result.result.strategy,
          attempts: result.attempts,
          duration: Date.now() - startTime
        };
      }

      // Record failure
      const stats = this.resolutionStats.get(strategy.name) || { success: 0, failure: 0 };
      stats.failure++;
      this.resolutionStats.set(strategy.name, stats);
    }

    // All strategies failed
    logger.warn(`[OptimizedElementResolver] Failed to resolve ${identifier} with all strategies`);
    return {
      locator: null,
      strategy: 'none',
      attempts: this.strategies.length,
      duration: Date.now() - startTime
    };
  }

  /**
   * Resolve element by refId with special handling
   */
  async resolveByRefId(page: Page, refId: number): Promise<Locator | null> {
    const result = await this.resolve(page, refId);
    return result.locator;
  }

  /**
   * Resolve element by selector with special handling
   */
  async resolveBySelector(page: Page, selector: string): Promise<Locator | null> {
    const result = await this.resolve(page, selector);
    return result.locator;
  }

  /**
   * Wait for element to be available with retry
   */
  async waitForElement(page: Page, identifier: string | number, timeout: number = 10000): Promise<Locator> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.resolve(page, identifier);
      if (result.locator) {
        return result.locator;
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    throw new Error(`Element ${identifier} not found within ${timeout}ms`);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('[OptimizedElementResolver] Cache cleared');
  }

  /**
   * Get resolution statistics
   */
  getStats(): {
    cacheSize: number;
    strategies: Array<{
      name: string;
      success: number;
      failure: number;
      successRate: number;
    }>;
  } {
    const strategies = this.strategies.map(strategy => {
      const stats = this.resolutionStats.get(strategy.name) || { success: 0, failure: 0 };
      const total = stats.success + stats.failure;
      const successRate = total > 0 ? stats.success / total : 0;

      return {
        name: strategy.name,
        success: stats.success,
        failure: stats.failure,
        successRate
      };
    });

    return {
      cacheSize: this.cache.size,
      strategies
    };
  }

  /**
   * Add custom resolution strategy
   */
  addStrategy(strategy: ResolutionStrategy, priority?: number): void {
    if (priority !== undefined) {
      strategy.priority = priority;
    }
    this.strategies.push(strategy);
    this.strategies.sort((a, b) => a.priority - b.priority);
    logger.info(`[OptimizedElementResolver] Added strategy: ${strategy.name} (priority: ${strategy.priority})`);
  }

  /**
   * Remove strategy by name
   */
  removeStrategy(name: string): void {
    this.strategies = this.strategies.filter(s => s.name !== name);
    logger.info(`[OptimizedElementResolver] Removed strategy: ${name}`);
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.resolutionStats.clear();
    logger.info('[OptimizedElementResolver] Statistics reset');
  }
}

// Global instance
let globalOptimizedResolver: OptimizedElementResolver | null = null;

/**
 * Get the global optimized element resolver
 */
export function getOptimizedElementResolver(): OptimizedElementResolver {
  if (!globalOptimizedResolver) {
    globalOptimizedResolver = new OptimizedElementResolver();
  }
  return globalOptimizedResolver;
}

/**
 * Reset the global optimized element resolver
 */
export function resetOptimizedElementResolver(): void {
  globalOptimizedResolver = null;
}
