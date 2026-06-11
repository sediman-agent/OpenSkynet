/**
 * Tab Manager
 * Manages browser tabs
 */

import type { Page, BrowserContext } from 'playwright';
import type { BrowserActionResult } from '../controller.js';

/**
 * Tab Manager
 * This is extracted from browser/controller.ts
 */
export class TabManager {
  constructor(private getContext: () => BrowserContext | null) {}

  /**
   * Switch to tab by index
   */
  async switchTab(index: number): Promise<BrowserActionResult> {
    try {
      const ctx = this.getContext();
      if (!ctx) {
        return {
          success: false,
          message: 'No browser context'
        };
      }

      const pages = ctx.pages();
      if (index < 0 || index >= pages.length) {
        return {
          success: false,
          message: `Tab index ${index} out of range (0-${pages.length - 1})`
        };
      }

      await pages[index].bringToFront();
      return {
        success: true,
        message: `Switched to tab ${index}: ${pages[index].url()}`
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to switch tab: ${e.message}`
      };
    }
  }

  /**
   * List all tabs
   */
  async listTabs(): Promise<BrowserActionResult & { tabs?: Array<{ index: number; url: string; title: string }> }> {
    try {
      const ctx = this.getContext();
      if (!ctx) {
        return {
          success: false,
          message: 'No browser context',
          tabs: []
        };
      }

      const pages = ctx.pages();
      const tabs = await Promise.all(pages.map(async (p, i) => ({
        index: i,
        url: p.url(),
        title: await p.title()
      })));

      return {
        success: true,
        message: `${tabs.length} tab${tabs.length !== 1 ? 's' : ''} open`,
        tabs
      };
    } catch (e: any) {
      return {
        success: false,
        message: `Failed to list tabs: ${e.message}`,
        tabs: []
      };
    }
  }

  /**
   * Close tab by index (or current if not specified)
   */
  async closeTab(index?: number): Promise<BrowserActionResult> {
    try {
      const ctx = this.getContext();
      if (!ctx) {
        return {
          success: false,
          message: 'No browser context'
        };
      }

      const pages = ctx.pages();

      if (pages.length === 0) {
        return {
          success: false,
          message: 'No tabs to close'
        };
      }

      if (index === undefined) {
        // Close current page (last one brought to front)
        const currentPage = pages[pages.length - 1];
        await currentPage.close();
        return {
          success: true,
          message: 'Closed current tab'
        };
      } else {
        // Close specific tab by index
        if (index < 0 || index >= pages.length) {
          return {
            success: false,
            message: `Invalid tab index: ${index}. Available tabs: ${pages.length}`
          };
        }
        await pages[index].close();
        return {
          success: true,
          message: `Closed tab ${index}`
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Failed to close tab: ${error.message}`
      };
    }
  }

  /**
   * Get tab count
   */
  getTabCount(): number {
    try {
      const ctx = this.getContext();
      if (!ctx) return 0;
      return ctx.pages().length;
    } catch {
      return 0;
    }
  }

  /**
   * Get all pages
   */
  getPages(): Page[] {
    try {
      const ctx = this.getContext();
      if (!ctx) return [];
      return ctx.pages();
    } catch {
      return [];
    }
  }
}
