/**
 * Vision Injector
 * Handles injection of screenshots and vision content into conversations
 */

import type { Message } from '../../../llm/provider';
import { captureScreenshot } from './screenshot-manager.js';
import { getConfig } from '../../core/config.js';
import { createLogger } from '../../core/logging.js';
import { createUserMessage, MessageBuilder } from '../../core/utils/message-builder.js';

const logger = createLogger('VisionInjector');

export interface VisionInjectionOptions {
  includeImage?: boolean;
  imageDetail?: 'low' | 'high' | 'auto';
  customMessage?: string;
  includeContext?: boolean;
}

export interface BrowserState {
  url: string;
  title: string;
  elements?: any[];
}

/**
 * Manages vision injection for LLM conversations
 */
export class VisionInjector {
  private enabled = true;

  constructor() {
    const config = getConfig();
    // @ts-ignore - skipBrowserVision not yet in Config type
    this.enabled = !config.skipBrowserVision;
  }

  /**
   * Inject browser vision into conversation after a browser action
   */
  async injectAfterBrowserAction(
    addMessage: (content: string | Message) => void,
    state?: BrowserState
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const result = await captureScreenshot();

    if (!result.success || !result.data) {
      // Check if this is a bot detection page
      if (result.error === 'BOT_DETECTION') {
        logger.warn('[VisionInjector] Bot detection detected - requesting human intervention');
        this.requestHumanIntervention(result.url || 'unknown', addMessage);
        return;
      }

      this.injectTextOnly(result.url || 'unknown', addMessage);
      return;
    }

    // Check if we should include image
    const config = getConfig();
    // @ts-ignore - skipBrowserVisionImages not yet in Config type
    const includeImage = !config.skipBrowserVisionImages;

    if (includeImage) {
      this.injectWithImage(result.url || 'unknown', result.data, addMessage);
    } else {
      this.injectTextOnly(result.url || 'unknown', addMessage);
    }
  }

  /**
   * Request human intervention for bot detection/challenge pages
   */
  private requestHumanIntervention(url: string, addMessage: (content: string | Message) => void): void {
    const message = `⚠️ **Bot Detection Page Detected**

The browser has encountered a bot detection or access challenge page at:
**${url}**

**Please help by:**
1. Checking the browser panel
2. Solving any CAPTCHA or challenge
3. Clicking "Accept" or "Continue" if prompted
4. Once the page loads, let me know and I'll continue

After you've solved the challenge, reply "continue" and I'll proceed with the task.`;

    addMessage(message);
  }

  /**
   * Inject text-only vision message (for LLMs that don't support images)
   */
  private injectTextOnly(url: string, addMessage: (content: string | Message) => void): void {
    const message = `[Browser screenshot available - Current URL: ${url}. Use browser_snapshot for element refIds.]`;
    addMessage(message);
  }

  /**
   * Inject vision message with image
   */
  private injectWithImage(url: string, imageData: string, addMessage: (content: string | Message) => void): void {
    // Create message with text and image - NO logging of image data
    const message = MessageBuilder.user()
      .withText(`[Browser screenshot after your last action. Use browser_snapshot for element refIds. Current URL: ${url}]`)
      .withImage(`data:image/jpeg;base64,${imageData}`, 'low')
      .build();

    addMessage(message);
  }

  /**
   * Create a vision message from state
   */
  createVisionMessage(state: BrowserState, imageData?: string): Message {
    if (!imageData) {
      return createUserMessage(
        `[Browser state - URL: ${state.url}, Title: ${state.title}. Use browser_snapshot for element refIds.]`
      );
    }

    return MessageBuilder.user()
      .withText(`[Browser state - URL: ${state.url}, Title: ${state.title}. Use browser_snapshot for element refIds.]`)
      .withImage(`data:image/jpeg;base64,${imageData}`, 'low')
      .build();
  }

  /**
   * Check if vision injection is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable vision injection
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(`[VisionInjector] Vision injection ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Inject vision on demand
   */
  async inject(
    addMessage: (content: string | Message) => void,
    options: VisionInjectionOptions = {}
  ): Promise<void> {
    if (!this.enabled) {
      logger.debug('[VisionInjector] Vision injection disabled');
      return;
    }

    const result = await captureScreenshot();

    if (!result.success || !result.data) {
      if (options.customMessage) {
        addMessage(options.customMessage);
      }
      return;
    }

    if (options.includeImage && result.data) {
      const base64Image = result.data.startsWith('data:') ? result.data : `data:image/jpeg;base64,${result.data}`;
      addMessage(
        MessageBuilder.user()
          .withText(options.customMessage || `[Browser screenshot - URL: ${result.url}]`)
          .withImage(base64Image, options.imageDetail || 'low')
          .build()
      );
    } else {
      addMessage(
        options.customMessage || `[Browser screenshot available - URL: ${result.url}]`
      );
    }
  }
}

/**
 * Global vision injector instance
 */
export const visionInjector = new VisionInjector();

/**
 * Convenience function to inject vision after browser action
 */
export async function injectBrowserVision(
  addMessage: (content: string | Message) => void,
  state?: BrowserState
): Promise<void> {
  return visionInjector.injectAfterBrowserAction(addMessage, state);
}
