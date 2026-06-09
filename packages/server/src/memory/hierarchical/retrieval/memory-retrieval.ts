/**
 * Memory Retrieval Strategies
 * Different retrieval strategies for hierarchical memory
 */

import type { MemoryNode } from '../storage/memory-storage.js';
import { createLogger } from '../../../core/logging.js';

const logger = createLogger('MemoryRetrieval');

export interface RetrievalResult {
  nodes: MemoryNode[];
  confidence: number;
  method: string;
}

export interface RetrievalContext {
  query: string;
  domain?: string;
  maxResults?: number;
  threshold?: number;
}

/**
 * Base Retrieval Strategy
 */
export interface RetrievalStrategy {
  readonly name: string;
  retrieve(context: RetrievalContext, storage: any): RetrievalResult;
}

/**
 * Exact Match Retrieval
 * Searches for nodes containing exact query match
 */
export class ExactMatchRetrieval implements RetrievalStrategy {
  readonly name = 'exact-match';

  retrieve(context: RetrievalContext, storage: any): RetrievalResult {
    const { query, domain, maxResults = 10 } = context;

    logger.debug(`[ExactMatchRetrieval] Searching for: "${query}" in domain: ${domain || 'all'}`);

    const allNodes = domain
      ? storage.getDomain(domain)
      : Array.from((storage as any).nodes.values());

    const matchingNodes = allNodes.filter(node =>
      node.content.toLowerCase().includes(query.toLowerCase())
    );

    return {
      nodes: matchingNodes.slice(0, maxResults),
      confidence: 1.0,
      method: 'exact-match'
    };
  }
}

/**
 * Semantic Retrieval
 * Uses semantic similarity for retrieval
 */
export class SemanticRetrieval implements RetrievalStrategy {
  readonly name = 'semantic';

  retrieve(context: RetrievalContext, storage: any): RetrievalResult {
    const { query, domain, maxResults = 10 } = context;

    logger.debug(`[SemanticRetrieval] Semantic search for: "${query}"`);

    const allNodes = domain
      ? storage.getDomain(domain)
      : Array.from((storage as any).nodes.values());

    // Simple similarity: keyword matching with scoring
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const scoredNodes = allNodes.map(node => {
      const content = node.content.toLowerCase();
      let score = 0;

      for (const word of queryWords) {
        if (content.includes(word)) score += 1;
        if (content.includes(word + ' ')) score += 0.5; // Bonus for phrase match
      }

      return { node, score };
    });

    const sorted = scoredNodes
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return {
      nodes: sorted.map(item => item.node),
      confidence: sorted.length > 0 ? sorted[0].score / queryWords.length : 0,
      method: 'semantic'
    };
  }
}

/**
 * Hierarchical Retrieval
 * Searches with hierarchy awareness
 */
export class HierarchicalRetrieval implements RetrievalStrategy {
  readonly name = 'hierarchical';

  retrieve(context: RetrievalContext, storage: any): RetrievalResult {
    const { query, domain, maxResults = 10 } = context;

    logger.debug(`[HierarchicalRetrieval] Hierarchical search for: "${query}"`);

    const allNodes = domain
      ? storage.getDomain(domain)
      : Array.from((storage as any).nodes.values());

    // Score by level (prefer higher/shorter paths)
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const scoredNodes = allNodes.map(node => {
      const content = node.content.toLowerCase();
      let score = 0;

      // Content match score
      for (const word of queryWords) {
        if (content.includes(word)) {
          score += 1;
          // Bonus for closer to root (lower level)
          score += Math.max(0, 10 - node.level);
        }
      }

      return { node, score };
    });

    const sorted = scoredNodes
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return {
      nodes: sorted.map(item => item.node),
      confidence: sorted.length > 0 ? Math.min(sorted[0].score / 10, 1) : 0,
      method: 'hierarchical'
    };
  }
}

/**
 * Time-Based Retrieval
 * Retrieves recent memories with decay
 */
export class TimeBasedRetrieval implements RetrievalStrategy {
  readonly name = 'time-based';

  retrieve(context: RetrievalContext, storage: any): RetrievalResult {
    const { query, domain, maxResults = 10, threshold = 0.5 } = context;

    logger.debug(`[TimeBasedRetrieval] Time-weighted search for: "${query}"`);

    const allNodes = domain
      ? storage.getDomain(domain)
      : Array.from((storage as any).nodes.values());

    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

    // Score by recency and relevance
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    const scoredNodes = allNodes.map(node => {
      const age = now - node.timestamp;
      if (age > maxAge) return { node, score: 0 };

      // Time decay score (0 to 1, exponentially decaying)
      const timeScore = Math.exp(-age / (24 * 60 * 60 * 1000)); // Decay over 24h

      // Content match score
      let contentScore = 0;
      const content = node.content.toLowerCase();
      for (const word of queryWords) {
        if (content.includes(word)) contentScore += 1;
      }

      // Normalize content score
      const normalizedContentScore = contentScore / queryWords.length;

      // Combined score
      const score = (timeScore * 0.4 + normalizedContentScore * 0.6);

      return { node, score };
    });

    const sorted = scoredNodes
      .filter(item => item.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return {
      nodes: sorted.map(item => item.node),
      confidence: sorted.length > 0 ? sorted[0].score : 0,
      method: 'time-based'
    };
  }
}
