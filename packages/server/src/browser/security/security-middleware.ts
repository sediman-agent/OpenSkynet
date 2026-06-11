/**
 * Enterprise Security Middleware
 * Production-grade security for browser operations
 * Optimized for industrial SaaS security and compliance
 */

import { createLogger } from '../../core/logging.js';
import { getRateLimiter, RateLimitResult } from './rate-limiter.js';
import { getTelemetryCollector } from '../monitoring/telemetry-collector.js';

const logger = createLogger('SecurityMiddleware');

export interface SecurityContext {
  userId: string;
  tenantId: string;
  apiKey: string;
  permissions: string[];
  roles: string[];
  tier: 'free' | 'basic' | 'pro' | 'enterprise';
  ipAddress?: string;
  userAgent?: string;
}

export interface SecurityPolicy {
  requireAuthentication: boolean;
  requireAuthorization: boolean;
  allowedOrigins: string[];
  allowedIPs?: string[];
  maxSessionDuration: number;
  allowedOperations: string[];
  rateLimitTier: 'free' | 'basic' | 'pro' | 'enterprise';
}

export interface AuditLogEntry {
  timestamp: number;
  userId: string;
  tenantId: string;
  operation: string;
  resource: string;
  action: string;
  result: 'success' | 'failure' | 'denied';
  statusCode?: number;
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export class SecurityMiddleware {
  private policies = new Map<string, SecurityPolicy>();
  private auditLog: AuditLogEntry[] = [];
  private maxAuditLogSize = 100000;
  private rateLimiter = getRateLimiter('enterprise');
  private telemetry = getTelemetryCollector();

  // Security event tracking
  private securityEvents = new Map<string, number>();
  private blockedIPs = new Set<string>();

  constructor() {
    this.initializeDefaultPolicies();
    this.startSecurityMonitoring();
  }

  /**
   * Initialize default security policies
   */
  private initializeDefaultPolicies(): void {
    // Free tier policy
    this.policies.set('free', {
      requireAuthentication: true,
      requireAuthorization: true,
      allowedOrigins: ['*'],
      maxSessionDuration: 3600000, // 1 hour
      allowedOperations: ['navigate', 'screenshot', 'extract_text'],
      rateLimitTier: 'free'
    });

    // Basic tier policy
    this.policies.set('basic', {
      requireAuthentication: true,
      requireAuthorization: true,
      allowedOrigins: ['*'],
      maxSessionDuration: 7200000, // 2 hours
      allowedOperations: ['navigate', 'screenshot', 'extract_text', 'click', 'type_text'],
      rateLimitTier: 'basic'
    });

    // Pro tier policy
    this.policies.set('pro', {
      requireAuthentication: true,
      requireAuthorization: true,
      allowedOrigins: ['*'],
      maxSessionDuration: 14400000, // 4 hours
      allowedOperations: ['*'], // All operations
      rateLimitTier: 'pro'
    });

    // Enterprise tier policy
    this.policies.set('enterprise', {
      requireAuthentication: true,
      requireAuthorization: true,
      allowedOrigins: ['*'],
      maxSessionDuration: 86400000, // 24 hours
      allowedOperations: ['*'], // All operations
      rateLimitTier: 'enterprise'
    });
  }

  /**
   * Authenticate request
   */
  async authenticateRequest(request: {
    apiKey?: string;
    token?: string;
    sessionId?: string;
  }): Promise<SecurityContext | null> {
    // In production, this would validate against a real auth system
    // For now, we'll do basic validation

    if (!request.apiKey && !request.token) {
      logger.warn('[SecurityMiddleware] Authentication failed: No credentials provided');
      return null;
    }

    // Basic API key validation
    if (request.apiKey && !this.isValidApiKey(request.apiKey)) {
      logger.warn('[SecurityMiddleware] Authentication failed: Invalid API key');
      return null;
    }

    // Token validation (JWT or similar)
    if (request.token && !this.isValidToken(request.token)) {
      logger.warn('[SecurityMiddleware] Authentication failed: Invalid token');
      return null;
    }

    // Create security context (in production, this would come from user database)
    const tier = this.getTierFromApiKey(request.apiKey || '');

    return {
      userId: this.extractUserIdFromApiKey(request.apiKey || ''),
      tenantId: this.extractTenantIdFromApiKey(request.apiKey || ''),
      apiKey: request.apiKey || '',
      permissions: this.getPermissionsForTier(tier),
      roles: [tier],
      tier
    };
  }

  /**
   * Authorize operation
   */
  async authorizeOperation(context: SecurityContext, operation: string): Promise<boolean> {
    const policy = this.policies.get(context.tier);

    if (!policy) {
      logger.error(`[SecurityMiddleware] No policy found for tier: ${context.tier}`);
      return false;
    }

    // Check if operation is allowed
    if (!this.isOperationAllowed(operation, policy.allowedOperations)) {
      logger.warn(`[SecurityMiddleware] Operation ${operation} not allowed for tier ${context.tier}`);
      return false;
    }

    // Check rate limits
    const rateLimitResult = await this.rateLimiter.checkLimit(context.userId);

    if (!rateLimitResult.allowed) {
      logger.warn(`[SecurityMiddleware] Rate limit exceeded for user ${context.userId}`);
      this.recordSecurityEvent('rate_limit_exceeded', context.userId);
      return false;
    }

    return true;
  }

  /**
   * Check if operation is allowed
   */
  private isOperationAllowed(operation: string, allowedOperations: string[]): boolean {
    return allowedOperations.includes('*') || allowedOperations.includes(operation);
  }

  /**
   * Validate API key format
   */
  private isValidApiKey(apiKey: string): boolean {
    // Basic validation: should be at least 20 characters
    return apiKey.length >= 20;
  }

  /**
   * Validate token format
   */
  private isValidToken(token: string): boolean {
    // Basic validation: JWT format check
    const parts = token.split('.');
    return parts.length === 3;
  }

  /**
   * Extract user ID from API key
   */
  private extractUserIdFromApiKey(apiKey: string): string {
    // In production, this would decode the API key
    return apiKey.substring(0, 8);
  }

  /**
   * Extract tenant ID from API key
   */
  private extractTenantIdFromApiKey(apiKey: string): string {
    // In production, this would decode the API key
    return 'default-tenant';
  }

  /**
   * Get tier from API key
   */
  private getTierFromApiKey(apiKey: string): 'free' | 'basic' | 'pro' | 'enterprise' {
    // In production, this would be determined from the user database
    if (apiKey.startsWith('enterprise_')) return 'enterprise';
    if (apiKey.startsWith('pro_')) return 'pro';
    if (apiKey.startsWith('basic_')) return 'basic';
    return 'free';
  }

  /**
   * Get permissions for tier
   */
  private getPermissionsForTier(tier: string): string[] {
    const permissions: Record<string, string[]> = {
      free: ['read:basic'],
      basic: ['read:basic', 'write:basic'],
      pro: ['read:all', 'write:all', 'admin:basic'],
      enterprise: ['read:all', 'write:all', 'admin:all', 'manage:users']
    };

    return permissions[tier] || permissions.free;
  }

  /**
   * Record security event
   */
  private recordSecurityEvent(eventType: string, userId: string): void {
    const key = `${eventType}:${userId}`;
    this.securityEvents.set(key, (this.securityEvents.get(key) || 0) + 1);

    // Check for suspicious patterns
    const count = this.securityEvents.get(key)!;
    if (count > 10) {
      logger.error(`[SecurityMiddleware] Suspicious activity detected: ${eventType} for user ${userId} (${count} events)`);
      // Could trigger additional security measures here
    }
  }

  /**
   * Block IP address
   */
  blockIP(ipAddress: string, duration: number = 3600000): void {
    this.blockedIPs.add(ipAddress);
    logger.warn(`[SecurityMiddleware] Blocked IP: ${ipAddress} for ${duration}ms`);

    // Unblock after duration
    setTimeout(() => {
      this.blockedIPs.delete(ipAddress);
      logger.info(`[SecurityMiddleware] Unblocked IP: ${ipAddress}`);
    }, duration);
  }

  /**
   * Check if IP is blocked
   */
  isIPBlocked(ipAddress: string): boolean {
    return this.blockedIPs.has(ipAddress);
  }

  /**
   * Add audit log entry
   */
  addAuditLog(entry: AuditLogEntry): void {
    this.auditLog.push(entry);

    // Keep audit log manageable
    if (this.auditLog.length > this.maxAuditLogSize) {
      this.auditLog.shift();
    }

    // Log to telemetry
    this.telemetry.recordBrowserOperation({
      sessionId: entry.sessionId || 'unknown',
      operation: entry.operation,
      duration: 0,
      success: entry.result === 'success',
      errorCode: entry.result === 'failure' ? 'OPERATION_FAILED' : undefined,
      errorMessage: entry.errorMessage,
      metadata: {
        auditLog: true,
        userId: entry.userId,
        tenantId: entry.tenantId
      }
    });
  }

  /**
   * Get audit log
   */
  getAuditLog(filters?: {
    userId?: string;
    tenantId?: string;
    operation?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): AuditLogEntry[] {
    let entries = [...this.auditLog];

    if (filters?.userId) {
      entries = entries.filter(e => e.userId === filters.userId);
    }

    if (filters?.tenantId) {
      entries = entries.filter(e => e.tenantId === filters.tenantId);
    }

    if (filters?.operation) {
      entries = entries.filter(e => e.operation === filters.operation);
    }

    if (filters?.startTime) {
      entries = entries.filter(e => e.timestamp >= filters.startTime!);
    }

    if (filters?.endTime) {
      entries = entries.filter(e => e.timestamp <= filters.endTime!);
    }

    // Sort by timestamp descending
    entries.sort((a, b) => b.timestamp - a.timestamp);

    // Apply limit
    if (filters?.limit) {
      entries = entries.slice(0, filters.limit);
    }

    return entries;
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    totalAuditEntries: number;
    blockedIPs: number;
    securityEvents: number;
    topSecurityEvents: Array<{ event: string; count: number }>;
    recentFailures: AuditLogEntry[];
  } {
    // Get top security events
    const eventCounts = new Map<string, number>();
    for (const [event, count] of this.securityEvents.entries()) {
      const eventType = event.split(':')[0];
      eventCounts.set(eventType, (eventCounts.get(eventType) || 0) + count);
    }

    const topSecurityEvents = Array.from(eventCounts.entries())
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Get recent failures
    const recentFailures = this.auditLog
      .filter(e => e.result === 'failure' || e.result === 'denied')
      .filter(e => Date.now() - e.timestamp < 3600000) // Last hour
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);

    return {
      totalAuditEntries: this.auditLog.length,
      blockedIPs: this.blockedIPs.size,
      securityEvents: this.securityEvents.size,
      topSecurityEvents,
      recentFailures
    };
  }

  /**
   * Start security monitoring
   */
  private startSecurityMonitoring(): void {
    // Periodic security checks
    setInterval(() => {
      this.detectAnomalies();
    }, 60000); // Every minute

    logger.info('[SecurityMiddleware] Security monitoring started');
  }

  /**
   * Detect security anomalies
   */
  private detectAnomalies(): void {
    // Check for unusual patterns
    const now = Date.now();
    const hourAgo = now - 3600000;

    // Get failed operations in last hour
    const recentFailures = this.auditLog.filter(
      e => (e.result === 'failure' || e.result === 'denied') && e.timestamp >= hourAgo
    );

    // Check for repeated failures from same user
    const userFailures = new Map<string, number>();
    for (const failure of recentFailures) {
      userFailures.set(failure.userId, (userFailures.get(failure.userId) || 0) + 1);
    }

    // Alert on suspicious activity
    for (const [userId, count] of userFailures.entries()) {
      if (count > 20) {
        logger.error(`[SecurityMiddleware] Suspicious activity: User ${userId} has ${count} failed operations in last hour`);
      }
    }

    // Check for unusual IP addresses
    const ipFailures = new Map<string, number>();
    for (const failure of recentFailures) {
      if (failure.ipAddress) {
        ipFailures.set(failure.ipAddress, (ipFailures.get(failure.ipAddress) || 0) + 1);
      }
    }

    // Block suspicious IPs
    for (const [ip, count] of ipFailures.entries()) {
      if (count > 50) {
        logger.warn(`[SecurityMiddleware] Blocking suspicious IP: ${ip} (${count} failures)`);
        this.blockIP(ip, 3600000); // Block for 1 hour
      }
    }
  }

  /**
   * Export audit log
   */
  exportAuditLog(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify({
        entries: this.auditLog.slice(-10000), // Last 10k entries
        statistics: this.getSecurityStats()
      }, null, 2);
    } else {
      // CSV format
      const headers = ['timestamp', 'userId', 'tenantId', 'operation', 'resource', 'action', 'result', 'ipAddress'];
      const rows = this.auditLog.map(e => [
        e.timestamp,
        e.userId,
        e.tenantId,
        e.operation,
        e.resource,
        e.action,
        e.result,
        e.ipAddress || ''
      ]);

      return [headers, ...rows]
        .map(row => row.join(','))
        .join('\n');
    }
  }

