/**
 * Browser API Routes - Simplified
 *
 * Refactored from 556 lines to ~100 lines
 * State management extracted to BrowserStateService
 * Business logic extracted to BrowserRouteHandlers
 */

import { Hono } from "hono";
import { browserStateService } from "../services/browser-state-service.js";
import { BrowserRouteHandlers } from "../handlers/browser-route-handlers.js";
import { createLogger } from "../../core/logging.js";

const logger = createLogger("browser-api");

/**
 * Create browser routes (for compatibility with app.ts)
 */
export function createBrowserRoutes(browserSession: any): Hono {
  const app = new Hono();
  const handlers = new BrowserRouteHandlers(browserStateService);

  // === Core Browser Commands ===
  app.post('/exec', async (c) => handlers.handleExec(c));
  app.get('/exec/poll', async (c) => handlers.handleExecPoll(c));

  // === State Queries ===
  app.get('/screenshot', async (c) => handlers.handleScreenshot(c));
  app.get('/snapshot', async (c) => handlers.handleSnapshot(c));
  app.get('/state', async (c) => handlers.handleStateSnapshot(c));

  // === CDP Connection ===
  app.get('/cdp/check', async (c) => handlers.handleCdpCheck(c));
  app.post('/cdp/connect', async (c) => handlers.handleCdpConnect(c));
  app.post('/cdp/reset', async (c) => handlers.handleCdpReset(c));

  // === Intervention ===
  app.get('/intervention', async (c) => handlers.handleIntervention(c));
  app.post('/intervention/resolve', async (c) => handlers.handleInterventionResolve(c));
  app.post('/intervention/cancel', async (c) => handlers.handleInterventionCancel(c));

  return app;
}

// Legacy routes with full API path (for backward compatibility)
const app = new Hono();
const handlers = new BrowserRouteHandlers(browserStateService);

// === Core Browser Commands ===
app.post('/api/browser/exec', async (c) => handlers.handleExec(c));
app.get('/api/browser/exec/poll', async (c) => handlers.handleExecPoll(c));

// === State Queries ===
app.get('/api/browser/screenshot', async (c) => handlers.handleScreenshot(c));
app.get('/api/browser/snapshot', async (c) => handlers.handleSnapshot(c));
app.get('/api/browser/state', async (c) => handlers.handleStateSnapshot(c));

// === CDP Connection ===
app.get('/api/browser/cdp/check', async (c) => handlers.handleCdpCheck(c));
app.post('/api/browser/cdp/connect', async (c) => handlers.handleCdpConnect(c));
app.post('/api/browser/cdp/reset', async (c) => handlers.handleCdpReset(c));

// === Intervention ===
app.get('/api/browser/intervention', async (c) => handlers.handleIntervention(c));
app.post('/api/browser/intervention/resolve', async (c) => handlers.handleInterventionResolve(c));
app.post('/api/browser/intervention/cancel', async (c) => handlers.handleInterventionCancel(c));

// === Utility Functions ===

/**
 * Set latest screenshot (called by browser tools)
 */
export function setLatestScreenshot(data: string | { elements: any[] }, url: string): void {
  browserStateService.setLatestScreenshot(data, url);
}

/**
 * Wait for CDP connection
 */
export async function waitForCdpConnection(timeout = 10000): Promise<boolean> {
  return browserStateService.waitForCdpConnection(timeout);
}

/**
 * Check if CDP is connected
 */
export function isCdpConnected(): boolean {
  return browserStateService.isCdpConnected();
}

/**
 * Reset CDP connection state
 */
export function resetCdpConnection(): void {
  browserStateService.resetCdpConnection();
}

/**
 * Get external CDP URL
 */
export function getExternalCdpUrl(): string | null {
  return browserStateService.getExternalCdpUrl();
}

/**
 * Check if there's a pending intervention
 */
export function hasPendingIntervention(): boolean {
  return browserStateService.hasPendingIntervention();
}

/**
 * Get pending intervention info
 */
export function getPendingIntervention(): { id: number; message: string } | null {
  return browserStateService.getPendingIntervention();
}

/**
 * Resolve an intervention
 */
export function resolveIntervention(result: string): boolean {
  return browserStateService.resolveIntervention(result);
}

export default app;
