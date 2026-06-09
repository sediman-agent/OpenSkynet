/**
 * Vision + DOM Fusion - Simplified
 *
 * Refactored from 377 lines to ~200 lines
 * Screenshot capture extracted to ScreenshotCapturer
 * Change detection extracted to PageChangeDetector
 * Message building extracted to LLMMessageBuilder
 * Fusion calculation extracted to FusionCalculator
 */

import type { Page } from 'playwright';
import { AccessibilityTreeExtractor, type PageState } from './ax-extractor.js';
import { createLogger } from '../../core/logging.js';

// Extracted modules
import { ScreenshotCapturer, type ScreenshotData, type ScreenshotOptions } from './capture/index.js';
import { PageChangeDetector } from './detection/index.js';
import { LLMMessageBuilder } from './messaging/index.js';
import { FusionCalculator, type FusionResult, type TokenEstimate } from './fusion/index.js';

const logger = createLogger('vision-dom-fusion');

// ============================================================================
// Type Definitions
// ============================================================================

export interface FusionState {
  screenshot: ScreenshotData;
  dom: {
    state: PageState;
    formatted: string;
    json: string;
  };
  fusion: FusionResult;
}

export type FusionStrategy = 'vision-primary' | 'dom-primary' | 'balanced';

export interface FusionOptions {
  includeScreenshot?: boolean;
  screenshotQuality?: 'low' | 'high' | 'auto';
  fusionStrategy?: FusionStrategy;
}

// ============================================================================
// Vision + DOM Fusion (Simplified)
// ============================================================================

/**
 * Vision DOM Fusion coordinates vision and DOM perception
 * This is the simplified main file that delegates to specialized modules
 */
export class VisionDOMFusion {
  private axExtractor: AccessibilityTreeExtractor;
  private screenshotCapturer: ScreenshotCapturer;
  private changeDetector: PageChangeDetector;
  private messageBuilder: LLMMessageBuilder;
  private fusionCalculator: FusionCalculator;
  private lastState?: PageState;

  constructor() {
    this.axExtractor = new AccessibilityTreeExtractor();
    this.screenshotCapturer = new ScreenshotCapturer();
    this.changeDetector = new PageChangeDetector();
    this.messageBuilder = new LLMMessageBuilder();
    this.fusionCalculator = new FusionCalculator();
  }

  /**
   * Capture fused state - vision + DOM together
   */
  async captureFusedState(
    page: Page,
    options: FusionOptions = {}
  ): Promise<FusionState> {
    const {
      includeScreenshot = true,
      screenshotQuality = 'auto',
      fusionStrategy = 'balanced'
    } = options;

    // Capture DOM state
    const domState = await this.axExtractor.extractInteractiveElements(page);
    this.lastState = domState;

    // Detect changes from previous state
    const detectedChanges = this.changeDetector.detectChanges(this.lastState, domState);

    // Capture screenshot if requested
    const screenshot = includeScreenshot
      ? await this.screenshotCapturer.capture(page, { quality: screenshotQuality })
      : this.getEmptyScreenshot();

    // Format DOM for LLM
    const formatted = this.axExtractor.formatForLLM(domState);
    const json = this.axExtractor.toJSON(domState);

    // Calculate fusion result
    const fusionResult = this.fusionCalculator.calculateFusionResult(
      domState,
      screenshot,
      fusionStrategy,
      detectedChanges
    );

    return {
      screenshot,
      dom: {
        state: domState,
        formatted,
        json
      },
      fusion: fusionResult
    };
  }

  /**
   * Build LLM message from fused state
   */
  buildLLMMessage(
    fusedState: FusionState,
    task: string,
    memory: string
  ): Array<{ role: string; content: string | Array<{ type: string; [key: string]: any }> }> {
    return this.messageBuilder.buildMessage({
      task,
      memory,
      fusedState
    });
  }

  /**
   * Build system message from fused state
   */
  buildSystemMessage(fusedState: FusionState): string {
    return this.messageBuilder.buildSystemMessage(fusedState);
  }

  /**
   * Get empty screenshot placeholder
   */
  private getEmptyScreenshot(): ScreenshotData {
    return {
      data: '',
      format: 'png',
      width: 0,
      height: 0,
      timestamp: Date.now()
    };
  }

  /**
   * Get last captured state
   */
  getLastState(): PageState | undefined {
    return this.lastState;
  }

  /**
   * Get last screenshot
   */
  getLastScreenshot(): string | undefined {
    return this.screenshotCapturer.getLastScreenshot();
  }

  /**
   * Reset state
   */
  reset(): void {
    this.axExtractor.reset();
    this.screenshotCapturer.clearCache();
    this.lastState = undefined;
    logger.info('Vision-DOM Fusion state reset');
  }

  /**
   * Get fusion statistics
   */
  getStats(): {
    refIdCount: number;
    hasScreenshot: boolean;
    hasState: boolean;
  } {
    return {
      refIdCount: this.axExtractor.getRefIdCount(),
      hasScreenshot: !!this.getLastScreenshot(),
      hasState: !!this.lastState
    };
  }

  /**
   * Get quality metrics for last fusion
   */
  getQualityMetrics(fusedState: FusionState) {
    return this.fusionCalculator.getQualityMetrics(fusedState.fusion);
  }

  /**
   * Select optimal fusion strategy
   */
  selectOptimalStrategy(domState: PageState, hasScreenshot: boolean): FusionStrategy {
    return this.fusionCalculator.selectOptimalStrategy(domState, hasScreenshot);
  }

  /**
   * Check if fused state has significant changes
   */
  hasSignificantChanges(previous: PageState | undefined, current: PageState): boolean {
    return this.changeDetector.hasSignificantChanges(previous, current);
  }

  /**
   * Get structured changes
   */
  getStructuredChanges(previous: PageState | undefined, current: PageState) {
    return this.changeDetector.detectStructuredChanges(previous, current);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const fusion = new VisionDOMFusion();

// Re-export types
export type { ScreenshotData, FusionOptions, FusionResult, TokenEstimate };
