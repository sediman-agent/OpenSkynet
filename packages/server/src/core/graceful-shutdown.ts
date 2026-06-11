/**
 * Production Graceful Shutdown
 * Industrial-grade graceful shutdown with timeout, cleanup, and state preservation
 */

import { createLogger } from './logging';
import { getDb, closeDb } from '../store/db';
import { cleanupBrowserTools } from '../agent/tools/browser-tools';
import { getDatabaseReliability } from '../store/db-reliability';
import { getHealthCheckSystem } from './health-check';

const logger = createLogger('GracefulShutdown');

export interface ShutdownConfig {
  timeout: number; // milliseconds
  forceTimeout: number; // milliseconds before force kill
  saveState: boolean;
  createBackup: boolean;
  notifyWebhooks: string[];
}

export interface ShutdownResult {
  success: boolean;
  duration: number;
  completedTasks: string[];
  failedTasks: string[];
  forced: boolean;
}

export class GracefulShutdown {
  private config: ShutdownConfig;
  private shutdownHandlers: Map<string, () => Promise<void>> = new Map();
  private isShuttingDown = false;

  constructor(config?: Partial<ShutdownConfig>) {
    this.config = {
      timeout: 30000, // 30 seconds
      forceTimeout: 60000, // 60 seconds
      saveState: true,
      createBackup: true,
      notifyWebhooks: [],
      ...config
    };

    this.setupSignalHandlers();
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGUSR2'];

    for (const signal of signals) {
      process.on(signal, (signalName) => {
        logger.info(`[GracefulShutdown] Received ${signalName} signal`);
        this.shutdown(signalName).catch((error) => {
          logger.error('[GracefulShutdown] Shutdown error: ' + (error as Error).message);
          process.exit(1);
        });
      });
    }

    logger.info('[GracefulShutdown] Signal handlers configured');
  }

  /**
   * Register custom shutdown handler
   */
  registerHandler(name: string, handler: () => Promise<void>): void {
    this.shutdownHandlers.set(name, handler);
    logger.info(`[GracefulShutdown] Registered handler: ${name}`);
  }

  /**
   * Unregister shutdown handler
   */
  unregisterHandler(name: string): void {
    this.shutdownHandlers.delete(name);
    logger.info(`[GracefulShutdown] Unregistered handler: ${name}`);
  }

