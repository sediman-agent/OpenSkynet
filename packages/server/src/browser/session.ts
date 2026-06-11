import { mkdirSync } from "node:fs";
import { getConfig } from "../core/config";
import logger from "../core/logging";

type Browser = import("playwright").Browser;
type BrowserContext = import("playwright").BrowserContext;
type Page = import("playwright").Page;

export class BrowserSession {
  headless: boolean;
  userDataDir: string;
  stealth: boolean;
  proxy?: string;
  fingerprintSeed?: number;

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
    onScreenshot?: (data: string) => void;
  }) {
    const cfg = getConfig();
    this.headless = opts?.headless ?? true;
    this.userDataDir =
      opts?.userDataDir ?? cfg.browserProfileDir;
    this.stealth = opts?.stealth ?? cfg.stealthEnabled;
    this.proxy = opts?.proxy ?? (cfg.stealthProxy || undefined);
    this.fingerprintSeed = opts?.fingerprintSeed;
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

    // For external browser, don't auto-launch - it will be connected via CDP
    if (this._isExternalBrowser) {
      throw new Error("External browser must be connected via CDP, use connectViaCDP()");
    }

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
      logger.info("browser session started (cloakbrowser stealth, humanize=true)");
      return;
    } catch (cloakErr) {
      logger.warn({ err: (cloakErr as Error).message }, "cloakbrowser_fallback_to_playwright");
    }

    const { chromium } = await import("playwright");
    const launchArgs = [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
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
    logger.info("browser session started (playwright fallback, stealth=%s)", this.stealth);
  }

  /**
   * Prepare for CDP connection from embedded webview
   * The webview is already running in Electron, we just need to mark as ready for CDP
   */
  prepareForWebviewCDP(): void {
    this._isExternalBrowser = true;
    logger.info("Browser session prepared for embedded webview CDP connection");
  }

  async connectViaCDP(wsUrl: string): Promise<void> {
    if (this._started) {
      await this.stop();
    }

    this._isExternalBrowser = true;

    const { chromium } = await import("playwright");

    logger.info("connectToCDP: Starting connection to external browser...");
    logger.info("connectToCDP: URL = " + wsUrl.substring(0, 80) + "...");

    try {
      const startTime = Date.now();

      // Connect to the external browser via CDP
      const browser = await chromium.connectOverCDP(wsUrl, {
        timeout: 20000, // 20 second timeout
      });

      const elapsed = Date.now() - startTime;
      logger.info("connectToCDP: ✓ Connected in " + elapsed + "ms");

      const contexts = browser.contexts();
      logger.info("connectToCDP: Found " + contexts.length + " browser contexts");

      // Use the first available context
      const defaultContext = contexts[0];
      if (!defaultContext) {
        throw new Error("no browser context found at CDP endpoint");
      }

      logger.info("connectToCDP: Using context with " + defaultContext.pages().length + " pages");

      this._browser = browser;
      this._context = defaultContext;
      this._started = true;

      logger.info("CDP: ✓ Shared browser active (external Chromium)");
    } catch (error) {
      logger.error("connectToCDP: ✗ Connection failed");
      logger.error("connectToCDP: " + (error instanceof Error ? error.message : String(error)));
      if (error instanceof Error && error.stack) {
        logger.error("connectToCDP: " + error.stack);
      }
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this._started) return;
    try {
      await this._context?.close();
    } catch {
      // ignore
    }
    this._context = null;
    this._browser = null;
    this._started = false;
    logger.info("browser session stopped");
  }

  async takeScreenshot(): Promise<string | null> {
    if (!this._context) return null;
    const page = this._context.pages()[0] || (await this._context.newPage());
    const buf = await page.screenshot({ type: "png" });
    const b64 = buf.toString("base64");
    this.onScreenshot?.(b64);
    return b64;
  }

}
