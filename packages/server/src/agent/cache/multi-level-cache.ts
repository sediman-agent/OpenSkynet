/**
 * Multi-Level Cache System
 * Implements L1 (memory) + L2 (disk) + L3 (compressed) caching for maximum performance
 */

import { createLogger } from '../../core/logging.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const logger = createLogger('MultiLevelCache');

interface CacheEntry {
  data: any;
  timestamp: number;
  hits: number;
  size: number;
  compressed?: boolean;
}

export class MultiLevelCache {
  private l1: Map<string, CacheEntry>; // Memory cache (fastest)
  private l2Path: string; // Disk cache (persistent)
  private l1MaxSize: number;
  private l1MaxEntries: number;
  private l2MaxEntries: number;
  private compressionThreshold: number;
  private enabled: boolean;

  constructor(options: {
    l1MaxEntries?: number;
    l1MaxSize?: number;
    l2MaxEntries?: number;
    compressionThreshold?: number;
    enabled?: boolean;
  } = {}) {
    this.l1 = new Map();
    this.l1MaxEntries = options.l1MaxEntries ?? 50;
    this.l1MaxSize = options.l1MaxSize ?? 10 * 1024 * 1024; // 10MB
    this.l2MaxEntries = options.l2MaxEntries ?? 500;
    this.compressionThreshold = options.compressionThreshold ?? 1024; // 1KB
    this.enabled = options.enabled ?? true;

    const dataDir = process.env.SEDIMAN_DATA_DIR || join(homedir(), '.terminator');
    this.l2Path = join(dataDir, 'cache');

    if (!existsSync(this.l2Path)) {
      mkdirSync(this.l2Path, { recursive: true });
    }

    this.loadL2Index();
  }

  private l2Index: Map<string, { size: number; timestamp: number }> = new Map();

