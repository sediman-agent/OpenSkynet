/**
 * Playwright Adapter
 * Handles page extraction from Playwright page objects
 */

import type { PageExtraction, ExtractionOptions } from './schemas.js';
import { ExtractionResponseParser } from './response-parser.js';

/**
 * Playwright Adapter handles Playwright-specific extraction
 * This is extracted from llm/page-extraction-provider.ts
 */
export class PlaywrightAdapter {
  private responseParser: ExtractionResponseParser;

  constructor() {
    this.responseParser = new ExtractionResponseParser();
  }

  /**
   * Extract data from Playwright page
   */
  async extractFromPage(
    page: any,
    options?: ExtractionOptions
  ): Promise<{
    url: string;
    title: string;
    text: string;
    html?: string;
  }> {
    try {
      const url = page.url();
      const title = await page.title();
      const text = await this.extractPageText(page);

      return { url, title, text };
    } catch (error) {
      console.error('[PlaywrightAdapter] Extraction failed:', error);
      return {
        url: '',
        title: 'Extraction Error',
        text: ''
      };
    }
  }

  /**
   * Extract text content from page
   */
  private async extractPageText(page: any): Promise<string> {
    return await page.evaluate(() => {
      // Get all text content
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script, style, noscript, svg').forEach(el => el.remove());
      return clone.innerText || '';
    });
  }

  /**
   * Extract HTML content from page
   */
  async extractPageHtml(page: any): Promise<string> {
    try {
      return await page.content();
    } catch (error) {
      console.warn('[PlaywrightAdapter] Failed to extract HTML:', error);
      return '';
    }
  }

  /**
   * Extract page metadata
   */
  async extractMetadata(page: any): Promise<{
    url: string;
    title: string;
    description?: string;
    keywords?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
  }> {
    try {
      const url = page.url();
      const title = await page.title();

      const metadata = await page.evaluate(() => {
        const getMeta = (name: string) =>
          document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ||
          document.querySelector(`meta[property="${name}"]`)?.getAttribute('content');

        return {
          description: getMeta('description'),
          keywords: getMeta('keywords'),
          ogTitle: getMeta('og:title'),
          ogDescription: getMeta('og:description'),
          ogImage: getMeta('og:image'),
        };
      });

      return {
        url,
        title,
        ...metadata,
      };
    } catch (error) {
      console.error('[PlaywrightAdapter] Metadata extraction failed:', error);
      return {
        url: '',
        title: 'Error'
      };
    }
  }

  /**
   * Check if page is loaded and ready
   */
  async isPageReady(page: any): Promise<boolean> {
    try {
      return await page.evaluate(() => {
        return document.readyState === 'complete';
      });
    } catch {
      return false;
    }
  }

  /**
   * Wait for page to be ready
   */
  async waitForPageReady(page: any, timeout = 5000): Promise<boolean> {
    try {
      await page.waitForLoadState('domcontentloaded', { timeout });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get page dimensions
   */
  async getPageDimensions(page: any): Promise<{
    width: number;
    height: number;
    scrollWidth: number;
    scrollHeight: number;
  }> {
    try {
      return await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      }));
    } catch {
      return {
        width: 0,
        height: 0,
        scrollWidth: 0,
        scrollHeight: 0,
      };
    }
  }

  /**
   * Get all frames in page
   */
  async getPageFrames(page: any): Promise<Array<{
    id: string;
    url: string;
    name?: string;
  }>> {
    try {
      const frames = page.frames();
      return frames.map(frame => ({
        id: frame._id ?? '',
        url: frame.url(),
        name: frame.name(),
      }));
    } catch {
      return [];
    }
  }

  /**
   * Create fallback extraction on failure
   */
  createFallbackExtraction(error: string): PageExtraction {
    return this.responseParser.getFallbackExtraction();
  }
}