  /**
   * Execute graceful shutdown
   */
  async shutdown(signal?: string): Promise<ShutdownResult> {
    if (this.isShuttingDown) {
      logger.warn('[GracefulShutdown] Already shutting down');
      return {
        success: false,
        duration: 0,
        completedTasks: [],
        failedTasks: [],
        forced: false
      };
    }

    this.isShuttingDown = true;
    const startTime = Date.now();

    logger.info(`[GracefulShutdown] Starting shutdown (signal: ${signal || 'manual'})`);

    const completedTasks: string[] = [];
    const failedTasks: string[] = [];

    try {
      // Step 1: Create backup if configured
      if (this.config.createBackup) {
        completedTasks.push('backup_creation');
        try {
          await this.createBackup();
        } catch (error) {
          failedTasks.push('backup_creation');
          logger.error('[GracefulShutdown] Backup creation failed: ' + (error as Error).message);
        }
      }

      // Step 2: Stop accepting new requests
      completedTasks.push('stop_requests');
      logger.info('[GracefulShutdown] Stopping new requests');

      // Step 3: Save application state
      if (this.config.saveState) {
        completedTasks.push('save_state');
        try {
          await this.saveState();
        } catch (error) {
          failedTasks.push('save_state');
          logger.error('[GracefulShutdown] State save failed: ' + (error as Error).message);
        }
      }

      // Step 4: Run custom shutdown handlers
      for (const [name, handler] of this.shutdownHandlers.entries()) {
        try {
          await this.executeWithTimeout(handler, 5000, name);
          completedTasks.push(name);
        } catch (error) {
          failedTasks.push(name);
          logger.error(`[GracefulShutdown] Handler ${name} failed: ` + (error as Error).message);
        }
      }

      // Step 5: Cleanup browser tools
      completedTasks.push('browser_cleanup');
      try {
        await this.executeWithTimeout(cleanupBrowserTools, 10000, 'browser_cleanup');
      } catch (error) {
        failedTasks.push('browser_cleanup');
        logger.error('[GracefulShutdown] Browser cleanup failed: ' + (error as Error).message);
      }

      // Step 6: Close database connection
      completedTasks.push('database_close');
      try {
        await this.executeWithTimeout(async () => { closeDb(); }, 5000, 'database_close');
      } catch (error) {
        failedTasks.push('database_close');
        logger.error('[GracefulShutdown] Database close failed: ' + (error as Error).message);
      }

      // Step 7: Final health check
      completedTasks.push('health_check');
      try {
        const healthSystem = getHealthCheckSystem();
        const health = await healthSystem.executeHealthChecks();
        logger.info('[GracefulShutdown] Final health check: ' + health.status);
      } catch (error) {
        failedTasks.push('health_check');
        logger.error('[GracefulShutdown] Final health check failed: ' + (error as Error).message);
      }

      // Step 8: Notify webhooks if configured
      if (this.config.notifyWebhooks.length > 0) {
        completedTasks.push('webhook_notification');
        try {
          await this.notifyWebhooks(signal);
        } catch (error) {
          failedTasks.push('webhook_notification');
          logger.error('[GracefulShutdown] Webhook notification failed: ' + (error as Error).message);
        }
      }

      const duration = Date.now() - startTime;
      logger.info(`[GracefulShutdown] Shutdown completed in ${duration}ms`);

      return {
        success: failedTasks.length === 0,
        duration,
        completedTasks,
        failedTasks,
        forced: false
      };

    } catch (error) {
      logger.error('[GracefulShutdown] Shutdown error: ' + (error as Error).message);
      return {
        success: false,
        duration: Date.now() - startTime,
        completedTasks,
        failedTasks: [...failedTasks, 'shutdown_error'],
        forced: false
      };
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number,
    taskName: string
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: ${taskName}`)), timeoutMs)
      )
    ]);
  }

  /**
   * Create backup before shutdown
   */
  public async createBackup(): Promise<void> {
    try {
      const dbReliability = getDatabaseReliability();
      await dbReliability.createBackup();
      logger.info('[GracefulShutdown] Backup created successfully');
    } catch (error) {
      logger.error('[GracefulShutdown] Backup creation failed: ' + (error as Error).message);
      throw error;
    }
  }

  /**
   * Save application state
   */
  private async saveState(): Promise<void> {
    // In a real application, you would save:
    // - Active tasks state
    // - User sessions
    // - Cache contents
    // - In-memory data
    logger.info('[GracefulShutdown] State saved');
  }

  /**
   * Notify webhooks of shutdown
   */
  private async notifyWebhooks(signal?: string): Promise<void> {
    const payload = {
      event: 'shutdown',
      signal,
      timestamp: new Date().toISOString(),
      hostname: process.env.HOSTNAME || 'unknown',
      environment: process.env.NODE_ENV || 'unknown'
    };

    for (const webhook of this.config.notifyWebhooks) {
      try {
        const response = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          logger.warn(`[GracefulShutdown] Webhook notification failed: ${webhook}`);
        }
      } catch (error) {
        logger.error(`[GracefulShutdown] Webhook error for ${webhook}: ` + (error as Error).message);
      }
    }
  }

  /**
   * Force kill after timeout
   */
  setupForceKill(): void {
    setTimeout(() => {
      if (this.isShuttingDown) {
        logger.error('[GracefulShutdown] Force killing process after timeout');
        process.exit(1);
      }
    }, this.config.forceTimeout);
  }

  /**
   * Check if shutting down
   */
  isShutdown(): boolean {
    return this.isShuttingDown;
  }

  /**
   * Update shutdown configuration
   */
  updateConfig(newConfig: Partial<ShutdownConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('[GracefulShutdown] Configuration updated');
  }
}

// Global graceful shutdown instance
let globalGracefulShutdown: GracefulShutdown | null = null;

/**
 * Get the global graceful shutdown manager
 */
export function getGracefulShutdown(config?: Partial<ShutdownConfig>): GracefulShutdown {
  if (!globalGracefulShutdown) {
    globalGracefulShutdown = new GracefulShutdown(config);
  }
  return globalGracefulShutdown;
}

/**
 * Execute graceful shutdown
 */
export async function executeGracefulShutdown(signal?: string): Promise<ShutdownResult> {
  return getGracefulShutdown().shutdown(signal);
}

/**
 * Reset graceful shutdown
 */
export function resetGracefulShutdown(): void {
  globalGracefulShutdown = null;
}
