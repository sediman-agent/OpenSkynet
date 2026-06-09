/**
 * Element Interaction Handler
 * Handles interactions with page elements
 */

import type { Page, Locator } from "playwright";
import { createLogger } from "../../core/logging.js";

const logger = createLogger('ElementInteractionHandler');

export interface ElementInteractionContext {
  page: Page;
  resolveElement: (refId: number) => Promise<Locator | null>;
  emit?: (action: string, detail: string) => void;
}

/**
 * Element Interaction Handler handles element-based interactions
 * This is extracted from browser/controller.ts
 */
export class ElementInteractionHandler {
  private context: ElementInteractionContext;

  constructor(context: ElementInteractionContext) {
    this.context = context;
  }

  /**
   * Click on an element by refId
   */
  async click(refId: number): Promise<string> {
    try {
      const el = await this.context.resolveElement(refId);
      if (!el) return `Element with refId ${refId} not found`;

      await el.click({ timeout: 5000 });
      this.emit("click", `refId=${refId}`);
      return `Clicked element ${refId}`;
    } catch (e: any) {
      return `Failed to click element ${refId}: ${e.message}`;
    }
  }

  /**
   * Type text into an element
   */
  async typeText(refId: number, text: string, submit?: boolean): Promise<string> {
    try {
      const el = await this.context.resolveElement(refId);
      if (!el) return `Element with refId ${refId} not found`;

      await el.fill("");
      await el.type(text, { delay: 30 });

      if (submit) await el.press("Enter");

      this.emit("type", `refId=${refId} text=${text.slice(0, 50)}`);
      return `Typed "${text.slice(0, 50)}" into element ${refId}${submit ? " and submitted" : ""}`;
    } catch (e: any) {
      return `Failed to type into element ${refId}: ${e.message}`;
    }
  }

  /**
   * Hover over an element
   */
  async hover(refId: number): Promise<string> {
    try {
      const el = await this.context.resolveElement(refId);
      if (!el) return `Element with refId ${refId} not found`;

      await el.hover({ timeout: 5000 });
      this.emit("hover", `refId=${refId}`);
      return `Hovered over element ${refId}`;
    } catch (e: any) {
      return `Failed to hover over element ${refId}: ${e.message}`;
    }
  }

  /**
   * Select an option from a dropdown
   */
  async selectOption(refId: number, value: string): Promise<string> {
    try {
      const el = await this.context.resolveElement(refId);
      if (!el) return `Element with refId ${refId} not found`;

      await el.selectOption(value, { timeout: 5000 });
      this.emit("select", `refId=${refId} value=${value}`);
      return `Selected "${value}" in element ${refId}`;
    } catch (e: any) {
      return `Failed to select in element ${refId}: ${e.message}`;
    }
  }

  /**
   * Drag and drop from source to target element
   */
  async dragAndDrop(sourceRefId: number, targetRefId: number): Promise<string> {
    try {
      const source = await this.context.resolveElement(sourceRefId);
      const target = await this.context.resolveElement(targetRefId);

      if (!source) return `Source element ${sourceRefId} not found`;
      if (!target) return `Target element ${targetRefId} not found`;

      // Get bounding boxes for the drag operation
      const sourceBox = await source.boundingBox();
      const targetBox = await target.boundingBox();

      if (!sourceBox || !targetBox) {
        return `Could not get element positions`;
      }

      // Calculate center points
      const sourceX = sourceBox.x + sourceBox.width / 2;
      const sourceY = sourceBox.y + sourceBox.height / 2;
      const targetX = targetBox.x + targetBox.width / 2;
      const targetY = targetBox.y + targetBox.height / 2;

      // Perform drag and drop
      await this.context.page.mouse.move(sourceX, sourceY);
      await this.context.page.mouse.down();
      await this.context.page.mouse.move(targetX, targetY);
      await this.context.page.mouse.up();

      this.emit("drag_and_drop", `source=${sourceRefId} target=${targetRefId}`);
      return `Dragged element ${sourceRefId} to ${targetRefId}`;
    } catch (e: any) {
      return `Failed to drag and drop: ${e.message}`;
    }
  }

  /**
   * Upload a file to an input element
   */
  async uploadFile(refId: number, filePath: string): Promise<string> {
    try {
      const el = await this.context.resolveElement(refId);
      if (!el) return `Element with refId ${refId} not found`;

      await el.setInputFiles(filePath);
      this.emit("upload_file", `refId=${refId} path=${filePath}`);
      return `Uploaded file to element ${refId}`;
    } catch (e: any) {
      return `Failed to upload file: ${e.message}`;
    }
  }

  /**
   * Wait for a selector to appear
   */
  async waitForSelector(selector: string, timeout?: number): Promise<string> {
    try {
      await this.context.page.waitForSelector(selector, {
        timeout: timeout ?? 30000
      });
      return `Element matching selector "${selector}" appeared`;
    } catch (e: any) {
      return `Failed to wait for selector: ${e.message}`;
    }
  }

  /**
   * Evaluate JavaScript in the page
   */
  async evaluate(script: string): Promise<any> {
    try {
      return await this.context.page.evaluate(script);
    } catch (e: any) {
      return `Failed to evaluate script: ${e.message}`;
    }
  }

  /**
   * Emit step event
   */
  private emit(action: string, detail: string): void {
    this.context.emit?.(action, detail);
  }
}
