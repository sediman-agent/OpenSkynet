/**
 * Navigation Handler
 * Handles browser navigation operations
 */

import type { Page } from 'playwright';
import type { BrowserActionResult } from '../types.js';

/**
 * Navigation Handler
 * This is extracted from browser/controller.ts
 */
export class NavigationHandler {
  constructor(private getPage: () => Page) {}

  /**
   * Navigate to URL with retry logic
   */
  async navigate(url: string): Promise<BrowserActionResult> {
    try {
      const page = this.getPage();
      console.log('[NavigationHandler] Navigating to:', url);

      let lastError: Error | null = null;

      // Try with different strategies
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 45000
          });
          return {
            success: true,
            message: `Navigated to ${url}`
          };
        } catch (gotoError: any) {
          lastError = gotoError;
          console.log('[NavigationHandler] Attempt', attempt, 'failed:', gotoError.message);

          if (attempt === 3) {
            // Last attempt failed, try with just commit state
            try {
              await page.goto(url, {
                waitUntil: 'commit',
                timeout: 30000
              });
              return {
                success: true,
                message: `Navigated to ${url} (committed)`
              };
            } catch (commitError: any) {
              lastError = commitError;
            }
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }

      return {
        success: false,
        message: `Failed to navigate to ${url}: ${lastError?.message || 'Unknown error'}`
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to navigate to ${url}: ${e.message}`
      };
    }
  }

  /**
   * Navigate back
   */
  async goBack(): Promise<BrowserActionResult> {
    try {
      const page = this.getPage();
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
      return {
        success: true,
        message: 'Navigated back'
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to go back: ${e.message}`
      };
    }
  }

  /**
   * Navigate forward
   */
  async goForward(): Promise<BrowserActionResult> {
    try {
      const page = this.getPage();
      await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });
      return {
        success: true,
        message: 'Navigated forward'
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to go forward: ${e.message}`
      };
    }
  }

  /**
   * Refresh current page
   */
  async refresh(): Promise<BrowserActionResult> {
    try {
      const page = this.getPage();
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      return {
        success: true,
        message: 'Page refreshed'
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to refresh: ${e.message}`
      };
    }
  }

  /**
   * Get current URL
   */
  async getUrl(): Promise<string> {
    try {
      return this.getPage().url();
    } catch (e: any) {
      return `Failed to get URL: ${e.message}`;
    }
  }

  /**
   * Get current page title
   */
  async getTitle(): Promise<string> {
    try {
      return await this.getPage().title();
    } catch (e: any) {
      return `Failed to get title: ${e.message}`;
    }
  }
}
