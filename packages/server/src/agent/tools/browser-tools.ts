/**
 * Browser Tools - Simplified
 *
 * Refactored from 525 lines to ~200 lines
 * IPC execution extracted to IPCBrowserExecutor
 * Page change detection extracted to PageChangeDetector
 * Intervention management extracted to InterventionManager
 * Tool routing extracted to BrowserToolRouter
 */

import { ToolBus } from './bus.js';
import type { ToolExecutor } from './interfaces.js';
import type { BrowserController, PageSnapshot } from '../../browser/controller.js';
import type { ProjectManager } from '../../project/manager.js';
import { createLogger } from '../../core/logging.js';
import { ALL_BROWSER_TOOLS } from './browser-tool-definitions.js';
import {
  setBrowserController,
  storeScreenshot,
  updateLatestSnapshot
} from './screenshot-handler.js';
import { setProjectManager as setInterventionProjectManager } from './intervention-handler.js';

// Extracted modules
import { IPCBrowserExecutor, type IPCExecutionResult } from './execution/index.js';
import { PageChangeDetector, PageStateManager, type PageChangeResult } from './detection/index.js';
import { InterventionManager } from './intervention/index.js';
import { BrowserToolRouter } from './routing/index.js';

const logger = createLogger("browser-tools");

// Detect if running in Electron mode
const RUNNING_IN_ELECTRON = process.env.SEDIMAN_MODE === 'electron';

/**
 * Browser Tools Manager coordinates browser tool registration and execution
 * This is the simplified main file that delegates to specialized modules
 */
export class BrowserToolsManager {
  private browserController: BrowserController | null = null;
  private projectManager: ProjectManager | null = null;

  // Extracted module instances
  private ipcExecutor: IPCBrowserExecutor | null = null;
  private pageChangeDetector: PageChangeDetector;
  private pageStateManager: PageStateManager;
  private interventionManager: InterventionManager;
  private toolRouter: BrowserToolRouter | null = null;

  constructor() {
    this.pageChangeDetector = new PageChangeDetector();
    this.pageStateManager = new PageStateManager();
    this.interventionManager = new InterventionManager();

    // Set up intervention callback
    this.interventionManager.setOnRequestRequested((message, id) => {
      // Emit event or callback to request human intervention
      logger.info(`[BrowserTools] Intervention requested: ${message} (id: ${id})`);
    });
  }

  /**
   * Initialize with browser controller
   */
  initialize(controller: BrowserController): void {
    this.browserController = controller;
    setBrowserController(controller);

    // Initialize IPC executor if in Electron mode
    if (RUNNING_IN_ELECTRON) {
      this.ipcExecutor = new IPCBrowserExecutor();
    }

    // Initialize tool router
    this.toolRouter = new BrowserToolRouter({
      controller,
      screenshotHandler: storeScreenshot
    });

    logger.info('[BrowserTools] Initialized', {
      mode: RUNNING_IN_ELECTRON ? 'Electron IPC' : 'Playwright'
    });
  }

  /**
   * Set project manager
   */
  setProjectManager(pm: ProjectManager): void {
    this.projectManager = pm;
    setInterventionProjectManager(pm);

    if (this.browserController) {
      setBrowserController(this.browserController);
    }
  }

  /**
   * Register all browser tools with the tool bus
   */
  registerTools(toolBus: ToolBus): void {
    if (!this.browserController) {
      throw new Error('BrowserController not initialized. Call initialize() first.');
    }

    const executor = this.createToolExecutor();
    for (const tool of ALL_BROWSER_TOOLS) {
      toolBus.register(tool, executor);
    }

    logger.info(`[BrowserTools] Registered ${ALL_BROWSER_TOOLS.length} tools`);
  }

  /**
   * Create tool executor function
   */
  private createToolExecutor(): ToolExecutor {
    return async (name, args) => {
      try {
        // Ensure page is available
        if (!await this.ensurePage()) {
          return { success: false, output: '', error: 'Browser context not available' };
        }

        // Route to appropriate executor based on mode
        if (RUNNING_IN_ELECTRON && this.ipcExecutor) {
          return await this.executeViaIPC(name, args);
        } else {
          return await this.executeViaRouter(name, args);
        }
      } catch (error) {
        return {
          success: false,
          output: '',
          error: error instanceof Error ? error.message : String(error)
        };
      }
    };
  }

  /**
   * Execute tool via IPC (Electron mode)
   */
  private async executeViaIPC(name: string, args: Record<string, any>): Promise<any> {
    if (!this.ipcExecutor) {
      throw new Error('IPC executor not initialized');
    }

    const result = await this.ipcExecutor.execute(name, args);

    // Transform IPC result to tool bus format
    return {
      success: result.success,
      output: result.result ?? '',
      error: result.error
    };
  }

  /**
   * Execute tool via router (Playwright mode)
   */
  private async executeViaRouter(name: string, args: Record<string, any>): Promise<any> {
    if (!this.toolRouter) {
      throw new Error('Tool router not initialized');
    }

    // Special handling for intervention request
    if (name === 'request_human_help') {
      return await this.handleInterventionRequest(args);
    }

    return await this.toolRouter.route(name, args);
  }

