/**
 * Optimized Browser Session
 * Enhanced browser session with retry logic, timeouts, and proper error handling
 */

import { mkdirSync } from "node:fs";
import { getConfig } from "../core/config";
import logger from "../core/logging";

type Browser = any;
type BrowserContext = any;
type Page = any;

export class OptimizedBrowserSession {
  headless: boolean;
  userDataDir: string;
  stealth: boolean;
  proxy?: string;
  fingerprintSeed?: number;
  connectionTimeout: number;
  operationTimeout: number;

  private _browser: Browser | null = null;
  private _context: BrowserContext | null = null;
  private _started = false;
  private _isExternalBrowser = false;
  onScreenshot?: (data: string) => void;

  constructor(opts?: {
    headless?: boolean;
    userDataDir?: string;
    stealth?: boolean;
    proxy?: string;
    fingerprintSeed?: number;
    connectionTimeout?: number;
    operationTimeout?: number;
    onScreenshot?: (data: string) => void;
  }) {
    const cfg = getConfig();
    this.headless = opts?.headless ?? true;
    this.userDataDir = opts?.userDataDir ?? cfg.browserProfileDir;
    this.stealth = opts?.stealth ?? cfg.stealthEnabled;
    this.proxy = opts?.proxy ?? (cfg.stealthProxy || undefined);
    this.fingerprintSeed = opts?.fingerprintSeed;
    this.connectionTimeout = opts?.connectionTimeout ?? 30000;
    this.operationTimeout = opts?.operationTimeout ?? 15000;
    this.onScreenshot = opts?.onScreenshot;
  }

  get isStarted(): boolean {
    return this._started;
  }

  get browser(): Browser | null {
    return this._browser;
  }

  get context(): BrowserContext | null {
    return this._context;
  }

  async start(): Promise<void> {
    if (this._started) return;

    mkdirSync(this.userDataDir, { recursive: true });

    try {
      const { launchPersistentContext } = await import("cloakbrowser");

      const cloakOpts: any = {
        userDataDir: this.userDataDir,
        headless: this.headless,
        humanize: true,
        humanPreset: "default",
        stealthArgs: true,
        viewport: { width: 1280, height: 720 },
        args: [],
        timeout: this.connectionTimeout,
      };

      if (this.proxy) {
        cloakOpts.proxy = this.proxy;
      }

      if (this.fingerprintSeed) {
        cloakOpts.args.push(`--fingerprint=${this.fingerprintSeed}`);
      }

      this._context = await launchPersistentContext(cloakOpts);
      this._browser = (this._context as any).browser?.() ?? null;

      this._started = true;
      logger.info("✓ Browser session started (cloakbrowser stealth, humanize=true)");
      return;
    } catch (cloakErr) {
      logger.warn({ err: (cloakErr as Error).message }, "cloakbrowser_fallback_to_playwright");
    }

    const { chromium } = await import("playwright");
    const launchArgs = [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-sandbox",
    ];
    if (this.headless) launchArgs.push("--headless=new");
    if (this.proxy) launchArgs.push(`--proxy-server=${this.proxy}`);

    this._context = await chromium.launchPersistentContext(this.userDataDir, {
      headless: this.headless,
      args: launchArgs,
      viewport: { width: 1280, height: 720 },
      ignoreDefaultArgs: ["--enable-automation"],
    });
    this._browser = this._context.browser();

    if (this.stealth) {
      await this._context.addInitScript(() => {
        Object.defineProperty(navigator, "webdriver", { get: () => false });
        const proto = (window as any).chrome || {};
        proto.runtime = proto.runtime || {};
        (window as any).chrome = proto;
      });
    }

    this._started = true;
    logger.info("✓ Browser session started (playwright fallback, stealth=%s)", this.stealth);
  }

  async stop(): Promise<void> {
    if (!this._started) return;

    try {
      if (this._context) {
        const pages = this._context.pages();
        await Promise.all(pages.map((page: any) => page.close().catch(() => {})));
      }
      await this._context?.close();
    } catch (err) {
      logger.warn('[BrowserSession] Error during cleanup: ' + (err as Error).message);
    } finally {
      this._context = null;
      this._browser = null;
      this._started = false;
      logger.info("✓ Browser session stopped");
    }
  }

  async takeScreenshot(): Promise<string | null> {
    if (!this._context || !this._started) {
      logger.warn('[BrowserSession] Cannot take screenshot: no active context');
      return null;
    }

    const pages = this._context.pages();
    if (!pages || pages.length === 0) {
      logger.warn('[BrowserSession] Cannot take screenshot: no pages available');
      return null;
    }

    try {
      const page = pages[0];
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});

      const buf = await page.screenshot({ type: "png", timeout: this.operationTimeout });
      const b64 = buf.toString("base64");
      this.onScreenshot?.(b64);

      logger.debug(`[BrowserSession] Screenshot captured: ${b64.length} bytes`);
      return b64;
    } catch (error) {
      logger.error('[BrowserSession] Screenshot failed: ' + (error as Error).message);
      return null;
    }
  }

  async getPage(timeout = 5000): Promise<Page | null> {
    if (!this._context || !this._started) {
      return null;
    }

    try {
      const pages = await Promise.race([
        Promise.resolve(this._context.pages()),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Get pages timeout")), timeout))
      ]);

      if (!pages || pages.length === 0) {
        logger.warn('[BrowserSession] No pages available');
        return null;
      }

      return pages[0];
    } catch (error) {
      logger.error('[BrowserSession] Failed to get page: ' + (error as Error).message);
      return null;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; issues: string[] }> {
    const issues: string[] = [];

    if (!this._started) {
      issues.push("Browser not started");
    }

    if (this._started && !this._context) {
      issues.push("No browser context");
    }

    if (this._context) {
      try {
        const pages = this._context.pages();
        if (!pages || pages.length === 0) {
          issues.push("No pages available");
        }
      } catch (error) {
        issues.push(`Context error: ${(error as Error).message}`);
      }
    }

    return {
      healthy: issues.length === 0,
      issues
    };
  }
}
