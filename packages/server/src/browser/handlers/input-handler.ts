/**
 * Input Handler
 * Handles keyboard and mouse input operations
 */

import type { Page } from "playwright";
import { createLogger } from "../../core/logging.js";

const logger = createLogger('InputHandler');

export interface InputHandlerContext {
  page: Page;
  emit?: (action: string, detail: string) => void;
}

/**
 * Input Handler handles keyboard and mouse operations
 * This is extracted from browser/controller.ts
 */
export class InputHandler {
  private context: InputHandlerContext;

  constructor(context: InputHandlerContext) {
    this.context = context;
  }

  /**
   * Scroll the page in a direction
   */
  async scroll(direction: string, amount?: number): Promise<string> {
    try {
      const delta = amount ?? 500;
      const deltaWithSign = direction === "up" ? -delta : delta;

      if (direction === "left" || direction === "right") {
        await this.context.page.mouse.wheel(direction === "right" ? delta : -delta, 0);
      } else {
        await this.context.page.mouse.wheel(0, deltaWithSign);
      }

      this.emit("scroll", `${direction} ${amount ?? 500}px`);
      return `Scrolled ${direction} by ${amount ?? 500}px`;
    } catch (e: any) {
      return `Failed to scroll: ${e.message}`;
    }
  }

  /**
   * Press a keyboard key
   */
  async pressKey(key: string): Promise<string> {
    try {
      await this.context.page.keyboard.press(key);
      this.emit("press_key", key);
      return `Pressed key: ${key}`;
    } catch (e: any) {
      return `Failed to press key ${key}: ${e.message}`;
    }
  }

  /**
   * Type text using keyboard
   */
  async type(text: string, delay?: number): Promise<string> {
    try {
      await this.context.page.keyboard.type(text, { delay });
      this.emit("type_text", `length=${text.length}`);
      return `Typed ${text.length} characters`;
    } catch (e: any) {
      return `Failed to type text: ${e.message}`;
    }
  }

  /**
   * Dispatch mouse event
   */
  async dispatchMouse(
    type: string,
    x: number,
    y: number,
    button: string = 'left',
    buttons: number = 1
  ): Promise<void> {
    try {
      const options = {
        x: Math.round(x),
        y: Math.round(y),
        button: button as any,
        clickCount: 1
      };

      switch (type) {
        case 'mousedown':
        case 'mouseup':
        case 'mousemove':
        case 'click':
        case 'dblclick':
          await this.context.page.mouse[`${type}`](options.x, options.y, options);
          break;
        default:
          logger.warn(`Unknown mouse event type: ${type}`);
      }
    } catch (e: any) {
      logger.error(`Failed to dispatch mouse event: ${e.message}`);
    }
  }

  /**
   * Dispatch keyboard event
   */
  async dispatchKey(
    type: string,
    key: string,
    code?: string,
    text?: string
  ): Promise<void> {
    try {
      // Dispatch keyboard event through CDP or Playwright
      switch (type) {
        case 'keydown':
        case 'keyup':
          await this.context.page.keyboard.press(key);
          break;
        case 'keypress':
          await this.context.page.keyboard.type(text ?? key);
          break;
        default:
          logger.warn(`Unknown keyboard event type: ${type}`);
      }
    } catch (e: any) {
      logger.error(`Failed to dispatch keyboard event: ${e.message}`);
    }
  }

  /**
   * Move mouse to position
   */
  async moveMouse(x: number, y: number): Promise<string> {
    try {
      await this.context.page.mouse.move(Math.round(x), Math.round(y));
      return `Moved mouse to (${x}, ${y})`;
    } catch (e: any) {
      return `Failed to move mouse: ${e.message}`;
    }
  }

  /**
   * Click mouse at position
   */
  async clickMouse(x: number, y: number, button: 'left' | 'right' | 'middle' = 'left'): Promise<string> {
    try {
      await this.context.page.mouse.click(Math.round(x), Math.round(y), { button });
      return `Clicked at (${x}, ${y}) with ${button} button`;
    } catch (e: any) {
      return `Failed to click: ${e.message}`;
    }
  }

  /**
   * Emit step event
   */
  private emit(action: string, detail: string): void {
    this.context.emit?.(action, detail);
  }
}
