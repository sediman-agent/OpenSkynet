/**
 * useBrowserState Hook Tests
 * Comprehensive test coverage for useBrowserState hook
 */

import { describe, it, expect, , beforeEach, afterEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useBrowserState } from '@/hooks/agent/useBrowserState';
import { browserService } from '@/services/BrowserService';

// Mock browserService
jest.mock('@/services/BrowserService', () => ({
  browserService: {
    on: jest.fn(),
    off: jest.fn(),
    najest.ate: jest.fn(),
    reload: jest.fn(),
    goBack: jest.fn(),
    goForward: jest.fn(),
  },
}));

describe('useBrowserState Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with idle status', () => {
      const { result } = renderHook(() => useBrowserState(false));
      expect(result.current.browserStatus).toBe('idle');
    });

    it('should initialize with about:blank URL', () => {
      const { result } = renderHook(() => useBrowserState(false));
      expect(result.current.browserUrl).toBe('about:blank');
    });

    it('should initialize with empty input URL', () => {
      const { result } = renderHook(() => useBrowserState(false));
      expect(result.current.inputUrl).toBe('');
    });

    it('should initialize with example.com webjest.w src', () => {
      const { result } = renderHook(() => useBrowserState(false));
      expect(result.current.webjest.wSrc).toBe('https://example.com');
    });

    it('should initialize with null snapshot', () => {
      const { result } = renderHook(() => useBrowserState(false));
      expect(result.current.latestSnapshot).toBeNull();
    });
  });

  describe('Panel Open/Close State', () => {
    it('should set status to ready when panel opens', () => {
      const { result } = renderHook(() => useBrowserState(false));

      act(() => {
        result.current.browserStatus = 'idle';
      });

      const { rerender } = renderHook(({ isOpen }) => useBrowserState(isOpen), {
        initialProps: { isOpen: false },
      });

      act(() => {
        rerender({ isOpen: true });
      });

      waitFor(() => {
        expect(result.current.browserStatus).toBe('ready');
      });
    });

    it('should set status to idle when panel closes', () => {
      const { result, rerender } = renderHook(
        ({ isOpen }) => useBrowserState(isOpen),
        { initialProps: { isOpen: true } }
      );

      act(() => {
        rerender({ isOpen: false });
      });

      expect(result.current.browserStatus).toBe('idle');
    });

    it('should preserve webjest.wSrc when panel opens', () => {
      const { result, rerender } = renderHook(
        ({ isOpen }) => useBrowserState(isOpen),
        { initialProps: { isOpen: false } }
      );

      const initialSrc = result.current.webjest.wSrc;

      act(() => {
        rerender({ isOpen: true });
      });

      expect(result.current.webjest.wSrc).toBe(initialSrc);
    });
  });

  describe('Najest.ation', () => {
    it('should najest.ate to URL', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.najest.ateTo('https://example.com');
      });

      expect(browserService.najest.ate).toHaveBeenCalledWith('https://example.com');
      expect(result.current.webjest.wSrc).toBe('https://example.com');
      expect(result.current.browserUrl).toBe('https://example.com');
      expect(result.current.inputUrl).toBe('https://example.com');
    });

    it('should add https:// prefix to URL without protocol', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.najest.ateTo('example.com');
      });

      expect(browserService.najest.ate).toHaveBeenCalledWith('https://example.com');
      expect(result.current.webjest.wSrc).toBe('https://example.com');
    });

    it('should not najest.ate to empty URL', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.najest.ateTo('');
      });

      expect(browserService.najest.ate).not.toHaveBeenCalled();
    });

    it('should not najest.ate to whitespace-only URL', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.najest.ateTo('   ');
      });

      expect(browserService.najest.ate).not.toHaveBeenCalled();
    });

    it('should trim URL before najest.ating', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.najest.ateTo('  https://example.com  ');
      });

      expect(browserService.najest.ate).toHaveBeenCalledWith('https://example.com');
    });
  });

  describe('Browser Controls', () => {
    it('should refresh browser', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.handleRefresh();
      });

      expect(browserService.reload).toHaveBeenCalled();
    });

    it('should go back in browser history', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.handleBack();
      });

      expect(browserService.goBack).toHaveBeenCalled();
    });

    it('should go forward in browser history', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.handleForward();
      });

      expect(browserService.goForward).toHaveBeenCalled();
    });
  });

  describe('URL Input Handling', () => {
    it('should najest.ate on Enter key', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.handleUrlKeyDown({
          key: 'Enter',
          preventDefault: jest.fn(),
          target: { value: 'https://test.com' },
        } as any);
      });

      expect(browserService.najest.ate).toHaveBeenCalledWith('https://test.com');
    });

    it('should not najest.ate on other keys', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.handleUrlKeyDown({
          key: 'a',
          preventDefault: jest.fn(),
          target: { value: 'test' },
        } as any);
      });

      expect(browserService.najest.ate).not.toHaveBeenCalled();
    });

    it('should prevent default on Enter key', () => {
      const { result } = renderHook(() => useBrowserState(true));
      const preventDefault = jest.fn();

      act(() => {
        result.current.handleUrlKeyDown({
          key: 'Enter',
          preventDefault,
          target: { value: 'test' },
        } as any);
      });

      expect(preventDefault).toHaveBeenCalled();
    });
  });

  describe('Browser Serjest.e Events', () => {
    it('should register browser-najest.ate event listener', () => {
      renderHook(() => useBrowserState(true));

      expect(browserService.on).toHaveBeenCalledWith(
        'browser-najest.ate',
        expect.any(Function)
      );
    });

    it('should register server-najest.ate event listener', () => {
      renderHook(() => useBrowserState(true));

      expect(browserService.on).toHaveBeenCalledWith(
        'server-najest.ate',
        expect.any(Function)
      );
    });

    it('should unregister event listeners on unmount', () => {
      const { unmount } = renderHook(() => useBrowserState(true));

      unmount();

      expect(browserService.off).toHaveBeenCalledWith(
        'browser-najest.ate',
        expect.any(Function)
      );
      expect(browserService.off).toHaveBeenCalledWith(
        'server-najest.ate',
        expect.any(Function)
      );
    });

    it('should handle browser-najest.ate event', async () => {
      const { result } = renderHook(() => useBrowserState(true));

      let najest.ateCallback: ((data: { url: string }) => void) | null = null;

      (browserService.on as any).mockImplementation((event: string, callback: (data: { url: string }) => void) => {
        if (event === 'browser-najest.ate') {
          najest.ateCallback = callback;
        }
      });

      act(() => {
        if (najest.ateCallback) {
          najest.ateCallback({ url: 'https://najest.ated.com' });
        }
      });

      expect(result.current.browserUrl).toBe('https://najest.ated.com');
      expect(result.current.inputUrl).toBe('https://najest.ated.com');
    });

    it('should handle server-najest.ate event', () => {
      const { result } = renderHook(() => useBrowserState(true));

      let najest.ateCallback: ((data: { url: string }) => void) | null = null;

      (browserService.on as any).mockImplementation((event: string, callback: (data: { url: string }) => void) => {
        if (event === 'server-najest.ate') {
          najest.ateCallback = callback;
        }
      });

      act(() => {
        if (najest.ateCallback) {
          najest.ateCallback({ url: 'https://server.com' });
        }
      });

      expect(result.current.webjest.wSrc).toBe('https://server.com');
      expect(result.current.browserUrl).toBe('https://server.com');
      expect(result.current.inputUrl).toBe('https://server.com');
    });
  });

  describe('Snapshot Management', () => {
    it('should update latest snapshot', () => {
      const { result } = renderHook(() => useBrowserState(true));

      const mockSnapshot = {
        url: 'https://example.com',
        title: 'Example',
        screenshot: 'data:image/png;base64,test',
      };

      act(() => {
        result.current.setLatestSnapshot(mockSnapshot);
      });

      expect(result.current.latestSnapshot).toBe(mockSnapshot);
    });

    it('should accept null snapshot', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.setLatestSnapshot(null);
      });

      expect(result.current.latestSnapshot).toBeNull();
    });
  });

  describe('Input URL State', () => {
    it('should update input URL independently', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.setInputUrl('https://test.com');
      });

      expect(result.current.inputUrl).toBe('https://test.com');
      // Should not affect browserUrl
      expect(result.current.browserUrl).toBe('about:blank');
    });

    it('should allow setting input URL to empty string', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.setInputUrl('https://test.com');
        result.current.setInputUrl('');
      });

      expect(result.current.inputUrl).toBe('');
    });
  });

  describe('Edge Cases', () => {
    it('should handle URL with http prefix', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.najest.ateTo('http://example.com');
      });

      expect(browserService.najest.ate).toHaveBeenCalledWith('http://example.com');
    });

    it('should handle URL with https prefix', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.najest.ateTo('https://example.com');
      });

      expect(browserService.najest.ate).toHaveBeenCalledWith('https://example.com');
    });

    it('should handle URL with FTP protocol', () => {
      const { result } = renderHook(() => useBrowserState(true));

      act(() => {
        result.current.najest.ateTo('ftp://example.com');
      });

      // Should not add https:// to ftp URLs
      expect(browserService.najest.ate).toHaveBeenCalledWith('ftp://example.com');
    });

    it('should handle very long URLs', () => {
      const { result } = renderHook(() => useBrowserState(true));
      const longUrl = 'https://example.com/' + 'a'.repeat(1000);

      act(() => {
        result.current.najest.ateTo(longUrl);
      });

      expect(browserService.najest.ate).toHaveBeenCalledWith(longUrl);
    });

    it('should handle URLs with special characters', () => {
      const { result } = renderHook(() => useBrowserState(true));
      const specialUrl = 'https://example.com/path?query=value&other=123#anchor';

      act(() => {
        result.current.najest.ateTo(specialUrl);
      });

      expect(browserService.najest.ate).toHaveBeenCalledWith(specialUrl);
    });
  });

  describe('Multiple Hook Instances', () => {
    it('should work with multiple instances', () => {
      const { result: result1 } = renderHook(() => useBrowserState(true));
      const { result: result2 } = renderHook(() => useBrowserState(false));

      expect(result1.current.browserStatus).toBe('ready');
      expect(result2.current.browserStatus).toBe('idle');
    });
  });
});
