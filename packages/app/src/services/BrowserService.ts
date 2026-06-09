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
  action: string;
  params: Record<string, any>;
  timestamp: number;
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
    console.log('[BrowserService] Webview registered');
  }

  /**
   * Start polling for pending browser commands from backend
   */
  private startCommandPolling(): void {
    if (this.isPollingCommands) return;
    this.isPollingCommands = true;

    // Poll every 500ms for pending commands
    setInterval(async () => {
      if (!this.isWebviewRegistered) return;

      try {
        const response = await fetch('http://localhost:3001/api/browser/pending-commands');
        if (response.ok) {
          const data = await response.json();
          if (data.commands && data.commands.length > 0) {
            console.log('[BrowserService] Received commands:', data.commands);
            await this.executeCommands(data.commands);
          }
        }
      } catch (err) {
        // Ignore polling errors
      }
    }, 500);
  }

  /**
   * Execute browser commands via Electron IPC
   */
  private async executeCommands(commands: BrowserCommand[]): Promise<void> {
    for (const command of commands) {
      try {
        console.log('[BrowserService] Executing:', command.action, command.params);
        console.log('[BrowserService] Full command:', JSON.stringify(command));

        let result: any = null;
        let error: string | null = null;

        switch (command.action) {
          case 'navigate':
            // Navigate directly using webview ref
            if (this.webviewRef) {
              const url = command.params?.url;
              console.log('[BrowserService] Navigating webview to:', url);
              if (url) {
                this.webviewRef.src = url;
                result = { success: true, url };
                // Wait for navigation to complete
                await new Promise(resolve => setTimeout(resolve, 2000));
              } else {
                error = 'No URL found in command';
                console.error('[BrowserService] No URL found in command');
              }
            } else {
              error = 'No webview registered for navigation';
              console.error('[BrowserService] No webview registered for navigation');
            }
            break;
          case 'click':
            // Execute click directly on webview
            if (this.webviewRef) {
              console.log('[BrowserService] Clicking at:', command.params.x, command.params.y);
              const clickResult = await this.webviewRef.executeJavaScript(`
                (async () => {
                  const element = document.elementFromPoint(${command.params.x}, ${command.params.y});
                  if (element) {
                    element.click();
                    return { success: true, tagName: element.tagName };
                  }
                  return { success: false, error: 'No element at point' };
                })()
              `);
              result = clickResult;
            }
            break;
          case 'type':
            // Execute type directly on webview
            if (this.webviewRef && command.params.selector) {
              console.log('[BrowserService] Typing into:', command.params.selector);
              const typeResult = await this.webviewRef.executeJavaScript(`
                (async () => {
                  const element = document.querySelector('${command.params.selector}');
                  if (element) {
                    element.value = '${command.params.text}';
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    return { success: true };
                  }
                  return { success: false, error: 'Element not found' };
                })()
              `);
              result = typeResult;
            }
            break;
          case 'snapshot':
            // Execute snapshot directly on webview
            if (this.webviewRef) {
              console.log('[BrowserService] Taking snapshot...');
              const snapResult = await this.webviewRef.executeJavaScript(`
                (async () => {
                  const interactive = document.querySelectorAll('button, a, input, textarea, select, [onclick], [role="button"]');
                  const results = [];
                  interactive.forEach((el, idx) => {
                    const rect = el.getBoundingClientRect();
                    results.push({
                      refId: idx,
                      tag: el.tagName.toLowerCase(),
                      type: el.type || '',
                      text: el.textContent?.slice(0, 50) || el.placeholder || '',
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 2
                    });
                  });
                  return {
                    success: true,
                    elements: results,
                    url: window.location.href,
                    title: document.title
                  };
                })()
              `);
              console.log('[BrowserService] Snapshot result:', snapResult);
              result = snapResult;
              this.emit('snapshot', result);
            }
            break;
          case 'screenshot':
            // Execute screenshot directly on webview
            if (this.webviewRef) {
              console.log('[BrowserService] Taking screenshot...');
              try {
                const shotResult = await this.webviewRef.executeJavaScript(`
                  (async () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = window.innerWidth;
                    canvas.height = window.innerHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    // Simple capture - in production use html2canvas
                    ctx.drawWindow(window, 0, 0, canvas.width, canvas.height, 'rgb(255,255,255)');
                    return canvas.toDataURL('image/png', 0.9);
                  })()
                `);
                console.log('[BrowserService] Screenshot result:', shotResult ? 'success' : 'failed');
                result = shotResult;
                this.emit('screenshot', result);
              } catch (err) {
                error = err instanceof Error ? err.message : String(err);
                console.error('[BrowserService] Screenshot failed:', err);
              }
            }
            break;
          case 'refresh':
            // Execute refresh directly on webview
            if (this.webviewRef) {
              console.log('[BrowserService] Refreshing webview...');
              this.webviewRef.reload();
              result = { success: true };
            }
            break;
        }

        // Send result back to backend
        const commandId = (command as any).id;
        if (commandId) {
          await this.sendCommandResult(commandId, result, error);
        } else {
          console.error('[BrowserService] Command missing ID field:', command);
        }
      } catch (err) {
        console.error('[BrowserService] Command execution error:', err);
        // Try to send error result if we have command ID
        const commandId = (command as any).id;
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
        console.log('[BrowserService] Result sent for command:', commandId);
      } else {
        console.error('[BrowserService] Failed to send result:', response.status);
      }
    } catch (err) {
      console.error('[BrowserService] Error sending result:', err);
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
      console.log('[BrowserService] Context extracted:', context);
    } catch (error) {
      console.log('[BrowserService] Context extraction failed (non-critical):', error instanceof Error ? error.message : String(error));
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
      console.log('[BrowserService] Navigating to:', url);
      this.webviewRef.src = url;
    } else {
      console.error('[BrowserService] No webview registered');
    }
  }

  /**
   * Called when server-side browser navigates to a URL
   * This only tracks the URL for display purposes, doesn't try to load in webview
   * (Electron webview cannot load external URLs due to security restrictions)
   */
  serverNavigated(url: string): void {
    console.log('[BrowserService] Server navigated to:', url);
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
   */
  async takeScreenshot(): Promise<string | undefined> {
    if (!this.webviewRef) return undefined;

    try {
      const screenshot = await this.webviewRef.executeJavaScript(`
        (async () => {
          // Use html2canvas or similar for better results
          // For now, basic canvas capture
          const canvas = document.createElement('canvas');
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
          const ctx = canvas.getContext('2d');

          // Capture the visible viewport
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Simple capture - in production use html2canvas
          ctx.drawWindow(window, 0, 0, canvas.width, canvas.height, 'rgb(255,255,255)');

          return canvas.toDataURL('image/png', 0.9);
        })()
      `);

      this.recordEvent('screenshot', { success: true });
      this.emit('browser-screenshot', screenshot);
      return screenshot;
    } catch (error) {
      console.error('[BrowserService] Screenshot failed:', error);
      this.recordEvent('screenshot', { success: false, error });
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
      console.error('[BrowserService] Script execution failed:', error);
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
    console.log('[BrowserService] Browser activated');
  }

  /**
   * Deactivate browser session
   */
  deactivate(): void {
    this.updateState({ isActive: false, isLoading: false });
    console.log('[BrowserService] Browser deactivated');
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
    console.log('[BrowserService] Browser state reset');
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
