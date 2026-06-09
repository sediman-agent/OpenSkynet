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
      logger.info(`[BrowserAPI] Executing: ${action}`);
      logger.info(`[BrowserAPI] Request body: ${JSON.stringify(requestBody)}`);
      logger.info(`[BrowserAPI] Extracted action: ${action}`);
      logger.info(`[BrowserAPI] Extracted args: ${JSON.stringify(args)}`);

      const RUNNING_IN_ELECTRON = process.env.SEDIMAN_MODE === 'electron';

      // In Electron mode, browser commands are executed by the frontend
      // Add command to pending queue for frontend to poll and execute via Electron IPC
      if (RUNNING_IN_ELECTRON) {
        logger.info(`[BrowserAPI] Electron mode - queuing ${action} command for frontend`);
        logger.info(`[BrowserAPI] Args to queue: ${JSON.stringify(args)}`);

        // Import here to avoid circular dependency
        const { addPendingCommand } = require('./browser-route-handlers.js');
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
          if (shot) this.state.setLatestScreenshot(shot, controller.getSession()?.context?.pages?.[0]?.url() || '');
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
   * Handle browser exec polling (for execution results)
   */
  async handleExecPoll(c: Context): Promise<Response> {
    const screenshot = this.state.getScreenshotData();
    const url = this.state.getScreenshotUrl();
    const snapshot = this.state.getLatestScreenshot();

    return c.json({
      success: true,
      ready: true,
      screenshot: screenshot || null,
      url: url || '',
      snapshot: snapshot || null,
      timestamp: Date.now()
    });
  }

  /**
   * Handle screenshot request
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
   * Handle snapshot request
   */
  async handleSnapshot(c: Context): Promise<Response> {
    const snapshot = this.state.getLatestScreenshot();

    if (!snapshot) {
      return c.json({ error: 'No snapshot available' }, 404);
    }

    return c.json({
      success: true,
      ...snapshot
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

    logger.info(`[BrowserAPI] Sending ${commands.length} pending commands to frontend`);

    return c.json({
      success: true,
      commands: commands.map(cmd => ({
        action: cmd.action,
        params: cmd.params,
        timestamp: cmd.timestamp
      }))
    });
  }
}

// Global pending commands array for Electron mode
let pendingCommands: Array<{ action: string; params: Record<string, any>; timestamp: number }> = [];

/**
 * Add a browser command to the pending queue (called by handleExec)
 */
export function addPendingCommand(action: string, params: Record<string, any>): void {
  pendingCommands.push({
    action,
    params,
    timestamp: Date.now()
  });
  logger.info(`[BrowserAPI] Added pending command: ${action}`);
}
