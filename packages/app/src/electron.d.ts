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
  // Browser visibility
  browserShow: () => Promise<object>;
  browserHide: () => Promise<object>;

  // Browser controls
  browserNavigate: (url: string) => Promise<object>;
  browserBack: () => Promise<object>;
  browserForward: () => Promise<object>;
  browserRefresh: () => Promise<object>;
  browserGetState: () => Promise<object>;
  browserScreenshot: () => Promise<object>;

  // CDP connection for shared browser
  getCdpTarget: () => Promise<{ success: boolean; webSocketDebuggerUrl?: string; targetId?: string; error?: string }>;

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
