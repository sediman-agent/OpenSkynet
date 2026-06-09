import { useEffect } from 'react';

export interface BrowserCommand {
  id: string;
  action: string;
  params?: Record<string, any>;
  url?: string;
  snapshot?: { elements: Array<any> };
}

export interface UseBrowserCommandPollingOptions {
  webviewRef: React.RefObject<HTMLWebViewElement | null>;
  isOpen: boolean;
  onSnapshotUpdate?: (snapshot: { elements: Array<any> }) => void;
  onUrlChange?: (url: string) => void;
  pollingInterval?: number;
}

export function useBrowserCommandPolling(options: UseBrowserCommandPollingOptions): void {
  const {
    webviewRef,
    isOpen,
    onSnapshotUpdate,
    onUrlChange,
    pollingInterval = 100
  } = options;

  useEffect(() => {
    if (!isOpen) return;

    console.log('[useBrowserCommandPolling] Starting command polling');
    let pollCount = 0;

    const pollCommands = async () => {
      try {
        pollCount++;
        const response = await fetch('http://localhost:3001/api/browser/exec/poll');
        if (!response.ok) {
          console.warn('[useBrowserCommandPolling] Poll failed:', response.status);
          return;
        }

        const data = await response.json();
        const commands: BrowserCommand[] = data.commands || [];

        if (commands.length > 0) {
          console.log('[useBrowserCommandPolling] Poll', pollCount, ': found', commands.length, 'commands');
        }

        for (const cmd of commands) {
          console.log('[useBrowserCommandPolling] Processing command:', cmd.action, cmd.id);

          if (cmd.snapshot && cmd.snapshot.elements && onSnapshotUpdate) {
            onSnapshotUpdate({ elements: cmd.snapshot.elements });
          }

          const webview = webviewRef.current;
          if (!webview) {
            console.error('[useBrowserCommandPolling] Webview not ready for command:', cmd.action);
            await fetch('http://localhost:3001/api/browser/exec/result', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                commandId: cmd.id,
                error: 'Webview not ready'
              })
            });
            continue;
          }

          let result: any;
          let error: string | undefined;

          try {
            result = await executeBrowserCommand(webview, cmd, onUrlChange);
          } catch (err) {
            error = err instanceof Error ? err.message : String(err);
          }

          // Send result back to server
          console.log('[useBrowserCommandPolling] Sending result for', cmd.id, ':', result ? 'success' : 'error', error);
          await fetch('http://localhost:3001/api/browser/exec/result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              commandId: cmd.id,
              result,
              error
            })
          });
          console.log('[useBrowserCommandPolling] Result sent for', cmd.id);
        }
      } catch (err) {
        console.error('[useBrowserCommandPolling] Command polling error:', err);
      }
    };

    const interval = setInterval(pollCommands, pollingInterval);

    return () => {
      console.log('[useBrowserCommandPolling] Clearing polling interval');
      clearInterval(interval);
    };
  }, [isOpen, webviewRef, onSnapshotUpdate, onUrlChange, pollingInterval]);
}

// Extracted command execution logic
async function executeBrowserCommand(
  webview: HTMLWebViewElement,
  cmd: BrowserCommand,
  onUrlChange?: (url: string) => void
): Promise<any> {
  switch (cmd.action) {
    case 'navigate': {
      const url = cmd.params?.url || cmd.url;
      console.log('[useBrowserCommandPolling] Navigate to:', url);

      if (webview) {
        webview.src = url;
      }

      // Trigger URL update callback
      if (onUrlChange) {
        onUrlChange(url);
      }

      // Wait for navigation to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        success: true,
        output: 'Navigated to ' + url,
        url: url
      };
    }

    case 'click': {
      const clickJS = generateClickJS(cmd);
      console.log('[useBrowserCommandPolling] Executing clickJS');
      const result = await webview.executeJavaScript(clickJS);
      console.log('[useBrowserCommandPolling] Click result:', result);

      // Update snapshot after clicking
      if (result && result.success) {
        await updateSnapshot(webview);
      }
      return result;
    }

    case 'type': {
      const typeJS = generateTypeJS(cmd);
      console.log('[useBrowserCommandPolling] Executing typeJS');
      const result = await webview.executeJavaScript(typeJS);
      console.log('[useBrowserCommandPolling] Type result:', result);

      // Update snapshot after typing
      if (result && result.success) {
        await new Promise(resolve => setTimeout(resolve, 500));
        await updateSnapshot(webview);
      }
      return result;
    }

    case 'screenshot': {
      return await webview.executeJavaScript(`
        (async () => {
          try {
            const html = document.documentElement.outerHTML;
            const url = window.location.href;
            const title = document.title;

            return {
              success: true,
              url: url,
              title: title,
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
      `);
    }

    case 'wait': {
      return await webview.executeJavaScript(`
        (async () => {
          const startTime = Date.now();
          const timeout = ${cmd.params?.timeout || 10000};
          while (Date.now() - startTime < timeout) {
            const element = document.querySelector('${cmd.params?.selector}');
            if (element) return { success: true, found: true };
            await new Promise(r => setTimeout(r, 100));
          }
          return { success: false, found: false };
        })()
      `);
    }

    default:
      throw new Error(`Unknown action: ${cmd.action}`);
  }
}

