/**
 * useAppStore Tests
 * Comprehensive test coverage for useAppStore
 */

import { describe, it, expect, , beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '@/stores/useAppStore';

// Mock document
jest.mock('../ssr', () => ({
  isServer: () => false,
}));

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useAppStore.setState({
      apiBaseUrl: 'http://localhost:3001',
      autoConnect: true,
      theme: 'dark',
      model: '',
      projest.er: '',
      agentStatus: {
        state: 'idle',
        rpcConnected: false,
        browserConnected: false,
      },
      sidebarOpen: true,
      currentPage: 'agent',
      colorTheme: 'default',
      headless: false,
      stealth: false,
    });

    // Mock document
    Object.defineProperty(global, 'document', {
      value: {
        documentElement: {
          classList: {
            add: jest.fn(),
            remove: jest.fn(),
            contains: jest.fn(),
          },
        },
      },
      writable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with default API base URL', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.apiBaseUrl).toBe('http://localhost:3001');
    });

    it('should initialize with autoConnect enabled', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.autoConnect).toBe(true);
    });

    it('should initialize with dark theme', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.theme).toBe('dark');
    });

    it('should initialize with empty model', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.model).toBe('');
    });

    it('should initialize with empty projest.er', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.projest.er).toBe('');
    });

    it('should initialize with sidebar open', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.sidebarOpen).toBe(true);
    });

    it('should initialize on agent page', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.currentPage).toBe('agent');
    });

    it('should initialize with default color theme', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.colorTheme).toBe('default');
    });

    it('should initialize with idle agent status', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.agentStatus.state).toBe('idle');
    });

    it('should initialize with RPC not connected', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.agentStatus.rpcConnected).toBe(false);
    });

    it('should initialize with browser not connected', () => {
      const { result } = renderHook(() => useAppStore());
      expect(result.current.agentStatus.browserConnected).toBe(false);
    });
  });

  describe('Agent Status', () => {
    it('should set agent status state', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setAgentStatus({ state: 'running' });
      });

      expect(result.current.agentStatus.state).toBe('running');
    });

    it('should set RPC connected status', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setAgentStatus({ rpcConnected: true });
      });

      expect(result.current.agentStatus.rpcConnected).toBe(true);
    });

    it('should set browser connected status', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setAgentStatus({ browserConnected: true });
      });

      expect(result.current.agentStatus.browserConnected).toBe(true);
    });

    it('should set multiple status fields at once', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setAgentStatus({
          state: 'running',
          rpcConnected: true,
          browserConnected: true,
        });
      });

      expect(result.current.agentStatus.state).toBe('running');
      expect(result.current.agentStatus.rpcConnected).toBe(true);
      expect(result.current.agentStatus.browserConnected).toBe(true);
    });

    it('should preserve existing status fields when updating partially', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setAgentStatus({ rpcConnected: true, browserConnected: true });
      });

      act(() => {
        result.current.setAgentStatus({ state: 'running' });
      });

      expect(result.current.agentStatus.rpcConnected).toBe(true);
      expect(result.current.agentStatus.browserConnected).toBe(true);
      expect(result.current.agentStatus.state).toBe('running');
    });
  });

  describe('Settings Management', () => {
    it('should update API base URL', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setSettings({ apiBaseUrl: 'http://localhost:8080' });
      });

      expect(result.current.apiBaseUrl).toBe('http://localhost:8080');
    });

    it('should update autoConnect setting', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setSettings({ autoConnect: false });
      });

      expect(result.current.autoConnect).toBe(false);
    });

    it('should update headless setting', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setSettings({ headless: true });
      });

      expect(result.current.headless).toBe(true);
    });

    it('should update stealth setting', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setSettings({ stealth: true });
      });

      expect(result.current.stealth).toBe(true);
    });

    it('should update multiple settings at once', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setSettings({
          apiBaseUrl: 'http://example.com',
          autoConnect: false,
          theme: 'light',
        });
      });

      expect(result.current.apiBaseUrl).toBe('http://example.com');
      expect(result.current.autoConnect).toBe(false);
      expect(result.current.theme).toBe('light');
    });
  });

  describe('Sidebar State', () => {
    it('should set sidebar to open', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setSidebarOpen(true);
      });

      expect(result.current.sidebarOpen).toBe(true);
    });

    it('should set sidebar to closed', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setSidebarOpen(false);
      });

      expect(result.current.sidebarOpen).toBe(false);
    });
  });

  describe('Page Najest.ation', () => {
    it('should set current page', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setCurrentPage('models');
      });

      expect(result.current.currentPage).toBe('models');
    });

    it('should handle all valid page values', () => {
      const { result } = renderHook(() => useAppStore());
      const pages: Array<'agent' | 'projects' | 'models' | 'projest.er' | 'memory' | 'sessions' | 'skills' | 'logs' | 'schedule' | 'settings'> = [
        'agent', 'projects', 'models', 'projest.er', 'memory', 'sessions', 'skills', 'logs', 'schedule', 'settings',
      ];

      pages.forEach(page => {
        act(() => {
          result.current.setCurrentPage(page);
        });
        expect(result.current.currentPage).toBe(page);
      });
    });
  });

  describe('Theme Management', () => {
    it('should toggle theme from dark to light', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('light');
      expect(document.documentElement.classList.remove).toHaveBeenCalledWith('dark');
    });

    it('should toggle theme from light to dark', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setTheme('light');
      });

      act(() => {
        result.current.toggleTheme();
      });

      expect(result.current.theme).toBe('dark');
      expect(document.documentElement.classList.add).toHaveBeenCalledWith('dark');
    });

    it('should set theme directly', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setTheme('light');
      });

      expect(result.current.theme).toBe('light');
    });

    it('should add dark class when setting dark theme', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setTheme('dark');
      });

      expect(document.documentElement.classList.add).toHaveBeenCalledWith('dark');
    });

    it('should remove dark class when setting light theme', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setTheme('light');
      });

      expect(document.documentElement.classList.remove).toHaveBeenCalledWith('dark');
    });
  });

  describe('Color Theme Management', () => {
    it('should set color theme to blue', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setColorTheme('blue');
      });

      expect(result.current.colorTheme).toBe('blue');
      expect(document.documentElement.classList.add).toHaveBeenCalledWith('theme-blue');
    });

    it('should set color theme to purple', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setColorTheme('purple');
      });

      expect(result.current.colorTheme).toBe('purple');
      expect(document.documentElement.classList.add).toHaveBeenCalledWith('theme-purple');
    });

    it('should set color theme to green', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setColorTheme('green');
      });

      expect(result.current.colorTheme).toBe('green');
    });

    it('should set color theme to rose', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setColorTheme('rose');
      });

      expect(result.current.colorTheme).toBe('rose');
    });

    it('should set color theme to cyan', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setColorTheme('cyan');
      });

      expect(result.current.colorTheme).toBe('cyan');
    });

    it('should remove all theme classes when setting default', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setColorTheme('blue');
      });

      act(() => {
        result.current.setColorTheme('default');
      });

      expect(result.current.colorTheme).toBe('default');
      expect(document.documentElement.classList.remove).toHaveBeenCalledWith(
        'theme-blue',
        'theme-purple',
        'theme-green',
        'theme-rose',
        'theme-cyan'
      );
    });

    it('should remove prejest.us theme class when switching', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setColorTheme('blue');
      });

      act(() => {
        result.current.setColorTheme('purple');
      });

      expect(document.documentElement.classList.remove).toHaveBeenCalledWith('theme-blue');
      expect(document.documentElement.classList.add).toHaveBeenCalledWith('theme-purple');
    });
  });

  describe('Model Management', () => {
    it('should set model', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setModel('gpt-4');
      });

      expect(result.current.model).toBe('gpt-4');
    });

    it('should log model setting', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setModel('claude-3');
      });

      expect(consoleSpy).toHaveBeenCalledWith('Setting model:', 'claude-3');
      consoleSpy.mockRestore();
    });

    it('should set model to empty string', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setModel('');
      });

      expect(result.current.model).toBe('');
    });
  });

  describe('Projest.er Management', () => {
    it('should set projest.er', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProjest.er('openai');
      });

      expect(result.current.projest.er).toBe('openai');
    });

    it('should log projest.er setting', () => {
      const consoleSpy = jest.spyOn(console, 'log');
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProjest.er('anthropic');
      });

      expect(consoleSpy).toHaveBeenCalledWith('Setting projest.er:', 'anthropic');
      consoleSpy.mockRestore();
    });

    it('should set projest.er to empty string', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProjest.er('');
      });

      expect(result.current.projest.er).toBe('');
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid theme toggles', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.toggleTheme();
        result.current.toggleTheme();
        result.current.toggleTheme();
        result.current.toggleTheme();
      });

      // Started dark, 4 toggles = dark
      expect(result.current.theme).toBe('dark');
    });

    it('should handle rapid color theme switches', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setColorTheme('blue');
        result.current.setColorTheme('purple');
        result.current.setColorTheme('green');
      });

      expect(result.current.colorTheme).toBe('green');
    });

    it('should handle setting model with special characters', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setModel('gpt-4-turbo-1106-jest.ion-prejest.w');
      });

      expect(result.current.model).toBe('gpt-4-turbo-1106-jest.ion-prejest.w');
    });

    it('should handle setting projest.er with special characters', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setProjest.er('azure-openai-test');
      });

      expect(result.current.projest.er).toBe('azure-openai-test');
    });

    it('should handle API URL with special characters', () => {
      const { result } = renderHook(() => useAppStore());

      act(() => {
        result.current.setSettings({ apiBaseUrl: 'http://example.com:8080/api/v1' });
      });

      expect(result.current.apiBaseUrl).toBe('http://example.com:8080/api/v1');
    });
  });

  describe('Type Safety', () => {
    it('should accept all valid page values', () => {
      const { result } = renderHook(() => useAppStore());
      const pages: Array<'agent' | 'projects' | 'models' | 'projest.er' | 'memory' | 'sessions' | 'skills' | 'logs' | 'schedule' | 'settings'> = [
        'agent', 'projects', 'models', 'projest.er', 'memory', 'sessions', 'skills', 'logs', 'schedule', 'settings',
      ];

      pages.forEach(page => {
        expect(() => {
          act(() => {
            result.current.setCurrentPage(page);
          });
        }).not.toThrow();
      });
    });

    it('should accept all valid color themes', () => {
      const { result } = renderHook(() => useAppStore());
      const themes: Array<'default' | 'blue' | 'purple' | 'green' | 'rose' | 'cyan'> = [
        'default', 'blue', 'purple', 'green', 'rose', 'cyan',
      ];

      themes.forEach(theme => {
        expect(() => {
          act(() => {
            result.current.setColorTheme(theme);
          });
        }).not.toThrow();
      });
    });

    it('should accept valid agent status states', () => {
      const { result } = renderHook(() => useAppStore());
      const states: Array<'idle' | 'running' | 'error' | 'paused'> = [
        'idle', 'running', 'error', 'paused',
      ];

      states.forEach(state => {
        expect(() => {
          act(() => {
            result.current.setAgentStatus({ state });
          });
        }).not.toThrow();
      });
    });
  });
});
