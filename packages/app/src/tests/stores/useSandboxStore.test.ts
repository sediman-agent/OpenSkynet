/**
 * useSandboxStore Tests
 * Comprehensive test coverage for useSandboxStore
 */

import { describe, it, expect,  beforeEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useSandboxStore } from '@/stores/useSandboxStore';

describe('useSandboxStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useSandboxStore.setState({
      isOpen: true,
      isActive: false,
      sandboxType: 'browser',
      controlMode: 'agent',
      connectionStatus: 'disconnected',
      currentSession: null,
      isStreaming: false,
      lastScreenshot: null,
      streamError: null,
      isStarting: false,
      isStopping: false,
      error: null,
    });
  });

  describe('Initial State', () => {
    it('should initialize with panel open', () => {
      const { result } = renderHook(() => useSandboxStore());
      expect(result.current.isOpen).toBe(true);
    });

    it('should initialize with inactive sandbox', () => {
      const { result } = renderHook(() => useSandboxStore());
      expect(result.current.isActive).toBe(false);
    });

    it('should initialize with browser sandbox type', () => {
      const { result } = renderHook(() => useSandboxStore());
      expect(result.current.sandboxType).toBe('browser');
    });

    it('should initialize with agent control mode', () => {
      const { result } = renderHook(() => useSandboxStore());
      expect(result.current.controlMode).toBe('agent');
    });

    it('should initialize with disconnected status', () => {
      const { result } = renderHook(() => useSandboxStore());
      expect(result.current.connectionStatus).toBe('disconnected');
    });

    it('should initialize with no current session', () => {
      const { result } = renderHook(() => useSandboxStore());
      expect(result.current.currentSession).toBeNull();
    });

    it('should initialize with not streaming', () => {
      const { result } = renderHook(() => useSandboxStore());
      expect(result.current.isStreaming).toBe(false);
    });

    it('should initialize with no screenshot', () => {
      const { result } = renderHook(() => useSandboxStore());
      expect(result.current.lastScreenshot).toBeNull();
    });

    it('should initialize with no error', () => {
      const { result } = renderHook(() => useSandboxStore());
      expect(result.current.error).toBeNull();
    });
  });

  describe('Panel Toggle', () => {
    it('should toggle panel from open to closed', () => {
      const { result } = renderHook(() => useSandboxStore());
      expect(result.current.isOpen).toBe(true);

      act(() => {
        result.current.togglePanel();
      });

      expect(result.current.isOpen).toBe(false);
    });

    it('should toggle panel from closed to open', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setOpen(false);
      });

      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.togglePanel();
      });

      expect(result.current.isOpen).toBe(true);
    });

    it('should activate sandbox when opening panel', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setOpen(false);
        result.current.setIsActive(false);
      });

      act(() => {
        result.current.togglePanel();
      });

      expect(result.current.isActive).toBe(true);
    });

    it('should deactivate sandbox when closing panel', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.togglePanel();
      });

      expect(result.current.isActive).toBe(false);
    });

    it('should set connection status to connecting when opening', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setOpen(false);
      });

      act(() => {
        result.current.togglePanel();
      });

      expect(result.current.connectionStatus).toBe('connecting');
    });

    it('should set connection status to disconnected when closing', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setOpen(true);
        result.current.setConnectionStatus('connected');
      });

      act(() => {
        result.current.togglePanel();
      });

      expect(result.current.connectionStatus).toBe('disconnected');
    });
  });

  describe('Panel Open State', () => {
    it('should set panel to open', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setOpen(false);
      });

      act(() => {
        result.current.setOpen(true);
      });

      expect(result.current.isOpen).toBe(true);
    });

    it('should set panel to closed', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setOpen(false);
      });

      expect(result.current.isOpen).toBe(false);
    });

    it('should activate sandbox when opening', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setOpen(true);
      });

      expect(result.current.isActive).toBe(true);
    });

    it('should set connection status to connecting when opening', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setOpen(true);
      });

      expect(result.current.connectionStatus).toBe('connecting');
    });

    it('should set connection status to disconnected when closing', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setOpen(false);
      });

      expect(result.current.connectionStatus).toBe('disconnected');
    });
  });

  describe('Control Mode', () => {
    it('should set control mode to agent', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setControlMode('agent');
      });

      expect(result.current.controlMode).toBe('agent');
    });

    it('should set control mode to user', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setControlMode('user');
      });

      expect(result.current.controlMode).toBe('user');
    });

    it('should set control mode to shared', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setControlMode('shared');
      });

      expect(result.current.controlMode).toBe('shared');
    });
  });

  describe('Active State', () => {
    it('should set sandbox to active', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setIsActive(true);
      });

      expect(result.current.isActive).toBe(true);
    });

    it('should set sandbox to inactive', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setIsActive(true);
      });

      act(() => {
        result.current.setIsActive(false);
      });

      expect(result.current.isActive).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should set error message', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setError('Something went wrong');
      });

      expect(result.current.error).toBe('Something went wrong');
    });

    it('should clear error message', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setError('Test error');
      });

      expect(result.current.error).toBe('Test error');

      act(() => {
        result.current.setError(null);
      });

      expect(result.current.error).toBeNull();
    });

    it('should set error to empty string', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setError('');
      });

      expect(result.current.error).toBe('');
    });
  });

  describe('State Mutations', () => {
    it('should allow setting connection status', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setConnectionStatus('connected');
      });

      expect(result.current.connectionStatus).toBe('connected');
    });

    it('should allow setting sandbox type', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setSandboxType('computer');
      });

      expect(result.current.sandboxType).toBe('computer');
    });

    it('should allow setting current session', () => {
      const { result } = renderHook(() => useSandboxStore());

      const session = {
        id: '123',
        type: 'browser',
        startedAt: Date.now(),
        controlMode: 'agent',
      };

      act(() => {
        result.current.setCurrentSession(session);
      });

      expect(result.current.currentSession).toEqual(session);
    });
  });

  describe('Streaming State', () => {
    it('should set streaming to true', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setIsStreaming(true);
      });

      expect(result.current.isStreaming).toBe(true);
    });

    it('should set streaming to false', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setIsStreaming(true);
      });

      act(() => {
        result.current.setIsStreaming(false);
      });

      expect(result.current.isStreaming).toBe(false);
    });

    it('should set last screenshot', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setLastScreenshot('data:image/png;base64,test');
      });

      expect(result.current.lastScreenshot).toBe('data:image/png;base64,test');
    });

    it('should clear last screenshot', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setLastScreenshot('test');
      });

      act(() => {
        result.current.setLastScreenshot(null);
      });

      expect(result.current.lastScreenshot).toBeNull();
    });

    it('should set stream error', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setStreamError('Stream failed');
      });

      expect(result.current.streamError).toBe('Stream failed');
    });
  });

  describe('Loading States', () => {
    it('should set starting state', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setIsStarting(true);
      });

      expect(result.current.isStarting).toBe(true);
    });

    it('should set stopping state', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setIsStopping(true);
      });

      expect(result.current.isStopping).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid toggle calls', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.togglePanel();
        result.current.togglePanel();
        result.current.togglePanel();
        result.current.togglePanel();
      });

      // Should settle at closed (started open, 4 toggles = closed)
      expect(result.current.isOpen).toBe(true);
    });

    it('should handle setting same control mode', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setControlMode('agent');
        result.current.setControlMode('agent');
      });

      expect(result.current.controlMode).toBe('agent');
    });

    it('should handle switching between all control modes', () => {
      const { result } = renderHook(() => useSandboxStore());

      act(() => {
        result.current.setControlMode('agent');
        result.current.setControlMode('user');
        result.current.setControlMode('shared');
        result.current.setControlMode('agent');
      });

      expect(result.current.controlMode).toBe('agent');
    });

    it('should handle setting error with special characters', () => {
      const { result } = renderHook(() => useSandboxStore());

      const specialError = 'Error: @#$%^&*()';

      act(() => {
        result.current.setError(specialError);
      });

      expect(result.current.error).toBe(specialError);
    });

    it('should handle very long error messages', () => {
      const { result } = renderHook(() => useSandboxStore());

      const longError = 'a'.repeat(10000);

      act(() => {
        result.current.setError(longError);
      });

      expect(result.current.error).toBe(longError);
    });
  });

  describe('Type Safety', () => {
    it('should only accept valid sandbox types', () => {
      const { result } = renderHook(() => useSandboxStore());

      expect(() => {
        act(() => {
          result.current.setSandboxType('browser');
        });
      }).not.toThrow();

      expect(() => {
        act(() => {
          result.current.setSandboxType('computer');
        });
      }).not.toThrow();
    });

    it('should only accept valid control modes', () => {
      const { result } = renderHook(() => useSandboxStore());

      ['agent', 'user', 'shared'].forEach(mode => {
        expect(() => {
          act(() => {
            result.current.setControlMode(mode);
          });
        }).not.toThrow();
      });
    });

    it('should only accept valid connection statuses', () => {
      const { result } = renderHook(() => useSandboxStore());

      ['disconnected', 'connecting', 'connected', 'error'].forEach(status => {
        expect(() => {
          act(() => {
            result.current.setConnectionStatus(status);
          });
        }).not.toThrow();
      });
    });
  });
});