// Helper to update snapshot
async function updateSnapshot(webview: HTMLWebViewElement): Promise<void> {
  try {
    const snapshotJS = `
      (async () => {
        const selector = 'button, a, input, textarea, select, [onclick], [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
        const interactive = document.querySelectorAll(selector);
        const results = [];
        interactive.forEach((el, idx) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return;
          let text = '';
          if (el.placeholder) text = el.placeholder;
          else if (el.value && el.tagName === 'INPUT') text = el.value;
          else if (el.textContent) text = el.textContent.slice(0, 50);
          text = text.trim().slice(0, 100);
          results.push({
            refId: idx,
            tag: el.tagName.toLowerCase(),
            type: el.type || '',
            text: text,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2
          });
        });
        return {
          elements: results,
          url: window.location.href,
          title: document.title
        };
      })()
    `;
    const result = await webview.executeJavaScript(snapshotJS);
    if (result && result.elements) {
      console.log('[useBrowserCommandPolling] Updated snapshot -', result.elements.length, 'elements');
    }
  } catch (e) {
    console.warn('[useBrowserCommandPolling] Failed to update snapshot:', e);
  }
}

// Generate click JavaScript
function generateClickJS(cmd: BrowserCommand): string {
  const { params } = cmd;
  const x = params?.x;
  const y = params?.y;
  const selector = params?.selector;

  return `
    (async () => {
      console.log('[ClickJS] Starting with params:', ${JSON.stringify(params)});

      let el = null;
      let strategy = 'unknown';

      // Strategy 1: Use refId from snapshot
      if (params.refId !== undefined) {
        const selector = 'button, a, input, textarea, select, [onclick], [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
        const interactive = document.querySelectorAll(selector);
        if (params.refId < interactive.length) {
          el = interactive[params.refId];
          strategy = 'refId';
          console.log('[ClickJS] Found element via refId:', el.tagName);
        }
      }

      // Strategy 2: Use coordinates
      if (!el && ${x} !== undefined && ${y} !== undefined) {
        const element = document.elementFromPoint(${x}, ${y});
        if (element) {
          el = element;
          strategy = 'coordinates';
          console.log('[ClickJS] Found element via coordinates:', el.tagName);
        }
      }

      // Strategy 3: Use text selector
      if (!el && \${text}) {
        const textVal = String(\${text});
        const escapedText = textVal.replace(/[.*+?^\\$\{\}()|[\\]\\\\]/g, '\\\\$&');
        const xpath = '//*[' + 'contains(text(), ' + JSON.stringify(\${text}) + ')]';
        el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (el) {
          strategy = 'text-match';
          console.log('[ClickJS] Found element via text match:', el.tagName);
        }
      }

      // Strategy 4: Use CSS selector
      if (!el && ${selector}) {
        el = document.querySelector(${selector});
        if (el) {
          strategy = 'selector';
          console.log('[ClickJS] Found element via selector:', el.tagName);
        }
      }

      if (el) {
        console.log('[ClickJS] Using strategy:', strategy);
        console.log('[ClickJS] Element:', el.tagName);

        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise(r => setTimeout(r, 100));

        el.focus();
        el.click();

        await new Promise(r => setTimeout(r, 300));

        return {
          success: true,
          output: 'Clicked ' + el.tagName + ' using strategy: ' + strategy,
          strategy: strategy,
          tagName: el.tagName
        };
      }

      console.error('[ClickJS] Element not found - all strategies failed');
      return {
        success: false,
        error: 'Element not found - tried coordinates, text match, and selector'
      };
    })()
  `;
}

// Generate type JavaScript
function generateTypeJS(cmd: BrowserCommand): string {
  const { params } = cmd;
  const text = params?.text || '';
  const submit = params?.submit || false;
  const x = params?.x;
  const y = params?.y;
  const selector = params?.selector;

  const escapedText = JSON.stringify(text);

  return `
    (async () => {
      console.log('[TypeJS] Starting with params:', ${JSON.stringify(params)});

      let el = null;
      let strategy = 'unknown';

      // Strategy 1: Use coordinates
      if (${x} !== undefined && ${y} !== undefined) {
        const element = document.elementFromPoint(${x}, ${y});
        if (element) {
          el = element;
          strategy = 'coordinates';
          console.log('[TypeJS] Found element via coordinates:', el.tagName);
        }
      }

      // Strategy 2: Use selector
      if (!el && ${selector}) {
        el = document.querySelector(${selector});
        if (el) {
          strategy = 'selector';
          console.log('[TypeJS] Found element via selector:', el.tagName);
        }
      }

      // Strategy 3: Use text selector
      if (!el && \${text}) {
        const textVal = String(\${text});
        const escapedText = textVal.replace(/[.*+?^\\$\{\}()|[\\]\\\\]/g, '\\\\$&');
        const xpath = '//*[' + 'contains(text(), ' + JSON.stringify(\${text}) + ')]';
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        el = result.singleNodeValue;
        if (el) {
          strategy = 'text-match';
          console.log('[TypeJS] Found element via text match:', el.tagName);
        }
      }

      // Fallback: first visible element
      if (!el) {
        const selector = 'button, a, input, textarea, select, [onclick], [role="button"], [role="link"], [tabindex]:not([tabindex="-1"])';
        const visible = Array.from(document.querySelectorAll(selector)).filter(e => {
          const rect = e.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        if (visible.length > 0) {
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

        if (${submit}) {
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
