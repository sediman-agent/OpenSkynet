/**
 * Predictive Caching System
 * Learns from user patterns and pre-caches likely responses
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('PredictiveCache');

interface PatternMatch {
  pattern: string;
  frequency: number;
  lastSeen: number;
  avgResponseTime: number;
  cacheHit: boolean;
}

interface CachePrediction {
  key: string;
  confidence: number;
  predictedResponse: any;
  preload: boolean;
}

export class PredictiveCache {
  private patterns: Map<string, PatternMatch> = new Map();
  private recentQueries: string[] = [];
  private maxRecentQueries = 100;
  private minFrequency = 3;
  private confidenceThreshold = 0.7;

  /**
   * Learn from a completed query
   */
  learn(query: string, response: any, responseTime: number, cacheHit: boolean): void {
    const normalized = this.normalizeQuery(query);
    const pattern = this.extractPattern(normalized);

    let existing = this.patterns.get(pattern);
    if (existing) {
      existing.frequency++;
      existing.lastSeen = Date.now();
      existing.avgResponseTime = (existing.avgResponseTime * 0.8) + (responseTime * 0.2);
      existing.cacheHit = cacheHit;
    } else {
      this.patterns.set(pattern, {
        pattern,
        frequency: 1,
        lastSeen: Date.now(),
        avgResponseTime: responseTime,
        cacheHit
      });
    }

    // Track recent queries
    this.recentQueries.push(normalized);
    if (this.recentQueries.length > this.maxRecentQueries) {
      this.recentQueries.shift();
    }

    logger.debug(`[PredictiveCache] Learned pattern: ${pattern.substring(0, 50)}... (freq: ${this.patterns.get(pattern)?.frequency || 1})`);
  }

  /**
   * Predict and pre-load likely responses
   */
  async predict(query: string): Promise<CachePrediction[]> {
    const normalized = this.normalizeQuery(query);
    const pattern = this.extractPattern(normalized);

    const predictions: CachePrediction[] = [];

    // Find similar high-frequency patterns
    for (const [pat, match] of this.patterns.entries()) {
      if (match.frequency >= this.minFrequency &&
          this.similarity(pattern, pat) > 0.5 &&
          match.avgResponseTime < 1000) { // Fast responses only

        const confidence = this.calculateConfidence(match, pattern);

        if (confidence >= this.confidenceThreshold) {
          predictions.push({
            key: pat,
            confidence,
            predictedResponse: null, // Would be loaded from actual cache
            preload: match.avgResponseTime < 500 // Only preload very fast responses
          });
        }
      }
    }

    // Sort by confidence
    predictions.sort((a, b) => b.confidence - a.confidence);

    logger.debug(`[PredictiveCache] Generated ${predictions.length} predictions`);

    return predictions.slice(0, 5); // Top 5 predictions
  }

  /**
   * Normalize query for pattern matching
   */
  private normalizeQuery(query: string): string {
    return query
      .toLowerCase()
      .replace(/\d+/g, 'N') // Replace numbers with placeholder
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, 'EMAIL') // Replace emails
      .replace(/https?:\/\/[^\s]+/g, 'URL') // Replace URLs
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Extract pattern from normalized query
   */
  private extractPattern(normalized: string): string {
    // Simple pattern extraction: first few words
    const words = normalized.split(' ').slice(0, 4);
    return words.join(' ');
  }

  /**
   * Calculate similarity between two patterns
   */
  private similarity(pattern1: string, pattern2: string): number {
    const words1 = pattern1.split(' ');
    const words2 = pattern2.split(' ');

    let matches = 0;
    for (const word1 of words1) {
      if (words2.includes(word1)) {
        matches++;
      }
    }

    return (2 * matches) / (words1.length + words2.length);
  }

  /**
   * Calculate prediction confidence
   */
  private calculateConfidence(match: PatternMatch, currentPattern: string): number {
    const freqScore = Math.min(match.frequency / 20, 1); // Cap at 20 occurrences
    const recencyScore = Math.max(0, 1 - (Date.now() - match.lastSeen) / 86400000); // Decay over 24h
    const speedScore = Math.max(0, 1 - match.avgResponseTime / 2000); // Prefer fast responses

    return (freqScore * 0.5 + recencyScore * 0.3 + speedScore * 0.2);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalPatterns: number;
    highFrequencyPatterns: number;
    avgPatternFrequency: number;
    recentQueriesCount: number;
  } {
    let totalFreq = 0;
    let highFreq = 0;

    for (const match of this.patterns.values()) {
      totalFreq += match.frequency;
      if (match.frequency >= this.minFrequency) {
        highFreq++;
      }
    }

    return {
      totalPatterns: this.patterns.size,
      highFrequencyPatterns: highFreq,
      avgPatternFrequency: this.patterns.size > 0 ? totalFreq / this.patterns.size : 0,
      recentQueriesCount: this.recentQueries.length
    };
  }

  /**
   * Clear learned patterns
   */
  clear(): void {
    this.patterns.clear();
    this.recentQueries = [];
    logger.info('[PredictiveCache] Patterns cleared');
  }
}

// Global instance
let globalPredictiveCache: PredictiveCache | null = null;

export function getPredictiveCache(): PredictiveCache {
  if (!globalPredictiveCache) {
    globalPredictiveCache = new PredictiveCache();
  }
  return globalPredictiveCache;
}

export function resetPredictiveCache(): void {
  globalPredictiveCache = null;
}
