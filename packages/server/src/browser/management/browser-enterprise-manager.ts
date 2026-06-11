/**
 * Enterprise Browser Manager
 * Production-grade browser management for industrial SaaS
 * Integrates all enterprise features: security, monitoring, tracing, rate limiting
 */

import { createLogger } from '../../core/logging.js';
import { createOptimizedBrowserController, OptimizedBrowserController } from '../optimized-controller.js';
import { getSecurityMiddleware, SecurityContext } from '../security/security-middleware.js';
import { getTelemetryCollector } from '../monitoring/telemetry-collector.js';
import { getDistributedTracer, traceOperation } from '../monitoring/distributed-tracing.js';
import { getMonitoringDashboard } from '../monitoring/monitoring-dashboard.js';
import { getRateLimiter } from '../security/rate-limiter.js';

const logger = createLogger('EnterpriseBrowserManager');

export interface EnterpriseBrowserConfig {
  tenantId: string;
  userId: string;
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  maxConcurrentSessions: number;
  sessionTimeout: number;
  enableMonitoring: boolean;
  enableSecurity: boolean;
  enableTracing: boolean;
  enableRateLimiting: boolean;
}

export interface BrowserSessionConfig {
  headless?: boolean;
  proxy?: string;
  viewport?: { width: number; height: number };
  userAgent?: string;
  locale?: string;
  timezone?: string;
}

export class EnterpriseBrowserManager {
  private security = getSecurityMiddleware();
  private telemetry = getTelemetryCollector();
  private tracer = getDistributedTracer();
  private monitoring = getMonitoringDashboard();
  private rateLimiter = getRateLimiter('enterprise');

  private sessions = new Map<string, OptimizedBrowserController>();
  private sessionMetadata = new Map<string, {
    userId: string;
    tenantId: string;
    createdAt: number;
    lastUsed: number;
    operations: number;
  }>();

  private config: EnterpriseBrowserConfig;

  constructor(config: EnterpriseBrowserConfig) {
    this.config = {
      ...config,
      maxConcurrentSessions: config.maxConcurrentSessions ?? 10,
      sessionTimeout: config.sessionTimeout ?? 3600000, // 1 hour
      enableMonitoring: config.enableMonitoring ?? true,
      enableSecurity: config.enableSecurity ?? true,
      enableTracing: config.enableTracing ?? true,
      enableRateLimiting: config.enableRateLimiting ?? true
    };

    this.startSessionCleanup();
    logger.info(`[EnterpriseBrowserManager] Initialized for tenant ${config.tenantId}`);
  }

  /**
   * Create new browser session with full enterprise features
   */
  async createSession(sessionId: string, browserConfig?: BrowserSessionConfig): Promise<OptimizedBrowserController> {
    // Security check
    if (this.config.enableSecurity) {
      const context: SecurityContext = {
        userId: this.config.userId,
        tenantId: this.config.tenantId,
        apiKey: '', // Would be provided in real scenario
        permissions: [],
        roles: [this.config.tier],
        tier: this.config.tier
      };

      const authorized = await this.security.authorizeOperation(context, 'create_session');
      if (!authorized) {
        throw new Error('Unauthorized: Session creation not allowed');
      }
    }

    // Rate limiting check
    if (this.config.enableRateLimiting) {
      const rateLimit = await this.rateLimiter.checkLimit(this.config.userId);
      if (!rateLimit.allowed) {
        throw new Error(`Rate limit exceeded: Retry after ${rateLimit.retryAfter}ms`);
      }
    }

    // Check concurrent session limit
    if (this.sessions.size >= this.config.maxConcurrentSessions) {
      throw new Error(`Max concurrent sessions (${this.config.maxConcurrentSessions}) exceeded`);
    }

    // Create distributed trace
    const traceSpan = this.config.enableTracing
      ? this.tracer.createRootSpan('create_browser_session', {
          tenantId: this.config.tenantId,
          userId: this.config.userId,
          tier: this.config.tier
        })
      : null;

    try {
      // Create optimized browser controller
      const controller = createOptimizedBrowserController({
        headless: browserConfig?.headless ?? true,
        stealth: true,
        onStep: (action, detail) => {
          logger.debug(`[Session:${sessionId}] ${action}: ${detail}`);

          // Record in telemetry
          if (this.config.enableMonitoring) {
            this.telemetry.recordBrowserOperation({
              sessionId,
              operation: action,
              duration: 0,
              success: true,
              metadata: { detail }
            });
          }
        }
      });

      // Start browser
      await this.startOperationWithMonitoring(sessionId, 'browser_start', async () => {
        await controller.start();
      });

      // Store session
      this.sessions.set(sessionId, controller);
      this.sessionMetadata.set(sessionId, {
        userId: this.config.userId,
        tenantId: this.config.tenantId,
        createdAt: Date.now(),
        lastUsed: Date.now(),
        operations: 0
      });

      // Record session creation
      if (this.config.enableMonitoring) {
        this.telemetry.recordBrowserOperation({
          sessionId,
          operation: 'session_created',
          duration: Date.now() - (traceSpan?.startTime || Date.now()),
          success: true
        });
      }

      // Finish trace
      if (traceSpan) {
        this.tracer.finishSpan(traceSpan);
      }

      logger.info(`[EnterpriseBrowserManager] Session created: ${sessionId} for tenant ${this.config.tenantId}`);
      return controller;

    } catch (error) {
      // Record failure
      if (this.config.enableMonitoring) {
        this.telemetry.recordBrowserOperation({
          sessionId,
          operation: 'session_created',
          duration: 0,
          success: false,
          errorMessage: (error as Error).message
        });
      }

      // Finish trace with error
      if (traceSpan) {
        this.tracer.finishSpan(traceSpan, {
          code: 1,
          message: (error as Error).message
        });
      }

      throw error;
    }
  }

