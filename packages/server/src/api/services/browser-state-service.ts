/**
 * Browser State Service
 * Centralized state management for browser API operations
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('BrowserStateService');

export interface ScreenshotState {
  data: string | { elements: any[] };
  url: string;
  timestamp: number;
}

export interface CdpConnectionState {
  connected: boolean;
  resolver?: (value: boolean) => void;
  rejecter?: (reason: string) => void;
  timeoutId?: NodeJS.Timeout;
}

export interface InterventionState {
  pending: boolean;
  id: number;
  message: string;
  resolve?: (result: string) => void;
}

export interface PendingIntervention {
  id: number;
  message: string;
}

/**
 * Browser State Service manages all global browser-related state
 * This replaces global variables with a proper service class
 */
export class BrowserStateService {
  private screenshot: ScreenshotState | null = null;
  private cdp: CdpConnectionState = {
    connected: false,
    resolver: null,
    rejecter: null,
    timeoutId: undefined
  };
  private intervention: InterventionState = {
    pending: false,
    id: 0,
    message: ''
  };
  private externalCdpUrl: string | null = null;
  private commandResults: Map<string, any> = new Map();
  private commandErrors: Map<string, string> = new Map();

  // === Screenshot Management ===

  setLatestScreenshot(data: string | { elements: any[] }, url: string): void {
    this.screenshot = {
      data,
      url,
      timestamp: Date.now()
    };
    logger.debug(`[BrowserStateService] Screenshot updated for ${url}`);
  }

  getLatestScreenshot(): ScreenshotState | null {
    return this.screenshot;
  }

  getScreenshotData(): string | { elements: any[] } | null {
    return this.screenshot?.data ?? null;
  }

  getScreenshotUrl(): string {
    return this.screenshot?.url ?? '';
  }

  clearScreenshot(): void {
    this.screenshot = null;
  }

  // === CDP Connection Management ===

  /**
   * Wait for CDP connection to be established
   */
  async waitForCdpConnection(timeout = 10000): Promise<boolean> {
    if (this.cdp.connected) {
      logger.info("[BrowserStateService] CDP already connected");
      return Promise.resolve(true);
    }

    logger.info(`[BrowserStateService] Waiting for CDP connection (timeout: ${timeout}ms)...`);

    return new Promise((resolve, reject) => {
      this.cdp.resolver = resolve;
      this.cdp.rejecter = reject;

      this.cdp.timeoutId = setTimeout(() => {
        if (this.cdp.resolver) {
          logger.warn("[BrowserStateService] CDP connection timeout");
          this.cdp.resolver = null;
          this.cdp.rejecter = null;
          resolve(false);
        }
      }, timeout);
    });
  }

  /**
   * Mark CDP as connected
   */
  setCdpConnected(): void {
    this.cdp.connected = true;

    // Resolve any pending waits
    if (this.cdp.resolver) {
      this.cdp.resolver(true);
      this.cdp.resolver = null;
      this.cdp.rejecter = null;
    }

    // Clear timeout
    if (this.cdp.timeoutId) {
      clearTimeout(this.cdp.timeoutId);
      this.cdp.timeoutId = undefined;
    }

    logger.info("[BrowserStateService] CDP connected");
  }

  /**
   * Check if CDP is connected
   */
  isCdpConnected(): boolean {
    return this.cdp.connected;
  }

  /**
   * Reset CDP connection state
   */
  resetCdpConnection(): void {
    this.cdp.connected = false;

    if (this.cdp.timeoutId) {
      clearTimeout(this.cdp.timeoutId);
      this.cdp.timeoutId = undefined;
    }

    if (this.cdp.resolver) {
      this.cdp.resolver(false);
      this.cdp.resolver = null;
    }

    if (this.cdp.rejecter) {
      this.cdp.rejecter("CDP connection reset");
      this.cdp.rejecter = null;
    }

    logger.info("[BrowserStateService] CDP connection reset");
  }

  // === Intervention Management ===

  /**
   * Start a new intervention
   */
  startIntervention(message: string): PendingIntervention {
    const id = ++this.intervention.id;
    this.intervention = {
      pending: true,
      id,
      message
    };
    logger.info(`[BrowserStateService] Started intervention ${id}: ${message}`);
    return { id, message };
  }

  /**
   * Resolve an intervention
   */
  resolveIntervention(result: string): boolean {
    if (!this.intervention.pending) return false;

    if (this.intervention.resolve) {
      this.intervention.resolve(result);
    }

    this.intervention.pending = false;
    this.intervention.resolve = undefined;

    logger.info(`[BrowserStateService] Resolved intervention ${this.intervention.id}`);
    return true;
  }

  /**
   * Check if intervention is pending
   */
  hasPendingIntervention(): boolean {
    return this.intervention.pending;
  }

  /**
   * Get pending intervention info
   */
  getPendingIntervention(): PendingIntervention | null {
    if (!this.intervention.pending) return null;
    return {
      id: this.intervention.id,
      message: this.intervention.message
    };
  }

  /**
   * Set intervention resolve callback
   */
  setInterventionResolver(resolve: (result: string) => void): void {
    this.intervention.resolve = resolve;
  }

  // === Command Results ===

  /**
   * Store command execution result
   */
  setCommandResult(action: string, result: any): void {
    this.commandResults.set(action, result);
    logger.info(`[BrowserStateService] Stored result for ${action}`);
  }

  /**
   * Get command execution result
   */
  getCommandResult(action: string): any | null {
    return this.commandResults.get(action) ?? null;
  }

  /**
   * Store command execution error
   */
  setCommandError(action: string, error: string): void {
    this.commandErrors.set(action, error);
    logger.error(`[BrowserStateService] Stored error for ${action}: ${error}`);
  }

  /**
   * Get command execution error
   */
  getCommandError(action: string): string | null {
    return this.commandErrors.get(action) ?? null;
  }

  /**
   * Clear command results (after they've been consumed)
   */
  clearCommandResult(action: string): void {
    this.commandResults.delete(action);
    this.commandErrors.delete(action);
  }

  // === External CDP URL ===

  setExternalCdpUrl(url: string): void {
    this.externalCdpUrl = url;
    logger.info(`[BrowserStateService] External CDP URL set: ${url}`);
  }

  getExternalCdpUrl(): string | null {
    return this.externalCdpUrl;
  }

  /**
   * Get all state (for debugging)
   */
  getStateSnapshot(): any {
    return {
      screenshot: this.screenshot ? { url: this.screenshot.url, timestamp: this.screenshot.timestamp } : null,
      cdp: { connected: this.cdp.connected },
      intervention: this.intervention.pending ? { id: this.intervention.id } : null,
      externalCdpUrl: this.externalCdpUrl
    };
  }
}

/**
 * Global state service instance
 */
export const browserStateService = new BrowserStateService();
