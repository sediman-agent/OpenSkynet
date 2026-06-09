/**
 * State Capture
 * Captures browser state with smart perception support
 */

import type { BrowserSession, PageState } from '../../browser/index.js';
import { VisionDOMFusion } from '../../browser/perception/index.js';
import { createLogger } from '../../core/logging.js';

const logger = createLogger('state-capture');

/**
 * State capture options
 */
export interface StateCaptureOptions {
  useVision?: boolean;
  useSmartPerception?: boolean;
  screenshotQuality?: 'low' | 'auto' | 'high';
  fusionStrategy?: 'fast' | 'balanced' | 'accurate';
}

/**
 * Captured state result
 */
export interface CapturedState {
  formatted: string;
  screenshot: string | null;
  url: string;
  title: string;
  fusionState?: any;
}

/**
 * State Capture Manager
 * This is extracted from agent/execution/enhanced-loop.ts
 */
export class StateCaptureManager {
  private visionFusion?: VisionDOMFusion;
  private useVision: boolean;
  private useSmartPerception: boolean;
  private screenshotQuality: 'low' | 'auto' | 'high';
  private fusionStrategy: 'fast' | 'balanced' | 'accurate';

  constructor(options: StateCaptureOptions = {}) {
    this.useVision = options.useVision ?? true;
    this.useSmartPerception = options.useSmartPerception ?? false;
    this.screenshotQuality = options.screenshotQuality ?? 'auto';
    this.fusionStrategy = options.fusionStrategy ?? 'balanced';

    if (this.useSmartPerception) {
      this.visionFusion = new VisionDOMFusion();
      logger.info('[StateCapture] Smart perception enabled');
    }
  }

  /**
   * Capture current browser state
   */
  async captureState(browserSession?: BrowserSession): Promise<CapturedState> {
    if (!browserSession) {
      return this.getEmptyState();
    }

    try {
      const page = browserSession.context?.pages()[0];
      if (!page) {
        return this.getEmptyState();
      }

      if (this.useSmartPerception && this.visionFusion) {
        return await this.captureFusedState(page);
      } else {
        return await this.captureBasicState(page, browserSession);
      }
    } catch (error) {
      logger.error({ err: error as Error }, '[StateCapture] Failed to capture state');
      return this.getEmptyState();
    }
  }

  /**
   * Capture with smart perception (fusion)
   */
  private async captureFusedState(page: any): Promise<CapturedState> {
    const fusedState = await this.visionFusion!.captureFusedState(page, {
      includeScreenshot: this.useVision,
      screenshotQuality: this.screenshotQuality,
      fusionStrategy: this.fusionStrategy
    });

    return {
      formatted: fusedState.dom.formatted,
      screenshot: fusedState.screenshot.data,
      url: fusedState.dom.state.url,
      title: fusedState.dom.state.title,
      fusionState: fusedState
    };
  }

  /**
   * Capture basic state (legacy method)
   */
  private async captureBasicState(page: any, browserSession: BrowserSession): Promise<CapturedState> {
    const screenshot = this.useVision ? await browserSession.takeScreenshot() : null;
    const url = page.url();
    const title = await page.title();

    return {
      formatted: `URL: ${url}\nTitle: ${title}`,
      screenshot,
      url,
      title
    };
  }

  /**
   * Get empty state when no browser available
   */
  private getEmptyState(): CapturedState {
    return {
      formatted: '',
      screenshot: null,
      url: '',
      title: ''
    };
  }

  /**
   * Enable smart perception
   */
  enableSmartPerception(): void {
    this.useSmartPerception = true;
    if (!this.visionFusion) {
      this.visionFusion = new VisionDOMFusion();
    }
    logger.info('[StateCapture] Smart perception enabled');
  }

  /**
   * Update capture options
   */
  updateOptions(options: Partial<StateCaptureOptions>): void {
    if (options.useVision !== undefined) this.useVision = options.useVision;
    if (options.useSmartPerception !== undefined) this.useSmartPerception = options.useSmartPerception;
    if (options.screenshotQuality !== undefined) this.screenshotQuality = options.screenshotQuality;
    if (options.fusionStrategy !== undefined) this.fusionStrategy = options.fusionStrategy;

    if (options.useSmartPerception && !this.visionFusion) {
      this.visionFusion = new VisionDOMFusion();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): StateCaptureOptions {
    return {
      useVision: this.useVision,
      useSmartPerception: this.useSmartPerception,
      screenshotQuality: this.screenshotQuality,
      fusionStrategy: this.fusionStrategy
    };
  }
}