  /**
   * Execute operation with full monitoring and security
   */
  async executeOperation<T>(
    sessionId: string,
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    // Update session metadata
    const metadata = this.sessionMetadata.get(sessionId);
    if (metadata) {
      metadata.lastUsed = Date.now();
      metadata.operations++;
    }

    // Execute with monitoring
    return this.startOperationWithMonitoring(sessionId, operation, fn);
  }

  /**
   * Execute operation with monitoring
   */
  private async startOperationWithMonitoring<T>(
    sessionId: string,
    operation: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    const traceSpan = this.config.enableTracing
      ? this.tracer.createRootSpan(operation, { sessionId })
      : null;

    try {
      const result = await fn();

      const duration = Date.now() - startTime;

      // Record success
      if (this.config.enableMonitoring) {
        this.telemetry.recordBrowserOperation({
          sessionId,
          operation,
          duration,
          success: true
        });
      }

      // Finish trace
      if (traceSpan) {
        this.tracer.finishSpan(traceSpan);
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Record failure
      if (this.config.enableMonitoring) {
        this.telemetry.recordBrowserOperation({
          sessionId,
          operation,
          duration,
          success: false,
          errorMessage: (error as Error).message
        });
      }

      // Finish trace with error
      if (traceSpan) {
        this.tracer.finishSpan(traceSpan, {
          code: 1,
          message: (error as Error).message
        });
      }

      throw error;
    }
  }

  /**
   * Get session
   */
  getSession(sessionId: string): OptimizedBrowserController | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    try {
      await session.stop();
      this.sessions.delete(sessionId);
      this.sessionMetadata.delete(sessionId);

      // Record session closure
      if (this.config.enableMonitoring) {
        this.telemetry.recordBrowserOperation({
          sessionId,
          operation: 'session_closed',
          duration: 0,
          success: true
        });
      }

      logger.info(`[EnterpriseBrowserManager] Session closed: ${sessionId}`);
    } catch (error) {
      logger.error(`[EnterpriseBrowserManager] Error closing session ${sessionId}: ` + (error as Error).message);
    }
  }

  /**
   * Close all sessions for tenant
   */
  async closeAllSessions(): Promise<void> {
    const closePromises = Array.from(this.sessions.keys()).map(sessionId =>
      this.closeSession(sessionId)
    );

    await Promise.all(closePromises);
    logger.info(`[EnterpriseBrowserManager] All sessions closed for tenant ${this.config.tenantId}`);
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    totalSessions: number;
    activeSessions: number;
    totalOperations: number;
    avgOperationsPerSession: number;
    oldestSession: number;
    newestSession: number;
  } {
    const metadataArray = Array.from(this.sessionMetadata.values());
    const totalOperations = metadataArray.reduce((sum, m) => sum + m.operations, 0);
    const timestamps = metadataArray.map(m => m.createdAt);

    return {
      totalSessions: this.sessions.size,
      activeSessions: this.sessions.size,
      totalOperations,
      avgOperationsPerSession: this.sessions.size > 0
        ? totalOperations / this.sessions.size
        : 0,
      oldestSession: timestamps.length > 0 ? Math.min(...timestamps) : 0,
      newestSession: timestamps.length > 0 ? Math.max(...timestamps) : 0
    };
  }

