/**
 * Enterprise Rate Limiter
 * Production-grade rate limiting for browser operations
 * Optimized for industrial SaaS multi-tenant environments
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('RateLimiter');

export interface RateLimitConfig {
  requestsPerMinute: number;
  requestsPerHour: number;
  requestsPerDay: number;
  burstLimit: number;
  concurrentOperations: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  quotaRemaining?: {
    minute: number;
    hour: number;
    day: number;
  };
  limitExceeded?: 'minute' | 'hour' | 'day' | 'burst' | 'concurrent';
}

export interface ClientUsage {
  clientId: string;
  minuteRequests: number;
  hourRequests: number;
  dayRequests: number;
  currentConcurrent: number;
  lastRequestTime: number;
  resetTimes: {
    minute: number;
    hour: number;
    day: number;
  };
}

export class RateLimiter {
  private clients = new Map<string, ClientUsage>();
  private globalUsage = {
    minuteRequests: 0,
    hourRequests: 0,
    dayRequests: 0,
    currentConcurrent: 0,
    resetTimes: {
      minute: 0,
      hour: 0,
      day: 0
    }
  };

  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = {
      requestsPerMinute: 100,
      requestsPerHour: 1000,
      requestsPerDay: 10000,
      burstLimit: 20,
      concurrentOperations: 10,
      ...config
    };

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Check if request is allowed for client
   */
  async checkLimit(clientId: string): Promise<RateLimitResult> {
    const now = Date.now();
    let client = this.clients.get(clientId);

    // Initialize client if not exists
    if (!client) {
      client = this.initializeClient(clientId, now);
      this.clients.set(clientId, client);
    }

    // Reset counters if time window expired
    this.resetCountersIfNeeded(client, now);
    this.resetGlobalCountersIfNeeded(now);

    // Check burst limit (requests in rapid succession)
    const timeSinceLastRequest = now - client.lastRequestTime;
    if (timeSinceLastRequest < 100 && client.minuteRequests >= this.config.burstLimit) {
      logger.warn(`[RateLimiter] Burst limit exceeded for ${clientId}`);
      return {
        allowed: false,
        retryAfter: 100,
        limitExceeded: 'burst'
      };
    }

    // Check concurrent operations
    if (client.currentConcurrent >= this.config.concurrentOperations) {
      logger.warn(`[RateLimiter] Concurrent limit exceeded for ${clientId}`);
      return {
        allowed: false,
        retryAfter: 5000,
        limitExceeded: 'concurrent'
      };
    }

    // Check minute limit
    if (client.minuteRequests >= this.config.requestsPerMinute) {
      logger.warn(`[RateLimiter] Minute limit exceeded for ${clientId}`);
      return {
        allowed: false,
        retryAfter: client.resetTimes.minute - now,
        limitExceeded: 'minute'
      };
    }

    // Check hour limit
    if (client.hourRequests >= this.config.requestsPerHour) {
      logger.warn(`[RateLimiter] Hour limit exceeded for ${clientId}`);
      return {
        allowed: false,
        retryAfter: client.resetTimes.hour - now,
        limitExceeded: 'hour'
      };
    }

    // Check day limit
    if (client.dayRequests >= this.config.requestsPerDay) {
      logger.warn(`[RateLimiter] Day limit exceeded for ${clientId}`);
      return {
        allowed: false,
        retryAfter: client.resetTimes.day - now,
        limitExceeded: 'day'
      };
    }

    // Request allowed
    client.minuteRequests++;
    client.hourRequests++;
    client.dayRequests++;
    client.lastRequestTime = now;
    client.currentConcurrent++;

    this.globalUsage.minuteRequests++;
    this.globalUsage.hourRequests++;
    this.globalUsage.dayRequests++;
    this.globalUsage.currentConcurrent++;

    return {
      allowed: true,
      quotaRemaining: {
        minute: this.config.requestsPerMinute - client.minuteRequests,
        hour: this.config.requestsPerHour - client.hourRequests,
        day: this.config.requestsPerDay - client.dayRequests
      }
    };
  }

  /**
   * Mark operation as completed
   */
  releaseOperation(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client && client.currentConcurrent > 0) {
      client.currentConcurrent--;
    }

    if (this.globalUsage.currentConcurrent > 0) {
      this.globalUsage.currentConcurrent--;
    }
  }

  /**
   * Initialize new client
   */
  private initializeClient(clientId: string, now: number): ClientUsage {
    return {
      clientId,
      minuteRequests: 0,
      hourRequests: 0,
      dayRequests: 0,
      currentConcurrent: 0,
      lastRequestTime: now,
      resetTimes: {
        minute: this.getNextMinute(now),
        hour: this.getNextHour(now),
        day: this.getNextDay(now)
      }
    };
  }

  /**
   * Reset counters if time window expired
   */
  private resetCountersIfNeeded(client: ClientUsage, now: number): void {
    if (now >= client.resetTimes.minute) {
      client.minuteRequests = 0;
      client.resetTimes.minute = this.getNextMinute(now);
    }

    if (now >= client.resetTimes.hour) {
      client.hourRequests = 0;
      client.resetTimes.hour = this.getNextHour(now);
    }

    if (now >= client.resetTimes.day) {
      client.dayRequests = 0;
      client.resetTimes.day = this.getNextDay(now);
    }
  }

  /**
   * Reset global counters if time window expired
   */
  private resetGlobalCountersIfNeeded(now: number): void {
    if (now >= this.globalUsage.resetTimes.minute) {
      this.globalUsage.minuteRequests = 0;
      this.globalUsage.resetTimes.minute = this.getNextMinute(now);
    }

    if (now >= this.globalUsage.resetTimes.hour) {
      this.globalUsage.hourRequests = 0;
      this.globalUsage.resetTimes.hour = this.getNextHour(now);
    }

    if (now >= this.globalUsage.resetTimes.day) {
      this.globalUsage.dayRequests = 0;
      this.globalUsage.resetTimes.day = this.getNextDay(now);
    }
  }

  /**
   * Get next minute timestamp
   */
  private getNextMinute(now: number): number {
    return Math.floor(now / 60000) * 60000 + 60000;
  }

  /**
   * Get next hour timestamp
   */
  private getNextHour(now: number): number {
    return Math.floor(now / 3600000) * 3600000 + 3600000;
  }

  /**
   * Get next day timestamp
   */
  private getNextDay(now: number): number {
    return Math.floor(now / 86400000) * 86400000 + 86400000;
  }

  /**
   * Get client usage statistics
   */
  getClientUsage(clientId: string): ClientUsage | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get global usage statistics
   */
  getGlobalUsage(): {
    currentClients: number;
    minuteRequests: number;
    hourRequests: number;
    dayRequests: number;
    currentConcurrent: number;
    limits: RateLimitConfig;
  } {
    return {
      currentClients: this.clients.size,
      minuteRequests: this.globalUsage.minuteRequests,
      hourRequests: this.globalUsage.hourRequests,
      dayRequests: this.globalUsage.dayRequests,
      currentConcurrent: this.globalUsage.currentConcurrent,
      limits: { ...this.config }
    };
  }

  /**
   * Get top consumers
   */
  getTopConsumers(limit: number = 10): Array<{
    clientId: string;
    dayRequests: number;
    hourRequests: number;
    minuteRequests: number;
  }> {
    const consumers = Array.from(this.clients.values())
      .map(client => ({
        clientId: client.clientId,
        dayRequests: client.dayRequests,
        hourRequests: client.hourRequests,
        minuteRequests: client.minuteRequests
      }))
      .sort((a, b) => b.dayRequests - a.dayRequests)
      .slice(0, limit);

    return consumers;
  }

  /**
   * Update rate limit configuration
   */
  updateConfig(newConfig: Partial<RateLimitConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('[RateLimiter] Configuration updated: ' + JSON.stringify(this.config));
  }

  /**
   * Reset client limits
   */
  resetClient(clientId: string): void {
    this.clients.delete(clientId);
    logger.info(`[RateLimiter] Client ${clientId} limits reset`);
  }

  /**
   * Start periodic cleanup
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const dayAgo = now - 86400000;

      // Remove clients inactive for more than a day
      for (const [clientId, client] of this.clients.entries()) {
        if (client.lastRequestTime < dayAgo) {
          this.clients.delete(clientId);
        }
      }

      logger.debug(`[RateLimiter] Cleanup completed. Active clients: ${this.clients.size}`);
    }, 3600000); // Run every hour
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Reset all rate limiting
   */
  reset(): void {
    this.clients.clear();
    this.globalUsage = {
      minuteRequests: 0,
      hourRequests: 0,
      dayRequests: 0,
      currentConcurrent: 0,
      resetTimes: {
        minute: 0,
        hour: 0,
        day: 0
      }
    };
    logger.info('[RateLimiter] All limits reset');
  }
}

