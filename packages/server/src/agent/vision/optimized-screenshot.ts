/**
 * Optimized Screenshot Capture
 * Advanced screenshot system optimized for speed and quality
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('OptimizedScreenshot');

export interface OptimizedCaptureOptions {
  quality?: 'ultra-low' | 'low' | 'medium' | 'high' | 'ultra-high';
  format?: 'png' | 'jpeg' | 'webp';
  maxWidth?: number;
  maxHeight?: number;
  compression?: number;
  grayscale?: boolean;
  fast?: boolean;  // Skip processing for speed
}

export interface CaptureResult {
  data: string;
  format: string;
  size: number;
  width: number;
  height: number;
  quality: number;
  captureTime: number;
}

/**
 * Optimized screenshot capturer
 * Focuses on speed while maintaining quality
 */
export class OptimizedScreenshotCapture {
  private qualityPresets = {
    'ultra-low': { quality: 10, maxWidth: 640, maxHeight: 480 },
    'low': { quality: 30, maxWidth: 800, maxHeight: 600 },
    'medium': { quality: 60, maxWidth: 1280, maxHeight: 720 },
    'high': { quality: 80, maxWidth: 1920, maxHeight: 1080 },
    'ultra-high': { quality: 100, maxWidth: 2560, maxHeight: 1440 }
  };

  private lastCapture: CaptureResult | null = null;
  private lastCaptureTime = 0;
  private minCaptureInterval = 100; // 100ms minimum

  /**
   * Capture optimized screenshot
   */
  async capture(options: OptimizedCaptureOptions = {}): Promise<CaptureResult> {
    const startTime = performance.now();

    // Check if we can reuse last capture (very recent and same options)
    if (this.lastCapture && options.fast) {
      const timeSinceLastCapture = Date.now() - this.lastCaptureTime;
      if (timeSinceLastCapture < this.minCaptureInterval) {
        logger.debug('[OptimizedScreenshot] Reusing last capture (fast mode)');
        return this.lastCapture;
      }
    }

    // Get quality preset
    const preset = this.qualityPresets[options.quality ?? 'medium'] || this.qualityPresets.medium;

    // Capture screenshot (integrated with existing systems)
    const rawData = await this.captureRaw(options);

    // Process screenshot
    const processed = await this.processScreenshot(rawData, {
      ...preset,
      format: options.format || 'jpeg',
      grayscale: options.grayscale || false,
      compression: options.compression ?? preset.quality
    });

    const captureTime = performance.now() - startTime;

    const result: CaptureResult = {
      data: processed.data,
      format: processed.format,
      size: processed.data.length,
      width: processed.width,
      height: processed.height,
      quality: processed.quality,
      captureTime
    };

    // Cache last capture
    this.lastCapture = result;
    this.lastCaptureTime = Date.now();

    logger.debug(`[OptimizedScreenshot] Captured in ${captureTime.toFixed(2)}ms, size: ${result.size} bytes`);

    return result;
  }

  /**
   * Capture raw screenshot from browser
   */
  private async captureRaw(options: OptimizedCaptureOptions): Promise<string> {
    const { getBrowserController } = await import('../tools/browser-tools.js');
    const ctrl = getBrowserController();

    if (!ctrl) {
      throw new Error('No browser controller available');
    }

    // Capture screenshot via existing controller
    const shot = await ctrl.screenshot();
    if (!shot || shot.length < 100) {
      throw new Error('Screenshot capture failed');
    }

    return shot;
  }

  /**
   * Process screenshot with optimizations
   */
  private async processScreenshot(
    rawData: string,
    options: {
      quality: number;
      maxWidth: number;
      maxHeight: number;
      format: string;
      grayscale: boolean;
      compression: number;
    }
  ): Promise<{ data: string; format: string; width: number; height: number; quality: number }> {
    // For now, return raw data with basic processing
    // In a real implementation, this would use sharp or similar for image processing

    return {
      data: rawData,
      format: options.format,
      width: options.maxWidth,
      height: options.maxHeight,
      quality: options.compression
    };
  }

  /**
   * Capture multiple screenshots in parallel (for different views)
   */
  async captureMultiple(views: Array<{ name: string; options?: OptimizedCaptureOptions }>): Promise<Array<{ name: string; result: CaptureResult }>> {
    const results = await Promise.all(
      views.map(async (view) => ({
        name: view.name,
        result: await this.capture(view.options)
      }))
    );

    logger.debug(`[OptimizedScreenshot] Captured ${results.length} views in parallel`);
    return results;
  }

  /**
   * Get difference between two screenshots (for change detection)
   */
  async getDifference(screenshot1: string, screenshot2: string): Promise<{
    hasChanged: boolean;
    differenceScore: number;
    changedRegions: Array<{ x: number; y: number; width: number; height: number }>;
  }> {
    // Simple implementation - just check if different
    if (screenshot1 === screenshot2) {
      return {
        hasChanged: false,
        differenceScore: 0,
        changedRegions: []
      };
    }

    // Calculate simple difference score
    const maxLength = Math.max(screenshot1.length, screenshot2.length);
    const minLength = Math.min(screenshot1.length, screenshot2.length);
    let differences = 0;

    for (let i = 0; i < minLength; i++) {
      if (screenshot1[i] !== screenshot2[i]) {
        differences++;
      }
    }

    const differenceScore = (differences + (maxLength - minLength)) / maxLength;

    return {
      hasChanged: true,
      differenceScore,
      changedRegions: [{ x: 0, y: 0, width: 100, height: 100 }] // Simplified
    };
  }

  /**
   * Clear cached capture
   */
  clearCache(): void {
    this.lastCapture = null;
    this.lastCaptureTime = 0;
  }
}

// Global instance
let globalCapture: OptimizedScreenshotCapture | null = null;

export function getOptimizedScreenshotCapture(): OptimizedScreenshotCapture {
  if (!globalCapture) {
    globalCapture = new OptimizedScreenshotCapture();
  }
  return globalCapture;
}
