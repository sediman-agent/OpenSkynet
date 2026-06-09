/**
 * Page Data Extractor
 * Extracts data from pages (snapshots, text, screenshots)
 */

import type { Page } from 'playwright';
import type { PageSnapshot } from '../types.js';
import { getConfig } from '../../core/config.js';
import { DISMISS_OVERLAYS_JS } from '../scripts/dismiss-overlays.js';
import { SNAPSHOT_JS } from '../scripts/snapshot.js';

/**
 * Page Data Extractor
 * This is extracted from browser/controller.ts
 */
export class PageDataExtractor {
  constructor(
    private getPage: () => Page,
    private takeScreenshot: () => Promise<string | null>
  ) {}

  /**
   * Take page snapshot with all elements
   */
  async snapshot(): Promise<PageSnapshot> {
    const page = this.getPage();

    // Dismiss overlays
    await page.evaluate(DISMISS_OVERLAYS_JS).catch(() => {});

    // Take snapshot
    const result = (await page.evaluate(SNAPSHOT_JS)) as {
      elements: any[];
      output: string;
      textPreview: string;
      scrollPosition: { x: number; y: number };
      viewport: { width: number; height: number };
      pageSize: { width: number; height: number };
      url: string;
      title: string;
      stats: {
        links: number;
        interactive: number;
        iframes: number;
        images: number;
        total: number;
        textChars: number;
      };
      pagesAbove: number;
      pagesBelow: number;
    };

    const url = result.url || page.url();
    const title = result.title || await page.title();

    return {
      url,
      title,
      elements: result.elements,
      textPreview: result.textPreview || '',
      output: result.output || '',
      scrollPosition: result.scrollPosition,
      viewport: result.viewport,
      pageSize: result.pageSize,
      stats: result.stats,
      pagesAbove: result.pagesAbove,
      pagesBelow: result.pagesBelow,
    };
  }

  /**
   * Extract text content from page
   */
  async extractText(): Promise<string> {
    try {
      const page = this.getPage();
      const text = await page.evaluate(() => {
        const body = document.body;
        if (!body) return '';
        const clone = body.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('script, style, noscript, svg, path').forEach((el) => el.remove());
        return (clone.innerText || '').replace(/\s+/g, ' ').trim();
      });
      const cfg = getConfig();
      return text.slice(0, cfg.defaultWebMaxChars);
    } catch (e: any) {
      return `Failed to extract text: ${e.message}`;
    }
  }

  /**
   * Take screenshot
   */
  async screenshot(): Promise<string | null> {
    return this.takeScreenshot();
  }

  /**
   * Evaluate JavaScript in page context
   */
  async evaluate(script: string): Promise<any> {
    try {
      const page = this.getPage();
      const result = await page.evaluate(script);
      return result;
    } catch (error: any) {
      return {
        success: false,
        error: `Script execution failed: ${error.message}`
      };
    }
  }

  /**
   * Wait for selector to appear
   */
  async waitForSelector(selector: string, timeout = 10000): Promise<{ success: boolean; message: string }> {
    try {
      const page = this.getPage();
      await page.waitForSelector(selector, {
        timeout,
        state: 'visible'
      });
      return {
        success: true,
        message: `Element "${selector}" appeared`
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Timeout waiting for "${selector}": ${e.message}`
      };
    }
  }

  /**
   * Get page metadata
   */
  async getMetadata(): Promise<{
    url: string;
    title: string;
    elementCount: number;
    textLength: number;
  }> {
    try {
      const page = this.getPage();
      const url = page.url();
      const title = await page.title();

      const metadata = await page.evaluate(() => {
        const body = document.body;
        return {
          elementCount: body ? body.querySelectorAll('*').length : 0,
          textLength: body ? body.innerText.length : 0
        };
      });

      return {
        url,
        title,
        elementCount: metadata.elementCount,
        textLength: metadata.textLength
      };
    } catch (e: any) {
      return {
        url: '',
        title: '',
        elementCount: 0,
        textLength: 0
      };
    }
  }
}
