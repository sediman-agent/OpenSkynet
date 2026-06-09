import { ToolBus } from './bus.js';
import type { ToolExecutor } from './interfaces.js';
import { BrowserController, type PageSnapshot } from '../../browser/controller.js';
import type { ToolDefinition } from '../../core/types.js';
import type { ProjectManager } from '../../project/manager.js';
import { setLatestScreenshot, waitForCdpConnection, isCdpConnected } from '../../api/routes/browser.js';
import { createLogger } from '../../core/logging.js';
import { ALL_BROWSER_TOOLS } from './browser-tool-definitions.js';
import {
  setBrowserController,
  storeScreenshot,
  updateLatestSnapshot
} from './screenshot-handler.js';
import {
  setProjectManager as setInterventionProjectManager
} from './intervention-handler.js';

const logger = createLogger("browser-tools");

let browserController: BrowserController | null = null;
let projectManager: ProjectManager | null = null;
let onInterventionRequested: ((message: string, id: number) => void) | null = null;

let pendingInterventionId = 0;
let interventionPromise: { resolve: (v: string) => void; message: string; id: number } | null = null;

// Detect if running in Electron mode (shared browser expected)
// Set SEDIMAN_MODE=electron environment variable when running in Electron app
const RUNNING_IN_ELECTRON = process.env.SEDIMAN_MODE === 'electron';

export function setProjectManager(pm: ProjectManager): void {
  projectManager = pm;
  setInterventionProjectManager(pm);
  // Also set browser controller in screenshot handler if available
  if (browserController) {
    setBrowserController(browserController);
  }
}

// Local intervention callback setter for Promise-based waiting
export function setInterventionCallback(cb: (message: string, id: number) => void): void {
  onInterventionRequested = cb;
}

// Local resolve function for Promise-based waiting
export function resolveInterventionLocal(result: string): boolean {
  if (!interventionPromise) return false;
  interventionPromise.resolve(result);
  interventionPromise = null;
  return true;
}

async function ensurePage(ctrl: BrowserController): Promise<boolean> {
  const session = ctrl.getSession();

  // If session already started, we're good
  if (session?.isStarted) {
    const ctx = session.context;
    if (!ctx) return false;
    if (ctx.pages().length === 0) {
      await ctx.newPage();
    }
    return true;
  }

  // In Electron mode, DO NOT start Playwright browser
  // The shared <webview> is controlled via IPC
  if (RUNNING_IN_ELECTRON) {
    logger.info("ensurePage: Running in Electron mode - using shared <webview> (NOT Playwright)");

    // Don't start Playwright - the webview is already there
    // Just mark as ready
    logger.info("ensurePage: Shared webview available - NOT starting separate browser");
    return true;
  }

  // Not in Electron mode - start headless browser normally
  logger.info("ensurePage: Starting headless browser");
  await ctrl.start();

  const ctx = ctrl.getSession()?.context;
  if (!ctx) return false;
  if (ctx.pages().length === 0) {
    await ctx.newPage();
  }
  return true;
}