  /**
   * Clear old audit log entries
   */
  clearOldAuditLogEntries(olderThanMs: number = 2592000000): void {
    // Default: 30 days
    const cutoff = Date.now() - olderThanMs;
    const initialSize = this.auditLog.length;
    this.auditLog = this.auditLog.filter(e => e.timestamp >= cutoff);
    const cleared = initialSize - this.auditLog.length;
    logger.info(`[SecurityMiddleware] Cleared ${cleared} old audit log entries`);
  }

  /**
   * Reset security middleware
   */
  reset(): void {
    this.auditLog = [];
    this.securityEvents.clear();
    this.blockedIPs.clear();
    logger.info('[SecurityMiddleware] Security middleware reset');
  }
}

// Global security middleware instance
let globalSecurityMiddleware: SecurityMiddleware | null = null;

/**
 * Get the global security middleware
 */
export function getSecurityMiddleware(): SecurityMiddleware {
  if (!globalSecurityMiddleware) {
    globalSecurityMiddleware = new SecurityMiddleware();
  }
  return globalSecurityMiddleware;
}

/**
 * Reset the global security middleware
 */
export function resetSecurityMiddleware(): void {
  if (globalSecurityMiddleware) {
    globalSecurityMiddleware.reset();
  }
  globalSecurityMiddleware = null;
}
