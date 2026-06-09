/**
 * Global Browser Session Accessor
 * Provides cross-module access to the shared browser session
 */

import type { BrowserSession } from './session.js';

let globalBrowserSession: BrowserSession | null = null;

/**
 * Set the global browser session
 * Called during server initialization
 */
export function setGlobalBrowserSession(session: BrowserSession): void {
  globalBrowserSession = session;
  console.log('[GlobalSession] Browser session registered globally');
}

/**
 * Get the global browser session
 * Used by API handlers and CDP connection
 */
export function getGlobalBrowserSession(): BrowserSession | null {
  return globalBrowserSession;
}

/**
 * Clear the global browser session
 * Used during shutdown
 */
export function clearGlobalBrowserSession(): void {
  globalBrowserSession = null;
  console.log('[GlobalSession] Browser session cleared');
}
