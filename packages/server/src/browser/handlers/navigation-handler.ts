/**
 * Browser Navigation Handler
 * Handles page navigation and history operations
 */

import type { Page } from "playwright";
import { createLogger } from "../../core/logging.js";

const logger = createLogger('NavigationHandler');

export interface NavigationContext {
  page: Page;
  emit?: (action: string, detail: string) => void;
}

/**
 * Navigation Handler handles browser navigation operations
 * This is extracted from browser/controller.ts
 */
export class NavigationHandler {
  private context: NavigationContext;

  constructor(context: NavigationContext) {
    this.context = context;
  }

  /**
   * Navigate to URL with retry logic
   */
  async navigate(url: string): Promise<string> {
    try {
      logger.info(`[NavigationHandler] Navigating to: ${url}`);

      // Try with different strategies
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await this.context.page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 45000
          });
          this.emit("navigate", url);
          logger.info(`[NavigationHandler] Navigation succeeded on attempt ${attempt}`);
          return `Navigated to ${url}`;
        } catch (gotoError: any) {
          logger.warn(`[NavigationHandler] Attempt ${attempt} failed: ${gotoError.message}`);

          if (attempt === 3) {
            // Last attempt failed, try with just load state
            try {
              await this.context.page.goto(url, {
                waitUntil: "commit",
                timeout: 30000
              });
              this.emit("navigate", url);
              logger.info('[NavigationHandler] Navigation succeeded with commit');
              return `Navigated to ${url} (committed)`;
            } catch (commitError: any) {
              return `Failed to navigate to ${url}: ${commitError.message}`;
            }
          }

          // Exponential backoff before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }

      return `Failed to navigate to ${url}`;
    } catch (e: any) {
      const error = `Failed to navigate to ${url}: ${e.message}`;
      logger.error('[NavigationHandler]', error);
      return error;
    }
  }

  /**
   * Navigate back in history
   */
  async goBack(): Promise<string> {
    try {
      await this.context.page.goBack({
        waitUntil: "domcontentloaded",
        timeout: 15000
      });
      this.emit("go_back", "");
      return "Navigated back";
    } catch (e: any) {
      return `Failed to go back: ${e.message}`;
    }
  }

  /**
   * Navigate forward in history
   */
  async goForward(): Promise<string> {
    try {
      await this.context.page.goForward({
        waitUntil: "domcontentloaded",
        timeout: 15000
      });
      this.emit("go_forward", "");
      return "Navigated forward";
    } catch (e: any) {
      return `Failed to go forward: ${e.message}`;
    }
  }

  /**
   * Refresh current page
   */
  async refresh(): Promise<string> {
    try {
      await this.context.page.reload({
        waitUntil: "domcontentloaded",
        timeout: 15000
      });
      this.emit("refresh", "");
      return "Page refreshed";
    } catch (e: any) {
      return `Failed to refresh: ${e.message}`;
    }
  }

  /**
   * Get current URL
   */
  async getUrl(): Promise<string> {
    try {
      return this.context.page.url();
    } catch (e: any) {
      return `Failed to get URL: ${e.message}`;
    }
  }

  /**
   * Get current page title
   */
  async getTitle(): Promise<string> {
    try {
      return await this.context.page.title();
    } catch (e: any) {
      return `Failed to get title: ${e.message}`;
    }
  }

  /**
   * Emit step event
   */
  private emit(action: string, detail: string): void {
    this.context.emit?.(action, detail);
  }
}
