/**
 * Page State Manager
 * Manages page state (scroll, key presses, wait)
 */

import type { Page } from 'playwright';
import type { BrowserActionResult } from '../types.js';

/**
 * Page State Manager
 * This is extracted from browser/controller.ts
 */
export class PageStateManager {
  constructor(private getPage: () => Page) {}

  /**
   * Scroll page in direction
   */
  async scroll(direction: string, amount?: number): Promise<BrowserActionResult> {
    try {
      const page = this.getPage();
      const delta = amount ?? 500;
      const deltaWithSign = direction === 'up' ? -delta : delta;

      if (direction === 'left' || direction === 'right') {
        await page.mouse.wheel(direction === 'right' ? delta : -delta, 0);
      } else {
        await page.mouse.wheel(0, deltaWithSign);
      }

      return {
        success: true,
        message: `Scrolled ${direction} by ${amount ?? 500}px`
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to scroll: ${e.message}`,
        retryable: true
      };
    }
  }

  /**
   * Press keyboard key
   */
  async pressKey(key: string): Promise<BrowserActionResult> {
    try {
      const page = this.getPage();
      await page.keyboard.press(key);
      return {
        success: true,
        message: `Pressed key: ${key}`
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to press key ${key}: ${e.message}`,
        retryable: true
      };
    }
  }

  /**
   * Get scroll position
   */
  async getScrollPosition(): Promise<{ x: number; y: number }> {
    try {
      return await this.getPage().evaluate(() => ({
        x: window.scrollX,
        y: window.scrollY
      }));
    } catch {
      return { x: 0, y: 0 };
    }
  }

  /**
   * Set scroll position
   */
  async scrollTo(x: number, y: number): Promise<BrowserActionResult> {
    try {
      await this.getPage().evaluate((scrollX, scrollY) => {
        window.scrollTo(scrollX, scrollY);
      }, x, y);
      return {
        success: true,
        message: `Scrolled to (${x}, ${y})`
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to scroll: ${e.message}`
      };
    }
  }

  /**
   * Get viewport size
   */
  async getViewportSize(): Promise<{ width: number; height: number }> {
    try {
      return await this.getPage().evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight
      }));
    } catch {
      return { width: 0, height: 0 };
    }
  }

  /**
   * Get page size
   */
  async getPageSize(): Promise<{ width: number; height: number }> {
    try {
      return await this.getPage().evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
      }));
    } catch {
      return { width: 0, height: 0 };
    }
  }

  /**
   * Wait for page load state
   */
  async waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle' = 'domcontentloaded', timeout = 30000): Promise<BrowserActionResult> {
    try {
      await this.getPage().waitForLoadState(state, { timeout });
      return {
        success: true,
        message: `Page reached "${state}" state`
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Timeout waiting for "${state}": ${e.message}`,
        retryable: true
      };
    }
  }

  /**
   * Check if page is ready
   */
  async isReady(): Promise<boolean> {
    try {
      return await this.getPage().evaluate(() => document.readyState === 'complete');
    } catch {
      return false;
    }
  }
}
