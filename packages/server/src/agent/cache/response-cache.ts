/**
 * Response Cache Module
 * Caches LLM responses for repeated queries to improve performance
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('ResponseCache');

interface CacheEntry {
  response: any;
  timestamp: number;
  hits: number;
}

export class ResponseCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds
  private enabled: boolean;

  constructor(options: { maxSize?: number; ttl?: number; enabled?: boolean } = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.ttl = options.ttl ?? 60000; // 1 minute default TTL
    this.enabled = options.enabled ?? true;
  }

  /**
   * Generate cache key from messages and system prompt
   */
  private generateKey(messages: any[], systemPrompt: string, tools: any[]): string {
    // Create a simplified key from the last user message and system prompt
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
    if (!lastUserMessage) return '';

    const content = typeof lastUserMessage.content === 'string'
      ? lastUserMessage.content
      : JSON.stringify(lastUserMessage.content);

    // Simple hash function
    return `${systemPrompt.slice(0, 100)}_${content.slice(0, 200)}_${tools.length}`;
  }

  /**
   * Get cached response if available and not expired
   */
  get(messages: any[], systemPrompt: string, tools: any[]): any | null {
    if (!this.enabled) return null;

    const key = this.generateKey(messages, systemPrompt, tools);
    if (!key) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      logger.debug('[ResponseCache] Cache entry expired');
      return null;
    }

    // Update hit count
    entry.hits++;
    logger.debug(`[ResponseCache] Cache hit (hits: ${entry.hits})`);
    return entry.response;
  }

  /**
   * Store response in cache
   */
  set(messages: any[], systemPrompt: string, tools: any[], response: any): void {
    if (!this.enabled) return;

    const key = this.generateKey(messages, systemPrompt, tools);
    if (!key) return;

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize) {
      let oldestKey = '';
      let oldestTime = Date.now();

      for (const [k, v] of this.cache.entries()) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
        logger.debug('[ResponseCache] Evicted oldest cache entry');
      }
    }

    // Store new entry
    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      hits: 0
    });

    logger.debug(`[ResponseCache] Cached response (cache size: ${this.cache.size})`);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    logger.info('[ResponseCache] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; ttl: number; enabled: boolean; totalHits: number } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
    }

    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      enabled: this.enabled,
      totalHits
    };
  }

  /**
   * Enable or disable caching
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(`[ResponseCache] Caching ${enabled ? 'enabled' : 'disabled'}`);
  }
}

// Global cache instance
let globalCache: ResponseCache | null = null;

/**
 * Get global response cache instance
 */
export function getResponseCache(): ResponseCache {
  if (!globalCache) {
    globalCache = new ResponseCache({
      maxSize: 100,
      ttl: 60000,
      enabled: true
    });
  }
  return globalCache;
}

/**
 * Reset global cache instance
 */
export function resetResponseCache(): void {
  globalCache = null;
}
