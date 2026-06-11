/**
 * Browser Manager
 * Central management for browser instances with optimized performance
 */

import { createOptimizedBrowserController, OptimizedBrowserController } from './optimized-controller';
import { BrowserController } from './controller';
import logger from '../core/logging';

interface BrowserManagerConfig {
  defaultOptimized?: boolean;
  maxInstances?: number;
  enablePooling?: boolean;
}

class BrowserManager {
  private instances: Map<string, OptimizedBrowserController | BrowserController> = new Map();
  private config: BrowserManagerConfig;
  private currentInstanceIndex = 0;

  constructor(config: BrowserManagerConfig = {}) {
    this.config = {
      defaultOptimized: true,
      maxInstances: 5,
      enablePooling: true,
      ...config
    };
  }

  /**
   * Get or create a browser instance
   */
  getInstance(instanceId: string = 'default'): OptimizedBrowserController | BrowserController {
    let instance = this.instances.get(instanceId);

    if (!instance) {
      // Check if we should use optimized controller
      if (this.config.defaultOptimized) {
        logger.info(`[BrowserManager] Creating optimized browser instance: ${instanceId}`);
        instance = createOptimizedBrowserController({
          onStep: (action, detail) => {
            logger.debug(`[Browser:${instanceId}] ${action}: ${detail}`);
          }
        });
      } else {
        logger.info(`[BrowserManager] Creating standard browser instance: ${instanceId}`);
        instance = new BrowserController({
          onStep: (action, detail) => {
            logger.debug(`[Browser:${instanceId}] ${action}: ${detail}`);
          }
        });
      }

      this.instances.set(instanceId, instance);
    }

    return instance;
  }

  /**
   * Get an instance from the pool (round-robin)
   */
  getPooledInstance(): OptimizedBrowserController | BrowserController {
    if (this.instances.size === 0) {
      return this.getInstance('default');
    }

    const keys = Array.from(this.instances.keys());
    const key = keys[this.currentInstanceIndex % keys.length];
    this.currentInstanceIndex++;
    return this.instances.get(key)!;
  }

  /**
   * Remove and stop a browser instance
   */
  async removeInstance(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (instance) {
      await instance.stop();
      this.instances.delete(instanceId);
      logger.info(`[BrowserManager] Removed browser instance: ${instanceId}`);
    }
  }

  /**
   * Remove all instances
   */
  async removeAll(): Promise<void> {
    const stopPromises = Array.from(this.instances.values()).map(instance => instance.stop());
    await Promise.all(stopPromises);
    this.instances.clear();
    logger.info('[BrowserManager] Removed all browser instances');
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalInstances: number;
    instanceIds: string[];
    optimizedCount: number;
    standardCount: number;
  } {
    const instanceIds = Array.from(this.instances.keys());
    let optimizedCount = 0;
    let standardCount = 0;

    for (const instance of this.instances.values()) {
      if (instance instanceof OptimizedBrowserController) {
        optimizedCount++;
      } else {
        standardCount++;
      }
    }

    return {
      totalInstances: this.instances.size,
      instanceIds,
      optimizedCount,
      standardCount
    };
  }

  /**
   * Health check all instances
   */
  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();

    for (const [id, instance] of this.instances.entries()) {
      try {
        // Try to get URL to check if browser is responsive
        if (instance instanceof OptimizedBrowserController) {
          await instance.getUrl();
          results.set(id, true);
        } else {
          results.set(id, true); // Assume healthy for standard controller
        }
      } catch (error) {
        results.set(id, false);
        logger.warn(`[BrowserManager] Health check failed for ${id}: ${(error as Error).message}`);
      }
    }

    return results;
  }
}

// Global browser manager instance
let globalBrowserManager: BrowserManager | null = null;

/**
 * Get the global browser manager
 */
export function getBrowserManager(config?: BrowserManagerConfig): BrowserManager {
  if (!globalBrowserManager) {
    globalBrowserManager = new BrowserManager(config);
  }
  return globalBrowserManager;
}

/**
 * Reset the global browser manager
 */
export function resetBrowserManager(): void {
  globalBrowserManager = null;
}

export { BrowserManager };
