/**
 * Intervention Manager
 * Manages human intervention requests and responses
 */

import { createLogger } from '../../../core/logging.js';

const logger = createLogger('InterventionManager');

export interface InterventionRequest {
  id: number;
  message: string;
  timestamp: number;
}

export interface InterventionResponse {
  result: string;
  completed: boolean;
  timedOut?: boolean;
}

export interface InterventionOptions {
  timeout?: number;
}

/**
 * Intervention Manager handles human intervention requests
 * This is extracted from browser-tools.ts
 */
export class InterventionManager {
  private pendingInterventionId = 0;
  private interventionPromise: {
    resolve: (v: string) => void;
    message: string;
    id: number;
    timestamp: number;
  } | null = null;
  private onInterventionRequested: ((message: string, id: number) => void) | null = null;
  private timeout: number;

  constructor(options: InterventionOptions = {}) {
    this.timeout = options.timeout ?? 120000; // 2 minutes default
  }

  /**
   * Request human intervention
   */
  async requestIntervention(message: string): Promise<InterventionResponse> {
    const iid = ++this.pendingInterventionId;
    const timestamp = Date.now();

    logger.info(`[Intervention] Requesting intervention #${iid}: ${message}`);

    try {
      const userResp = await new Promise<string>((resolve) => {
        this.interventionPromise = {
          resolve,
          message,
          id: iid,
          timestamp
        };
        this.onInterventionRequested?.(message, iid);

        setTimeout(() => {
          if (this.interventionPromise?.id === iid) {
            resolve('timeout');
          }
        }, this.timeout);
      });

      const result = userResp === 'timeout'
        ? { result: 'Human intervention timed out', completed: false, timedOut: true }
        : { result: `Human intervention completed: ${userResp}`, completed: true };

      logger.info(`[Intervention] #${iid} completed:`, result);
      return result;
    } catch (error) {
      logger.error(`[Intervention] #${iid} cancelled:`, error);
      return {
        result: 'Human intervention cancelled',
        completed: false,
        timedOut: false
      };
    } finally {
      this.interventionPromise = null;
    }
  }

  /**
   * Resolve a pending intervention with user response
   */
  resolve(result: string): boolean {
    if (!this.interventionPromise) return false;

    const iid = this.interventionPromise.id;
    logger.info(`[Intervention] Resolving #${iid} with: ${result}`);

    this.interventionPromise.resolve(result);
    this.interventionPromise = null;

    return true;
  }

  /**
   * Check if there's a pending intervention
   */
  hasPending(): boolean {
    return this.interventionPromise !== null;
  }

  /**
   * Get pending intervention details
   */
  getPending(): InterventionRequest | null {
    if (!this.interventionPromise) return null;

    return {
      id: this.interventionPromise.id,
      message: this.interventionPromise.message,
      timestamp: this.interventionPromise.timestamp
    };
  }

  /**
   * Cancel pending intervention
   */
  cancel(): boolean {
    if (!this.interventionPromise) return false;

    const iid = this.interventionPromise.id;
    logger.warn(`[Intervention] Cancelling #${iid}`);

    this.interventionPromise.resolve('cancelled');
    this.interventionPromise = null;

    return true;
  }

  /**
   * Set callback for intervention requests
   */
  setOnRequestRequested(callback: (message: string, id: number) => void): void {
    this.onInterventionRequested = callback;
  }

  /**
   * Set timeout duration
   */
  setTimeout(timeout: number): void {
    this.timeout = timeout;
  }

  /**
   * Get timeout duration
   */
  getTimeout(): number {
    return this.timeout;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalRequested: number;
    currentlyPending: boolean;
    pendingId: number | null;
  } {
    return {
      totalRequested: this.pendingInterventionId,
      currentlyPending: this.hasPending(),
      pendingId: this.interventionPromise?.id ?? null
    };
  }
}
