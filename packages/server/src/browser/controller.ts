import type { Page } from "playwright";
import { getConfig } from "../core/config";
import logger from "../core/logging";
import { BrowserSession } from "./session";
import { DISMISS_OVERLAYS_JS } from "./scripts/dismiss-overlays";
import { SNAPSHOT_JS } from "./scripts/snapshot";
import { CDPInteractions, createCDPInteractions } from "./cdp/index.js";
import { createElementResolver } from "./element-resolution/index.js";

// Types
export interface ElementInfo {
  refId: number;
  tag: string;
  text: string;
  role: string;
  placeholder: string;
  href: string;
  src: string;
  alt: string;
  type: string;
  value: string;
  ariaLabel: string;
  title: string;
  name: string;
  isNew?: boolean;
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface PageSnapshot {
  url: string;
  title: string;
  elements: ElementInfo[];
  textPreview: string;
  /** Tree-style indented representation of interactive elements */
  output: string;
  scrollPosition?: { x: number; y: number };
  viewport?: { width: number; height: number };
  pageSize?: { width: number; height: number };
  stats?: {
    links: number;
    interactive: number;
    iframes: number;
    images: number;
    total: number;
    textChars: number;
  };
  pagesAbove?: number;
  pagesBelow?: number;
}

export interface BrowserActionResult {
  success: boolean;
  message: string;
  retryable?: boolean;
}

/**
 * Accessibility Tree Node
 * Represents a node from Chrome's Accessibility Tree
 */
export interface AXNode {
  role: string;
  name?: string;
  description?: string;
  value?: string;
  children?: AXNode[];
  properties?: Record<string, string | boolean>;
  attributes?: Record<string, string>;
  boundingBox?: { x: number; y: number; width: number; height: number };
  focusable?: boolean;
  focused?: boolean;
  hidden?: boolean;
  offscreen?: boolean;
  readonly?: boolean;
  disabled?: boolean;
  checked?: boolean | 'mixed';
  selected?: boolean;
  expanded?: boolean;
  level?: number;
  haspopup?: boolean;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
}

/**
 * Element Metadata
 * Rich metadata about a DOM element
 */
export interface ElementMetadata {
  id?: number;
  tag: string;
  text: string;
  attributes: Record<string, string>;
  boundingBox?: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  isInteractable: boolean;
  xpath: string;
  hash: string;
  refId?: number;
}

/**
 * Interactive Element
 * An element that can be interacted with
 */
export interface InteractiveElement {
  refId: number;
  tag: string;
  text?: string;
  role: string;
  xpath: string;
  href?: string;
  placeholder?: string;
  type?: string;
  value?: string;
  ariaLabel?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  metadata?: ElementMetadata;
  isNew?: boolean;
  isHighlighted?: boolean;
  position?: { index: number; viewportIndex: number };
}

/**
 * Page State
 * Current state of a browser page
 */
export interface PageState {
  url: string;
  title: string;
  elements: InteractiveElement[];
  timestamp: number;
  scrollPosition?: { x: number; y: number };
  viewport?: { width: number; height: number };
  stats?: {
    links?: number;
    interactive?: number;
    interactiveElements?: number;
    iframes?: number;
    images?: number;
    total?: number;
    textChars?: number;
    totalElements?: number;
    newElements?: number;
    viewportElements?: number;
  };
  scrollInfo?: any;
}

/**
 * BrowserController - Manages browser automation
 */
export class BrowserController {
  private session: BrowserSession;
  private onStep?: (action: string, detail: string) => void;
  private cdpInteractions: CDPInteractions | null = null;
  private elementResolver = createElementResolver();

  constructor(opts?: {
    headless?: boolean;
    userDataDir?: string;
    onStep?: (action: string, detail: string) => void;
    session?: BrowserSession;
    useAX?: boolean;
  }) {
    if (opts?.session) {
      this.session = opts.session;
    } else {
      this.session = new BrowserSession({
        headless: opts?.headless,
        userDataDir: opts?.userDataDir,
      });
    }
    this.onStep = opts?.onStep;
  }

