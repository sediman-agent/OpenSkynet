/**
 * HTTP Proxy Service for fetching page content
 * Avoids webview ERR_ABORTED errors by fetching pages via HTTP
 */

import { createLogger } from '../core/logging.js';

const logger = createLogger('HttpProxyService');

export interface ProxyPage {
  url: string;
  content: string;
  title: string;
  status: number;
  headers: Record<string, string>;
}

/**
 * Fetch a page via HTTP proxy
 */
export async function fetchPage(url: string): Promise<ProxyPage> {
  try {
    logger.info(`[HttpProxy] Fetching page: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
      redirect: 'follow'
    });

    const status = response.status;
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Get content type from headers
    const contentType = headers['content-type'] || '';
    let content = '';

    if (contentType.includes('application/json') || contentType.includes('application/json')) {
      const json = await response.json();
      content = JSON.stringify(json, null, 2);
    } else {
      content = await response.text();
    }

    // Extract title from HTML
    let title = '';
    if (contentType.includes('text/html')) {
      const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/i);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }
    }

    logger.info(`[HttpProxy] Successfully fetched ${url}: ${status}, ${content.length} bytes, title: ${title || 'none'}`);

    return {
      url,
      content,
      title,
      status,
      headers
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[HttpProxy] Failed to fetch ${url}: ${errorMessage}`);
    return {
      url,
      content: '',
      title: 'Error',
      status: 500,
      headers: {},
    };
  }
}

/**
 * Create a data URL from page content for display in webview
 */
export function createDataUrl(content: string, mimeType: string = 'text/html'): string {
  const base64Content = Buffer.from(content).toString('base64');
  return `data:${mimeType};base64,${base64Content}`;
}

/**
 * Navigate to a URL via HTTP proxy
 */
export async function navigateToUrl(url: string): Promise<{ success: boolean; result: string; error?: string; title?: string; content?: string; dataUrl?: string }> {
  try {
    logger.info(`[HttpProxy] Navigating to: ${url}`);

    // Validate URL
    try {
      new URL(url);
    } catch {
      return {
        success: false,
        result: `Invalid URL: ${url}`,
        error: `Invalid URL format`
      };
    }

    const page = await fetchPage(url);

    if (page.status >= 200 && page.status < 300) {
      logger.info(`[HttpProxy] Navigation succeeded: ${page.title}`);

      // Create data URL for displaying in webview
      const dataUrl = createDataUrl(page.content, 'text/html');

      return {
        success: true,
        result: `Navigated to ${url} (${page.status})`,
        title: page.title,
        content: page.content,
        dataUrl
      };
    } else {
      logger.warn(`[HttpProxy] Navigation failed with status ${page.status}`);
      return {
        success: false,
        result: `Failed to load ${url} (${page.status})`,
        error: `HTTP ${page.status}: ${page.title || 'Unknown error'}`
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`[HttpProxy] Navigation error: ${errorMessage}`);
    return {
      success: false,
      result: `Failed to navigate to ${url}: ${errorMessage}`,
      error: errorMessage
    };
  }
}
