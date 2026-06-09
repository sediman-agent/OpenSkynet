/**
 * Screenshot Manager
 * Centralizes screenshot capture and storage with throttling
 */

import { createLogger } from '../../core/logging.js';
import type { BrowserController } from '../../browser/controller.js';
import { getBrowserController } from '../tools/browser-tools.js';
import { setLatestScreenshot, waitForCdpConnection } from '../../api/routes/browser.js';

const logger = createLogger('ScreenshotManager');

export interface ScreenshotCaptureOptions {
  url?: string;
  delay?: number;
  force?: boolean;
}

export interface ScreenshotResult {
  success: boolean;
  data?: string;
  url?: string;
  size?: number;
  error?: string;
}

/**
 * Manages screenshot capture with throttling and coordination
 */
export class ScreenshotManager {
  private controller: BrowserController | null = null;
  private lastCaptureTime = 0;
  private throttleMs = 300;
  private pendingCapture: Promise<ScreenshotResult> | null = null;

  constructor(throttleMs: number = 300) {
    this.throttleMs = throttleMs;
  }

  /**
   * Set the browser controller
   */
  setController(controller: BrowserController): void {
    this.controller = controller;
  }

  /**
   * Capture a screenshot with throttling
   */
  async capture(options: ScreenshotCaptureOptions = {}): Promise<ScreenshotResult> {
    const now = Date.now();
    const timeSinceLastCapture = now - this.lastCaptureTime;

    // If we captured recently and not forced, wait for throttle period
    if (!options.force && timeSinceLastCapture < this.throttleMs) {
      const waitTime = this.throttleMs - timeSinceLastCapture;
      logger.debug(`[ScreenshotManager] Throttling: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // If there's a pending capture, return it
    if (this.pendingCapture) {
      logger.debug('[ScreenshotManager] Returning pending capture');
      return this.pendingCapture;
    }

    // Create new capture promise
    this.pendingCapture = this.doCapture(options);

    try {
      const result = await this.pendingCapture;
      return result;
    } finally {
      // Clear pending capture after a delay to allow rapid consecutive captures
      setTimeout(() => {
        this.pendingCapture = null;
      }, this.throttleMs);
    }
  }

  /**
   * Perform the actual screenshot capture
   */
  private async doCapture(options: ScreenshotCaptureOptions): Promise<ScreenshotResult> {
    try {
      const ctrl = this.controller || getBrowserController();

      if (!ctrl) {
        return {
          success: false,
          error: 'No browser controller available'
        };
      }

      // Ensure CDP connection for Electron mode
      if (process.env.SEDIMAN_MODE === 'electron') {
        const connected = await waitForCdpConnection(5000);
        if (!connected) {
          logger.warn('[ScreenshotManager] CDP connection timeout');
        }
      }

      // Apply delay if specified
      if (options.delay && options.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, options.delay));
      }

      // Capture screenshot
      const shot = await ctrl.screenshot();

      if (!shot || shot.length <= 100) {
        return {
          success: false,
          error: 'Screenshot failed or empty'
        };
      }

      // Get current URL
      const currentUrl = options.url || ctrl.getSession()?.context?.pages?.[0]?.url() || '';
      setLatestScreenshot(shot, currentUrl);

      this.lastCaptureTime = Date.now();

      logger.info(`[ScreenshotManager] Captured screenshot (${shot.length} bytes) for ${currentUrl}`);

      return {
        success: true,
        data: shot,
        url: currentUrl,
        size: shot.length
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[ScreenshotManager] Capture failed:', message);
      return {
        success: false,
        error: message
      };
    }
  }

  /**
   * Quick capture with minimal delay (for after-action screenshots)
   */
  async captureQuick(): Promise<ScreenshotResult> {
    return this.capture({ delay: 50 });
  }

  /**
   * Force capture ignoring throttle
   */
  async captureForce(): Promise<ScreenshotResult> {
    return this.capture({ force: true });
  }

  /**
   * Set throttle duration
   */
  setThrottle(ms: number): void {
    this.throttleMs = Math.max(0, ms);
  }

  /**
   * Get current throttle setting
   */
  getThrottle(): number {
    return this.throttleMs;
  }

  /**
   * Check if a capture is pending
   */
  isPending(): boolean {
    return this.pendingCapture !== null;
  }

  /**
   * Cancel pending capture
   */
  cancelPending(): void {
    this.pendingCapture = null;
  }
}

/**
 * Global screenshot manager instance
 */
export const screenshotManager = new ScreenshotManager();

/**
 * Convenience function to capture a screenshot
 */
export async function captureScreenshot(options?: ScreenshotCaptureOptions): Promise<ScreenshotResult> {
  return screenshotManager.capture(options);
}

/**
 * Convenience function to capture quick screenshot
 */
export async function captureQuickScreenshot(): Promise<ScreenshotResult> {
  return screenshotManager.captureQuick();
}
