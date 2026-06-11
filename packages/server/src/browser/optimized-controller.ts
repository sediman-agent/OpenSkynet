/**
 * Optimized Browser Controller
 * Enhanced browser automation with retry logic, circuit breakers, and performance monitoring
 * Designed to be way better than browser-use
 */

import type { Page, Locator } from "playwright";
import { getConfig } from "../core/config";
import logger from "../core/logging";
import { OptimizedBrowserSession } from "./optimized-session";
import { getRetrySystem } from "../agent/stability/retry-system";
import { getPerformanceMonitor } from "../agent/performance/monitor";
import { circuitBreakerRegistry } from "../agent/stability/circuit-breaker";
import { getAdaptiveThrottler } from "../agent/stability/adaptive-throttling";

// Re-export types from the main controller
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

export interface OptimizedControllerOptions {
  headless?: boolean;
  userDataDir?: string;
  stealth?: boolean;
  proxy?: string;
  fingerprintSeed?: number;
  onStep?: (action: string, detail: string) => void;
  enableRetry?: boolean;
  enableCircuitBreaker?: boolean;
  enablePerformanceMonitoring?: boolean;
  enableAdaptiveThrottling?: boolean;
  maxRetries?: number;
  operationTimeout?: number;
}

/**
 * Optimized Browser Controller
 * Provides resilience and performance optimizations for browser automation
 */
export class OptimizedBrowserController {
  private session: OptimizedBrowserSession;
  private onStep?: (action: string, detail: string) => void;
  private retrySystem = getRetrySystem('browser');
  private performanceMonitor = getPerformanceMonitor();
  private circuitBreaker = circuitBreakerRegistry.get('browser');
  private adaptiveThrottling = getAdaptiveThrottler('browser');

  private options: OptimizedControllerOptions;
  private elementCache = new Map<number, Locator>();
  private cacheHitCount = 0;
  private cacheMissCount = 0;

  constructor(options: OptimizedControllerOptions = {}) {
    this.options = {
      enableRetry: true,
      enableCircuitBreaker: true,
      enablePerformanceMonitoring: true,
      enableAdaptiveThrottling: true,
      maxRetries: 5,
      operationTimeout: 15000,
      ...options
    };

    this.session = new OptimizedBrowserSession({
      headless: options.headless,
      userDataDir: options.userDataDir,
      stealth: options.stealth,
      proxy: options.proxy,
      fingerprintSeed: options.fingerprintSeed,
      connectionTimeout: 30000,
      operationTimeout: this.options.operationTimeout,
      onScreenshot: options.onStep ? (data) => options.onStep!("screenshot", `${data.length} bytes`) : undefined,
    });

    this.onStep = options.onStep;
  }

