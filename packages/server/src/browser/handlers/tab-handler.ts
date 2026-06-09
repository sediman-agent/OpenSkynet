/**
 * Tab/Window Handler
 * Handles browser tab and window management
 */

import type { BrowserContext } from "playwright";
import { createLogger } from "../../core/logging.js";

const logger = createLogger('TabHandler');

export interface TabHandlerContext {
  context: BrowserContext;
  emit?: (action: string, detail: string) => void;
}

/**
 * Tab Handler manages browser tabs and windows
 * This is extracted from browser/controller.ts
 */
export class TabHandler {
  private context: TabHandlerContext;

  constructor(context: TabHandlerContext) {
    this.context = context;
  }

  /**
   * Switch to a specific tab by index
   */
  async switchTab(index: number): Promise<string> {
    try {
      const pages = this.context.context.pages();

      if (index < 0 || index >= pages.length) {
        return `Tab index ${index} out of range (0-${pages.length - 1})`;
      }

      const targetPage = pages[index];

      // Bring the page to focus
      await targetPage.bringToFront();

      this.emit("switch_tab", `index=${index}`);
      return `Switched to tab ${index}: ${targetPage.url()}`;
    } catch (e: any) {
      return `Failed to switch tab: ${e.message}`;
    }
  }

  /**
   * List all open tabs
   */
  async listTabs(): Promise<string> {
    try {
      const pages = this.context.context.pages();
      const lines: string[] = [];

      lines.push(`Total tabs: ${pages.length}`);
      pages.forEach((page, i) => {
        lines.push(`  [${i}] ${page.url()}`);
      });

      return lines.join("\n");
    } catch (e: any) {
      return `Failed to list tabs: ${e.message}`;
    }
  }

  /**
   * Close a specific tab by index
   */
  async closeTab(index?: number): Promise<string> {
    try {
      const pages = this.context.context.pages();

      // If no index provided, close current (last active) page
      const targetIndex = index ?? pages.indexOf(await this.getActivePage());

      if (targetIndex < 0 || targetIndex >= pages.length) {
        return `Tab index ${targetIndex} out of range (0-${pages.length - 1})`;
      }

      const targetPage = pages[targetIndex];
      const url = targetPage.url();

      await targetPage.close();

      // Make sure there's still at least one page
      if (this.context.context.pages().length === 0) {
        await this.context.context.newPage();
      }

      this.emit("close_tab", `index=${targetIndex}`);
      return `Closed tab ${targetIndex}: ${url}`;
    } catch (e: any) {
      return `Failed to close tab: ${e.message}`;
    }
  }

  /**
   * Open a new tab
   */
  async openTab(url?: string): Promise<string> {
    try {
      const newPage = await this.context.context.newPage();

      if (url) {
        await newPage.goto(url);
        this.emit("open_tab", `url=${url}`);
        return `Opened new tab: ${url}`;
      }

      this.emit("open_tab", "");
      return "Opened new blank tab";
    } catch (e: any) {
      return `Failed to open new tab: ${e.message}`;
    }
  }

  /**
   * Get the currently active page
   */
  private async getActivePage(): Promise<Page> {
    const pages = this.context.context.pages();

    // Try to find a page that is focused
    for (const page of pages) {
      if (page === await this.getFocusedPage(pages)) {
        return page;
      }
    }

    // Default to first page
    return pages[0];
  }

  /**
   * Find the focused page ( workaround method)
   */
  private async getFocusedPage(pages: Page[]): Promise<Page | null> {
    // Since Playwright doesn't have a direct way to check focus,
    // we use a heuristic: the last page in the array is usually the active one
    // This can be improved with CDP if needed
    return pages[pages.length - 1] ?? null;
  }

  /**
   * Get tab count
   */
  getTabCount(): number {
    return this.context.context.pages().length;
  }

  /**
   * Get all tab URLs
   */
  getTabUrls(): string[] {
    return this.context.context.pages().map(p => p.url());
  }

  /**
   * Emit step event
   */
  private emit(action: string, detail: string): void {
    this.context.emit?.(action, detail);
  }
}
