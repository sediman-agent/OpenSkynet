const { app, BrowserWindow, ipcMain, BrowserView } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow;
let browserView; // BrowserView for embedded browser panel

// Check for --showcase flag
const args = process.argv.slice(1);
const isShowcase = args.includes('--showcase');

// Enable remote debugging for CDP browser sharing
const DEBUG_PORT = 9222;
app.commandLine.appendSwitch('remote-debugging-port', String(DEBUG_PORT));
console.log(`CDP debugging enabled on port ${DEBUG_PORT}`);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // Enable <webview> tag for embedded browser (VSCode approach)
      webSecurity: false,
      additionalArguments: isShowcase ? ['--showcase'] : [],
    },
    show: false,
  });

  // Open DevTools in development to help debug
  // mainWindow.webContents.openDevTools();

  // ALWAYS load from built files
  const distPath = path.join(__dirname, '../dist/index.html');
  console.log('Loading from:', distPath);

  mainWindow.loadFile(distPath);

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();
  });

  // Log renderer errors
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer ${level}] ${message} (line ${line})`);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, validatedURL);
  });

  // Log uncaught errors
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process gone:', details);
  });

  mainWindow.on('closed', () => {
    console.log('Window closed');
    mainWindow = null;
  });

  // Setup IPC handlers for browser control
  setupBrowserHandlers();
}

/**
 * VSCode-style embedded browser using BrowserView
 * BrowserView is the correct API for embedding browser content in Electron
 */
function setupBrowserView() {
  console.log('[BrowserView] Setting up BrowserView for embedded browser');

  if (browserView) {
    console.log('[BrowserView] Already exists');
    return browserView;
  }

  // Create BrowserView - this is a proper browser instance that can be controlled via CDP
  browserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      // Enable for CDP discovery
      devTools: true,
      // Additional settings for CDP compatibility
      javascript: true,
      plugins: true,
    }
  });

  // Load a clean starter page (minimal HTML without text)
  // This ensures the CDP endpoint is properly initialized
  console.log('[BrowserView] Loading starter page...');
  browserView.webContents.loadURL('data:text/html,<html><head><title>Browser</title><style>body{margin:0;padding:0;}</style></head><body></body></html>');

  // Listen for navigation events
  browserView.webContents.on('did-navigate', (event, url) => {
    console.log('[BrowserView] Navigated to:', url);
    // Notify renderer about URL change
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-message', { type: 'browser-did-navigate', url });
    }
  });

  browserView.webContents.on('did-navigate-in-page', (event, url) => {
    console.log('[BrowserView] Navigated in page to:', url);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-message', { type: 'browser-did-navigate', url });
    }
  });

  browserView.webContents.on('page-title-updated', (event, title) => {
    console.log('[BrowserView] Title updated:', title);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-message', { type: 'browser-title-updated', title });
    }
  });

  browserView.webContents.on('console-message', (event, level, message) => {
    console.log(`[BrowserView console ${level}] ${message}`);
  });

  // Mark CDP as ready when page loads
  browserView.webContents.on('did-finish-load', () => {
    console.log('[BrowserView] Page loaded - CDP endpoint should be ready');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('main-message', { type: 'browser-cdp-ready' });
    }
  });

  // Handle loading errors
  browserView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('[BrowserView] Failed to load:', errorCode, errorDescription, validatedURL);
  });

  console.log('[BrowserView] Created successfully');
  return browserView;
}

function showBrowserPanel() {
  console.log('[BrowserPanel] Browser panel shown - using renderer webview (no BrowserView)');

  // Don't use BrowserView - renderer webview IS the browser
  // This avoids coordinate positioning issues and layout conflicts
  // The renderer will handle the browser display

  return { success: true };
}

function hideBrowserPanel() {
  console.log('[BrowserPanel] Hiding browser panel...');

  if (!mainWindow) {
    return { success: false, error: 'No main window' };
  }

  // Remove BrowserView from window
  mainWindow.setBrowserView(null);

  console.log('[BrowserPanel] Browser panel hidden');
  return { success: true };
}

function resizeBrowserPanel(panelWidth) {
  if (!browserView || !mainWindow) return;

  const bounds = mainWindow.getBounds();

  browserView.setBounds({
    x: bounds.width - panelWidth,
    y: 0,  // Start from top
    width: panelWidth,
    height: bounds.height  // Full height
  });
}

function setupBrowserHandlers() {
  console.log('Setting up browser handlers');

  // Show browser panel
  ipcMain.handle('browser-show', async () => {
    console.log('=== browser-show called (BrowserView approach) ===');
    return showBrowserPanel();
  });

  // Hide browser panel
  ipcMain.handle('browser-hide', async () => {
    console.log('browser-hide called');
    return hideBrowserPanel();
  });

  // Resize browser panel
  ipcMain.handle('browser-resize', async (event, width) => {
    console.log('browser-resize:', width);
    resizeBrowserPanel(width);
    return { success: true };
  });

  // Navigate to URL
  ipcMain.handle('browser-navigate', async (event, url) => {
    console.log('browser-navigate:', url);
    if (browserView) {
      browserView.webContents.loadURL(url);
      return { success: true };
    }
    return { success: false, error: 'BrowserView not initialized' };
  });

  // Get browser state
  ipcMain.handle('browser-get-state', async () => {
    if (!browserView) {
      return { success: false, error: 'BrowserView not initialized' };
    }

    const webContents = browserView.webContents;
    return {
      success: true,
      url: webContents.getURL(),
      title: 'Browser', // BrowserView doesn't have a title property
      canGoBack: webContents.canGoBack(),
      canGoForward: webContents.canGoForward(),
      isLoading: webContents.isLoading()
    };
  });

  // Browser controls
  ipcMain.handle('browser-back', async () => {
    if (browserView && browserView.webContents.canGoBack()) {
      browserView.webContents.goBack();
      return { success: true };
    }
    return { success: false, error: 'Cannot go back' };
  });

  ipcMain.handle('browser-forward', async () => {
    if (browserView && browserView.webContents.canGoForward()) {
      browserView.webContents.goForward();
      return { success: true };
    }
    return { success: false, error: 'Cannot go forward' };
  });

  ipcMain.handle('browser-refresh', async () => {
    if (browserView) {
      browserView.webContents.reload();
      return { success: true };
    }
    return { success: false, error: 'BrowserView not initialized' };
  });

  // Screenshot
  ipcMain.handle('browser-screenshot', async () => {
    if (browserView) {
      const image = await browserView.webContents.capturePage();
      const buffer = image.toPNG();
      const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
      return { success: true, data: dataUrl };
    }
    return { success: false, error: 'BrowserView not initialized' };
  });

  // Get version
  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion();
  });

  // IPC-based browser control for agent (VSCode approach)
  // These handlers execute browser commands directly on BrowserView
  ipcMain.handle('browser-exec:navigate', async (event, url) => {
    console.log('[BrowserExec] Navigate to:', url);
    if (browserView) {
      await browserView.webContents.loadURL(url);
      // Wait for page to load
      await new Promise(resolve => {
        const listener = () => {
          browserView.webContents.removeListener('did-finish-load', listener);
          browserView.webContents.removeListener('did-fail-load', errorListener);
          resolve();
        };
        const errorListener = () => {
          browserView.webContents.removeListener('did-finish-load', listener);
          browserView.webContents.removeListener('did-fail-load', errorListener);
          resolve(); // Continue even on error
        };
        browserView.webContents.once('did-finish-load', listener);
        browserView.webContents.once('did-fail-load', errorListener);
        // Timeout after 10 seconds
        setTimeout(() => {
          browserView.webContents.removeListener('did-finish-load', listener);
          browserView.webContents.removeListener('did-fail-load', errorListener);
          resolve();
        }, 10000);
      });
      return { success: true, url };
    }
    return { success: false, error: 'BrowserView not initialized' };
  });

  ipcMain.handle('browser-exec:click', async (event, x, y) => {
    console.log('[BrowserExec] Click at:', x, y);
    if (browserView) {
      const result = await browserView.webContents.executeJavaScript(`
        (async () => {
          const element = document.elementFromPoint(${x}, ${y});
          if (element) {
            element.click();
            return { success: true, tagName: element.tagName };
          }
          return { success: false, error: 'No element at point' };
        })();
      `);
      return result;
    }
    return { success: false, error: 'BrowserView not initialized' };
  });

  ipcMain.handle('browser-exec:type', async (event, selector, text) => {
    console.log('[BrowserExec] Type into:', selector, 'text:', text);
    if (browserView) {
      const result = await browserView.webContents.executeJavaScript(`
        (async () => {
          const element = document.querySelector('${selector}');
          if (element) {
            element.focus();
            element.value = '${text}';
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true };
          }
          return { success: false, error: 'Element not found' };
        })();
      `);
      return result;
    }
    return { success: false, error: 'BrowserView not initialized' };
  });

  ipcMain.handle('browser-exec:snapshot', async () => {
    console.log('[BrowserExec] Taking snapshot...');
    if (browserView) {
      const elements = await browserView.webContents.executeJavaScript(`
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
          return results;
        })();
      `);
      const url = browserView.webContents.getURL();
      const title = await browserView.webContents.getTitle();
      return { success: true, elements, url, title };
    }
    return { success: false, error: 'BrowserView not initialized' };
  });

  ipcMain.handle('browser-exec:evaluate', async (event, script) => {
    if (browserView) {
      try {
        const result = await browserView.webContents.executeJavaScript(script);
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: 'BrowserView not initialized' };
  });

  // CDP Shared Browser: discover BrowserView target for Playwright connection
  ipcMain.handle('browser:get-cdp-target', async (event, webContentsId) => {
    const maxRetries = 5;
    const retryDelay = 500; // 500ms between retries

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!browserView) {
          return { success: false, error: 'BrowserView not created yet' };
        }

        console.log('[CDP] Discovering BrowserView CDP endpoint (attempt', attempt, 'of', maxRetries, ')');

        // Get all targets from CDP
        const targets = await new Promise((resolve, reject) => {
          const req = http.get(`http://127.0.0.1:${DEBUG_PORT}/json`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try { resolve(JSON.parse(data)); }
              catch (e) { reject(e); }
            });
          });
          req.on('error', reject);
          req.setTimeout(3000, () => {
            req.destroy();
            reject(new Error('CDP targets request timeout'));
          });
        });

        console.log('[CDP] Total targets found:', targets.length);
        targets.forEach((t, i) => console.log(`[CDP]   [${i}] id=${t.id} type=${t.type} url=${t.url} title="${t.title}"`));

        // Find the BrowserView target
        const browserViewTargets = targets.filter(t => {
          if (t.url?.startsWith('file://') || t.type === 'devtools' || t.type === 'other') {
            return false;
          }
          return t.type === 'page';
        });

        console.log('[CDP] Found', browserViewTargets.length, 'BrowserView targets');

        if (browserViewTargets.length === 0) {
          if (attempt < maxRetries) {
            console.log('[CDP] No BrowserView targets found, retrying in', retryDelay, 'ms...');
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          return { success: false, error: 'No BrowserView target found after ' + maxRetries + ' attempts' };
        }

        // Use the BrowserView target's WebSocket URL
        const viewTarget = browserViewTargets[browserViewTargets.length - 1];
        const wsUrl = viewTarget.webSocketDebuggerUrl;

        if (!wsUrl) {
          console.error('[CDP] WebSocket URL not found in target');
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }
          return { success: false, error: 'WebSocket URL not available' };
        }

        console.log('[CDP] Using BrowserView WebSocket URL:', wsUrl.substring(0, 60) + '...');
        console.log('[CDP] BrowserView info:', {
          id: viewTarget.id,
          type: viewTarget.type,
          url: viewTarget.url,
          title: viewTarget.title
        });

        return {
          success: true,
          webSocketDebuggerUrl: wsUrl,
          url: viewTarget.url || 'about:blank',
          title: viewTarget.title || '',
          targetId: viewTarget.id,
        };
      } catch (err) {
        console.error('[CDP] Attempt', attempt, 'failed:', err.message);
        if (attempt === maxRetries) {
          return { success: false, error: err.message };
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    return { success: false, error: 'Max retries exceeded' };
  });
}

app.whenReady().then(() => {
  console.log('App ready, creating window');
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle window resize
app.on('browser-window-focus', () => {
  // Update BrowserView bounds when window is focused
  if (browserView && mainWindow) {
    const bounds = mainWindow.getBounds();
    resizeBrowserPanel(600);
  }
});