  /**
   * Get health report
   */
  async getHealthReport(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    sessions: {
      totalSessions: number;
      activeSessions: number;
      totalOperations: number;
      avgOperationsPerSession: number;
      oldestSession: number;
      newestSession: number;
    };
    monitoring: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      issues: string[];
      score: number;
    };
    telemetry: {
      uptime: number;
      totalEvents: number;
      operationsPerSecond: number;
      averageDuration: number;
      overallSuccessRate: number;
      topOperations: Array<{ operation: string; count: number }>;
      recentErrors: any[];
    };
    rateLimiting: {
      currentClients: number;
      minuteRequests: number;
      hourRequests: number;
      dayRequests: number;
      currentConcurrent: number;
      limits: any;
    };
    recommendations: string[];
  }> {
    const monitoring = this.monitoring.getHealthStatus();
    const telemetry = this.telemetry.getSystemOverview();
    const rateLimiting = this.rateLimiter.getGlobalUsage();

    const recommendations: string[] = [];

    // Generate recommendations based on health
    if (monitoring.score < 80) {
      recommendations.push('System health score is below 80% - investigate issues');
    }

    if (this.sessions.size > this.config.maxConcurrentSessions * 0.9) {
      recommendations.push('Session capacity is near limit - consider scaling');
    }

    if (telemetry.overallSuccessRate < 0.95) {
      recommendations.push('Success rate is below 95% - review error patterns');
    }

    return {
      status: monitoring.score >= 80 ? 'healthy' : monitoring.score >= 50 ? 'degraded' : 'unhealthy',
      sessions: this.getSessionStats(),
      monitoring,
      telemetry,
      rateLimiting,
      recommendations
    };
  }

  /**
   * Start session cleanup
   */
  private startSessionCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const timeout = this.config.sessionTimeout;

      for (const [sessionId, metadata] of this.sessionMetadata.entries()) {
        if (now - metadata.lastUsed > timeout) {
          logger.info(`[EnterpriseBrowserManager] Session timeout: ${sessionId}`);
          this.closeSession(sessionId);
        }
      }
    }, 300000); // Check every 5 minutes
  }

  /**
   * Export enterprise data
   */
  exportData(): {
    sessions: {
      totalSessions: number;
      activeSessions: number;
      totalOperations: number;
      avgOperationsPerSession: number;
      oldestSession: number;
      newestSession: number;
    };
    monitoring: string;
    telemetry: string;
    security: string;
    traces: string;
  } {
    return {
      sessions: this.getSessionStats(),
      monitoring: this.monitoring.exportMonitoringData(),
      telemetry: this.telemetry.exportTelemetry(),
      security: this.security.exportAuditLog(),
      traces: this.tracer.exportTraces()
    };
  }

  /**
   * Reset manager
   */
  async reset(): Promise<void> {
    await this.closeAllSessions();
    this.sessions.clear();
    this.sessionMetadata.clear();
    logger.info(`[EnterpriseBrowserManager] Manager reset for tenant ${this.config.tenantId}`);
  }
}

// Global enterprise managers per tenant
const enterpriseManagers = new Map<string, EnterpriseBrowserManager>();

/**
 * Get or create enterprise browser manager for tenant
 */
export function getEnterpriseBrowserManager(config: EnterpriseBrowserConfig): EnterpriseBrowserManager {
  const key = `${config.tenantId}:${config.userId}`;

  if (!enterpriseManagers.has(key)) {
    enterpriseManagers.set(key, new EnterpriseBrowserManager(config));
  }

  return enterpriseManagers.get(key)!;
}

/**
 * Reset all enterprise managers
 */
export async function resetAllEnterpriseManagers(): Promise<void> {
  for (const manager of enterpriseManagers.values()) {
    await manager.reset();
  }
  enterpriseManagers.clear();
}
