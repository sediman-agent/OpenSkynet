/**
 * Enterprise Monitoring Dashboard
 * Production-grade monitoring and alerting for browser operations
 * Optimized for industrial SaaS observability and operations
 */

import { createLogger } from '../../core/logging.js';
import { getTelemetryCollector, TelemetryMetrics } from './telemetry-collector.js';
import { getDistributedTracer } from './distributed-tracing.js';
import { getRateLimiter } from '../security/rate-limiter.js';

const logger = createLogger('MonitoringDashboard');

export interface AlertRule {
  name: string;
  condition: (metrics: MonitoringData) => boolean;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  cooldown: number; // milliseconds
  lastTriggered?: number;
}

export interface MonitoringData {
  timestamp: number;
  system: {
    uptime: number;
    totalOperations: number;
    operationsPerSecond: number;
    averageDuration: number;
    overallSuccessRate: number;
  };
  performance: {
    p50Duration: number;
    p95Duration: number;
    p99Duration: number;
    errorRate: number;
    timeoutRate: number;
  };
  resources: {
    memoryUsageMb: number;
    cpuPercent: number;
    activeConnections: number;
    activeSessions: number;
  };
  business: {
    totalUsers: number;
    activeUsers: number;
    requestsPerMinute: number;
    topOperations: Array<{ operation: string; count: number }>;
  };
}

export interface Alert {
  id: string;
  ruleName: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  timestamp: number;
  resolved: boolean;
  resolvedAt?: number;
  metadata?: Record<string, any>;
}

export class MonitoringDashboard {
  private telemetry = getTelemetryCollector();
  private tracer = getDistributedTracer();
  private rateLimiter = getRateLimiter('enterprise');

  private alertRules: AlertRule[] = [];
  private activeAlerts: Map<string, Alert> = new Map();
  private alertHistory: Alert[] = [];
  private maxAlertHistory = 10000;