  /**
   * Start the browser session with retry logic
   */
  async start(): Promise<void> {
    const startTime = Date.now();

    try {
      if (this.options.enableRetry) {
        const result = await this.retrySystem.execute(
          () => this.session.start(),
          'browser-start'
        );

        if (!result.success) {
          throw result.error || new Error('Failed to start browser after retries');
        }

        logger.info(`[OptimizedController] Browser started after ${result.attempts} attempts (${result.totalDelay}ms total delay)`);
      } else {
        await this.session.start();
      }

      const duration = Date.now() - startTime;
      this.performanceMonitor.recordToolExecution('browser_start', duration, true);
      this.emit('browser_start', `Success in ${duration}ms`);

    } catch (error) {
      const duration = Date.now() - startTime;
      this.performanceMonitor.recordToolExecution('browser_start', duration, false);
      this.emit('browser_start', `Failed: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Stop the browser session
   */
  async stop(): Promise<void> {
    const startTime = Date.now();

    try {
      await this.session.stop();
      this.elementCache.clear();

      const duration = Date.now() - startTime;
      this.performanceMonitor.recordToolExecution('browser_stop', duration, true);
      this.emit('browser_stop', `Success in ${duration}ms`);

    } catch (error) {
      const duration = Date.now() - startTime;
      this.performanceMonitor.recordToolExecution('browser_stop', duration, false);
      this.emit('browser_stop', `Failed: ${(error as Error).message}`);
    }
  }

  /**
   * Get current page with health check
   */
  private async getPage(): Promise<Page> {
    const health = await this.session.healthCheck();
    if (!health.healthy) {
      logger.warn(`[OptimizedController] Browser health issues: ${health.issues.join(', ')}`);

      // Try to recover if possible
      if (!this.session.isStarted) {
        await this.start();
      }
    }

    const page = await this.session.getPage(5000);
    if (!page) {
      throw new Error('No active page available');
    }

    return page;
  }

  /**
   * Emit step event
   */
  private emit(action: string, detail: string): void {
    this.onStep?.(action, detail);
  }

  /**
   * Execute operation with retry and circuit breaker
   */
  private async executeOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: string
  ): Promise<T> {
    // Apply adaptive throttling (acquire permission to proceed)
    if (this.options.enableAdaptiveThrottling) {
      await this.adaptiveThrottling.acquire();
    }

    const startTime = Date.now();

    try {
      let result: T;

      // Wrap with circuit breaker if enabled
      if (this.options.enableCircuitBreaker) {
        result = await this.circuitBreaker.execute(async () => {
          return await this.executeWithRetry(operation, fn, context);
        });
      } else {
        result = await this.executeWithRetry(operation, fn, context);
      }

      const duration = Date.now() - startTime;

      // Record success in throttler
      if (this.options.enableAdaptiveThrottling) {
        this.adaptiveThrottling.recordResult(true, duration);
      }

      // Record in performance monitor
      if (this.options.enablePerformanceMonitoring) {
        this.performanceMonitor.recordToolExecution(operation, duration, true);
      }

      this.emit(operation, `Success in ${duration}ms`);
      return result;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Record failure in throttler
      if (this.options.enableAdaptiveThrottling) {
        this.adaptiveThrottling.recordResult(false, duration);
      }

      // Record in performance monitor
      if (this.options.enablePerformanceMonitoring) {
        this.performanceMonitor.recordToolExecution(operation, duration, false);
      }

      this.emit(operation, `Failed after ${duration}ms: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: string
  ): Promise<T> {
    if (!this.options.enableRetry) {
      return await fn();
    }

    const retryResult = await this.retrySystem.execute(fn, context || operation);

    if (!retryResult.success) {
      throw retryResult.error || new Error('Operation failed after retries');
    }

    if (retryResult.attempts > 1) {
      this.emit(operation, `Required ${retryResult.attempts} attempts (${retryResult.totalDelay}ms total retry delay)`);
    }

    return retryResult.result!;
  }

  /**
   * Resolve element with caching
   */
  private async resolveElement(page: Page, refId: number): Promise<Locator> {
    // Check cache first
    if (this.elementCache.has(refId)) {
      const cached = this.elementCache.get(refId)!;
      try {
        // Verify element is still valid
        if (await cached.count() > 0) {
          this.cacheHitCount++;
          return cached;
        }
      } catch {
        // Element is no longer valid, remove from cache
        this.elementCache.delete(refId);
      }
    }

    this.cacheMissCount++;

    // Resolve element using standard selector
    const locator = page.locator(`[data-sediman-ref-id="${refId}"]`).first();

    // Verify element exists
    const count = await locator.count();
    if (count === 0) {
      throw new Error(`Element with refId ${refId} not found`);
    }

    // Cache the locator
    this.elementCache.set(refId, locator);

    return locator;
  }

  // === Browser Operations ===

  /**
   * Navigate to URL with retry and timeout
   */
  async navigate(url: string): Promise<string> {
    return this.executeOperation('navigate', async () => {
      const page = await this.getPage();

      // Try different wait strategies
      const strategies = [
        { waitUntil: 'domcontentloaded' as const, timeout: 45000 },
        { waitUntil: 'load' as const, timeout: 30000 },
        { waitUntil: 'commit' as const, timeout: 15000 },
      ];

      let lastError: Error | undefined;

      for (const strategy of strategies) {
        try {
          await page.goto(url, strategy);
          return `Navigated to ${url}`;
        } catch (error) {
          lastError = error as Error;
          logger.debug(`[OptimizedController] Navigation strategy ${strategy.waitUntil} failed, trying next`);
        }
      }

      throw lastError || new Error('Navigation failed');
    }, `navigate to ${url}`);
  }

  /**
   * Click element with retry
   */
  async click(refId: number): Promise<string> {
    return this.executeOperation('click', async () => {
      const page = await this.getPage();
      const element = await this.resolveElement(page, refId);

      // First ensure element is visible and clickable
      await element.scrollIntoViewIfNeeded();
      await element.waitFor({ state: 'visible', timeout: 5000 });

      await element.click({ timeout: 5000 });
      return `Clicked element ${refId}`;
    }, `click refId ${refId}`);
  }

  /**
   * Type text with retry and better error handling
   */
  async typeText(refId: number, text: string, submit?: boolean): Promise<string> {
    return this.executeOperation('type', async () => {
      const page = await this.getPage();
      const element = await this.resolveElement(page, refId);

      // Clear existing content
      await element.fill('');

      // Type with human-like delay
      await element.type(text, { delay: 30 });

      // Submit if requested
      if (submit) {
        await element.press('Enter');
      }

      return `Typed "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" into element ${refId}${submit ? ' and submitted' : ''}`;
    }, `type in refId ${refId}`);
  }

  /**
   * Hover over element
   */
  async hover(refId: number): Promise<string> {
    return this.executeOperation('hover', async () => {
      const page = await this.getPage();
      const element = await this.resolveElement(page, refId);

      await element.hover({ timeout: 5000 });
      return `Hovered over element ${refId}`;
    }, `hover refId ${refId}`);
  }

  /**
   * Select option from dropdown
   */
  async selectOption(refId: number, value: string): Promise<string> {
    return this.executeOperation('select', async () => {
      const page = await this.getPage();
      const element = await this.resolveElement(page, refId);

      await element.selectOption(value, { timeout: 5000 });
      return `Selected "${value}" in element ${refId}`;
    }, `select in refId ${refId}`);
  }

  /**
   * Scroll page
   */
  async scroll(direction: string, amount?: number): Promise<string> {
    return this.executeOperation('scroll', async () => {
      const page = await this.getPage();
      const delta = amount ?? 500;

      if (direction === 'left' || direction === 'right') {
        await page.mouse.wheel(direction === 'right' ? delta : -delta, 0);
      } else {
        const deltaWithSign = direction === 'up' ? -delta : delta;
        await page.mouse.wheel(0, deltaWithSign);
      }

      return `Scrolled ${direction} by ${delta}px`;
    }, `scroll ${direction}`);
  }

  /**
   * Press key
   */
  async pressKey(key: string): Promise<string> {
    return this.executeOperation('press_key', async () => {
      const page = await this.getPage();
      await page.keyboard.press(key);
      return `Pressed key: ${key}`;
    }, `press ${key}`);
  }

  /**
   * Navigate back
   */
  async goBack(): Promise<string> {
    return this.executeOperation('go_back', async () => {
      const page = await this.getPage();
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
      return 'Navigated back';
    }, 'go back');
  }

  /**
   * Navigate forward
   */
  async goForward(): Promise<string> {
    return this.executeOperation('go_forward', async () => {
      const page = await this.getPage();
      await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });
      return 'Navigated forward';
    }, 'go forward');
  }