  /**
   * Get or create CDP interactions instance for current page
   */
  private getCDP(): CDPInteractions {
    if (!this.cdpInteractions) {
      this.cdpInteractions = createCDPInteractions(this.page());
    }
    return this.cdpInteractions;
  }

  // Get current page
  private page(): Page {
    if (!this.session) {
      console.error('[BrowserController] No session set');
      throw new Error("no session - browser controller not initialized");
    }

    const context = this.session.context;
    if (!context) {
      console.error('[BrowserController] Session exists but no context. Session type:', typeof this.session);
      throw new Error("no context in browser session");
    }

    const pages = context.pages();
    console.log('[BrowserController] Page check:', {
      hasContext: !!context,
      pagesCount: pages?.length || 0,
      sessionType: typeof this.session,
      isExternal: (this.session as any)._isExternalBrowser
    });

    if (!pages || pages.length === 0) {
      console.error('[BrowserController] No pages available. Context:', context);
      throw new Error("no active page - browser may not be started. Context exists but no pages");
    }
    return pages[0];
  }

  // Emit step event
  private emit(action: string, detail: string): void {
    this.onStep?.(action, detail);
  }

  // Check if running in Electron mode with no Playwright context
  private isElectronModeNoContext(): boolean {
    const RUNNING_IN_ELECTRON = process.env.SEDIMAN_MODE === 'electron';
    return RUNNING_IN_ELECTRON && (!this.session.context || this.session.context.pages().length === 0);
  }

  // Lifecycle
  async start(): Promise<void> {
    await this.session.start();
  }

  async stop(): Promise<void> {
    await this.session.stop();
  }

  getSession(): BrowserSession {
    return this.session;
  }

  setSession(session: BrowserSession): void {
    this.session = session;
  }

  // Browser actions
  async navigate(url: string): Promise<string> {
    try {
      // Check if running in Electron mode with no Playwright context
      const RUNNING_IN_ELECTRON = process.env.SEDIMAN_MODE === 'electron';
      if (RUNNING_IN_ELECTRON && (!this.session.context || this.session.context.pages().length === 0)) {
        console.log('[BrowserController] Electron mode - navigation handled via BrowserView IPC');
        this.emit("navigate", url);
        return `Navigated to ${url} (via Electron IPC)`;
      }

      const page = this.page();
      console.log('[BrowserController] Navigating to:', url);

      // Try with different strategies
      let result = '';
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await page.goto(url, {
            waitUntil: "domcontentloaded",
            timeout: 45000
          });
          result = `Navigated to ${url}`;
          this.emit("navigate", url);
          console.log('[BrowserController] Navigation succeeded on attempt', attempt);
          break;
        } catch (gotoError: any) {
          console.log('[BrowserController] Attempt', attempt, 'failed:', gotoError.message);
          console.log('[BrowserController] Attempt', attempt, 'failed:', gotoError.message);
          if (attempt === 3) {
            // Last attempt failed, try with just load state
            try {
              await page.goto(url, {
                waitUntil: "commit",
                timeout: 30000
              });
              result = `Navigated to ${url} (committed)`;
              this.emit("navigate", url);
              console.log('[BrowserController] Navigation succeeded with commit');
              break;
            } catch (commitError: any) {
              result = `Failed to navigate to ${url}: ${commitError.message}`;
            }
          }
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }

      return result;
    } catch (e: any) {
      const error = `Failed to navigate to ${url}: ${e.message}`;
      console.error('[BrowserController]', error);
      return error;
    }
  }

  async click(refId: number): Promise<string> {
    try {
      if (this.isElectronModeNoContext()) {
        console.log('[BrowserController] Electron mode - click handled via BrowserView IPC');
        this.emit("click", `refId=${refId}`);
        return `Clicked element ${refId} (via Electron IPC)`;
      }

      const page = this.page();
      const el = await this.resolveElement(page, refId);
      if (!el) return `Element with refId ${refId} not found`;
      await el.click({ timeout: 5000 });
      this.emit("click", `refId=${refId}`);
      return `Clicked element ${refId}`;
    } catch (e: any) {
      return `Failed to click element ${refId}: ${e.message}`;
    }
  }