  private checkInterval = 30000; // 30 seconds
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeDefaultAlertRules();
    this.startMonitoring();
  }

  /**
   * Initialize default alert rules
   */
  private initializeDefaultAlertRules(): void {
    // High error rate alert
    this.addAlertRule({
      name: 'high-error-rate',
      condition: (data) => data.system.overallSuccessRate < 0.95,
      severity: 'error',
      message: 'Error rate exceeds 5%',
      cooldown: 300000 // 5 minutes
    });

    // Critical error rate alert
    this.addAlertRule({
      name: 'critical-error-rate',
      condition: (data) => data.system.overallSuccessRate < 0.90,
      severity: 'critical',
      message: 'Error rate exceeds 10% - CRITICAL',
      cooldown: 180000 // 3 minutes
    });

    // Slow operations alert
    this.addAlertRule({
      name: 'slow-operations',
      condition: (data) => data.performance.p95Duration > 5000,
      severity: 'warning',
      message: 'P95 duration exceeds 5 seconds',
      cooldown: 600000 // 10 minutes
    });

    // Very slow operations alert
    this.addAlertRule({
      name: 'very-slow-operations',
      condition: (data) => data.performance.p99Duration > 10000,
      severity: 'error',
      message: 'P99 duration exceeds 10 seconds',
      cooldown: 300000 // 5 minutes
    });

    // Low operations per second
    this.addAlertRule({
      name: 'low-ops-per-second',
      condition: (data) => data.system.operationsPerSecond < 1,
      severity: 'info',
      message: 'Operations per second is below 1',
      cooldown: 600000 // 10 minutes
    });

    // High memory usage
    this.addAlertRule({
      name: 'high-memory-usage',
      condition: (data) => data.resources.memoryUsageMb > 1000,
      severity: 'warning',
      message: 'Memory usage exceeds 1GB',
      cooldown: 300000 // 5 minutes
    });

    // Critical memory usage
    this.addAlertRule({
      name: 'critical-memory-usage',
      condition: (data) => data.resources.memoryUsageMb > 2000,
      severity: 'critical',
      message: 'Memory usage exceeds 2GB - CRITICAL',
      cooldown: 180000 // 3 minutes
    });

    // High timeout rate
    this.addAlertRule({
      name: 'high-timeout-rate',
      condition: (data) => data.performance.timeoutRate > 0.05,
      severity: 'error',
      message: 'Timeout rate exceeds 5%',
      cooldown: 300000 // 5 minutes
    });

    // Low success rate
    this.addAlertRule({
      name: 'low-success-rate',
      condition: (data) => data.system.overallSuccessRate < 0.98,
      severity: 'warning',
      message: 'Success rate below 98%',
      cooldown: 300000 // 5 minutes
    });

    // Session exhaustion
    this.addAlertRule({
      name: 'session-exhaustion',
      condition: (data) => data.resources.activeSessions > 100,
      severity: 'warning',
      message: 'Active sessions exceed 100',
      cooldown: 600000 // 10 minutes
    });
  }

  /**
   * Add custom alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.push(rule);
    logger.info(`[MonitoringDashboard] Alert rule added: ${rule.name}`);
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleName: string): void {
    this.alertRules = this.alertRules.filter(rule => rule.name !== ruleName);
    logger.info(`[MonitoringDashboard] Alert rule removed: ${ruleName}`);
  }

  /**
   * Get current monitoring data
   */
  private getCurrentData(): MonitoringData {
    const telemetryOverview = this.telemetry.getSystemOverview();
    const tracerStats = this.tracer.getStatistics();
    const rateLimiterStats = this.rateLimiter.getGlobalUsage();

    // Get operation metrics for performance percentiles
    const allMetrics = this.telemetry.getAllMetrics();
    const operationMetrics = Object.values(allMetrics);

    // Calculate aggregate performance metrics
    const p50Durations = operationMetrics.map(m => m.p50Duration).filter(d => d > 0);
    const p95Durations = operationMetrics.map(m => m.p95Duration).filter(d => d > 0);
    const p99Durations = operationMetrics.map(m => m.p99Duration).filter(d => d > 0);

    const p50Duration = p50Durations.length > 0
      ? p50Durations.reduce((sum, d) => sum + d, 0) / p50Durations.length
      : 0;

    const p95Duration = p95Durations.length > 0
      ? p95Durations.reduce((sum, d) => sum + d, 0) / p95Durations.length
      : 0;

    const p99Duration = p99Durations.length > 0
      ? p99Durations.reduce((sum, d) => sum + d, 0) / p99Durations.length
      : 0;

    // Calculate error and timeout rates
    const totalFailed = operationMetrics.reduce((sum, m) => sum + m.failedOperations, 0);
    const totalOps = operationMetrics.reduce((sum, m) => sum + m.totalOperations, 0);
    const errorRate = totalOps > 0 ? totalFailed / totalOps : 0;

    // Estimate timeout rate (would need actual timeout tracking)
    const timeoutRate = errorRate * 0.3; // Assume 30% of errors are timeouts

    // Get resource usage
    const memoryUsage = process.memoryUsage();
    const memoryUsageMb = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    return {
      timestamp: Date.now(),
      system: {
        uptime: telemetryOverview.uptime,
        totalOperations: telemetryOverview.totalEvents,
        operationsPerSecond: telemetryOverview.operationsPerSecond,
        averageDuration: telemetryOverview.averageDuration,
        overallSuccessRate: telemetryOverview.overallSuccessRate
      },
      performance: {
        p50Duration,
        p95Duration,
        p99Duration,
        errorRate,
        timeoutRate
      },
      resources: {
        memoryUsageMb,
        cpuPercent: 0, // Would need CPU monitoring
        activeConnections: rateLimiterStats.currentConcurrent,
        activeSessions: rateLimiterStats.currentClients
      },
      business: {
        totalUsers: rateLimiterStats.currentClients,
        activeUsers: rateLimiterStats.currentClients,
        requestsPerMinute: rateLimiterStats.minuteRequests,
        topOperations: telemetryOverview.topOperations
      }
    };
  }

  /**
   * Check alert rules and trigger alerts
   */
  private checkAlerts(data: MonitoringData): void {
    const now = Date.now();

    for (const rule of this.alertRules) {
      // Check cooldown
      if (rule.lastTriggered && (now - rule.lastTriggered) < rule.cooldown) {
        continue;
      }

      // Check condition
      if (rule.condition(data)) {
        this.triggerAlert(rule, data);
        rule.lastTriggered = now;
      }
    }
  }

  /**
   * Trigger alert
   */
  private triggerAlert(rule: AlertRule, data: MonitoringData): void {
    const alert: Alert = {
      id: this.generateAlertId(),
      ruleName: rule.name,
      severity: rule.severity,
      message: rule.message,
      timestamp: Date.now(),
      resolved: false,
      metadata: {
        systemData: data.system,
        performanceData: data.performance,
        resourceData: data.resources
      }
    };

    this.activeAlerts.set(alert.id, alert);
    this.alertHistory.push(alert);

    // Keep alert history manageable
    if (this.alertHistory.length > this.maxAlertHistory) {
      this.alertHistory.shift();
    }

    // Log alert
    logger.error(`[ALERT] ${rule.severity.toUpperCase()}: ${rule.message} - Alert ID: ${alert.id}`);

    // Could integrate with external alerting systems here
    // (PagerDuty, Slack, email, etc.)
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.activeAlerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = Date.now();
      this.activeAlerts.delete(alertId);

      logger.info(`[MonitoringDashboard] Alert resolved: ${alertId}`);
    }
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start monitoring loop
   */
  private startMonitoring(): void {
    this.intervalId = setInterval(() => {
      try {
        const data = this.getCurrentData();
        this.checkAlerts(data);
      } catch (error) {
        logger.error('[MonitoringDashboard] Error checking alerts: ' + (error as Error).message);
      }
    }, this.checkInterval);

    logger.info('[MonitoringDashboard] Monitoring started');
  }

  /**
   * Stop monitoring loop
   */
  stopMonitoring(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('[MonitoringDashboard] Monitoring stopped');
    }
  }

  /**
   * Get dashboard data
   */
  getDashboardData(): {
    monitoring: MonitoringData;
    alerts: {
      active: Alert[];
      recent: Alert[];
      total: number;
    };
    trends: {
      errorRate: number;
      performance: number;
      resourceUsage: number;
    };
  } {
    const data = this.getCurrentData();
    const activeAlerts = Array.from(this.activeAlerts.values());
    const recentAlerts = this.alertHistory.slice(-100);

    // Calculate trend scores (0-100)
    const errorRateScore = (1 - data.performance.errorRate) * 100;
    const performanceScore = Math.max(0, 100 - (data.performance.p95Duration / 100)); // Normalize duration
    const resourceScore = Math.max(0, 100 - (data.resources.memoryUsageMb / 20)); // Normalize memory

    return {
      monitoring: data,
      alerts: {
        active: activeAlerts,
        recent: recentAlerts,
        total: this.alertHistory.length
      },
      trends: {
        errorRate: errorRateScore,
        performance: performanceScore,
        resourceUsage: resourceScore
      }
    };
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
    score: number;
  } {
    const data = this.getCurrentData();
    const activeAlerts = Array.from(this.activeAlerts.values());

    const issues: string[] = [];
    let score = 100;

    // Check error rate
    if (data.performance.errorRate > 0.1) {
      issues.push(`High error rate: ${(data.performance.errorRate * 100).toFixed(1)}%`);
      score -= 30;
    } else if (data.performance.errorRate > 0.05) {
      issues.push(`Elevated error rate: ${(data.performance.errorRate * 100).toFixed(1)}%`);
      score -= 15;
    }

    // Check performance
    if (data.performance.p95Duration > 10000) {
      issues.push(`Very slow operations: P95 ${data.performance.p95Duration}ms`);
      score -= 25;
    } else if (data.performance.p95Duration > 5000) {
      issues.push(`Slow operations: P95 ${data.performance.p95Duration}ms`);
      score -= 10;
    }

    // Check resource usage
    if (data.resources.memoryUsageMb > 2000) {
      issues.push(`Critical memory usage: ${data.resources.memoryUsageMb}MB`);
      score -= 35;
    } else if (data.resources.memoryUsageMb > 1000) {
      issues.push(`High memory usage: ${data.resources.memoryUsageMb}MB`);
      score -= 15;
    }

    // Check active alerts
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical').length;
    const errorAlerts = activeAlerts.filter(a => a.severity === 'error').length;

    if (criticalAlerts > 0) {
      issues.push(`${criticalAlerts} critical alert(s) active`);
      score -= 40;
    } else if (errorAlerts > 0) {
      issues.push(`${errorAlerts} error alert(s) active`);
      score -= 20;
    }

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (score >= 80) {
      status = 'healthy';
    } else if (score >= 50) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      issues,
      score: Math.max(0, score)
    };
  }

  /**
   * Get monitoring report
   */
  getMonitoringReport(): {
    summary: MonitoringData;
    health: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      issues: string[];
      score: number;
    };
    alerts: {
      active: Alert[];
      resolvedToday: number;
      topAlerts: Array<{ rule: string; count: number }>;
    };
    recommendations: string[];
  } {
    const data = this.getDashboardData();
    const health = this.getHealthStatus();

    // Count resolved alerts today
    const today = Date.now() - 86400000;
    const resolvedToday = this.alertHistory.filter(
      a => a.resolved && a.resolvedAt && a.resolvedAt >= today
    ).length;

    // Get top alerts
    const alertCounts = new Map<string, number>();
    for (const alert of this.alertHistory) {
      alertCounts.set(alert.ruleName, (alertCounts.get(alert.ruleName) || 0) + 1);
    }

    const topAlerts = Array.from(alertCounts.entries())
      .map(([rule, count]) => ({ rule, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Generate recommendations
    const recommendations: string[] = [];

    if (health.score < 80) {
      recommendations.push('System health score is below 80% - investigate issues');
    }

    if (data.monitoring.performance.errorRate > 0.05) {
      recommendations.push('Error rate is elevated - review error logs and patterns');
    }

    if (data.monitoring.performance.p95Duration > 3000) {
      recommendations.push('Operations are slow - consider optimization or scaling');
    }

    if (data.monitoring.resources.memoryUsageMb > 1000) {
      recommendations.push('Memory usage is high - consider cleanup or scaling');
    }

    if (data.alerts.active.length > 5) {
      recommendations.push('Multiple alerts active - prioritize resolution');
    }

    return {
      summary: data.monitoring,
      health,
      alerts: {
        active: data.alerts.active,
        resolvedToday,
        topAlerts
      },
      recommendations
    };
  }

  /**
   * Export monitoring data
   */
  exportMonitoringData(format: 'json' | 'prometheus' = 'json'): string {
    const data = this.getDashboardData();

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    } else {
      // Prometheus format
      const lines: string[] = [];

      // System metrics
      lines.push(`# HELP system_uptime_seconds System uptime in seconds`);
      lines.push(`# TYPE system_uptime_seconds gauge`);
      lines.push(`system_uptime_seconds ${data.monitoring.system.uptime / 1000}`);

      lines.push(`# HELP operations_per_second Current operations per second`);
      lines.push(`# TYPE operations_per_second gauge`);
      lines.push(`operations_per_second ${data.monitoring.system.operationsPerSecond}`);

      // Performance metrics
      lines.push(`# HELP operation_duration_p95_seconds P95 operation duration in seconds`);
      lines.push(`# TYPE operation_duration_p95_seconds gauge`);
      lines.push(`operation_duration_p95_seconds ${data.monitoring.performance.p95Duration / 1000}`);

      lines.push(`# HELP error_rate_ratio Current error rate`);
      lines.push(`# TYPE error_rate_ratio gauge`);
      lines.push(`error_rate_ratio ${data.monitoring.performance.errorRate}`);

      // Resource metrics
      lines.push(`# HELP memory_usage_mb Current memory usage in MB`);
      lines.push(`# TYPE memory_usage_mb gauge`);
      lines.push(`memory_usage_mb ${data.monitoring.resources.memoryUsageMb}`);

      lines.push(`# HELP active_sessions Current active sessions`);
      lines.push(`# TYPE active_sessions gauge`);
      lines.push(`active_sessions ${data.monitoring.resources.activeSessions}`);

      // Alert metrics
      lines.push(`# HELP active_alerts Current active alerts`);
      lines.push(`# TYPE active_alerts gauge`);
      lines.push(`active_alerts ${data.alerts.active.length}`);

      return lines.join('\n');
    }
  }

  /**
   * Reset monitoring
   */
  reset(): void {
    this.stopMonitoring();
    this.activeAlerts.clear();
    this.alertHistory = [];
    this.initializeDefaultAlertRules();
    this.startMonitoring();
    logger.info('[MonitoringDashboard] Monitoring reset');
  }
}

// Global monitoring dashboard instance
let globalMonitoringDashboard: MonitoringDashboard | null = null;

/**
 * Get the global monitoring dashboard
 */
export function getMonitoringDashboard(): MonitoringDashboard {
  if (!globalMonitoringDashboard) {
    globalMonitoringDashboard = new MonitoringDashboard();
  }
  return globalMonitoringDashboard;
}

/**
 * Reset the global monitoring dashboard
 */
export function resetMonitoringDashboard(): void {
  if (globalMonitoringDashboard) {
    globalMonitoringDashboard.reset();
  }
  globalMonitoringDashboard = null;
}
