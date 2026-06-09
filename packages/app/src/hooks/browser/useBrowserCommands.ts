/**
 * useBrowserCommands Hook
 * Handles browser command polling and execution for agent control
 */

import { useEffect, useRef, useCallback } from 'react';
import { BrowserCommand, BrowserSnapshot, CommandResult } from './types';

const API_BASE = 'http://localhost:3001/api/browser';

export function useBrowserCommands(
  isOpen: boolean,
  webviewRef: React.RefObject<HTMLWebViewElement | null>,
  onSnapshotUpdate: (snapshot: BrowserSnapshot) => void
) {
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);

  const sendResult = useCallback(async (commandId: string, result: CommandResult, error?: string) => {
    try {
      await fetch(`${API_BASE}/exec/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandId, result, error })
      });
      console.log('[BrowserCommands] Result sent for', commandId);
    } catch (err) {
      console.error('[BrowserCommands] Failed to send result:', err);
    }
  }, []);

  const executeCommand = useCallback(async (cmd: BrowserCommand, webview: HTMLWebViewElement): Promise<CommandResult> => {
    const { action, params, snapshot } = cmd;

    switch (action) {
      case 'navigate':
        return await executeNavigate(webview, params);
      case 'snapshot':
        return await executeSnapshot(webview, onSnapshotUpdate);
      case 'click':
        return await executeClick(webview, params, snapshot || null);
      case 'type':
        return await executeType(webview, params, snapshot || null, onSnapshotUpdate);
      case 'screenshot':
        return await executeScreenshot(webview);
      case 'wait':
        return await executeWait(webview, params);
      default:
        return { success: false, error: `Unknown action: ${action}` };
    }
  }, [onSnapshotUpdate]);

  const pollCommands = useCallback(async () => {
    try {
      pollCountRef.current++;
      const response = await fetch(`${API_BASE}/exec/poll`);
      if (!response.ok) {
        console.warn('[BrowserCommands] Poll failed:', response.status);
        return;
      }

      const data = await response.json();
      const commands: BrowserCommand[] = data.commands || [];

      if (commands.length > 0) {
        console.log('[BrowserCommands] Poll', pollCountRef.current, ': found', commands.length, 'commands');
      }

      const webview = webviewRef.current;
      if (!webview) {
        console.error('[BrowserCommands] Webview not ready');
        // Send error results for all commands
        await Promise.all(commands.map(cmd =>
          sendResult(cmd.id, { success: false }, 'Webview not ready')
        ));
        return;
      }

      for (const cmd of commands) {
        console.log('[BrowserCommands] Processing:', cmd.action, cmd.id);

        if (cmd.snapshot?.elements) {
          onSnapshotUpdate({ elements: cmd.snapshot.elements });
        }

        try {
          const result = await executeCommand(cmd, webview);
          await sendResult(cmd.id, result);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          await sendResult(cmd.id, { success: false }, errorMsg);
        }
      }
    } catch (err) {
      console.error('[BrowserCommands] Polling error:', err);
    }
  }, [webviewRef, onSnapshotUpdate, executeCommand, sendResult]);

  useEffect(() => {
    if (!isOpen) return;

    console.log('[BrowserCommands] Starting polling');
    const interval = setInterval(pollCommands, 100);
    pollIntervalRef.current = interval;

    return () => {
      console.log('[BrowserCommands] Clearing polling interval');
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isOpen, pollCommands]);
}

// ============================================================================
// Command Executors
// ============================================================================

async function executeNavigate(webview: HTMLWebViewElement, params: any): Promise<CommandResult> {
  const url = params?.url || params;
  console.log('[BrowserCommands] Navigate to:', url);

  webview.src = url;
  await new Promise(resolve => setTimeout(resolve, 500));

  return {
    success: true,
    output: `Navigated to ${url}`,
    url
  };
}

async function executeSnapshot(
  webview: HTMLWebViewElement,
  onSnapshotUpdate: (snapshot: BrowserSnapshot) => void
): Promise<CommandResult> {
  const snapshotJS = getSnapshotScript();
  const result = await webview.executeJavaScript(snapshotJS);

  if (result?.elements) {
    onSnapshotUpdate({ elements: result.elements });
    console.log('[BrowserCommands] Updated snapshot with', result.elements.length, 'elements');
  }

  return result;
}

async function executeClick(
  webview: HTMLWebViewElement,
  params: any,
  snapshot: BrowserSnapshot | null
): Promise<CommandResult> {
  const refId = params?.refId || params;

  if (!snapshot || refId === undefined) {
    return {
      success: false,
      error: `Cannot find element with refId ${refId} - need snapshot first`
    };
  }

  const element = snapshot.elements.find(el => el.refId === refId);
  if (!element) {
    return {
      success: false,
      error: `Element with refId ${refId} not found in snapshot`
    };
  }

  const clickJS = getClickScript(element.x, element.y);
  const result = await webview.executeJavaScript(clickJS);

  return result;
}

async function executeType(
  webview: HTMLWebViewElement,
  params: any,
  snapshot: BrowserSnapshot | null,
  onSnapshotUpdate: (snapshot: BrowserSnapshot) => void
): Promise<CommandResult> {
  const text = params?.text || params;
  const refId = params?.refId;
  const submit = params?.submit || false;

  if (!snapshot || refId === undefined) {
    return {
      success: false,
      error: `Cannot find element with refId ${refId} - need snapshot first`
    };
  }

  const element = snapshot.elements.find(el => el.refId === refId);
  if (!element) {
    return {
      success: false,
      error: `Element with refId ${refId} not found in snapshot`
    };
  }

  const typeJS = getTypeScript(element, text, submit);
  const result = await webview.executeJavaScript(typeJS);

  // Update snapshot after typing
  if (result?.success) {
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      const updateScript = getSnapshotScript();
      const snapshotResult = await webview.executeJavaScript(updateScript);
      if (snapshotResult?.elements) {
        onSnapshotUpdate({ elements: snapshotResult.elements });
      }
    } catch (e) {
      console.warn('[BrowserCommands] Failed to update snapshot:', e);
    }
  }

  return result;
}

async function executeScreenshot(webview: HTMLWebViewElement): Promise<CommandResult> {
  const screenshotJS = `
    (async () => {
      try {
        const html = document.documentElement.outerHTML;
        const url = window.location.href;
        const title = document.title;
        return {
          success: true,
          url,
          title,
          htmlLength: html.length,
          message: 'Page captured for analysis'
        };
      } catch (e) {
        return {
          success: false,
          error: e.message
        };
      }
    })()
  `;
  return await webview.executeJavaScript(screenshotJS);
}

async function executeWait(webview: HTMLWebViewElement, params: any): Promise<CommandResult> {
  const waitJS = `
    (async () => {
      const startTime = Date.now();
      const timeout = ${params?.timeout || 10000};
      const selector = '${params?.selector || ''}';
      while (Date.now() - startTime < timeout) {
        const element = document.querySelector(selector);
        if (element) return { success: true, found: true };
        await new Promise(r => setTimeout(r, 100));
      }
      return { success: false, found: false };
    })()
  `;
  return await webview.executeJavaScript(waitJS);
}

// ============================================================================
// JavaScript Templates
// ============================================================================

function getSnapshotScript(): string {
  return `
    (async () => {
      console.log('[SnapshotJS] Starting capture');
      console.log('[SnapshotJS] Page URL:', window.location.href);
      console.log('[SnapshotJS] Title:', document.title);

      const selector = 'button, a, input, textarea, select, [onclick], [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
      const interactive = document.querySelectorAll(selector);
      console.log('[SnapshotJS] Found', interactive.length, 'interactive elements');

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

      console.log('[SnapshotJS] Visible elements captured:', results.length);

      const out = results.map(
        (el) => '[' + el.refId + ']<' + el.tag + (el.type ? '[type=' + el.type + ']' : '') + '>' + (el.text ? ' ' + JSON.stringify(el.text.slice(0, 100)) : '')
      ).join('\\\\n');

      return {
        success: true,
        output: 'Current URL: ' + window.location.href + '\\\\nTitle: ' + document.title + '\\\\n\\\\n' + out + '\\\\n\\\\n' + results.length + ' interactive elements total.',
        elements: results,
        url: window.location.href,
        title: document.title
      };
    })()
  `;
}

function getClickScript(x: number, y: number): string {
  return `
    (async () => {
      const x = ${x};
      const y = ${y};
      console.log('[ClickJS] Looking for element at coordinates:', x, y);
      const element = document.elementFromPoint(x, y);
      console.log('[ClickJS] Found element:', element ? element.tagName : 'none');
      if (element) {
        element.click();
        return {
          success: true,
          output: 'Clicked element at (' + x + ', ' + y + ')',
          tagName: element.tagName
        };
      }
      return {
        success: false,
        error: 'No element at point'
      };
    })()
  `;
}

function getTypeScript(element: any, text: string, submit: boolean): string {
  const escapedText = JSON.stringify(text);
  const submitStr = String(submit === true);
  const elementTag = String(element.tag);
  const elementType = String(element.type || '');
  const elementText = String(element.text || '');
  const targetX = Number(element.x) || 0;
  const targetY = Number(element.y) || 0;

  return `
    (async () => {
      console.log('[TypeJS] Page URL:', window.location.href);
      console.log('[TypeJS] Target coordinates:', ${targetX}, ${targetY});
      console.log('[TypeJS] Target tag:', ${JSON.stringify(elementTag)});
      console.log('[TypeJS] Target type:', ${JSON.stringify(elementType)});
      console.log('[TypeJS] Target text:', ${JSON.stringify(elementText)});

      let el = null;
      let strategy = '';

      // Strategy 1: Try coordinates first
      el = document.elementFromPoint(${targetX}, ${targetY});
      if (el) {
        strategy = 'coordinates';
        console.log('[TypeJS] Found element via coordinates:', el.tagName, el.type);
      }

      // Strategy 2: If coordinates fail, search by attributes
      if (!el) {
        console.log('[TypeJS] Coordinates failed, searching by attributes...');

        let selector = '${elementTag}';
        if ('${elementType}' && '${elementType}' !== '') {
          selector += '[type="${elementType}"]';
        }

        const candidates = Array.from(document.querySelectorAll(selector));
        console.log('[TypeJS] Found', candidates.length, 'candidates matching', selector);

        const visible = candidates.filter(elem => {
          const rect = elem.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        console.log('[TypeJS] Visible candidates:', visible.length);

        if ('${elementText}' && '${elementText}' !== '') {
          const targetText = '${elementText}'.toLowerCase();
          el = visible.find(e => {
            const txt = (e.textContent || e.placeholder || e.value || '').toLowerCase();
            return txt.includes(targetText);
          });
          if (el) {
            strategy = 'text-match';
            console.log('[TypeJS] Found element via text match:', el.tagName);
          }
        }

        if (!el && visible.length > 0) {
          el = visible[0];
          strategy = 'first-visible';
          console.log('[TypeJS] Using first visible element:', el.tagName);
        }
      }

      if (el) {
        console.log('[TypeJS] Using strategy:', strategy);
        console.log('[TypeJS] Element:', el.tagName, el.type);

        el.focus();
        el.click();

        if (el.value !== undefined) {
          el.value = '';
        }

        const text = ${escapedText};
        console.log('[TypeJS] Typing:', text);

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          el.value = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
          for (let i = 0; i < text.length; i++) {
            if (el.value !== undefined) {
              el.value += text[i];
            }
            el.dispatchEvent(new Event('input', { bubbles: true }));
            await new Promise(r => setTimeout(r, 10));
          }
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (${submitStr}) {
          console.log('[TypeJS] Pressing Enter');
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
          el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', bubbles: true, cancelable: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
        }

        return {
          success: true,
          output: 'Typed "' + text + '" into ' + el.tagName + ' using strategy: ' + strategy,
          strategy: strategy,
          tagName: el.tagName
        };
      }

      console.error('[TypeJS] Element not found - all strategies failed');
      return {
        success: false,
        error: 'Element not found - tried coordinates, text match, and first visible'
      };
    })()
  `;
}