  async typeText(refId: number, text: string, submit?: boolean): Promise<string> {
    try {
      if (this.isElectronModeNoContext()) {
        console.log('[BrowserController] Electron mode - type handled via BrowserView IPC');
        this.emit("type", `refId=${refId} text=${text.slice(0, 50)}`);
        return `Typed "${text.slice(0, 50)}" into element ${refId}${submit ? " and submitted" : ""} (via Electron IPC)`;
      }

      const page = this.page();
      const el = await this.resolveElement(page, refId);
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

  async hover(refId: number): Promise<string> {
    try {
      if (this.isElectronModeNoContext()) {
        console.log('[BrowserController] Electron mode - hover handled via BrowserView IPC');
        this.emit("hover", `refId=${refId}`);
        return `Hovered over element ${refId} (via Electron IPC)`;
      }

      const page = this.page();
      const el = await this.resolveElement(page, refId);
      if (!el) return `Element with refId ${refId} not found`;
      await el.hover({ timeout: 5000 });
      this.emit("hover", `refId=${refId}`);
      return `Hovered over element ${refId}`;
    } catch (e: any) {
      return `Failed to hover over element ${refId}: ${e.message}`;
    }
  }

  async selectOption(refId: number, value: string): Promise<string> {
    try {
      if (this.isElectronModeNoContext()) {
        console.log('[BrowserController] Electron mode - select handled via BrowserView IPC');
        this.emit("select", `refId=${refId} value=${value}`);
        return `Selected "${value}" in element ${refId} (via Electron IPC)`;
      }

      const page = this.page();
      const el = await this.resolveElement(page, refId);
      if (!el) return `Element with refId ${refId} not found`;
      await el.selectOption(value, { timeout: 5000 });
      this.emit("select", `refId=${refId} value=${value}`);
      return `Selected "${value}" in element ${refId}`;
    } catch (e: any) {
      return `Failed to select in element ${refId}: ${e.message}`;
    }
  }

  async scroll(direction: string, amount?: number): Promise<string> {
    try {
      if (this.isElectronModeNoContext()) {
        console.log('[BrowserController] Electron mode - scroll handled via BrowserView IPC');
        this.emit("scroll", `${direction} ${amount ?? 500}px`);
        return `Scrolled ${direction} by ${amount ?? 500}px (via Electron IPC)`;
      }

      const page = this.page();
      const delta = amount ?? 500;
      const deltaWithSign = direction === "up" ? -delta : delta;
      if (direction === "left" || direction === "right") {
        await page.mouse.wheel(direction === "right" ? delta : -delta, 0);
      } else {
        await page.mouse.wheel(0, deltaWithSign);
      }
      this.emit("scroll", `${direction} ${amount ?? 500}px`);
      return `Scrolled ${direction} by ${amount ?? 500}px`;
    } catch (e: any) {
      return `Failed to scroll: ${e.message}`;
    }
  }

  async pressKey(key: string): Promise<string> {
    try {
      if (this.isElectronModeNoContext()) {
        console.log('[BrowserController] Electron mode - press key handled via BrowserView IPC');
        this.emit("press_key", key);
        return `Pressed key: ${key} (via Electron IPC)`;
      }

      const page = this.page();
      await page.keyboard.press(key);
      this.emit("press_key", key);
      return `Pressed key: ${key}`;
    } catch (e: any) {
      return `Failed to press key ${key}: ${e.message}`;
    }
  }

  async goBack(): Promise<string> {
    try {
      if (this.isElectronModeNoContext()) {
        console.log('[BrowserController] Electron mode - go back handled via BrowserView IPC');
        this.emit("go_back", "");
        return "Navigated back (via Electron IPC)";
      }

      const page = this.page();
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 15000 });
      this.emit("go_back", "");
      return "Navigated back";
    } catch (e: any) {
      return `Failed to go back: ${e.message}`;
    }
  }

