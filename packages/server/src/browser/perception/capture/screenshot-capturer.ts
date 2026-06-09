/**
 * Screenshot Capturer
 * Handles screenshot capture with quality settings
 */

import type { Page } from 'playwright';
import { createLogger } from '../../core/logging.js';

const logger = createLogger('ScreenshotCapturer');

export interface ScreenshotData {
  data: string;        // Base64 encoded
  format: 'png' | 'jpeg';
  width: number;
  height: number;
  timestamp: number;
}

export interface ScreenshotOptions {
  quality: 'low' | 'high' | 'auto';
  fullPage?: boolean;
  type?: 'png' | 'jpeg';
}

/**
 * Screenshot Capturer handles screenshot capture operations
 * This is extracted from browser/perception/fusion.ts
 */
export class ScreenshotCapturer {
  private lastScreenshot?: string;

  /**
   * Capture screenshot with quality settings
   */
  async capture(
    page: Page,
    options: ScreenshotOptions = {}
  ): Promise<ScreenshotData> {
    const {
      quality = 'auto',
      fullPage = false,
      type = 'png'
    } = options;

    try {
      const viewportSize = page.viewportSize();

      const screenshotOptions: any = {
        type,
        fullPage,
        animations: 'disabled'
      };

      const buffer = await page.screenshot(screenshotOptions);

      const screenshot: ScreenshotData = {
        data: buffer.toString('base64'),
        format: type,
        width: viewportSize?.width || 1280,
        height: viewportSize?.height || 720,
        timestamp: Date.now()
      };

      this.lastScreenshot = screenshot.data;

      logger.debug(`[ScreenshotCapturer] Captured ${screenshot.data.length} bytes`);
      return screenshot;
    } catch (error) {
      logger.error({ err: error as Error }, 'Failed to capture screenshot');
      return {
        data: '',
        format: type,
        width: 0,
        height: 0,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get last captured screenshot data
   */
  getLastScreenshot(): string | undefined {
    return this.lastScreenshot;
  }

  /**
   * Clear cached screenshot
   */
  clearCache(): void {
    this.lastScreenshot = undefined;
  }

  /**
   * Check if screenshot has valid data
   */
  isValidScreenshot(screenshot: ScreenshotData): boolean {
    return screenshot.data.length > 100;
  }

  /**
   * Get screenshot size in bytes
   */
  getScreenshotSize(screenshot: ScreenshotData): number {
    return screenshot.data.length;
  }

  /**
   * Convert screenshot to data URL
   */
  toDataURL(screenshot: ScreenshotData): string {
    return `data:image/${screenshot.format};base64,${screenshot.data}`;
  }
}
