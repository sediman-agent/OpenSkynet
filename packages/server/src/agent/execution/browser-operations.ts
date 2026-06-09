/**
 * Browser Operations Module
 * Handles browser state capture, vision injection, and screenshot management
 */

import { takeBrowserScreenshot, getLastPageState, setOnInterventionRequested } from "../tools/browser-tools";
import { setLatestScreenshot } from "../../api/routes/browser";
import logger from "../../core/logging";
import { getConfig } from "../../core/config";

export interface BrowserState {
  url: string;
  title: string;
  elements?: any[];
}

export interface BrowserOperationsOptions {
  onInterventionRequested?: (message: string, id: string) => void;
}

/**
 * Browser operations handler
 */
export class BrowserOperations {
  private interventionCallback?: (message: string, id: string) => void;
  private currentState: BrowserState | null = null;

  constructor(opts: BrowserOperationsOptions = {}) {
    this.interventionCallback = opts.onInterventionRequested;
  }

  /**
   * Initialize browser operations
   */
  initialize(): void {
    setOnInterventionRequested((message, id) => {
      this.interventionCallback?.(message, id);
    });
  }

  /**
   * Capture current browser state
   */
  async captureBrowserState(): Promise<BrowserState | null> {
    try {
      const { getBrowserController } = await import("../tools/browser-tools.js");
      const controller = await getBrowserController();

      if (!controller) {
        return null;
      }

      const snapshot = await controller.snapshot();
      if (snapshot) {
        this.currentState = {
          url: snapshot.url || '',
          title: snapshot.title || '',
          elements: snapshot.elements
        };
        return this.currentState;
      }

      return null;
    } catch (error) {
      logger.warn({ err: (error as Error).message }, "capture_browser_state_failed");
      return null;
    }
  }

  /**
   * Get current browser state
   */
  getCurrentState(): BrowserState | null {
    return this.currentState;
  }

  /**
   * Inject browser vision into conversation
   */
  async injectBrowserVision(onAddMessage: (content: string) => void): Promise<void> {
    try {
      const pageState = await getLastPageState();
      if (!pageState) {
        logger.debug("No page state available for vision injection");
        return;
      }

      const { url, screenshot } = pageState;
      const config = getConfig();

      // Skip vision injection if disabled
      if (config.skipBrowserVision) {
        logger.debug("Browser vision injection disabled by config");
        return;
      }

      // TEMPORARILY DISABLE IMAGE FOR MINIMAX TESTING
      // MiniMax might not support image_url content type or has issues with base64 images
      onAddMessage('[Browser screenshot available - Current URL: ' + url + '. Use browser_snapshot for element refIds.]');

      /*
      // Original vision injection with image (disabled for MiniMax compatibility)
      const messageContent = [
        {
          type: 'text',
          text: '[Browser screenshot after your last action. Use browser_snapshot for element refIds. Current URL: ' + url + ']'
        },
        {
          type: 'image_url',
          image_url: {
            url: screenshot,
            detail: 'low'
          }
        }
      ];

      this.addUserMessage({
        role: 'user',
        content: messageContent
      });
      */

      logger.debug({ url, hasScreenshot: !!screenshot }, "browser_vision_injected");
    } catch (error) {
      logger.warn({ err: (error as Error).message }, "browser_vision_injection_failed");
    }
  }

  /**
   * Take browser screenshot and update latest
   */
  async takeScreenshot(): Promise<string | null> {
    try {
      const screenshot = await takeBrowserScreenshot();
      if (screenshot) {
        await setLatestScreenshot({ elements: screenshot.elements });
        return screenshot.url || null;
      }
      return null;
    } catch (error) {
      logger.warn({ err: (error as Error).message }, "browser_screenshot_failed");
      return null;
    }
  }

  /**
   * Update current state from page state
   */
  async updateFromPageState(): Promise<void> {
    try {
      const pageState = await getLastPageState();
      if (pageState) {
        this.currentState = {
          url: pageState.url || '',
          title: pageState.title || ''
        };
      }
    } catch (error) {
      logger.warn({ err: (error as Error).message }, "update_browser_state_failed");
    }
  }

  /**
   * Get current URL
   */
  getCurrentUrl(): string {
    return this.currentState?.url || '';
  }

  /**
   * Get current title
   */
  getCurrentTitle(): string {
    return this.currentState?.title || '';
  }

  /**
   * Clear current state
   */
  clearState(): void {
    this.currentState = null;
  }
}