  async goForward(): Promise<string> {
    try {
      if (this.isElectronModeNoContext()) {
        console.log('[BrowserController] Electron mode - go forward handled via BrowserView IPC');
        this.emit("go_forward", "");
        return "Navigated forward (via Electron IPC)";
      }

      const page = this.page();
      await page.goForward({ waitUntil: "domcontentloaded", timeout: 15000 });
      this.emit("go_forward", "");
      return "Navigated forward";
    } catch (e: any) {
      return `Failed to go forward: ${e.message}`;
    }
  }

  async refresh(): Promise<string> {
    try {
      if (this.isElectronModeNoContext()) {
        console.log('[BrowserController] Electron mode - refresh handled via BrowserView IPC');
        this.emit("refresh", "");
        return "Page refreshed (via Electron IPC)";
      }

      const page = this.page();
      await page.reload({ waitUntil: "domcontentloaded", timeout: 15000 });
      this.emit("refresh", "");
      return "Page refreshed";
    } catch (e: any) {
      return `Failed to refresh: ${e.message}`;
    }
  }

  async switchTab(index: number): Promise<string> {
    try {
      const ctx = this.session.context;
      if (!ctx) return "No browser context";
      const pages = ctx.pages();
      if (index < 0 || index >= pages.length) {
        return `Tab index ${index} out of range (0-${pages.length - 1})`;
      }
      await pages[index].bringToFront();
      this.emit("switch_tab", `index=${index}`);
      return `Switched to tab ${index}: ${pages[index].url()}`;
    } catch (e: any) {
      return `Failed to switch tab: ${e.message}`;
    }
  }

  async listTabs(): Promise<string> {
    try {
      const ctx = this.session.context;
      if (!ctx) return "No browser context";
      const pages = ctx.pages();
      const lines = pages.map((p, i) => `[${i}] ${p.url()} — ${p.title()}`);
      this.emit("list_tabs", `${pages.length} tabs`);
      return lines.join("\n") || "No open tabs";
    } catch (e: any) {
      return `Failed to list tabs: ${e.message}`;
    }
  }

  async snapshot(): Promise<PageSnapshot> {
    if (this.isElectronModeNoContext()) {
      console.log('[BrowserController] Electron mode - snapshot handled via BrowserView IPC');
      this.emit("snapshot", "0 elements (via Electron IPC)");
      return {
        url: '',
        title: '',
        elements: [],
        textPreview: "",
        output: "Snapshot not available in Electron mode",
        scrollPosition: { x: 0, y: 0 },
        viewport: { width: 600, height: 800 },
        pageSize: { width: 600, height: 800 },
        stats: { links: 0, interactive: 0, iframes: 0, images: 0, total: 0, textChars: 0 },
        pagesAbove: 0,
        pagesBelow: 0,
      };
    }

    const page = this.page();

    // Dismiss overlays
    await page.evaluate(DISMISS_OVERLAYS_JS).catch(() => {});

    // Take snapshot
    const result = (await page.evaluate(SNAPSHOT_JS)) as {
      elements: ElementInfo[];
      output: string;
      textPreview: string;
      scrollPosition: { x: number; y: number };
      viewport: { width: number; height: number };
      pageSize: { width: number; height: number };
      url: string;
      title: string;
      stats: { links: number; interactive: number; iframes: number; images: number; total: number; textChars: number };
      pagesAbove: number;
      pagesBelow: number;
    };

    const url = result.url || page.url();
    const title = result.title || await page.title();

    this.emit("snapshot", `${result.elements.length} elements`);

    return {
      url,
      title,
      elements: result.elements,
      textPreview: result.textPreview || "",
      output: result.output || "",
      scrollPosition: result.scrollPosition,
      viewport: result.viewport,
      pageSize: result.pageSize,
      stats: result.stats,
      pagesAbove: result.pagesAbove,
      pagesBelow: result.pagesBelow,
    };
  }