export function registerBrowserTools(toolBus: ToolBus, controller?: BrowserController): void {
  if (!browserController && controller) {
    browserController = controller;
    setBrowserController(controller);
  }
  if (!browserController) {
    throw new Error('BrowserController not provided.');
  }

  const executor: ToolExecutor = async (name, args) => {
    const ctrl = browserController!;
    try {
      let result: string;

      if (!await ensurePage(ctrl)) {
        return { success: false, output: '', error: 'Browser context not available' };
      }

      // In Electron mode, use IPC-based browser execution
      if (RUNNING_IN_ELECTRON) {
        logger.info(`[IPC-Browser] Executing: ${name}`);

        // Execute the command by calling the webviewController in the renderer
        // This will be done via a fetch call to a renderer endpoint with retry
        let lastError: Error | null = null;
        const maxRetries = 3;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            const response = await fetch('http://localhost:3001/api/browser/exec', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: name.replace('browser_', ''),
                ...args  // Flatten params to top level
              }),
              signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
              const data = await response.json();
              logger.info(`[IPC-Browser] Command executed: ${name} ->`, data);
              // Ensure result is always a string, not an object
              const rawResult = data.result || data.message || `Executed ${name}`;
              result = typeof rawResult === 'object' && rawResult !== null
                ? JSON.stringify(rawResult)
                : String(rawResult);
              return { success: true, output: result };
            } else {
              logger.error(`[IPC-Browser] Command failed: ${response.status}`);
              lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

              // For 5xx errors, retry immediately
              if (response.status >= 500 && attempt < maxRetries - 1) {
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                continue;
              }

              // For 4xx errors, don't retry
              break;
            }
          } catch (fetchError) {
            lastError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));

            // Retry on network errors with exponential backoff
            if (attempt < maxRetries - 1) {
              logger.warn({ attempt: attempt + 1, maxRetries, error: lastError.message }, "ipc_browser_retry");
              await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
              continue;
            }

            logger.error({ maxRetries, error: lastError.message }, "ipc_browser_all_attempts_failed");
            break;
          }
        }

        // All retries exhausted
        result = `Failed to execute ${name} after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`;
        return { success: false, output: '', error: result };
      }

      // Non-Electron mode: use Playwright-based controller (original code)
      switch (name) {
        case 'browser_navigate':
          result = await ctrl.navigate(args.url as string);
          storeScreenshot(args.url as string);
          // Capture updated snapshot after navigation
          await new Promise(r => setTimeout(r, 1000)); // Wait for page to settle
          await updateLatestSnapshot();
          break;

        case 'browser_click':
          result = await ctrl.click(args.refId as number);
          storeScreenshot();
          // Also capture updated snapshot for refId resolution
          await updateLatestSnapshot();
          break;

        case 'browser_type':
          result = await ctrl.typeText(args.refId as number, args.text as string, args.submit as boolean);
          storeScreenshot();
          break;

        case 'browser_snapshot': {
          const snap = await ctrl.snapshot();
          const out = snap.output || snap.elements.map(
            (el) => `[${el.refId}]<${el.tag}>${el.text ? ' ' + JSON.stringify(el.text.slice(0, 100)) : ''}`
          ).join('\n');
          result = `Current URL: ${snap.url}\nTitle: ${snap.title}\n\n${out}\n\n${snap.elements.length} interactive elements total.`;
          storeScreenshot(snap.url);
          // Update global latestSnapshot for refId resolution
          const { setLatestScreenshot } = await import('../../api/routes/browser.js');
          setLatestScreenshot({ elements: snap.elements }, snap.url);
          break;
        }

        case 'browser_scroll':
          result = await ctrl.scroll(args.direction as string, args.amount as number | undefined);
          storeScreenshot();
          break;

        case 'browser_press_key':
          result = await ctrl.pressKey(args.key as string);
          storeScreenshot();
          break;

        case 'browser_hover':
          result = await ctrl.hover(args.refId as number);
          storeScreenshot();
          break;

        case 'browser_select_option':
          result = await ctrl.selectOption(args.refId as number, args.value as string);
          storeScreenshot();
          break;

        case 'browser_go_back':
          result = await ctrl.goBack();
          storeScreenshot();
          break;

        case 'browser_go_forward':
          result = await ctrl.goForward();
          storeScreenshot();
          break;

        case 'browser_refresh':
          result = await ctrl.refresh();
          storeScreenshot();
          break;

        case 'browser_switch_tab':
          result = await ctrl.switchTab(args.index as number);
          storeScreenshot();
          break;

        case 'browser_list_tabs':
          result = await ctrl.listTabs();
          break;

        case 'browser_wait':
          result = await ctrl.waitForSelector(args.selector as string, args.timeout as number | undefined);
          break;

        case 'browser_extract_text':
          result = await ctrl.extractText();
          break;

        case 'browser_screenshot': {
          const shot = await ctrl.screenshot();
          if (shot && shot.length > 100) {
            const url = ctrl.getSession()?.context?.pages()[0]?.url() || '';
            setLatestScreenshot(shot, url);
          }
          result = shot ? `Screenshot captured (${shot.length} bytes)` : 'Screenshot failed';
          break;
        }

        case 'browser_drag_and_drop':
          result = await ctrl.dragAndDrop(args.sourceRefId as number, args.targetRefId as number);
          storeScreenshot();
          break;

        case 'browser_upload_file':
          result = await ctrl.uploadFile(args.refId as number, args.filePath as string);
          storeScreenshot();
          break;

        case 'browser_execute_script': {
          const scriptResult = await ctrl.evaluate(args.script as string);
          result = typeof scriptResult === 'object' ? JSON.stringify(scriptResult) : String(scriptResult);
          break;
        }

        case 'browser_close_tab':
          result = await ctrl.closeTab(args.index as number | undefined);
          break;

        case 'browser_extract_data': {
          // Extract specific structured data from the current page
          const query = (args.query as string) || '';
          const format = (args.format as string) || 'text';

          logger.info(`[browser_extract_data] Extracting data for query: "${query}", format: "${format}"`);

          try {
            // Get page text for extraction
            const pageText = await ctrl.extractText();
            logger.info(`[browser_extract_data] Page text length: ${pageText.length}, preview: ${pageText.slice(0, 100)}...`);

            // Try to extract based on format hint
            let extracted = '';
            let found = false;

            if (format === 'price') {
              // Extract price patterns: $123.45, USD 123.45, €123.45, etc.
              const pricePatterns = [
                /[\$€£¥]\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g,  // $123.45, $1,234.56
                /\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s?(?:USD|EUR|GBP|JPY|CNY)/gi, // 123.45 USD
              ];
              for (const pattern of pricePatterns) {
                const matches = pageText.match(pattern);
                if (matches && matches.length > 0) {
                  extracted = matches[0];
                  found = true;
                  logger.info(`[browser_extract_data] Found price: ${extracted}`);
                  break;
                }
              }
            } else if (format === 'date') {
              // Extract date patterns: June 15, 2027, 15/06/2027, etc.
              const datePatterns = [
                /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi,
                /\d{1,2}\/\d{1,2}\/\d{4}/g,
                /\d{4}-\d{2}-\d{2}/g,
              ];
              for (const pattern of datePatterns) {
                const matches = pageText.match(pattern);
                if (matches && matches.length > 0) {
                  extracted = matches[0];
                  found = true;
                  logger.info(`[browser_extract_data] Found date: ${extracted}`);
                  break;
                }
              }
            } else if (format === 'email') {
              const emailMatch = pageText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
              if (emailMatch && emailMatch.length > 0) {
                extracted = emailMatch[0];
                found = true;
                logger.info(`[browser_extract_data] Found email: ${extracted}`);
              }
            } else if (format === 'phone') {
              const phonePatterns = [
                /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // 123-456-7890
                /\b\+\d{1,3}\s?\d{3,}\s?\d{3,}\s?\d{4}\b/g, // +1 234 567 8900
              ];
              for (const pattern of phonePatterns) {
                const matches = pageText.match(pattern);
                if (matches && matches.length > 0) {
                  extracted = matches[0];
                  found = true;
                  logger.info(`[browser_extract_data] Found phone: ${extracted}`);
                  break;
                }
              }
            } else if (format === 'number') {
              const numberMatch = pageText.match(/\b\d+(?:,\d{3})*(?:\.\d+)?\b/g);
              if (numberMatch && numberMatch.length > 0) {
                extracted = numberMatch[0];
                found = true;
                logger.info(`[browser_extract_data] Found number: ${extracted}`);
              }
            } else {
              // Default text extraction - look for the query context in page text
              // Search for relevant sentences containing the query terms
              const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
              const sentences = pageText.split(/[.!?]+/).filter(s => s.length > 10);
              for (const sentence of sentences) {
                const lowerSentence = sentence.toLowerCase();
                const matchCount = queryWords.filter(w => lowerSentence.includes(w)).length;
                if (matchCount >= Math.min(2, queryWords.length)) {
                  extracted = sentence.trim();
                  found = true;
                  logger.info(`[browser_extract_data] Found text: ${extracted.slice(0, 100)}...`);
                  break;
                }
              }
            }

            if (found && extracted) {
              result = `Extracted: ${extracted}`;
            } else {
              // Fallback: return page text snippet around relevant keywords
              const relevantSnippet = pageText.split('\n').find(line =>
                query.toLowerCase().split(/\s+/).some((w: string) => w.length > 3 && line.toLowerCase().includes(w))
              );
              result = relevantSnippet?.trim() || `Could not extract data for: ${query}. Here's some page content: ${pageText.slice(0, 300)}...`;
              logger.info(`[browser_extract_data] Using fallback result`);
            }
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error(`[browser_extract_data] Error: ${errMsg}`);
            result = `Error extracting data: ${errMsg}. Please try using browser_snapshot to see page content and extract data manually.`;
          }
          break;
        }

        case 'browser_end':
          result = `Task completed: ${(args.summary as string) || 'Done'}`;
          break;

        case 'request_human_help': {
          const msg = (args.message as string) || 'Agent needs assistance';
          try {
            const helpShot = await ctrl.screenshot();
            if (helpShot) setLatestScreenshot(helpShot, ctrl.getSession()?.context?.pages()[0]?.url() || '');
          } catch {}

          const iid = ++pendingInterventionId;
          try {
            const userResp = await new Promise<string>((resolve) => {
              interventionPromise = { resolve, message: msg, id: iid };
              onInterventionRequested?.(msg, iid);
              setTimeout(() => { if (interventionPromise?.id === iid) resolve('timeout'); }, 120000);
            });
            result = userResp === 'timeout'
              ? 'Human intervention timed out after 2 minutes.'
              : `Human intervention completed: ${userResp}`;
          } catch {
            result = 'Human intervention cancelled';
          }
          interventionPromise = null;
          break;
        }

        default:
          return { success: false, output: '', error: `Unknown tool: ${name}` };
      }

      return { success: true, output: result };
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  for (const tool of ALL_BROWSER_TOOLS) {
    toolBus.register(tool, executor);
  }
}

