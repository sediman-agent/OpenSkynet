// Agent action type
interface AgentAction {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// Browser state type
interface BrowserState {
  url: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
}

// Electron API interface
interface ElectronAPI {
  // Browser controls API (unified)
  browser: {
    // Visibility control
    show: () => Promise<object>;
    hide: () => Promise<object>;
    resize: (width: number) => Promise<object>;

    // Navigation
    navigate: (url: string) => Promise<object>;
    back: () => Promise<object>;
    forward: () => Promise<object>;
    refresh: () => Promise<object>;

    // State
    getState: () => Promise<object>;
    screenshot: () => Promise<object>;

    // IPC-based browser execution
    exec: {
      navigate: (url: string) => Promise<object>;
      click: (x: number, y: number) => Promise<object>;
      type: (selector: string, text: string) => Promise<object>;
      snapshot: () => Promise<object>;
      evaluate: (script: string) => Promise<object>;
    };

    // CDP connection for shared browser
    getCdpTarget: (webContentsId?: number) => Promise<{ success: boolean; webSocketDebuggerUrl?: string; targetId?: string; error?: string }>;
  };

  // Agent action listener
  onAgentAction: (callback: (action: AgentAction) => void) => () => void;

  // File operations
  selectFile: () => Promise<string[]>;
  selectFiles: () => Promise<string[]>;
  saveFile: (options: { title: string; defaultPath: string }) => Promise<string | undefined>;

  // App info
  getVersion: () => Promise<string>;
  getPlatform: () => string;

  // Events
  onMessage: (callback: (message: unknown) => void) => (() => void);
  sendMessage: (message: unknown) => void;

  // Check if running in showcase mode
  isShowcase: () => boolean;
}

// Window interface extension
interface Window {
  electronAPI?: ElectronAPI;
}

// Global declaration
declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
