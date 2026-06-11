/**
 * Production Health Check System
 * Industrial-grade health monitoring for the entire OpenSkynet application
 */

import { createLogger } from './logging';
import { getDb } from '../store/db';
import { getConfigManager } from './production-config';

const logger = createLogger('HealthCheck');

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  checks: Record<string, HealthCheck>;
  uptime: number;
  version: string;
}

export interface HealthCheck {
  status: 'pass' | 'warn' | 'fail';
  description?: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export class HealthCheckSystem {
  private checks: Map<string, () => Promise<HealthCheck>> = new Map();
  private startTime: number;
  private version: string;

  constructor() {
    this.startTime = Date.now();
    this.version = this.getVersion();
    this.initializeDefaultChecks();
  }

  /**
   * Get application version
   */
  private getVersion(): string {
    try {
      const packageJson = require('../../../package.json');
      return packageJson.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  /**
   * Initialize default health checks
   */
  private initializeDefaultChecks(): void {
    // Database health check
    this.registerCheck('database', async () => {
      const start = Date.now();
      try {
        const db = getDb();
        // Execute a simple query to test connection
        db.exec('SELECT 1');

        return {
          status: 'pass',
          description: 'Database connection successful',
          duration: Date.now() - start,
          metadata: {
            type: 'sqlite',
            inMemory: false
          }
        };
      } catch (error) {
        return {
          status: 'fail',
          description: 'Database connection failed',
          duration: Date.now() - start,
          metadata: {
            error: (error as Error).message
          }
        };
      }
    });

    // Memory health check
    this.registerCheck('memory', async () => {
      const memory = process.memoryUsage();
      const heapUsedMb = Math.round(memory.heapUsed / 1024 / 1024);
      const heapTotalMb = Math.round(memory.heapTotal / 1024 / 1024);

      const config = getConfigManager();
      const memoryLimit = config.get('agent.memoryLimit') || 1024;

      const status = heapUsedMb < memoryLimit * 0.9 ? 'pass' :
                   heapUsedMb < memoryLimit ? 'warn' : 'fail';

      return {
        status,
        description: `Memory usage: ${heapUsedMb}MB / ${heapTotalMb}MB`,
        metadata: {
          heapUsedMb,
          heapTotalMb,
          rssMb: Math.round(memory.rss / 1024 / 1024),
          externalMb: Math.round(memory.external / 1024 / 1024),
          memoryLimit
        }
      };
    });

    // Event loop health check
    this.registerCheck('event_loop', async () => {
      const start = process.hrtime.bigint();

      await new Promise(resolve => setImmediate(resolve));

      const delay = Number(process.hrtime.bigint() - start) / 1e6; // Convert to milliseconds

      const status = delay < 10 ? 'pass' : delay < 50 ? 'warn' : 'fail';

      return {
        status,
        description: `Event loop delay: ${delay.toFixed(2)}ms`,
        metadata: { delayMs: delay }
      };
    });

    // File system health check
    this.registerCheck('filesystem', async () => {
      const start = Date.now();
      const fs = require('fs');
      const path = require('path');

      try {
        const testFile = path.join(process.env.SEDIMAN_DATA_DIR || './data', '.health-check');
        fs.writeFileSync(testFile, 'health-check');
        fs.readFileSync(testFile);
        fs.unlinkSync(testFile);

        return {
          status: 'pass',
          description: 'File system operations successful',
          duration: Date.now() - start,
          metadata: {
            dataDir: process.env.SEDIMAN_DATA_DIR || './data'
          }
        };
      } catch (error) {
        return {
          status: 'fail',
          description: 'File system operations failed',
          duration: Date.now() - start,
          metadata: {
            error: (error as Error).message
          }
        };
      }
    });

    // Configuration health check
    this.registerCheck('configuration', async () => {
      const configManager = getConfigManager();
      const productionReady = configManager.isProductionReady();

      const status = productionReady.ready ? 'pass' : 'warn';

      return {
        status,
        description: productionReady.ready ? 'Configuration is valid' : 'Configuration has warnings',
        metadata: productionReady
      };
    });
  }

  /**
   * Register custom health check
   */
  registerCheck(name: string, check: () => Promise<HealthCheck>): void {
    this.checks.set(name, check);
    logger.info(`[HealthCheck] Registered check: ${name}`);
  }

  /**
   * Remove health check
   */
  unregisterCheck(name: string): void {
    this.checks.delete(name);
    logger.info(`[HealthCheck] Unregistered check: ${name}`);
  }

  /**
   * Execute all health checks
   */
  async executeHealthChecks(): Promise<HealthCheckResult> {
    const checks: Record<string, HealthCheck> = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    for (const [name, check] of this.checks.entries()) {
      try {
        checks[name] = await check();

        if (checks[name].status === 'fail') {
          overallStatus = 'unhealthy';
        } else if (checks[name].status === 'warn' && overallStatus === 'healthy') {
          overallStatus = 'degraded';
        }
      } catch (error) {
        checks[name] = {
          status: 'fail',
          description: 'Health check error',
          metadata: {
            error: (error as Error).message
          }
        };
        overallStatus = 'unhealthy';
      }
    }

    return {
      status: overallStatus,
      timestamp: Date.now(),
      checks,
      uptime: Date.now() - this.startTime,
      version: this.version
    };
  }

  /**
   * Get quick health status (for load balancers)
   */
  async getQuickStatus(): Promise<{ status: string } | null> {
    try {
      // Just check database and memory for quick status
      const dbCheck = this.checks.get('database');
      const memCheck = this.checks.get('memory');

      if (!dbCheck || !memCheck) {
        return { status: 'unhealthy' };
      }

      const dbResult = await dbCheck();
      const memResult = await memCheck();

      if (dbResult.status === 'fail' || memResult.status === 'fail') {
        return { status: 'unhealthy' };
      }

      if (dbResult.status === 'warn' || memResult.status === 'warn') {
        return { status: 'degraded' };
      }

      return { status: 'healthy' };
    } catch (error) {
      return { status: 'unhealthy' };
    }
  }

  /**
   * Start periodic health checks
   */
  startPeriodicChecks(intervalMs: number = 60000): void {
    setInterval(async () => {
      try {
        const result = await this.executeHealthChecks();

        if (result.status === 'unhealthy') {
          logger.error('[HealthCheck] System unhealthy - status: ' + result.status);
        } else if (result.status === 'degraded') {
          logger.warn('[HealthCheck] System degraded - status: ' + result.status);
        }

        // Store result for monitoring
        this.storeHealthResult(result);
      } catch (error) {
        logger.error('[HealthCheck] Error executing health checks: ' + (error as Error).message);
      }
    }, intervalMs);

    logger.info(`[HealthCheck] Started periodic checks (interval: ${intervalMs}ms)`);
  }

  /**
   * Store health check result for monitoring
   */
  private storeHealthResult(result: HealthCheckResult): void {
    // This could be integrated with the monitoring system
    // For now, just log significant issues
    if (result.status === 'unhealthy') {
      const failedChecks = Object.entries(result.checks)
        .filter(([_, check]) => check.status === 'fail')
        .map(([name, _]) => name);

      if (failedChecks.length > 0) {
        logger.error(`[HealthCheck] Failed checks: ${failedChecks.join(', ')}`);
      }
    }
  }

  /**
   * Get health statistics
   */
  getHealthStatistics(): {
    uptime: number;
    checks: number;
    version: string;
    environment: string;
  } {
    const config = getConfigManager();

    return {
      uptime: Date.now() - this.startTime,
      checks: this.checks.size,
      version: this.version,
      environment: config.get('environment')
    };
  }
}

// Global health check system instance
let globalHealthCheckSystem: HealthCheckSystem | null = null;

/**
 * Get the global health check system
 */
export function getHealthCheckSystem(): HealthCheckSystem {
  if (!globalHealthCheckSystem) {
    globalHealthCheckSystem = new HealthCheckSystem();
  }
  return globalHealthCheckSystem;
}

/**
 * Execute health checks
 */
export async function executeHealthChecks(): Promise<HealthCheckResult> {
  return getHealthCheckSystem().executeHealthChecks();
}

/**
 * Reset health check system
 */
export function resetHealthCheckSystem(): void {
  globalHealthCheckSystem = null;
}
