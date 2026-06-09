/**
 * Central Application Configuration
 * Single source of truth for all app settings
 */

// ============================================================================
// API Configuration
// ============================================================================

export const API_CONFIG = {
  get baseURL(): string {
    // Check environment variable first, then fall back to localhost
    return import.meta.env.VITE_API_URL || 'http://localhost:3001';
  },

  get timeout(): number {
    return parseInt(import.meta.env.VITE_API_TIMEOUT || '30000', 10);
  },

  get maxRetries(): number {
    return parseInt(import.meta.env.VITE_MAX_RETRIES || '3', 10);
  }
} as const;

// ============================================================================
// App Configuration
// ============================================================================

export const APP_CONFIG = {
  name: 'OpenSkynet',
  version: '0.3.2',

  // Streaming
  streamChunkSize: 1024,
  streamBatchDelay: 0, // VS Code uses microtasks, no delay needed

  // UI
  sidebarDefaultWidth: 256,
  sidebarCollapsedWidth: 48,
  panelDefaultWidth: 600,
  panelMinWidth: 300,

  // Performance
  messagePageSize: 50,
  maxConversationHistory: 100,

  // Features
  features: {
    browser: import.meta.env.VITE_ENABLE_BROWSER !== 'false',
    skills: true,
    recording: true,
  }
} as const;

// ============================================================================
// Development Helpers
// ============================================================================

export const DEV_CONFIG = {
  isDevelopment: import.meta.env.DEV,
  isDebug: import.meta.env.VITE_DEBUG === 'true',

  log(...args: any[]) {
    if (this.isDebug) {
      console.log(`[${APP_CONFIG.name}]`, ...args);
    }
  },

  error(...args: any[]) {
    if (this.isDevelopment) {
      console.error(`[${APP_CONFIG.name}]`, ...args);
    }
  },

  warn(...args: any[]) {
    if (this.isDevelopment) {
      console.warn(`[${APP_CONFIG.name}]`, ...args);
    }
  }
} as const;

// ============================================================================
// Environment Type Guards
// ============================================================================

export function isRunningInElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as any).electron;
}

export function isRunningInBrowser(): boolean {
  return typeof window !== 'undefined' && !isRunningInElectron();
}

export function getPlatform(): 'darwin' | 'linux' | 'windows' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';

  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac')) return 'darwin';
  if (platform.includes('linux')) return 'linux';
  if (platform.includes('win')) return 'windows';
  return 'unknown';
}

// ============================================================================
// Validation
// ============================================================================

export function validateApiUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function validateTimeout(timeout: number): boolean {
  return timeout > 0 && timeout <= 120000; // Max 2 minutes
}
