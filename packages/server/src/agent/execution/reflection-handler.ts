/**
 * Reflection Handler Module
 * Handles loop detection, reflection, and recovery strategies
 */

import type { StepEvent } from "../../core/types";
import logger from "../../core/logging";
import { getConfig } from "../../core/config";

export interface ReflectionResult {
  success: boolean;
  recoveryHint?: string;
}

export interface LoopDetectionOptions {
  maxRepetitions?: number;
  timeoutThreshold?: number;
}

/**
 * Detect loops in action history
 */
export function detectLoop(actionsTaken: string[]): string | null {
  if (actionsTaken.length < 3) return null;

  const recentActions = actionsTaken.slice(-5);
  const actionCounts = new Map<string, number>();

  for (const action of recentActions) {
    const count = actionCounts.get(action) || 0;
    actionCounts.set(action, count + 1);
  }

  // Check for repeated actions
  for (const [action, count] of actionCounts.entries()) {
    if (count >= 3) {
      return `Loop detected: Action "${action}" repeated ${count} times`;
    }
  }

  // Check for alternating pattern
  if (recentActions.length >= 4) {
    const lastFour = recentActions.slice(-4);
    const pattern = `${lastFour[0]}->${lastFour[1]}->${lastFour[2]}->${lastFour[3]}`;
    const reversePattern = `${lastFour[3]}->${lastFour[2]}->${lastFour[1]}->${lastFour[0]}`;

    if (recentActions.length >= 6) {
      const earlierFour = recentActions.slice(-6, -2);
      const earlierPattern = `${earlierFour[0]}->${earlierFour[1]}->${earlierFour[2]}->${earlierFour[3]}`;

      if (pattern === earlierPattern) {
        return `Loop detected: Repeating pattern "${pattern}"`;
      }
    }
  }

  return null;
}

/**
 * Analyze steps and provide reflection with recovery hints
 */
export function reflect(
  task: string,
  steps: StepEvent[],
  iteration: number
): ReflectionResult {
  const config = getConfig();

  // Check if we're making progress
  if (steps.length === 0) {
    return {
      success: true,
      recoveryHint: 'Starting task execution. Focus on understanding requirements.'
    };
  }

  // Analyze recent steps
  const recentSteps = steps.slice(-5);
  const errors = recentSteps.filter(s => s.action === 'error');
  const warnings = recentSteps.filter(s => s.action === 'warning');

  // Check for error patterns
  if (errors.length >= 2) {
    const errorMessages = errors.map(e => e.detail || e.observation).join('; ');
    return {
      success: false,
      recoveryHint: `Multiple errors detected: ${errorMessages}. Consider a different approach or use request_human_help.`
    };
  }

  // Check for stuck state
  const stuckActions = recentSteps.filter(s =>
    s.action === 'retry' ||
    s.action === 'timeout' ||
    s.action === 'not_found'
  );

  if (stuckActions.length >= 3) {
    return {
      success: false,
      recoveryHint: 'Multiple retries or timeouts. Try: (1) Use browser_snapshot to refresh page state, (2) Try a different approach, (3) Use browser_go_back if stuck, (4) Use request_human_help for complex obstacles.'
    };
  }

  // Check for slow progress
  if (iteration > 10 && steps.length < 5) {
    return {
      success: false,
      recoveryHint: 'Slow progress detected. Consider if the current approach is effective. Try a more direct strategy or break down the task differently.'
    };
  }

  // Check for vision issues
  const visionIssues = recentSteps.filter(s =>
    s.detail?.includes('no elements') ||
    s.detail?.includes('not found') ||
    s.observation?.includes('empty')
  );

  if (visionIssues.length >= 2) {
    return {
      success: false,
      recoveryHint: 'Element detection issues. Try: (1) Scroll to find more elements, (2) Use browser_wait for dynamic content, (3) Check if you\'re on the correct page, (4) Use browser_navigate to the right URL.'
    };
  }

  // No issues detected
  return {
    success: true
  };
}

/**
 * Generate recovery hint based on context
 */
export function generateRecoveryHint(
  context: {
    lastAction: string;
    error?: string;
    iteration: number;
  }
): string {
  const { lastAction, error, iteration } = context;

  // Recovery hints based on last action
  if (lastAction.includes('browser_click')) {
    return 'Click failed. Try: (1) Refresh with browser_snapshot, (2) Scroll to find element, (3) Check if element is visible/interactable, (4) Try alternative selector.';
  }

  if (lastAction.includes('browser_navigate')) {
    return 'Navigation failed. Try: (1) Check URL format, (2) Try alternative URL, (3) Use browser_go_back and retry, (4) Check if site requires authentication.';
  }

  if (lastAction.includes('browser_type')) {
    return 'Input failed. Try: (1) Clear field first, (2) Use browser_press_key with special keys, (3) Check if field is writable, (4) Verify field is visible.';
  }

  if (lastAction.includes('browser_snapshot') && error?.includes('no elements')) {
    return 'No elements found. Try: (1) browser_scroll to reveal content, (2) browser_wait for dynamic loading, (3) Check if page loaded correctly, (4) Try alternative page.';
  }

  // Generic recovery hint based on iteration count
  if (iteration > 15) {
    return 'High iteration count. Consider: (1) Reassess strategy, (2) Use browser_end if task complete, (3) Request human help if stuck, (4) Try simpler approach.';
  }

  return 'Action failed. Take a fresh browser_snapshot to understand current state, then adjust your approach.';
}

/**
 * Check if recovery is possible based on error type
 */
export function isRecoverable(error: string): boolean {
  const recoverableErrors = [
    'timeout',
    'not found',
    'element not interactable',
    'no elements',
    'failed to load',
    'connection'
  ];

  const lowerError = error.toLowerCase();
  return recoverableErrors.some(pattern => lowerError.includes(pattern));
}

/**
 * Suggest next action based on current state
 */
export function suggestNextAction(context: {
  currentUrl?: string;
  lastAction?: string;
  hasElements?: boolean;
  iteration: number;
}): string {
  const { currentUrl, lastAction, hasElements, iteration } = context;

  // If no elements visible
  if (!hasElements) {
    return 'Try browser_scroll("down") to reveal more elements, then browser_snapshot.';
  }

  // If just navigated
  if (lastAction?.includes('navigate')) {
    return 'Use browser_snapshot to see page elements.';
  }

  // If high iteration count
  if (iteration > 20) {
    return 'Consider using browser_end to summarize findings or request_human_help.';
  }

  // If on error page
  if (currentUrl?.includes('error') || currentUrl?.includes('404')) {
    return 'Use browser_go_back and try a different approach or URL.';
  }

  // Default suggestion
  return 'Use browser_snapshot to refresh page state, then continue with your task.';
}