export function getBrowserController(projectId?: string): BrowserController | null {
  if (projectId && projectManager) return projectManager.getBrowserController(projectId);
  return browserController;
}

export async function cleanupBrowserTools(): Promise<void> {
  if (browserController) { await browserController.stop(); browserController = null; }
  if (projectManager) { await projectManager.shutdown(); projectManager = null; }
}

export async function takeBrowserScreenshot(projectId?: string): Promise<string | null> {
  const controller = getBrowserController(projectId);
  if (!controller) return null;
  return controller.screenshot();
}

/**
 * Page change detection result
 */
export interface PageChangeResult {
  changed: boolean;
  changeType: 'navigation' | 'content' | 'none';
  reason: string;
}

/**
 * Detect if the page has changed between two snapshots
 * Used for multi-action batch execution - stops batch when page changes
 */
export async function detectPageChange(
  previousState: PageSnapshot | null,
  currentState: PageSnapshot | null
): Promise<PageChangeResult> {
  if (!previousState || !currentState) {
    return {
      changed: false,
      changeType: 'none',
      reason: 'No state comparison available'
    };
  }

  const config = (await import('../../core/config')).getConfig();
  const detectionMode = config.batchChangeDetection;

  // Check for navigation change (most significant)
  if (previousState.url !== currentState.url) {
    return {
      changed: true,
      changeType: 'navigation',
      reason: `URL changed from ${previousState.url} to ${currentState.url}`
    };
  }

  if (previousState.title !== currentState.title) {
    return {
      changed: true,
      changeType: 'navigation',
      reason: `Title changed from "${previousState.title}" to "${currentState.title}"`
    };
  }

  // Check for content change in strict mode
  if (detectionMode === 'strict') {
    // Element count change
    if (previousState.elements.length !== currentState.elements.length) {
      return {
        changed: true,
        changeType: 'content',
        reason: `Element count changed from ${previousState.elements.length} to ${currentState.elements.length}`
      };
    }

    // Check if any interactive elements changed (refId comparison)
    const prevElements = new Map(
      previousState.elements.map(el => [el.refId, { tag: el.tag, text: el.text }])
    );
    const currElements = new Map(
      currentState.elements.map(el => [el.refId, { tag: el.tag, text: el.text }])
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
  }

  // No significant change detected
  return {
    changed: false,
    changeType: 'none',
    reason: 'No significant page change detected'
  };
}

/**
 * Store current page state for change detection
 */
let lastPageState: PageSnapshot | null = null;

/**
 * Update the stored page state
 */
export function updatePageState(state: PageSnapshot): void {
  lastPageState = state;
}

/**
 * Get the stored page state
 */
export function getLastPageState(): PageSnapshot | null {
  return lastPageState;
}

/**
 * Clear the stored page state
 */
export function clearPageState(): void {
  lastPageState = null;
}

/**
 * Export intervention-related functions for other modules
 */
export { setInterventionCallback as setOnInterventionRequested };

export function hasPendingIntervention(): boolean {
  return interventionPromise !== null;
}

export function getPendingIntervention(): { message: string; id: number } | null {
  if (!interventionPromise) return null;
  return { message: interventionPromise.message, id: interventionPromise.id };
}

export { resolveInterventionLocal as resolveIntervention };
