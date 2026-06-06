const { contextBridge, ipcRenderer } = require('electron');

const isLocalMode = process.argv.includes('--local') || process.env.SEDIMAN_MODE === 'local';

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform info
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },

  // Browser control methods
  navigate: async (url) => {
    return await ipcRenderer.invoke('browser:navigate', url);
  },

  screenshot: async () => {
    return await ipcRenderer.invoke('browser:screenshot');
  },

  execute: async (script) => {
    return await ipcRenderer.invoke('browser:execute', script);
  },

  // Security: Only expose safe APIs to renderer process
  openExternal: (url) => {
    require('electron').shell.openExternal(url);
  },

  // Path utilities
  path: {
    join: (...args) => require('path').join(...args),
    dirname: (file) => require('path').dirname(file),
    basename: (file) => require('path').basename(file),
  },

  // App info
  getVersion: () => {
    return ipcRenderer.invoke('app:getVersion');
  },

  getName: () => {
    return ipcRenderer.invoke('app:getName');
  },

  // Local mode support
  isLocalMode: isLocalMode,

  localInit: async () => {
    return await ipcRenderer.invoke('local:init');
  },

  localCall: async (method, params) => {
    return await ipcRenderer.invoke('local:call', { method, params });
  },
});
