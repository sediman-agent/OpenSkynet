/**
 * Page Content Handler
 * Handles page snapshots, screenshots, and content extraction
 */

import type { Page } from "playwright";
import type { PageSnapshot } from "../controller.js";
import { createLogger } from "../../core/logging.js";
import { SNAPSHOT_JS } from "../scripts/snapshot.js";

const logger = createLogger('PageContentHandler');

export interface PageContentContext {
  page: Page;
  emit?: (action: string, detail: string) => void;
}

/**
 * Page Content Handler handles content extraction and snapshots
 * This is extracted from browser/controller.ts
 */
export class PageContentHandler {
  private context: PageContentContext;

  constructor(context: PageContentContext) {
    this.context = context;
  }

  /**
   * Capture a page snapshot with interactive elements
   */
  async snapshot(): Promise<PageSnapshot> {
    try {
      const page = this.context.page;
      const url = page.url();
      const title = await page.title();

      // Execute snapshot script
      const snapshotData = await page.evaluate(SNAPSHOT_JS);

      this.emit("snapshot", `elements=${snapshotData.elements.length}`);

      return {
        url,
        title,
        elements: snapshotData.elements,
        textPreview: snapshotData.text || '',
        output: snapshotData.output || '',
        scrollPosition: snapshotData.scrollPosition,
        viewport: snapshotData.viewport,
        pageSize: snapshotData.pageSize,
        stats: snapshotData.stats,
        pagesAbove: snapshotData.pagesAbove,
        pagesBelow: snapshotData.pagesBelow
      };
    } catch (e: any) {
      logger.error(`Failed to capture snapshot: ${e.message}`);
      return {
        url: '',
        title: '',
        elements: [],
        textPreview: '',
        output: `Failed to capture snapshot: ${e.message}`
      };
    }
  }

  /**
   * Extract all visible text from the page
   */
  async extractText(): Promise<string> {
    try {
      const text = await this.context.page.evaluate(() => {
        return document.body.innerText;
      });

      this.emit("extract_text", `length=${text.length}`);
      return text;
    } catch (e: any) {
      return `Failed to extract text: ${e.message}`;
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(options?: {
    fullPage?: boolean;
    type?: 'png' | 'jpeg';
  }): Promise<string | null> {
    try {
      const screenshot = await this.context.page.screenshot({
        type: options?.type ?? 'png',
        fullPage: options?.fullPage ?? false,
        animations: 'disabled'
      });

      this.emit("screenshot", `size=${screenshot.length}`);
      return screenshot.toString('base64');
    } catch (e: any) {
      logger.error(`Failed to take screenshot: ${e.message}`);
      return null;
    }
  }

  /**
   * Get page HTML
   */
  async getHtml(): Promise<string> {
    try {
      return await this.context.page.content();
    } catch (e: any) {
      return `Failed to get HTML: ${e.message}`;
    }
  }

  /**
   * Get page metadata
   */
  async getMetadata(): Promise<Record<string, string | undefined>> {
    try {
      return await this.context.page.evaluate(() => {
        const meta: Record<string, string> = {};

        // Get meta tags
        document.querySelectorAll('meta').forEach(tag => {
          const name = tag.getAttribute('name') || tag.getAttribute('property');
          const content = tag.getAttribute('content');
          if (name && content) {
            meta[name] = content;
          }
        });

        return meta;
      });
    } catch (e: any) {
      logger.error(`Failed to get metadata: ${e.message}`);
      return {};
    }
  }

  /**
   * Get all links from the page
   */
  async getLinks(): Promise<Array<{ text: string; href: string }>> {
    try {
      return await this.context.page.evaluate(() => {
        const links: Array<{ text: string; href: string }> = [];

        document.querySelectorAll('a[href]').forEach(a => {
          const text = a.textContent?.trim() || '';
          const href = (a as HTMLAnchorElement).href;
          if (href) {
            links.push({ text, href });
          }
        });

        return links;
      });
    } catch (e: any) {
      logger.error(`Failed to get links: ${e.message}`);
      return [];
    }
  }

  /**
   * Get all images from the page
   */
  async getImages(): Promise<Array<{ src: string; alt?: string }>> {
    try {
      return await this.context.page.evaluate(() => {
        const images: Array<{ src: string; alt?: string }> = [];

        document.querySelectorAll('img').forEach(img => {
          const src = img.src;
          const alt = img.alt;
          if (src) {
            images.push({ src, alt });
          }
        });

        return images;
      });
    } catch (e: any) {
      logger.error(`Failed to get images: ${e.message}`);
      return [];
    }
  }

  /**
   * Get page dimensions and scroll info
   */
  async getPageInfo(): Promise<{
    url: string;
    title: string;
    viewport: { width: number; height: number };
    scroll: { x: number; y: number };
    contentSize: { width: number; height: number };
  }> {
    try {
      return await this.context.page.evaluate(() => {
        return {
          url: window.location.href,
          title: document.title,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          scroll: {
            x: window.scrollX,
            y: window.scrollY
          },
          contentSize: {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight
          }
        };
      });
    } catch (e: any) {
      logger.error(`Failed to get page info: ${e.message}`);
      throw e;
    }
  }

  /**
   * Emit step event
   */
  private emit(action: string, detail: string): void {
    this.context.emit?.(action, detail);
  }
}
