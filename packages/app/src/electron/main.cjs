const path = require('path');

// In Electron, the API is available globally when running with electron binary
// The module loading issue suggests we need to access it differently
const { app, BrowserWindow, ipcMain, session, protocol } = require('electron');

// Simple check for development environment
const isDev = process.env.NODE_ENV === 'development' || process.env.ELECTRON_IS_DEV === 'true' || true; // Always use dev mode for now

let mainWindow = null;

// Register schemes before app is ready (must be done early)
if (isDev) {
  protocol.registerSchemesAsPrivileged([{ scheme: 'http', privileges: { standard: true, secure: true, fetch: true } }]);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    backgroundColor: '#09090b',
    show: false,
    titleBarStyle: 'hiddenInset',
    frame: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webviewTag: true, // Enable webview tag for browser integration
      preload: path.join(__dirname, 'preload.cjs'),
      // Allow loading local files and dev server
      webSecurity: !isDev,
    }
  });

  // Allow navigating to dev server in development
  if (isDev) {
    mainWindow.webContents.session.webRequest.onBeforeRequest(
      { urls: ['http://localhost:*/*', 'ws://localhost:*/*'] },
      (details, callback) => {
        callback({ cancel: false });
      }
    );
  }

  mainWindow.loadURL(
    isDev
      ? 'http://localhost:1420' // Dev server from current setup
      : `file://${path.join(__dirname, '../dist/index.html')}`
  );

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Local backend mode - direct function calls via IPC
const isLocalMode = process.argv.includes('--local') || process.env.SEDIMAN_MODE === 'local';

if (isLocalMode) {
  console.log('[Main] Running in local mode - server embedded');

  ipcMain.handle('local:init', async () => {
    try {
      const { AgentLoop } = await import('@sediman/server/src/agent/loop');
      const { SkillEngine } = await import('@sediman/server/src/skills/engine');
      const { FileMemoryStrategy } = await import('@sediman/server/src/memory/strategies/file-memory');
      const { HubClient, GitHubInstaller } = await import('@sediman/server/src/skills/hub');
      const { SkillSearchEngine } = await import('@sediman/server/src/skills/search');
      const { CronManager } = await import('@sediman/server/src/scheduler/cron');
      const { CheckpointManager } = await import('@sediman/server/src/agent/checkpoint');
      const { Changelog } = await import('@sediman/server/src/memory/utils/changelog');
      const { createProvider } = await import('@sediman/server/src/llm/provider');
      const { BrowserSession } = await import('@sediman/server/src/browser/session');
      const { BrowserController } = await import('@sediman/server/src/browser/controller');

      const providerName = process.env.SEDIMAN_PROVIDER ?? 'openai';
      const modelName = process.env.SEDIMAN_MODEL;
      const baseUrl = process.env.SEDIMAN_BASE_URL;
      const apiKey = process.env.SEDIMAN_API_KEY;

      const llmProvider = createProvider(providerName, modelName, baseUrl, apiKey);
      const memory = new FileMemoryStrategy();
      await memory.initialize();
      const skillEngine = new SkillEngine();
      const hubClient = new HubClient();
      const skillSearch = new SkillSearchEngine(skillEngine);
      const cronManager = new CronManager();
      const changelog = new Changelog();
      const checkpointManager = new CheckpointManager();

      const headless = (process.env.SEDIMAN_HEADLESS ?? 'true') === 'true';
      const browserSession = new BrowserSession({ headless, stealth: false });
      const browserController = new BrowserController(browserSession);

      const agentLoop = new AgentLoop({
        llmProvider,
        browserSession,
        memory,
        skillEngine,
        headless,
      });

      return { success: true, mode: 'local' };
    } catch (error) {
      console.error('[Main] Failed to initialize local backend:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('local:call', async (event, { method, params }) => {
    return { error: 'Not yet implemented', method };
  });
}

app.whenReady().then(createWindow);

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

// Browser control IPC handlers
ipcMain.handle('browser:navigate', async (event, url) => {
  console.log('Browser navigate to:', url);
  // Will be handled by the webview in the renderer process
  return { success: true };
});

ipcMain.handle('browser:screenshot', async () => {
  console.log('Browser screenshot requested');
  // Will be handled by the webview in the renderer process
  return { success: true };
});

ipcMain.handle('browser:execute', async (event, script) => {
  console.log('Browser execute script:', script);
  return { success: true };
});

// App info IPC handlers
ipcMain.handle('app:getVersion', async () => {
  return app.getVersion();
});

ipcMain.handle('app:getName', async () => {
  return app.getName();
});