  /**
   * Refresh page
   */
  async refresh(): Promise<string> {
    return this.executeOperation('refresh', async () => {
      const page = await this.getPage();
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
      return 'Page refreshed';
    }, 'refresh');
  }

  /**
   * Take screenshot with retry
   */
  async screenshot(): Promise<string | null> {
    return this.executeOperation('screenshot', async () => {
      return this.session.takeScreenshot();
    }, 'screenshot');
  }

  /**
   * Get page URL
   */
  async getUrl(): Promise<string> {
    const page = await this.getPage();
    return page.url();
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    const page = await this.getPage();
    return page.title();
  }

  /**
   * Clear element cache
   */
  clearElementCache(): void {
    this.elementCache.clear();
    logger.info('[OptimizedController] Element cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  } {
    const hitRate = this.cacheHitCount + this.cacheMissCount > 0
      ? this.cacheHitCount / (this.cacheHitCount + this.cacheMissCount)
      : 0;

    return {
      size: this.elementCache.size,
      hits: this.cacheHitCount,
      misses: this.cacheMissCount,
      hitRate
    };
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): any {
    return this.performanceMonitor.getSnapshot();
  }

  /**
   * Get circuit breaker state
   */
  getCircuitBreakerState(): any {
    return this.circuitBreaker.getState();
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
    logger.info('[OptimizedController] Circuit breaker reset');
  }

  /**
   * Get session
   */
  getSession(): OptimizedBrowserSession {
    return this.session;
  }
}

/**
 * Factory function to create optimized browser controller
 */
export function createOptimizedBrowserController(options?: OptimizedControllerOptions): OptimizedBrowserController {
  return new OptimizedBrowserController(options);
}
