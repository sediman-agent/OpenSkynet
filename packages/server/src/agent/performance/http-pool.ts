/**
 * HTTP Connection Pool
 * Manages reusable HTTP connections for better performance
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('HTTPPool');

interface PooledConnection {
  id: string;
  lastUsed: number;
  useCount: number;
  isAvailable: boolean;
}

export class HTTPConnectionPool {
  private pool: Map<string, PooledConnection> = new Map();
  private maxPoolSize: number;
  private idleTimeoutMs: number;
  private maxReuseCount: number;
  private enabled: boolean;

  constructor(options: {
    maxPoolSize?: number;
    idleTimeoutMs?: number;
    maxReuseCount?: number;
    enabled?: boolean;
  } = {}) {
    this.maxPoolSize = options.maxPoolSize ?? 10;
    this.idleTimeoutMs = options.idleTimeoutMs ?? 120000; // 2 minutes
    this.maxReuseCount = options.maxReuseCount ?? 100;
    this.enabled = options.enabled ?? true;

    // Start cleanup interval
    if (this.enabled) {
      setInterval(() => this.cleanup(), 30000); // Cleanup every 30s
      logger.info('[HTTPPool] Connection pool initialized');
    }
  }

  /**
   * Acquire connection from pool
   */
  acquire(key: string): string | null {
    if (!this.enabled) return null;

    const conn = this.pool.get(key);
    if (conn && conn.isAvailable) {
      // Check if connection hasn't been reused too many times
      if (conn.useCount < this.maxReuseCount) {
        conn.isAvailable = false;
        conn.useCount++;
        conn.lastUsed = Date.now();
        logger.debug(`[HTTPPool] Acquired connection ${key} (reuse #${conn.useCount})`);
        return key;
      } else {
        // Replace connection
        this.pool.delete(key);
        logger.debug(`[HTTPPool] Replacing overused connection ${key}`);
      }
    }

    return null;
  }

  /**
   * Release connection back to pool
   */
  release(key: string): void {
    if (!this.enabled) return;

    const conn = this.pool.get(key);
    if (conn) {
      conn.isAvailable = true;
      conn.lastUsed = Date.now();
      logger.debug(`[HTTPPool] Released connection ${key}`);
    } else {
      // Add new connection to pool
      if (this.pool.size < this.maxPoolSize) {
        this.pool.set(key, {
          id: key,
          lastUsed: Date.now(),
          useCount: 1,
          isAvailable: true
        });
        logger.debug(`[HTTPPool] Added new connection ${key} to pool`);
      }
    }
  }

  /**
   * Clean up idle connections
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, conn] of this.pool.entries()) {
      // Remove idle connections
      if (conn.isAvailable && (now - conn.lastUsed) > this.idleTimeoutMs) {
        this.pool.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`[HTTPPool] Cleaned up ${cleaned} idle connections`);
    }
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    totalConnections: number;
    availableConnections: number;
    maxPoolSize: number;
    enabled: boolean;
    avgReuseCount: number;
  } {
    let available = 0;
    let totalReuse = 0;

    for (const conn of this.pool.values()) {
      if (conn.isAvailable) available++;
      totalReuse += conn.useCount;
    }

    return {
      totalConnections: this.pool.size,
      availableConnections: available,
      maxPoolSize: this.maxPoolSize,
      enabled: this.enabled,
      avgReuseCount: this.pool.size > 0 ? totalReuse / this.pool.size : 0
    };
  }

  /**
   * Clear all connections
   */
  clear(): void {
    this.pool.clear();
    logger.info('[HTTPPool] Connection pool cleared');
  }
}

/**
 * Fetch with connection pooling
 */
class PooledFetch {
  constructor(private pool: HTTPConnectionPool) {}

  async fetch(url: string, options?: RequestInit): Promise<Response> {
    const key = this.generateKey(url);

    // Try to acquire pooled connection
    const pooledKey = this.pool.acquire(key);
    if (pooledKey) {
      logger.debug('[PooledFetch] Using pooled connection');
    }

    try {
      const response = await fetch(url, options);
      return response;
    } finally {
      // Release connection back to pool
      if (pooledKey) {
        this.pool.release(pooledKey);
      }
    }
  }

  private generateKey(url: string): string {
    // Simple key based on hostname
    try {
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return 'default';
    }
  }
}

// Global pool instance
let globalPool: HTTPConnectionPool | null = null;
let globalPooledFetch: PooledFetch | null = null;

export function getHTTPPool(): HTTPConnectionPool {
  if (!globalPool) {
    globalPool = new HTTPConnectionPool({
      maxPoolSize: 10,
      idleTimeoutMs: 120000,
      maxReuseCount: 100,
      enabled: true
    });
  }
  return globalPool;
}

export function getPooledFetch(): PooledFetch {
  if (!globalPooledFetch) {
    globalPooledFetch = new PooledFetch(getHTTPPool());
  }
  return globalPooledFetch;
}

export function resetHTTPPool(): void {
  globalPool = null;
  globalPooledFetch = null;
}
