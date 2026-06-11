/**
 * Browser Service - Handles IPC communication between webview and agent
 * Provides real-time browser state synchronization and context sharing
 */

import { EventEmitter } from '@/utils/EventEmitter';

// Browser state types
export interface BrowserState {
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isActive: boolean;
  lastError: string | null;
}

export interface BrowserContext {
  url: string;
  title: string;
  cookies: Record<string, string>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  screenshot?: string;
}

export interface BrowserEvent {
  type: 'navigate' | 'load' | 'error' | 'console' | 'screenshot' | 'dom-ready';
  timestamp: number;
  data: unknown;
}

export interface BrowserCommand {
  id: string;
  action: string;
  params: Record<string, any>;
  timestamp: number;
  // Note: Backend stores parameters inside params object, not flattened to top level
  url?: string;
  refId?: number;
  text?: string;
  direction?: string;
  amount?: number;
  key?: string;
  selector?: string;
  timeout?: number;
  submit?: boolean;
}

class BrowserService extends EventEmitter {
  private currentState: BrowserState = {
    url: '',
    title: '',
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
    isActive: false,
    lastError: null,
  };

  private webviewRef: HTMLWebViewElement | null = null;
  private eventHistory: BrowserEvent[] = [];
  private maxHistorySize = 100;
  private isWebviewRegistered = false;
  private pendingCommands: BrowserCommand[] = [];
  private isPollingCommands = false;

  constructor() {
    super();
    this.setupEventListeners();
    this.startCommandPolling();
  }

  /**
   * Register and initialize the webview element
   */
  registerWebview(webview: HTMLWebViewElement): void {
    // Prevent duplicate registrations
    if (this.isWebviewRegistered && this.webviewRef === webview) {
      return;
    }

    this.webviewRef = webview;
    this.setupWebviewListeners(webview);
    this.isWebviewRegistered = true;
    // console.log('[BrowserService] Webview registered');
  }

  /**
   * Start polling for pending browser commands from backend
   */
  private startCommandPolling(): void {
    if (this.isPollingCommands) return;
    this.isPollingCommands = true;

    // Poll every 2000ms for pending commands (2 seconds - reduce noise)
    // Use non-blocking approach to prevent UI freezing
    setInterval(() => {
      // Don't use await inside setInterval to prevent blocking
      fetch('http://localhost:3001/api/browser/pending-commands')
        .then(response => {
          if (response.ok) {
            return response.json();
          }
          throw new Error('Poll failed');
        })
        .then(data => {
          if (data.commands && data.commands.length > 0) {
            // Execute commands without blocking
            this.executeCommands(data.commands).catch(err => {
              // Silent error handling to prevent console spam
            });
          }
        })
        .catch(err => {
          // Ignore polling errors silently
        });
    }, 2000);
  }