// Global rate limiter instances
const rateLimiters = new Map<string, RateLimiter>();

/**
 * Get or create rate limiter for specific tier
 */
export function getRateLimiter(tier: string = 'default', config?: Partial<RateLimitConfig>): RateLimiter {
  if (!rateLimiters.has(tier)) {
    const tierConfigs: Record<string, Partial<RateLimitConfig>> = {
      free: {
        requestsPerMinute: 20,
        requestsPerHour: 200,
        requestsPerDay: 1000,
        burstLimit: 5,
        concurrentOperations: 2
      },
      basic: {
        requestsPerMinute: 50,
        requestsPerHour: 500,
        requestsPerDay: 5000,
        burstLimit: 10,
        concurrentOperations: 5
      },
      pro: {
        requestsPerMinute: 100,
        requestsPerHour: 1000,
        requestsPerDay: 10000,
        burstLimit: 20,
        concurrentOperations: 10
      },
      enterprise: {
        requestsPerMinute: 500,
        requestsPerHour: 5000,
        requestsPerDay: 50000,
        burstLimit: 50,
        concurrentOperations: 50
      }
    };

    const tierConfig = tierConfigs[tier] || tierConfigs.pro;
    rateLimiters.set(tier, new RateLimiter({ ...tierConfig, ...config }));
  }

  return rateLimiters.get(tier)!;
}

/**
 * Reset all rate limiters
 */
export function resetRateLimiters(): void {
  for (const limiter of rateLimiters.values()) {
    limiter.stopCleanup();
  }
  rateLimiters.clear();
}