  async extractText(): Promise<string> {
    try {
      if (this.isElectronModeNoContext()) {
        console.log('[BrowserController] Electron mode - extract_text handled via BrowserView IPC');
        this.emit("extract_text", "");
        return "Text extraction queued (via Electron IPC)";
      }

      const page = this.page();
      const text = await page.evaluate(() => {
        const body = document.body;
        if (!body) return "";
        const clone = body.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("script, style, noscript, svg, path").forEach((el) => el.remove());
        return (clone.innerText || "").replace(/\s+/g, " ").trim();
      });

      // Return full text without truncation for data extraction
      // The agent needs complete page content to extract structured data
      return text;
    } catch (e: any) {
      return `Failed to extract text: ${e.message}`;
    }
  }

  async waitForSelector(selector: string, timeout?: number): Promise<string> {
    try {
      const page = this.page();
      await page.waitForSelector(selector, {
        timeout: timeout ?? 10000,
        state: "visible",
      });
      return `Element "${selector}" appeared`;
    } catch (e: any) {
      return `Timeout waiting for "${selector}": ${e.message}`;
    }
  }

  async screenshot(): Promise<string | null> {
    return this.session.takeScreenshot();
  }

  // === CDP input dispatch ===
  async dispatchMouse(type: string, x: number, y: number, button: string = 'left', buttons: number = 1): Promise<void> {
    await this.getCDP().dispatchMouseEvent(type as any, x, y, button as any, buttons);
  }

  async dispatchKey(type: string, key: string, _code?: string, _text?: string): Promise<void> {
    await this.getCDP().dispatchKeyEvent(type as any, key);
  }

  async getUrl(): Promise<string> {
    return this.page().url();
  }

  async getTitle(): Promise<string> {
    return this.page().title();
  }

  // Element resolution
  private async resolveElement(page: Page, refId: number): Promise<any> {
    return this.elementResolver.resolve(page, refId);
  }

  // === Advanced browser interactions ===

  async dragAndDrop(sourceRefId: number, targetRefId: number): Promise<string> {
    try {
      const page = this.page();
      const result = await this.getCDP().dragAndDrop(
        sourceRefId,
        targetRefId,
        (refId) => this.resolveElement(page, refId)
      );
      return result.message;
    } catch (error: any) {
      return `Drag and drop failed: ${error.message}`;
    }
  }

  async uploadFile(refId: number, filePath: string): Promise<string> {
    try {
      const page = this.page();
      const element = await this.resolveElement(page, refId);

      if (!element) {
        return `Failed to resolve element: ${refId}`;
      }

      // Use Playwright's setInputFiles for file upload
      await element.setInputFiles(filePath);

      return `Uploaded file "${filePath}" to element ${refId}`;
    } catch (error: any) {
      return `File upload failed: ${error.message}`;
    }
  }

  async evaluate(script: string): Promise<any> {
    try {
      if (this.isElectronModeNoContext()) {
        console.log('[BrowserController] Electron mode - evaluate handled via BrowserView IPC');
        this.emit("evaluate", `script=${script.slice(0, 100)}`);
        return `Script execution queued (via Electron IPC) (script=${script.slice(0, 100)})`;
      }

      const page = this.page();
      const result = await page.evaluate(script);
      return result;
    } catch (error: any) {
      return `Script execution failed: ${error.message}`;
    }
  }

  async closeTab(index?: number): Promise<string> {
    try {
      const context = this.session.context;
      const pages = context.pages();

      if (pages.length === 0) {
        return 'No tabs to close';
      }

      if (index === undefined) {
        // Close current page (last one)
        const currentPage = this.page();
        await currentPage.close();
        return 'Closed current tab';
      } else {
        // Close specific tab by index
        if (index < 0 || index >= pages.length) {
          return `Invalid tab index: ${index}. Available tabs: ${pages.length}`;
        }
        await pages[index].close();
        return `Closed tab ${index}`;
      }
    } catch (error: any) {
      return `Failed to close tab: ${error.message}`;
    }
  }
}
