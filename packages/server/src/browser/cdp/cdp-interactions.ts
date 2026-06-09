/**
 * CDP (Chrome DevTools Protocol) Interactions Module
 * Handles low-level browser interactions via CDP
 */

import type { Page, ElementHandle } from "playwright";
import { createLogger } from "../../core/logging.js";

const logger = createLogger("CDPInteractions");

/**
 * Mouse button types
 */
export type MouseButton = 'left' | 'right' | 'middle' | 'none';

/**
 * Mouse event types
 */
export type MouseEventType = 'mousePressed' | 'mouseReleased' | 'mouseMoved';

/**
 * Result of a drag and drop operation
 */
export interface DragAndDropResult {
  success: boolean;
  message: string;
}

/**
 * CDP Interactions Handler
 * Provides low-level browser control using Chrome DevTools Protocol
 */
export class CDPInteractions {
  private page: Page;
  private cdpSession: any = null;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Get or create CDP session for the page
   */
  private async getCDPSession(): Promise<any> {
    if (!this.cdpSession) {
      this.cdpSession = await this.page.context().newCDPSession(this.page);
    }
    return this.cdpSession;
  }

  /**
   * Dispatch a mouse event via CDP
   */
  async dispatchMouseEvent(
    type: MouseEventType,
    x: number,
    y: number,
    button: MouseButton = 'left',
    buttons: number = 1
  ): Promise<void> {
    try {
      const cdp = await this.getCDPSession();

      // Determine button and button states
      const buttonParam = type === 'mouseMoved' ? 'none' : button;
      const buttonsParam = type === 'mouseReleased' ? 0 : buttons;

      await cdp.send('Input.dispatchMouseEvent', {
        type,
        x: Math.round(x),
        y: Math.round(y),
        button: buttonParam,
        buttons: buttonsParam,
        clickCount: 1,
      } as any);

      logger.debug(`[CDP] Dispatched mouse event: ${type} at (${Math.round(x)}, ${Math.round(y)})`);
    } catch (error) {
      logger.error(`[CDP] Failed to dispatch mouse event: ${error}`);
      throw error;
    }
  }

  /**
   * Dispatch a key event via CDP
   * Note: For reliable text input, Playwright's keyboard API is preferred
   */
  async dispatchKeyEvent(type: 'keyDown' | 'keyUp', key: string): Promise<void> {
    try {
      // Use Playwright's keyboard API for reliable text input
      // CDP Input.dispatchKeyEvent is notoriously unreliable for text
      if (type === 'keyDown') {
        await this.page.keyboard.down(key as any);
      } else if (type === 'keyUp') {
        await this.page.keyboard.up(key as any);
      }

      logger.debug(`[CDP] Dispatched key event: ${type} for key: ${key}`);
    } catch (error) {
      logger.error(`[CDP] Failed to dispatch key event: ${error}`);
      throw error;
    }
  }

  /**
   * Perform drag and drop operation using CDP mouse events
   */
  async dragAndDrop(
    sourceRefId: number,
    targetRefId: number,
    elementResolver: (refId: number) => Promise<ElementHandle | null>
  ): Promise<DragAndDropResult> {
    try {
      const sourceElement = await elementResolver(sourceRefId);
      const targetElement = await elementResolver(targetRefId);

      if (!sourceElement || !targetElement) {
        return {
          success: false,
          message: `Failed to resolve elements: source=${sourceRefId}, target=${targetRefId}`
        };
      }

      // Get bounding boxes
      const sourceBox = await sourceElement.boundingBox();
      const targetBox = await targetElement.boundingBox();

      if (!sourceBox || !targetBox) {
        return {
          success: false,
          message: 'Failed to get element bounding boxes'
        };
      }

      // Calculate center points
      const sourceCenter = {
        x: sourceBox.x + sourceBox.width / 2,
        y: sourceBox.y + sourceBox.height / 2
      };
      const targetCenter = {
        x: targetBox.x + targetBox.width / 2,
        y: targetBox.y + targetBox.height / 2
      };

      logger.info(`[CDP] Drag and drop: (${Math.round(sourceCenter.x)}, ${Math.round(sourceCenter.y)}) -> (${Math.round(targetCenter.x)}, ${Math.round(targetCenter.y)})`);

      // Perform drag and drop using CDP
      // 1. Mouse down on source
      await this.dispatchMouseEvent('mousePressed', sourceCenter.x, sourceCenter.y, 'left', 1);
      await this.delay(100);

      // 2. Move to target
      await this.dispatchMouseEvent('mouseMoved', targetCenter.x, targetCenter.y, 'none', 1);
      await this.delay(200);

      // 3. Mouse up at target
      await this.dispatchMouseEvent('mouseReleased', targetCenter.x, targetCenter.y, 'left', 0);

      return {
        success: true,
        message: `Dragged element ${sourceRefId} to element ${targetRefId}`
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[CDP] Drag and drop failed: ${message}`);
      return {
        success: false,
        message: `Drag and drop failed: ${message}`
      };
    }
  }

  /**
   * Click at specific coordinates using CDP
   */
  async click(x: number, y: number, button: MouseButton = 'left'): Promise<void> {
    await this.dispatchMouseEvent('mousePressed', x, y, button, 1);
    await this.delay(50);
    await this.dispatchMouseEvent('mouseReleased', x, y, button, 0);
  }

  /**
   * Hover at specific coordinates using CDP
   */
  async hover(x: number, y: number): Promise<void> {
    await this.dispatchMouseEvent('mouseMoved', x, y, 'none', 0);
  }

  /**
   * Scroll using mouse wheel
   */
  async scroll(x: number, y: number, deltaX: number, deltaY: number): Promise<void> {
    const cdp = await this.getCDPSession();
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: Math.round(x),
      y: Math.round(y),
      deltaX: Math.round(deltaX),
      deltaY: Math.round(deltaY),
    } as any);
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up CDP session
   */
  async dispose(): Promise<void> {
    if (this.cdpSession) {
      try {
        await this.cdpSession.detach();
      } catch (error) {
        logger.warn('[CDP] Failed to detach CDP session:', error);
      }
      this.cdpSession = null;
    }
  }
}

/**
 * Factory function to create CDP interactions for a page
 */
export function createCDPInteractions(page: Page): CDPInteractions {
  return new CDPInteractions(page);
}
