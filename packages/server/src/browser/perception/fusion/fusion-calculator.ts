/**
 * Fusion Calculator
 * Calculates fusion confidence and token estimates
 */

import type { PageState } from '../ax-extractor.js';
import type { ScreenshotData, FusionStrategy } from '../fusion.js';
import { createLogger } from '../../core/logging.js';

const logger = createLogger('FusionCalculator');

export interface TokenEstimate {
  dom: number;
  vision: number;
  total: number;
}

export interface FusionResult {
  strategy: FusionStrategy;
  confidence: number;
  detectedChanges: string[];
  tokenEstimate: TokenEstimate;
}

/**
 * Fusion Calculator handles fusion confidence and token estimation
 * This is extracted from browser/perception/fusion.ts
 */
export class FusionCalculator {
  /**
   * Calculate fusion confidence based on strategy
   */
  calculateConfidence(
    domState: PageState,
    screenshot: ScreenshotData,
    strategy: FusionStrategy
  ): number {
    // Base confidence
    let confidence = 0.8;

    // Adjust based on DOM completeness
    const domCompleteness = Math.min(1, domState.stats.interactiveElements / 50);
    confidence *= (0.5 + domCompleteness * 0.5);

    // Adjust based on strategy
    switch (strategy) {
      case 'vision-primary':
        confidence *= screenshot.data.length > 100 ? 1.0 : 0.5;
        break;
      case 'dom-primary':
        confidence *= 0.9; // DOM is usually reliable
        break;
      case 'balanced':
        confidence *= 0.85; // Slight penalty for fusion complexity
        break;
    }

    return Math.min(1.0, Math.max(0.0, confidence));
  }

  /**
   * Estimate token counts
   */
  estimateTokens(
    domState: PageState,
    includeVision: boolean,
    visionTokenMultiplier: number = 1000
  ): TokenEstimate {
    // DOM tokens (rough estimate: 4 chars per token)
    const domText = JSON.stringify(domState.elements);
    const domTokens = Math.ceil(domText.length / 4);

    // Vision tokens (fixed estimate for simplicity)
    const visionTokens = includeVision ? visionTokenMultiplier : 0;

    return {
      dom: domTokens,
      vision: visionTokens,
      total: domTokens + visionTokens
    };
  }

  /**
   * Calculate complete fusion result
   */
  calculateFusionResult(
    domState: PageState,
    screenshot: ScreenshotData,
    strategy: FusionStrategy,
    detectedChanges: string[]
  ): FusionResult {
    const confidence = this.calculateConfidence(domState, screenshot, strategy);
    const tokenEstimate = this.estimateTokens(
      domState,
      screenshot.data.length > 100
    );

    return {
      strategy,
      confidence,
      detectedChanges,
      tokenEstimate
    };
  }

  /**
   * Select optimal fusion strategy based on page characteristics
   */
  selectOptimalStrategy(domState: PageState, hasScreenshot: boolean): FusionStrategy {
    const elementCount = domState.stats.interactiveElements;

    // For pages with few elements, vision is more important
    if (elementCount < 10 && hasScreenshot) {
      return 'vision-primary';
    }

    // For pages with many elements, DOM is more reliable
    if (elementCount > 100) {
      return 'dom-primary';
    }

    // Default to balanced
    return 'balanced';
  }

  /**
   * Get fusion quality metrics
   */
  getQualityMetrics(fusionResult: FusionResult): {
    quality: 'high' | 'medium' | 'low';
    reason: string;
  } {
    const { confidence, strategy, tokenEstimate } = fusionResult;

    if (confidence >= 0.8) {
      return {
        quality: 'high',
        reason: `High confidence (${confidence.toFixed(2)}) using ${strategy} strategy`
      };
    }

    if (confidence >= 0.5) {
      return {
        quality: 'medium',
        reason: `Medium confidence (${confidence.toFixed(2)}) using ${strategy} strategy`
      };
    }

    return {
      quality: 'low',
      reason: `Low confidence (${confidence.toFixed(2)}) using ${strategy} strategy`
    };
  }

  /**
   * Check if fusion should include vision
   */
  shouldIncludeVision(
    strategy: FusionStrategy,
    tokenBudget: number,
    currentTokenCount: number
  ): boolean {
    const visionCost = 1000; // Rough estimate

    if (strategy === 'dom-primary') {
      return currentTokenCount + visionCost <= tokenBudget;
    }

    if (strategy === 'vision-primary') {
      return true; // Always include if vision-primary
    }

    // Balanced: include if within budget
    return currentTokenCount + visionCost <= tokenBudget;
  }

  /**
   * Calculate optimal screenshot quality
   */
  selectScreenshotQuality(
    strategy: FusionStrategy,
    tokenBudget: number
  ): 'high' | 'auto' | 'low' {
    if (strategy === 'vision-primary' && tokenBudget > 50000) {
      return 'high';
    }

    if (tokenBudget < 30000) {
      return 'low';
    }

    return 'auto';
  }
}
