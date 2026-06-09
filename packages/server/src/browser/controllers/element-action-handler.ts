/**
 * Element Action Handler
 * Handles actions on page elements
 */

import type { Page } from 'playwright';
import type { BrowserActionResult } from '../types.js';

/**
 * Element Action Handler
 * This is extracted from browser/controller.ts
 */
export class ElementActionHandler {
  constructor(
    private getPage: () => Page,
    private resolveElement: (page: Page, refId: number) => Promise<any>
  ) {}

  /**
   * Click element by refId
   */
  async click(refId: number): Promise<BrowserActionResult> {
    try {
      const page = this.getPage();
      const el = await this.resolveElement(page, refId);
      if (!el) {
        return {
          success: false,
          message: `Element with refId ${refId} not found`,
          retryable: false
        };
      }
      await el.click({ timeout: 5000 });
      return {
        success: true,
        message: `Clicked element ${refId}`
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to click element ${refId}: ${e.message}`,
        retryable: true
      };
    }
  }

  /**
   * Type text into element
   */
  async typeText(refId: number, text: string, submit = false): Promise<BrowserActionResult> {
    try {
      const page = this.getPage();
      const el = await this.resolveElement(page, refId);
      if (!el) {
        return {
          success: false,
          message: `Element with refId ${refId} not found`,
          retryable: false
        };
      }
      await el.fill('');
      await el.type(text, { delay: 30 });
      if (submit) await el.press('Enter');
      return {
        success: true,
        message: `Typed "${text.slice(0, 50)}" into element ${refId}${submit ? ' and submitted' : ''}`
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to type into element ${refId}: ${e.message}`,
        retryable: true
      };
    }
  }

  /**
   * Hover over element
   */
  async hover(refId: number): Promise<BrowserActionResult> {
    try {
      const page = this.getPage();
      const el = await this.resolveElement(page, refId);
      if (!el) {
        return {
          success: false,
          message: `Element with refId ${refId} not found`,
          retryable: false
        };
      }
      await el.hover({ timeout: 5000 });
      return {
        success: true,
        message: `Hovered over element ${refId}`
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to hover over element ${refId}: ${e.message}`,
        retryable: true
      };
    }
  }

  /**
   * Select option in dropdown
   */
  async selectOption(refId: number, value: string): Promise<BrowserActionResult> {
    try {
      const page = this.getPage();
      const el = await this.resolveElement(page, refId);
      if (!el) {
        return {
          success: false,
          message: `Element with refId ${refId} not found`,
          retryable: false
        };
      }
      await el.selectOption(value, { timeout: 5000 });
      return {
        success: true,
        message: `Selected "${value}" in element ${refId}`
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to select in element ${refId}: ${e.message}`,
        retryable: true
      };
    }
  }

  /**
   * Drag and drop
   */
  async dragAndDrop(sourceRefId: number, targetRefId: number, dispatchDragDrop: (source: number, target: number, resolver: (refId: number) => Promise<any>) => Promise<{ message: string }>): Promise<BrowserActionResult> {
    try {
      const page = this.getPage();
      const result = await dispatchDragDrop(
        sourceRefId,
        targetRefId,
        (refId) => this.resolveElement(page, refId)
      );
      return {
        success: true,
        message: result.message
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Drag and drop failed: ${error.message}`,
        retryable: true
      };
    }
  }

  /**
   * Upload file to element
   */
  async uploadFile(refId: number, filePath: string): Promise<BrowserActionResult> {
    try {
      const page = this.getPage();
      const element = await this.resolveElement(page, refId);

      if (!element) {
        return {
          success: false,
          message: `Failed to resolve element: ${refId}`,
          retryable: false
        };
      }

      await element.setInputFiles(filePath);
      return {
        success: true,
        message: `Uploaded file "${filePath}" to element ${refId}`
      };
    } catch (error: any) {
      return {
        success: false,
        message: `File upload failed: ${error.message}`,
        retryable: true
      };
    }
  }
}