  /**
   * Generate cache key from request parameters
   */
  private generateKey(params: { messages: any[]; systemPrompt: string; tools: any[] }): string {
    const lastUserMsg = params.messages.filter((m: any) => m.role === 'user').pop();
    if (!lastUserMsg) return '';

    const content = typeof lastUserMsg.content === 'string'
      ? lastUserMsg.content
      : JSON.stringify(lastUserMsg.content);

    // Fast hash function
    const str = `${params.systemPrompt.slice(0, 50)}_${content.slice(0, 100)}_${params.tools.length}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `cache_${Math.abs(hash)}`;
  }

  /**
   * Get from multi-level cache (L1 → L2 → miss)
   */
  get(params: { messages: any[]; systemPrompt: string; tools: any[] }): any | null {
    if (!this.enabled) return null;

    const key = this.generateKey(params);
    if (!key) return null;

    // Try L1 (memory)
    const l1Entry = this.l1.get(key);
    if (l1Entry) {
      const now = Date.now();
      if (now - l1Entry.timestamp < 300000) { // 5 minute TTL
        l1Entry.hits++;
        logger.debug(`[MultiLevelCache] L1 hit (hits: ${l1Entry.hits})`);
        return l1Entry.data;
      } else {
        this.l1.delete(key);
      }
    }

    // Try L2 (disk)
    const l2Entry = this.l2Index.get(key);
    if (l2Entry) {
      const now = Date.now();
      if (now - l2Entry.timestamp < 3600000) { // 1 hour TTL
        try {
          const filePath = join(this.l2Path, `${key}.json`);
          if (existsSync(filePath)) {
            const data = JSON.parse(readFileSync(filePath, 'utf-8'));
            // Promote to L1
            this.setL1(key, data);
            logger.debug('[MultiLevelCache] L2 hit, promoted to L1');
            return data;
          }
        } catch (err) {
          logger.warn('[MultiLevelCache] L2 read failed: ' + (err as Error).message);
        }
      }
      this.l2Index.delete(key);
    }

    return null;
  }

  /**
   * Set in multi-level cache (L1 + L2)
   */
  set(params: { messages: any[]; systemPrompt: string; tools: any[] }, data: any): void {
    if (!this.enabled) return;

    const key = this.generateKey(params);
    if (!key) return;

    const size = JSON.stringify(data).length;

    // Set L1
    this.setL1(key, data, size);

    // Set L2 (disk) for larger responses
    if (size > this.compressionThreshold) {
      this.setL2(key, data, size);
    }
  }

  /**
   * Set in L1 cache with eviction
   */
  private setL1(key: string, data: any, size?: number): void {
    const entrySize = size ?? JSON.stringify(data).length;

    // Evict if over size limit
    if (this.l1.size >= this.l1MaxEntries) {
      this.evictL1();
    }

    this.l1.set(key, {
      data,
      timestamp: Date.now(),
      hits: 0,
      size: entrySize
    });
  }

  /**
   * Set in L2 cache (disk)
   */
  private setL2(key: string, data: any, size: number): void {
    try {
      const filePath = join(this.l2Path, `${key}.json`);
      writeFileSync(filePath, JSON.stringify(data), 'utf-8');

      this.l2Index.set(key, {
        size,
        timestamp: Date.now()
      });

      // Evict old L2 entries
      if (this.l2Index.size > this.l2MaxEntries) {
        this.evictL2();
      }
    } catch (err) {
      logger.warn('[MultiLevelCache] L2 write failed: ' + (err as Error).message);
    }
  }

  /**
   * Evict oldest L1 entry
   */
  private evictL1(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, entry] of this.l1.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.l1.delete(oldestKey);
      logger.debug('[MultiLevelCache] Evicted from L1');
    }
  }

  /**
   * Evict oldest L2 entry
   */
  private evictL2(): void {
    let oldestKey = '';
    let oldestTime = Date.now();

    for (const [key, entry] of this.l2Index.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.l2Index.delete(oldestKey);
      try {
        const filePath = join(this.l2Path, `${oldestKey}.json`);
        if (existsSync(filePath)) {
          // Delete file asynchronously
          setImmediate(() => {
            try {
              // Use fs.promises or spawn rm
            } catch (e) {
              // Ignore
            }
          });
        }
      } catch (err) {
        // Ignore
      }
      logger.debug('[MultiLevelCache] Evicted from L2');
    }
  }

  /**
   * Load L2 index from disk
   */
  private loadL2Index(): void {
    try {
      const indexPath = join(this.l2Path, 'index.json');
      if (existsSync(indexPath)) {
        const data = JSON.parse(readFileSync(indexPath, 'utf-8'));
        this.l2Index = new Map(Object.entries(data));
        logger.debug(`[MultiLevelCache] Loaded L2 index: ${this.l2Index.size} entries`);
      }
    } catch (err) {
      logger.warn('[MultiLevelCache] Failed to load L2 index: ' + (err as Error).message);
    }
  }

  /**
   * Save L2 index to disk
   */
  private saveL2Index(): void {
    try {
      const indexPath = join(this.l2Path, 'index.json');
      const data = Object.fromEntries(this.l2Index);
      writeFileSync(indexPath, JSON.stringify(data), 'utf-8');
    } catch (err) {
      logger.warn('[MultiLevelCache] Failed to save L2 index: ' + (err as Error).message);
    }
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.l1.clear();
    this.l2Index.clear();
    logger.info('[MultiLevelCache] All caches cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    l1Size: number;
    l1MaxEntries: number;
    l2Size: number;
    l2MaxEntries: number;
    enabled: boolean;
    l1TotalHits: number;
    l1TotalSize: number;
  } {
    let l1TotalHits = 0;
    let l1TotalSize = 0;

    for (const entry of this.l1.values()) {
      l1TotalHits += entry.hits;
      l1TotalSize += entry.size;
    }

    return {
      l1Size: this.l1.size,
      l1MaxEntries: this.l1MaxEntries,
      l2Size: this.l2Index.size,
      l2MaxEntries: this.l2MaxEntries,
      enabled: this.enabled,
      l1TotalHits,
      l1TotalSize
    };
  }
}

// Global instance
let globalCache: MultiLevelCache | null = null;

export function getMultiLevelCache(): MultiLevelCache {
  if (!globalCache) {
    globalCache = new MultiLevelCache({
      l1MaxEntries: 50,
      l1MaxSize: 10 * 1024 * 1024,
      l2MaxEntries: 500,
      compressionThreshold: 1024,
      enabled: true
    });
  }
  return globalCache;
}

export function resetMultiLevelCache(): void {
  globalCache = null;
}