  /**
   * Handle human intervention request
   */
  private async handleInterventionRequest(args: Record<string, any>): Promise<any> {
    const message = (args.message as string) || 'Agent needs assistance';

    try {
      const shot = await this.browserController?.screenshot();
      if (shot) {
        const { setLatestScreenshot } = await import('../../api/routes/browser.js');
        setLatestScreenshot(
          shot,
          this.browserController?.getSession()?.context?.pages()[0]?.url() || ''
        );
      }
    } catch {}

    const response = await this.interventionManager.requestIntervention(message);

    return {
      success: response.completed,
      output: response.result,
      error: response.completed ? undefined : response.result
    };
  }

  /**
   * Ensure browser page is available
   */
  private async ensurePage(): Promise<boolean> {
    if (!this.browserController) return false;

    const session = this.browserController.getSession();

    // If session already started, we're good
    if (session?.isStarted) {
      const ctx = session.context;
      if (!ctx) return false;
      if (ctx.pages().length === 0) {
        await ctx.newPage();
      }
      return true;
    }

    // In Electron mode, don't start Playwright
    if (RUNNING_IN_ELECTRON) {
      logger.info("ensurePage: Running in Electron mode - using shared <webview>");
      return true;
    }

    // Start headless browser normally
    logger.info("ensurePage: Starting headless browser");
    await this.browserController.start();

    const ctx = this.browserController.getSession()?.context;
    if (!ctx) return false;
    if (ctx.pages().length === 0) {
      await ctx.newPage();
    }
    return true;
  }

  /**
   * Get browser controller
   */
  getController(projectId?: string): BrowserController | null {
    if (projectId && this.projectManager) {
      return this.projectManager.getBrowserController(projectId);
    }
    return this.browserController;
  }

  /**
   * Take screenshot
   */
  async takeScreenshot(projectId?: string): Promise<string | null> {
    const controller = this.getController(projectId);
    if (!controller) return null;
    return controller.screenshot();
  }

  /**
   * Detect page change
   */
  detectPageChange(previous: PageSnapshot | null, current: PageSnapshot | null): PageChangeResult {
    return this.pageChangeDetector.detect(previous, current);
  }

  /**
   * Update page state
   */
  updatePageState(state: PageSnapshot): void {
    this.pageStateManager.update(state);
  }

  /**
   * Get last page state
   */
  getLastPageState(): PageSnapshot | null {
    return this.pageStateManager.getLast();
  }

  /**
   * Clear page state
   */
  clearPageState(): void {
    this.pageStateManager.clear();
  }

  /**
   * Get intervention manager
   */
  getInterventionManager(): InterventionManager {
    return this.interventionManager;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.browserController) {
      await this.browserController.stop();
      this.browserController = null;
    }

    if (this.projectManager) {
      await this.projectManager.shutdown();
      this.projectManager = null;
    }

    this.ipcExecutor = null;
    this.toolRouter = null;

    logger.info('[BrowserTools] Cleaned up');
  }

  /**
   * Get statistics
   */
  getStats(): {
    mode: string;
    controllerActive: boolean;
    ipcAvailable: boolean;
    interventionStats: ReturnType<InterventionManager['getStats']>;
  } {
    return {
      mode: RUNNING_IN_ELECTRON ? 'Electron IPC' : 'Playwright',
      controllerActive: this.browserController !== null,
      ipcAvailable: this.ipcExecutor !== null,
      interventionStats: this.interventionManager.getStats()
    };
  }
}

// ============================================================================
// Singleton Instance & Legacy API Compatibility
// ============================================================================

let defaultManager: BrowserToolsManager | null = null;

/**
 * Get or create default manager instance
 */
function getManager(): BrowserToolsManager {
  if (!defaultManager) {
    defaultManager = new BrowserToolsManager();
  }
  return defaultManager;
}

// ============================================================================
// Legacy Export Functions (for backward compatibility)
// ============================================================================

export function setProjectManager(pm: ProjectManager): void {
  getManager().setProjectManager(pm);
}

export function registerBrowserTools(toolBus: ToolBus, controller?: BrowserController): void {
  const manager = getManager();

  if (controller) {
    manager.initialize(controller);
  }

  manager.registerTools(toolBus);
}

export function getBrowserController(projectId?: string): BrowserController | null {
  return getManager().getController(projectId);
}

export async function cleanupBrowserTools(): Promise<void> {
  if (defaultManager) {
    await defaultManager.cleanup();
    defaultManager = null;
  }
}

export async function takeBrowserScreenshot(projectId?: string): Promise<string | null> {
  return getManager().takeScreenshot(projectId);
}

export function updatePageState(state: PageSnapshot): void {
  getManager().updatePageState(state);
}

export function getLastPageState(): PageSnapshot | null {
  return getManager().getLastPageState();
}

export function clearPageState(): void {
  getManager().clearPageState();
}

export function detectPageChange(
  previous: PageSnapshot | null,
  current: PageSnapshot | null
): PageChangeResult {
  return getManager().detectPageChange(previous, current);
}

export function setOnInterventionRequested(cb: (message: string, id: number) => void): void {
  getManager().getInterventionManager().setOnRequestRequested(cb);
}

export function resolveIntervention(result: string): boolean {
  return getManager().getInterventionManager().resolve(result);
}

export function hasPendingIntervention(): boolean {
  return getManager().getInterventionManager().hasPending();
}

export function getPendingIntervention(): { message: string; id: number } | null {
  const pending = getManager().getInterventionManager().getPending();
  return pending ? { message: pending.message, id: pending.id } : null;
}

// Re-export types
export type { PageChangeResult, PageSnapshot };