  /**
   * Execute browser commands via Electron IPC
   */
  private async executeCommands(commands: BrowserCommand[]): Promise<void> {
    for (const command of commands) {
      try {
        let result: any = null;
        let error: string | null = null;

        switch (command.action) {
          case 'navigate':
            // Navigate directly using webview ref
            if (this.webviewRef) {
              // URL extraction - backend stores params inside command.params object
              let url = command.params?.url || (command as any).params?.url || command.url;

              if (!url) {
                console.error('[BrowserService] No URL found in command. Full command:', JSON.stringify(command, null, 2));
                console.error('[BrowserService] Command keys:', Object.keys(command));
                console.error('[BrowserService] Has params?', !!command.params, 'Params keys:', command.params ? Object.keys(command.params) : 'N/A');
              }

              if (url) {
                // For external URLs, emit server-navigate event and update state
                // The backend will handle HTTP proxy and return content separately
                console.log('[BrowserService] Navigate to:', url);
                this.emit('server-navigate', { url });
                this.updateState({ url, isLoading: false });

                // Don't try to load external URLs in webview (causes ERR_ABORTED)
                // The backend will provide content via HTTP proxy

                result = { success: true, url };
                await this.sendCommandResult(command.id, result, null);
              } else {
                error = 'No URL found in command';
                await this.sendCommandResult(command.id, null, error);
              }
            } else {
              error = 'No webview registered for navigation';
              await this.sendCommandResult(command.id, null, error);
            }
            break;
          case 'click':
            // Execute click directly on webview
            if (this.webviewRef) {
              const refId = command.params?.refId || command.refId;
              const clickResult = await this.webviewRef.executeJavaScript(`
                (async () => {
                  const refId = ${refId};
                  const interactive = document.querySelectorAll('button, a, input, textarea, select, [onclick], [role="button"]');
                  if (refId >= 0 && refId < interactive.length) {
                    const element = interactive[refId];
                    element.click();
                    return { success: true, tagName: element.tagName, refId };
                  }
                  return { success: false, error: 'Invalid refId: ' + refId };
                })()
              `);
              result = clickResult;
              // Send result back to backend
              await this.sendCommandResult(command.id, result, null);
            }
            break;
          case 'type':
            // Execute type directly on webview
            if (this.webviewRef) {
              const refId = command.params?.refId || command.refId;
              const text = command.params?.text || command.text;
              if (refId !== undefined) {
                // console.log('[BrowserService] Typing into refId:', refId, 'text:', text);
                const typeResult = await this.webviewRef.executeJavaScript(`
                  (async () => {
                    const refId = ${refId};
                    const interactive = document.querySelectorAll('button, a, input, textarea, select, [onclick], [role="button"]');
                    if (refId >= 0 && refId < interactive.length) {
                      const element = interactive[refId];
                      const text = ${JSON.stringify(text)};
                    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                      element.value = text;
                      element.dispatchEvent(new Event('input', { bubbles: true }));
                      element.dispatchEvent(new Event('change', { bubbles: true }));
                      return { success: true, refId, value: text };
                    } else {
                      // For non-input elements, try to focus and type
                      element.focus();
                      return { success: false, error: 'Element is not an input field', refId };
                    }
                  }
                  return { success: false, error: 'Invalid refId: ' + refId };
                })()
              `);
              result = typeResult;
              // console.log('[BrowserService] Type result:', result);
              // Send result back to backend
              await this.sendCommandResult(command.id, result, null);
              }
            } else {
              error = 'No refId provided for type command';
              await this.sendCommandResult(command.id, null, error);
            }
            break;
          case 'snapshot':
            // Execute snapshot directly on webview
            if (this.webviewRef) {
              // console.log('[BrowserService] Taking snapshot...');
              // console.log('[BrowserService] Current webview URL:', this.webviewRef.src);
              const snapResult = await this.webviewRef.executeJavaScript(`
                (async () => {
                  try {
                    // console.log('[SnapshotJS] Starting capture');
                    // console.log('[SnapshotJS] Page URL:', window.location.href);
                    // console.log('[SnapshotJS] Title:', document.title);

                    const interactive = document.querySelectorAll('button, a, input, textarea, select, [onclick], [role="button"]');
                    // console.log('[SnapshotJS] Found', interactive.length, 'interactive elements');

                    const results = [];
                    interactive.forEach((el, idx) => {
                      const rect = el.getBoundingClientRect();

                      if (rect.width === 0 || rect.height === 0) return;

                      let text = '';
                      if (el.placeholder) {
                        text = el.placeholder;
                      } else if (el.value && el.tagName === 'INPUT') {
                        text = el.value;
                      } else if (el.textContent) {
                        text = el.textContent.slice(0, 50);
                      }

                      text = text.trim().slice(0, 100);

                      results.push({
                        refId: idx,
                        tag: el.tagName.toLowerCase(),
                        type: el.type || '',
                        text: text,
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2,
                        width: rect.width,
                        height: rect.height,
                        visible: rect.width > 0 && rect.height > 0
                      });
                    });

                    // console.log('[SnapshotJS] Visible elements captured:', results.length);

                    const out = results.map(
                      (el) => '[' + el.refId + ']<' + el.tag + (el.type ? '[type=' + el.type + ']' : '') + '>' + (el.text ? ' ' + JSON.stringify(el.text.slice(0, 100)) : '')
                    ).join('\\n');

                    return {
                      success: true,
                      output: 'Current URL: ' + window.location.href + '\\n\\nTitle: ' + document.title + '\\n\\n' + out + '\\n\\n' + results.length + ' interactive elements total.',
                      elements: results,
                      url: window.location.href,
                      title: document.title
                    };
                  } catch (e) {
                    // console.error('[SnapshotJS] Error:', e);
                    return {
                      success: false,
                      error: e.message || 'Snapshot failed',
                      url: window.location.href,
                      title: document.title,
                      elements: []
                    };
                  }
                })()
              `);
              // console.log('[BrowserService] Snapshot result:', snapResult?.elements?.length || 0, 'elements');
              // console.log('[BrowserService] Snapshot URL:', snapResult?.url);
              result = snapResult;
              this.emit('snapshot', result);
              // Send result back to backend
              await this.sendCommandResult(command.id, result, null);
            }
            break;
          case 'screenshot':
            // Execute screenshot directly on webview
            if (this.webviewRef) {
              // console.log('[BrowserService] Taking screenshot...');
              try {
                // Use takeScreenshot method which handles capturePage and JavaScript fallback
                const screenshotDataUrl = await this.takeScreenshot();
                if (screenshotDataUrl && typeof screenshotDataUrl === 'string') {
                  // Remove data URL prefix to get raw base64
                  const base64Data = screenshotDataUrl.replace(/^data:image\/[a-z]+;base64,/i, '');
                  const url = this.webviewRef.getURL() || '';
                  const title = await this.webviewRef.executeJavaScript('document.title') || '';

                  result = {
                    success: true,
                    screenshot: base64Data,
                    url,
                    title,
                    size: base64Data.length
                  };
                  // console.log('[BrowserService] Screenshot captured:', base64Data.length, 'bytes for', url);

                  // Send screenshot to backend state service
                  try {
                    await fetch('http://localhost:3001/api/browser/screenshot', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        screenshot: base64Data,
                        url,
                        title
                      })
                    });
                    // console.log('[BrowserService] Screenshot sent to backend');
                  } catch (err) {
                    // console.error('[BrowserService] Failed to send screenshot to backend:', err);
                  }

                  this.emit('screenshot', result);
                  await this.sendCommandResult(command.id, result, null);
                } else {
                  error = 'Screenshot capture failed - no data returned';
                  // console.error('[BrowserService] Screenshot failed - no data');
                  await this.sendCommandResult(command.id, null, error);
                }
              } catch (err) {
                error = err instanceof Error ? err.message : String(err);
                // console.error('[BrowserService] Screenshot failed:', err);
                await this.sendCommandResult(command.id, null, error);
              }
            }
            break;
          case 'refresh':
            // Execute refresh directly on webview
            if (this.webviewRef) {
              // console.log('[BrowserService] Refreshing webview...');
              this.webviewRef.reload();
              result = { success: true };
              await this.sendCommandResult(command.id, result, null);
            }
            break;
          case 'extract_data':
          case 'extract_text':
            // Execute data/text extraction directly on webview
            if (this.webviewRef) {
              const textResult = await this.webviewRef.executeJavaScript(`
                (async () => {
                  const body = document.body;
                  if (!body) return "";
                  const clone = body.cloneNode(true);
                  clone.querySelectorAll("script, style, noscript, svg, path").forEach((el) => el.remove());
                  const text = (clone.innerText || "").replace(/\\s+/g, " ").trim();
                  return text;
                })()
              `);
              result = { text: textResult, success: true };
              await this.sendCommandResult(command.id, result, null);
            } else {
              error = 'No webview available for extraction';
              await this.sendCommandResult(command.id, null, error);
            }
            break;
          case 'execute_script':
            // Execute custom JavaScript directly on webview
            if (this.webviewRef && command.params?.script) {
              // console.log('[BrowserService] Executing script...');
              const scriptResult = await this.webviewRef.executeJavaScript(`
                (async () => {
                  try {
                    const result = eval(${JSON.stringify(command.params.script)});
                    return { success: true, result };
                  } catch (error) {
                    return { success: false, error: error.message || String(error) };
                  }
                })()
              `);
              // console.log('[BrowserService] Script execution result:', scriptResult);
              result = scriptResult;
              await this.sendCommandResult(command.id, result, null);
            }
            break;
          case 'scroll':
            // Execute scroll directly on webview
            if (this.webviewRef) {
              const direction = command.params?.direction || 'down';
              const amount = command.params?.amount || 500;
              // console.log('[BrowserService] Scrolling...', direction, amount);
              const scrollResult = await this.webviewRef.executeJavaScript(`
                (async () => {
                  const delta = ${direction === 'up' ? -amount : amount};
                  window.scrollBy(0, delta);
                  return { success: true, scrollY: window.scrollY };
                })()
              `);
              result = scrollResult;
              await this.sendCommandResult(command.id, result, null);
            }
            break;
          case 'press_key':
            // Execute key press directly on webview
            if (this.webviewRef) {
              const key = command.params?.key || command.key;
              if (key) {
                // console.log('[BrowserService] Pressing key:', key);
                const keyResult = await this.webviewRef.executeJavaScript(`
                  (async () => {
                    const keyEvent = new KeyboardEvent('keydown', {
                      key: '${key}',
                    code: '${command.params.key}',
                    bubbles: true
                  });
                  document.activeElement?.dispatchEvent(keyEvent);
                  return { success: true, key: '${command.params.key}' };
                })()
              `);
                result = keyResult;
                await this.sendCommandResult(command.id, result, null);
              }
            }
            break;
          case 'hover':
            // Execute hover directly on webview
            if (this.webviewRef) {
              const refId = command.params?.refId || command.refId;
              // console.log('[BrowserService] Hovering refId:', refId);
              const hoverResult = await this.webviewRef.executeJavaScript(`
                (async () => {
                  const refId = ${refId};
                  const interactive = document.querySelectorAll('button, a, input, textarea, select, [onclick], [role="button"]');
                  if (refId >= 0 && refId < interactive.length) {
                    const element = interactive[refId];
                    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                    return { success: true, tagName: element.tagName, refId };
                  }
                  return { success: false, error: 'Invalid refId: ' + refId };
                })()
              `);
              result = hoverResult;
              await this.sendCommandResult(command.id, result, null);
            }
            break;
          case 'wait':
            // Execute wait for selector directly on webview
            if (this.webviewRef) {
              const selector = command.params?.selector || command.selector;
              const timeout = command.params?.timeout || command.timeout || 10000;
              if (selector) {
                // console.log('[BrowserService] Waiting for selector:', selector);
                const waitResult = await this.webviewRef.executeJavaScript(`
                  (async () => {
                    const selector = '${selector}';
                  const timeout = ${timeout};
                  const startTime = Date.now();
                  while (Date.now() - startTime < timeout) {
                    const element = document.querySelector(selector);
                    if (element && getComputedStyle(element).display !== 'none') {
                      return { success: true, selector, found: true };
                    }
                    await new Promise(resolve => setTimeout(resolve, 100));
                  }
                  return { success: false, selector, found: false, error: 'Timeout waiting for selector' };
                })()
              `);
                result = waitResult;
                await this.sendCommandResult(command.id, result, null);
              } else {
                error = 'No selector provided for wait command';
                await this.sendCommandResult(command.id, null, error);
              }
            }
            break;
        }
      } catch (err) {
        // console.error('[BrowserService] Command execution error:', err);
        // Try to send error result if we have command ID
        const commandId = command.id;
        if (commandId) {
          await this.sendCommandResult(commandId, null, err instanceof Error ? err.message : String(err));
        }
      }
    }
  }

  /**
   * Send command execution result back to backend
   */
  private async sendCommandResult(commandId: string, result: any, error: string | null): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/browser/exec/result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commandId,
          result,
          error
        })
      });
      if (response.ok) {
        // console.log('[BrowserService] Result sent for command:', commandId);
      } else {
        // console.error('[BrowserService] Failed to send result:', response.status);
      }
    } catch (err) {
      // console.error('[BrowserService] Error sending result:', err);
    }
  }

  /**
   * Setup webview event listeners for IPC communication
   */
  private setupWebviewListeners(webview: HTMLWebViewElement): void {
    // Navigation events
    webview.addEventListener('will-navigate', (event: Event) => {
      const e = event as CustomEvent;
      this.handleNavigate(e.detail as string);
    });

    webview.addEventListener('did-start-loading', () => {
      this.updateState({ isLoading: true });
      this.recordEvent('load', { status: 'start' });
    });

    webview.addEventListener('did-stop-loading', () => {
      this.updateState({ isLoading: false });
      this.recordEvent('load', { status: 'complete' });
    });

    webview.addEventListener('did-finish-load', () => {
      this.updateState({ isLoading: false });
      this.recordEvent('load', { status: 'finished' });
      this.emit('browser-ready', this.currentState);
    });

    webview.addEventListener('dom-ready', () => {
      // Silently record event without logging
      this.recordEvent('dom-ready', {});
      this.extractPageContext();
    });

    // Console messages for debugging
    webview.addEventListener('console-message', (event: Event) => {
      const e = event as CustomEvent;
      this.recordEvent('console', {
        level: e.detail?.level,
        message: e.detail?.message,
        line: e.detail?.line,
        sourceId: e.detail?.sourceId,
      });
    });

    // Error handling
    webview.addEventListener('did-fail-load', (event: Event) => {
      const e = event as CustomEvent;
      this.handleError(e.detail);
    });

    // Page title changes
    webview.addEventListener('page-title-updated', (event: Event) => {
      const e = event as CustomEvent;
      this.updateState({ title: e.detail?.title || '' });
    });
  }

  /**
   * Handle navigation events
   */
  private handleNavigate(url: string): void {
    this.updateState({ url });
    this.recordEvent('navigate', { url });
    this.emit('browser-navigate', { url, state: this.currentState });

    // Notify agent of navigation for context awareness
    this.notifyAgentNavigation(url);
  }

  /**
   * Handle browser errors
   */
  private handleError(detail: unknown): void {
    const error = detail as { errorCode: number; errorDescription: string; validatedURL: string };

    // Handle missing error detail gracefully
    if (!error || typeof error !== 'object') {
      this.updateState({
        isLoading: false,
        lastError: 'Unknown browser error',
      });
      return;
    }

    // ERR_ABORTED (-3) is expected for external URLs - not a real error
    // This happens when webview can't load external URLs due to security restrictions
    if (error.errorCode === -3) {
      // Silently ignore - this is expected behavior
      this.updateState({ isLoading: false });
      return;
    }

    const errorMessage = error.errorDescription
      ? `${error.errorCode}: ${error.errorDescription}`
      : 'Browser navigation failed';

    this.updateState({
      isLoading: false,
      lastError: errorMessage,
    });

    this.recordEvent('error', {
      code: error.errorCode || 'UNKNOWN',
      description: error.errorDescription || 'Unknown error',
      url: error.validatedURL || '',
    });

    this.emit('browser-error', { error: errorMessage, url: error.validatedURL || '' });
  }

  /**
   * Update browser state and emit events
   */
  private updateState(updates: Partial<BrowserState>): void {
    const oldState = { ...this.currentState };
    this.currentState = { ...this.currentState, ...updates };
    this.emit('browser-state-change', { oldState, newState: this.currentState });
  }

  /**
   * Record event for history tracking
   */
  private recordEvent(type: BrowserEvent['type'], data: unknown): void {
    const event: BrowserEvent = {
      type,
      timestamp: Date.now(),
      data,
    };

    this.eventHistory.push(event);

    // Maintain max history size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    this.emit('browser-event', event);
  }

  /**
   * Extract page context for agent awareness
   */
  private async extractPageContext(): Promise<void> {
    if (!this.webviewRef) return;

    // Only extract context if we have a real URL loaded (not about:blank)
    const currentUrl = this.webviewRef.getURL() || '';
    if (currentUrl === 'about:blank' || currentUrl === '' || currentUrl.startsWith('data:')) {
      // Silently skip - no logging needed
      return;
    }

    try {
      const context = await this.webviewRef.executeJavaScript(`
        (async () => {
          return {
            url: window.location.href,
            title: document.title,
            // Sample of localStorage (not full dump for privacy)
            hasLocalStorage: Object.keys(localStorage).length > 0,
            localStorageKeys: Object.keys(localStorage).slice(0, 10),
            // Sample of sessionStorage
            hasSessionStorage: Object.keys(sessionStorage).length > 0,
            sessionStorageKeys: Object.keys(sessionStorage).slice(0, 10),
            // Basic page info
            hasForms: document.forms.length > 0,
            formCount: document.forms.length,
            hasInputs: document.querySelectorAll('input, textarea').length > 0,
            inputCount: document.querySelectorAll('input, textarea').length,
            // Links
            linkCount: document.links.length,
            // Basic meta info
            description: document.querySelector('meta[name="description"]')?.content || '',
          };
        })()
      `);

      this.emit('browser-context-extracted', context);
      // console.log('[BrowserService] Context extracted:', context);
    } catch (error) {
      // console.log('[BrowserService] Context extraction failed (non-critical):', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Notify agent of navigation for context awareness
   */
  private notifyAgentNavigation(url: string): void {
    // This will be used to keep the agent aware of browser state
    this.emit('agent-notify-navigation', {
      url,
      timestamp: Date.now(),
      state: this.currentState
    });
  }

  /**
   * Navigate to a URL
   */
  navigate(url: string): void {
    if (this.webviewRef) {
      // console.log('[BrowserService] Navigating to:', url);
      this.webviewRef.src = url;
    } else {
      // console.error('[BrowserService] No webview registered');
    }
  }

  /**
   * Called when server-side browser navigates to a URL
   * This only tracks the URL for display purposes, doesn't try to load in webview
   * (Electron webview cannot load external URLs due to security restrictions)
   */
  serverNavigated(url: string): void {
    // console.log('[BrowserService] Server navigated to:', url);
    // Only update state, don't try to navigate webview (security restrictions)
    this.updateState({ url, isLoading: false });
    // Emit event for UI to update display
    this.emit('server-navigate', { url });
  }

  /**
   * Navigate back
   */
  goBack(): void {
    if (this.webviewRef && this.currentState.canGoBack) {
      this.webviewRef.goBack();
    }
  }

  /**
   * Navigate forward
   */
  goForward(): void {
    if (this.webviewRef && this.currentState.canGoForward) {
      this.webviewRef.goForward();
    }
  }

  /**
   * Reload current page
   */
  reload(): void {
    if (this.webviewRef) {
      this.webviewRef.reload();
    }
  }

  /**
   * Take a screenshot of the current page
   * Uses JavaScript-based capture for Electron webview compatibility
   */
  async takeScreenshot(): Promise<string | undefined> {
    if (!this.webviewRef) return undefined;

    try {
      // Use native webview capturePage API first (most reliable)
      const webview = this.webviewRef as any;
      try {
        const image = await webview.capturePage();
        if (image && typeof image.toDataURL === 'function') {
          return image.toDataURL();
        }
      } catch (e) {
        // console.warn('[BrowserService] capturePage failed, trying JavaScript fallback:', e);
      }

      // Fallback: JavaScript-based capture (limited but works)
      const screenshot = await this.webviewRef.executeJavaScript(`
        (async () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;

            // Set canvas to viewport size
            const width = window.innerWidth || 1280;
            const height = window.innerHeight || 720;
            canvas.width = width;
            canvas.height = height;

            // Fill white background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);

            // Try to capture visible content
            // Note: This is a simplified capture and may not capture all content perfectly
            const html = document.documentElement;
            const body = document.body;

            if (body) {
              // Capture body content
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, width, height);

              // Simple text capture (fallback)
              const text = body.innerText || body.textContent || '';
              ctx.fillStyle = '#000000';
              ctx.font = '12px monospace';
              const lines = text.split('\\n').slice(0, 50);
              lines.forEach((line, i) => {
                ctx.fillText(line.substring(0, 100), 10, 20 + i * 15);
              });
            }

            return canvas.toDataURL('image/png');
          } catch (e) {
            // console.error('Screenshot JavaScript failed:', e);
            return null;
          }
        })()
      `);

      if (screenshot && typeof screenshot === 'string') {
        return screenshot;
      }

      return undefined;
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Execute JavaScript in the browser context
   */
  async executeScript<T>(script: string): Promise<T | undefined> {
    if (!this.webviewRef) return undefined;

    try {
      const result = await this.webviewRef.executeJavaScript(script);
      return result;
    } catch (error) {
      // console.error('[BrowserService] Script execution failed:', error);
      return undefined;
    }
  }

  /**
   * Get current browser state
   */
  getState(): BrowserState {
    return { ...this.currentState };
  }

  /**
   * Get event history
   */
  getEventHistory(limit?: number): BrowserEvent[] {
    if (limit) {
      return this.eventHistory.slice(-limit);
    }
    return [...this.eventHistory];
  }

  /**
   * Check if browser is ready for interaction
   */
  isReady(): boolean {
    return this.currentState.isActive && !this.currentState.isLoading;
  }

  /**
   * Setup additional event listeners
   */
  private setupEventListeners(): void {
    // Listen for agent requests for browser state
    this.on('agent-request-state', () => {
      this.emit('browser-state-response', this.currentState);
    });

    // Listen for agent requests for screenshots
    this.on('agent-request-screenshot', async () => {
      const screenshot = await this.takeScreenshot();
      this.emit('browser-screenshot-response', screenshot);
    });
  }

  /**
   * Activate browser session
   */
  activate(): void {
    this.updateState({ isActive: true });
    // console.log('[BrowserService] Browser activated');
  }

  /**
   * Deactivate browser session
   */
  deactivate(): void {
    this.updateState({ isActive: false, isLoading: false });
    // console.log('[BrowserService] Browser deactivated');
  }

  /**
   * Reset browser state
   */
  reset(): void {
    this.currentState = {
      url: '',
      title: '',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      isActive: false,
      lastError: null,
    };
    this.eventHistory = [];
    // console.log('[BrowserService] Browser state reset');
  }
}

// Singleton instance
export const browserService = new BrowserService();

// Type declaration for global window object
declare global {
  interface Window {
    browserService?: typeof browserService;
  }
}

// Make available globally for easy access
if (typeof window !== 'undefined') {
  window.browserService = browserService;
}
