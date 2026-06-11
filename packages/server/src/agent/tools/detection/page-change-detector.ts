/**
 * Page Change Detector
 * Detects page state changes between snapshots for batch execution control
 */

import type { PageSnapshot } from '../../../browser/controller.js';
import { getConfig } from '../../../core/config.js';

export interface PageChangeResult {
  changed: boolean;
  changeType: 'navigation' | 'content' | 'none';
  reason: string;
}

export interface PageChangeOptions {
  detectionMode?: 'strict' | 'basic' | 'loose';
}

/**
 * Page Change Detector handles page state change detection
 * This is extracted from browser-tools.ts
 */
export class PageChangeDetector {
  private detectionMode: 'strict' | 'basic' | 'loose';

  constructor(options: PageChangeOptions = {}) {
    const config = getConfig();
    this.detectionMode = options.detectionMode ?? config.batchChangeDetection ?? 'basic';
  }

  /**
   * Detect if page has changed between two snapshots
   */
  detect(previousState: PageSnapshot | null, currentState: PageSnapshot | null): PageChangeResult {
    if (!previousState || !currentState) {
      return {
        changed: false,
        changeType: 'none',
        reason: 'No state comparison available'
      };
    }

    // Check for navigation change (most significant)
    const navCheck = this.checkNavigationChange(previousState, currentState);
    if (navCheck.changed) {
      return navCheck;
    }

    // Check for content change in strict mode
    if (this.detectionMode === 'strict') {
      const contentCheck = this.checkContentChange(previousState, currentState);
      if (contentCheck.changed) {
        return contentCheck;
      }
    }

    // No significant change detected
    return {
      changed: false,
      changeType: 'none',
      reason: 'No significant page change detected'
    };
  }

  /**
   * Check for navigation changes
   */
  private checkNavigationChange(previous: PageSnapshot, current: PageSnapshot): PageChangeResult {
    if (previous.url !== current.url) {
      return {
        changed: true,
        changeType: 'navigation',
        reason: `URL changed from ${previous.url} to ${current.url}`
      };
    }

    if (previous.title !== current.title) {
      return {
        changed: true,
        changeType: 'navigation',
        reason: `Title changed from "${previous.title}" to "${current.title}"`
      };
    }

    return {
      changed: false,
      changeType: 'none',
      reason: 'No navigation change detected'
    };
  }

  /**
   * Check for content changes in strict mode
   */
  private checkContentChange(previous: PageSnapshot, current: PageSnapshot): PageChangeResult {
    // Element count change
    if (previous.elements.length !== current.elements.length) {
      return {
        changed: true,
        changeType: 'content',
        reason: `Element count changed from ${previous.elements.length} to ${current.elements.length}`
      };
    }

    // Check if any interactive elements changed (refId comparison)
    const prevElements = new Map(
      previous.elements.map(el => [el.refId, { tag: el.tag, text: el.text }])
    );
    const currElements = new Map(
      current.elements.map(el => [el.refId, { tag: el.tag, text: el.text }])
    );

    if (prevElements.size !== currElements.size) {
      return {
        changed: true,
        changeType: 'content',
        reason: 'Interactive elements changed (count mismatch)'
      };
    }

    for (const [refId, currEl] of currElements) {
      const prevEl = prevElements.get(refId);
      if (!prevEl) {
        return {
          changed: true,
          changeType: 'content',
          reason: `New element appeared: ${refId}`
        };
      }

      if (prevEl.tag !== currEl.tag || prevEl.text !== currEl.text) {
        return {
          changed: true,
          changeType: 'content',
          reason: `Element ${refId} changed: ${prevEl.tag}/${prevEl.text} -> ${currEl.tag}/${currEl.text}`
        };
      }
    }

    return {
      changed: false,
      changeType: 'none',
      reason: 'No content change detected'
    };
  }

  /**
   * Set detection mode
   */
  setDetectionMode(mode: 'strict' | 'basic'): void {
    this.detectionMode = mode;
  }

  /**
   * Get current detection mode
   */
  getDetectionMode(): 'strict' | 'basic' | 'loose' {
    return this.detectionMode;
  }
}

/**
 * Page state manager for tracking the last known page state
 */
export class PageStateManager {
  private state: PageSnapshot | null = null;

  /**
   * Update the stored page state
   */
  update(state: PageSnapshot): void {
    this.state = state;
  }

  /**
   * Get the stored page state
   */
  getLast(): PageSnapshot | null {
    return this.state;
  }

  /**
   * Clear the stored page state
   */
  clear(): void {
    this.state = null;
  }

  /**
   * Check if state is available
   */
  hasState(): boolean {
    return this.state !== null;
  }
}
