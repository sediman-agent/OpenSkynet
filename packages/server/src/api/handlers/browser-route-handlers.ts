/**
 * Browser Route Handlers
 * Extracted business logic from API routes
 */

import type { Context } from 'hono';
import { browserStateService } from '../services/browser-state-service.js';
import { getBrowserController } from '../../agent/tools/browser-tools.js';
import { getGlobalBrowserSession } from '../../browser/global-session.js';
import { createLogger } from '../../core/logging.js';

const logger = createLogger('BrowserRouteHandlers');

export class BrowserRouteHandlers {
  constructor(private state = browserStateService) {}

  /**
   * Handle browser command execution
   */
  async handleExec(c: Context): Promise<Response> {
    try {
      const requestBody = await c.req.json();
      const { action, ...args } = requestBody;

      // Only log when action changes (reduce noise)
      // logger.debug(`[BrowserAPI] Executing: ${action}`);

      const RUNNING_IN_ELECTRON = process.env.SEDIMAN_MODE === 'electron';

      // In Electron mode, browser commands are executed by the frontend
      // Add command to pending queue for frontend to poll and execute via Electron IPC
      if (RUNNING_IN_ELECTRON) {
        // logger.info(`[BrowserAPI] Queueing ${action} for frontend execution`);

        // Import here to avoid circular dependency
        const { addPendingCommand } = require('./browser-route-handlers.js');

        // Clear any existing result for this action before queuing new command
        // This prevents returning stale results from previous executions
        this.state.clearCommandResult(action);

        addPendingCommand(action, args);

        // Return immediately - frontend will poll and execute
        return c.json({
          success: true,
          result: `Command ${action} queued for execution via Electron IPC`
        });
      }

      // Non-Electron mode: Use browser controller
      const controller = getBrowserController();
      if (!controller) {
        return c.json({ success: false, error: 'Browser not available' }, 503);
      }

      let result: any;
      switch (action) {
        case 'navigate':
          result = await controller.navigate(args.url);
          this.state.setLatestScreenshot(result, args.url);
          break;
        case 'click':
          result = await controller.click(args.refId);
          this.state.setLatestScreenshot(result, '');
          break;
        case 'type':
          result = await controller.typeText(args.refId, args.text, args.submit);
          break;
        case 'snapshot':
          const snap = await controller.snapshot();
          result = {
            url: snap.url,
            title: snap.title,
            elements: snap.elements,
            output: snap.output
          };
          this.state.setLatestScreenshot({ elements: snap.elements }, snap.url);
          break;
        case 'screenshot':
          const shot = await controller.screenshot();
          result = shot ? { success: true, data: shot } : { success: false, error: 'Screenshot failed' };
          if (shot) this.state.setLatestScreenshot(shot, controller.getSession()?.context?.pages()?.[0]?.url() || '');
          break;
        case 'extract_text':
          const textResult = await controller.extractText();
          result = { text: textResult };
          break;
        case 'execute_script':
          const scriptResult = await controller.evaluate(args.script as string);
          result = { result: scriptResult };
          break;
        case 'scroll':
          result = await controller.scroll(args.direction, args.amount);
          break;
        case 'press_key':
          result = await controller.pressKey(args.key);
          break;
        case 'hover':
          result = await controller.hover(args.refId);
          break;
        case 'select_option':
          result = await controller.selectOption(args.refId, args.value);
          break;
        case 'go_back':
          result = await controller.goBack();
          break;
        case 'go_forward':
          result = await controller.goForward();
          break;
        case 'refresh':
          result = await controller.refresh();
          break;
        case 'switch_tab':
          result = await controller.switchTab(args.index);
          break;
        case 'list_tabs':
          result = await controller.listTabs();
          break;
        case 'close_tab':
          result = await controller.closeTab(args.index);
          break;
        case 'wait':
          result = await controller.waitForSelector(args.selector, args.timeout);
          break;
        case 'drag_and_drop':
          result = await controller.dragAndDrop(args.sourceRefId, args.targetRefId);
          break;
        case 'upload_file':
          result = await controller.uploadFile(args.refId, args.filePath);
          break;
        default:
          return c.json({ success: false, error: `Unknown action: ${action}` }, 400);
      }

      return c.json({ success: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[BrowserAPI] Exec error: ${message}`);
      return c.json({ success: false, error: message }, 500);
    }
  }

  /**
   * Handle browser command execution result submission from frontend
   * This is called by the frontend after executing a command via Electron IPC
   */
  async handleExecResult(c: Context): Promise<Response> {
    try {
      const requestBody = await c.req.json();
      const { commandId, result, error } = requestBody;

      logger.info('[BrowserAPI] Received execution result for ' + commandId + ': ' + JSON.stringify({
        success: !!result,
        hasError: !!error
      }));

      // Extract action name from commandId (format: "action:timestamp:random")
      // Use colon as delimiter to avoid conflicts with underscores in action names
      const action = commandId?.split(':')[0] || commandId;

      // Store the result in the state service so it can be retrieved by the agent
      if (result) {
        this.state.setCommandResult(action, result);
      }

      if (error) {
        this.state.setCommandError(action, error);
      }

      return c.json({
        success: true,
        message: 'Result received'
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[BrowserAPI] Failed to handle exec result: ${message}`);
      return c.json({ success: false, error: message }, 500);
    }
  }

  /**
   * Handle browser exec polling (for execution results)
   */
  async handleExecPoll(c: Context): Promise<Response> {
    const screenshot = this.state.getScreenshotData();
    const url = this.state.getScreenshotUrl();
    const snapshot = this.state.getLatestScreenshot();

    // Also check for any command results that have been submitted
    const commandResults: Record<string, any> = {};
    const actions = [
      'navigate', 'snapshot', 'screenshot', 'click', 'type', 'scroll', 'wait', 'hover', 'press_key',
      'extract_text', 'execute_script', 'refresh', 'go_back', 'go_forward', 'select_option',
      'switch_tab', 'list_tabs', 'close_tab', 'drag_and_drop', 'upload_file'
    ];

    let hasResults = false;
    for (const action of actions) {
      const result = this.state.getCommandResult(action);
      if (result) {
        commandResults[action] = result;
        hasResults = true;
        // DON'T clear immediately - let it persist for subsequent polls
        // The result will be naturally replaced when a new command with same action is executed
        // This prevents race conditions where polling misses the result
      }
    }

    // Only log when we actually have results to reduce noise
    if (hasResults) {
      // Disabled for now - too noisy
      // logger.info(`[BrowserAPI] Poll returning ${Object.keys(commandResults).length} command results: ${Object.keys(commandResults).join(', ')}`);
    }

    return c.json({
      success: true,
      ready: true,
      screenshot: screenshot || null,
      url: url || '',
      snapshot: snapshot || null,
      commandResults: Object.keys(commandResults).length > 0 ? commandResults : undefined,
      timestamp: Date.now()
    });
  }

  /**
   * Handle screenshot request (GET)
   */
  async handleScreenshot(c: Context): Promise<Response> {
    const screenshot = this.state.getScreenshotData();
    const url = this.state.getScreenshotUrl();

    if (!screenshot) {
      return c.json({ error: 'No screenshot available' }, 404);
    }

    return c.json({
      success: true,
      data: screenshot,
      url,
      timestamp: Date.now()
    });
  }

  /**
   * Handle screenshot submission from frontend (POST)
   * Called when frontend captures a screenshot via Electron webview
   */
  async handleScreenshotSubmit(c: Context): Promise<Response> {
    try {
      const requestBody = await c.req.json();
      const { screenshot, url, title, snapshot } = requestBody;

      if (screenshot) {
        logger.info(`[BrowserAPI] Received screenshot from frontend: url=${url}, title=${title || 'none'}, size=${screenshot.length} bytes`);

        // Store screenshot in state service
        this.state.setLatestScreenshot(screenshot, url);

        logger.info(`[BrowserAPI] Screenshot stored in state service for ${url}`);
      }

      if (snapshot && snapshot.elements) {
        logger.info(`[BrowserAPI] Received snapshot from frontend: url=${url}, title=${title || 'none'}, elements=${snapshot.elements.length}`);

        // Store snapshot with elements in state service
        this.state.setLatestScreenshot(snapshot, url);

        logger.info(`[BrowserAPI] Snapshot with ${snapshot.elements.length} elements stored for ${url}`);
      }

      return c.json({
        success: true,
        message: 'Data received',
        url,
        timestamp: Date.now()
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[BrowserAPI] Failed to handle screenshot submission: ${message}`);
      return c.json({ success: false, error: message }, 500);
    }
  }

  /**
   * Handle snapshot request
   */
  async handleSnapshot(c: Context): Promise<Response> {
    const snapshot = this.state.getLatestScreenshot();

    if (!snapshot) {
      return c.json({ error: 'No snapshot available' }, 404);
    }

    const screenshotData = this.state.getScreenshotData();

    // Return snapshot data with elements if available
    return c.json({
      success: true,
      snapshot: screenshotData,
      url: this.state.getScreenshotUrl(),
      timestamp: snapshot.timestamp
    });
  }

  /**
   * Handle CDP connection check
   */
  async handleCdpCheck(c: Context): Promise<Response> {
    const connected = this.state.isCdpConnected();
    return c.json({ connected });
  }

  /**
   * Handle CDP connection establishment
   * Actually connects the browser session via Playwright CDP
   */
  async handleCdpConnect(c: Context): Promise<Response> {
    try {
      const { url, webSocketDebuggerUrl } = await c.req.json();

      // Use webSocketDebuggerUrl if provided (from Electron), otherwise use url
      const cdpUrl = webSocketDebuggerUrl || url;

      if (!cdpUrl) {
        return c.json({ error: 'CDP URL required' }, 400);
      }

      logger.info(`[CDP] Connection requested, URL: ${cdpUrl.substring(0, 60)}...`);

      // Store the URL
      this.state.setExternalCdpUrl(cdpUrl);

      // Get the global browser session
      const browserSession = getGlobalBrowserSession();
      if (!browserSession) {
        logger.error('[CDP] No global browser session found');
        return c.json({ error: 'Browser session not initialized' }, 500);
      }

      // Actually connect via CDP using Playwright
      logger.info('[CDP] Connecting browser session via Playwright CDP...');
      await browserSession.connectViaCDP(cdpUrl);
      logger.info('[CDP] ✓ Browser session connected via CDP');

      // Mark as connected
      this.state.setCdpConnected();

      return c.json({ success: true, connected: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[CDP] Connection failed: ${message}`);
      return c.json({ error: `CDP connection failed: ${message}` }, 500);
    }
  }

  /**
   * Handle intervention request
   */
  async handleIntervention(c: Context): Promise<Response> {
    const intervention = this.state.getPendingIntervention();

    if (!intervention) {
      return c.json({ error: 'No pending intervention' }, 404);
    }

    return c.json({
      success: true,
      id: intervention.id,
      message: intervention.message
    });
  }

  /**
   * Handle intervention resolution
   */
  async handleInterventionResolve(c: Context): Promise<Response> {
    const { result } = await c.req.json();

    const resolved = this.state.resolveIntervention(result);

    return c.json({
      success: resolved,
      result: resolved ? 'Intervention resolved' : 'No pending intervention'
    });
  }

  /**
   * Handle intervention cancel
   */
  async handleInterventionCancel(c: Context): Promise<Response> {
    const resolved = this.state.resolveIntervention('cancelled');

    return c.json({
      success: resolved,
      result: 'Intervention cancelled'
    });
  }

  /**
   * Handle state snapshot (debugging)
   */
  async handleStateSnapshot(c: Context): Promise<Response> {
    return c.json(this.state.getStateSnapshot());
  }

  /**
   * Handle CDP reset (testing)
   */
  async handleCdpReset(c: Context): Promise<Response> {
    this.state.resetCdpConnection();
    return c.json({ success: true, message: 'CDP connection reset' });
  }

  /**
   * Handle pending browser commands
   */
  async handlePendingCommands(c: Context): Promise<Response> {
    const RUNNING_IN_ELECTRON = process.env.SEDIMAN_MODE === 'electron';

    if (!RUNNING_IN_ELECTRON) {
      return c.json({ success: true, commands: [] });
    }

    // Get all pending commands and clear them
    const commands = [...pendingCommands];
    pendingCommands = [];

    // Only log when there are actual commands to reduce noise
    if (commands.length > 0) {
      logger.info(`[BrowserAPI] Sending ${commands.length} pending commands to frontend`);
    }

    return c.json({
      success: true,
      commands: commands.map(cmd => ({
        id: cmd.id,
        action: cmd.action,
        params: cmd.params,
        timestamp: cmd.timestamp
      }))
    });
  }
}

// Global pending commands array for Electron mode
let pendingCommands: Array<{ action: string; params: Record<string, any>; timestamp: number; id: string }> = [];

/**
 * Add a browser command to the pending queue (called by handleExec)
 * Uses colon delimiter to avoid conflicts with action names containing underscores
 */
export function addPendingCommand(action: string, params: Record<string, any>): void {
  const id = `${action}:${Date.now()}:${Math.random().toString(36).substring(2, 9)}`;
  pendingCommands.push({
    id,
    action,
    params,
    timestamp: Date.now()
  });
  // logger.info(`[BrowserAPI] Added pending command: ${action} with id: ${id}`);
}
