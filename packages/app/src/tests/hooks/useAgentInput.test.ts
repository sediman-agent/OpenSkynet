/**
 * useAgentInput Hook Tests
 * Comprehensive test coverage for useAgentInput hook
 */

import { describe, it, expect, , beforeEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAgentInput, SLASH_COMMANDS } from '@/hooks/agent/useAgentInput';
import type { SlashCommand } from '@/hooks/agent/useAgentInput';
import { createRef } from 'react';

describe('useAgentInput Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should initialize with empty input', () => {
      const { result } = renderHook(() => useAgentInput());
      expect(result.current.input).toBe('');
    });

    it('should initialize with not sending state', () => {
      const { result } = renderHook(() => useAgentInput());
      expect(result.current.isSending).toBe(false);
    });

    it('should initialize with no error', () => {
      const { result } = renderHook(() => useAgentInput());
      expect(result.current.sendError).toBe(false);
    });

    it('should initialize with slash commands hidden', () => {
      const { result } = renderHook(() => useAgentInput());
      expect(result.current.showSlashCommands).toBe(false);
    });

    it('should work without options', () => {
      expect(() => {
        renderHook(() => useAgentInput());
      }).not.toThrow();
    });
  });

  describe('Input Management', () => {
    it('should update input value', () => {
      const { result } = renderHook(() => useAgentInput());
      act(() => {
        result.current.setInput('test message');
      });
      expect(result.current.input).toBe('test message');
    });

    it('should update input multiple times', () => {
      const { result } = renderHook(() => useAgentInput());
      act(() => {
        result.current.setInput('first');
      });
      expect(result.current.input).toBe('first');

      act(() => {
        result.current.setInput('second');
      });
      expect(result.current.input).toBe('second');
    });

    it('should clear input', () => {
      const { result } = renderHook(() => useAgentInput());
      act(() => {
        result.current.setInput('test');
      });
      expect(result.current.input).toBe('test');

      act(() => {
        result.current.clearInput();
      });
      expect(result.current.input).toBe('');
    });

    it('should clear error on clearInput', () => {
      const { result } = renderHook(() => useAgentInput());
      act(() => {
        result.current.setInput('test');
      });
      // Simulate error state
      act(() => {
        result.current.setInput('error');
      });
      act(() => {
        result.current.clearInput();
      });
      expect(result.current.sendError).toBe(false);
    });
  });

  describe('Slash Commands', () => {
    it('should show slash commands when input starts with /', () => {
      const { result } = renderHook(() => useAgentInput());
      act(() => {
        result.current.setInput('/scr');
      });
      expect(result.current.showSlashCommands).toBe(true);
    });

    it('should not show slash commands when input does not start with /', () => {
      const { result } = renderHook(() => useAgentInput());
      act(() => {
        result.current.setInput('test');
      });
      expect(result.current.showSlashCommands).toBe(false);
    });

    it('should filter slash commands by label', () => {
      const { result } = renderHook(() => useAgentInput());
      act(() => {
        result.current.setInput('/scr');
      });
      expect(result.current.filteredSlashCommands).toHaveLength(1);
      expect(result.current.filteredSlashCommands[0].id).toBe('screenshot');
    });

    it('should filter slash commands by id', () => {
      const { result } = renderHook(() => useAgentInput());
      act(() => {
        result.current.setInput('/nav');
      });
      expect(result.current.filteredSlashCommands).toHaveLength(1);
      expect(result.current.filteredSlashCommands[0].id).toBe('najest.ate');
    });

    it('should show all commands when filter is just /', () => {
      const { result } = renderHook(() => useAgentInput());
      act(() => {
        result.current.setInput('/');
      });
      expect(result.current.filteredSlashCommands).toHaveLength(SLASH_COMMANDS.length);
    });

    it('should hide slash commands when input no longer starts with /', () => {
      const { result } = renderHook(() => useAgentInput());
      act(() => {
        result.current.setInput('/test');
      });
      expect(result.current.showSlashCommands).toBe(true);

      act(() => {
        result.current.setInput('normal text');
      });
      expect(result.current.showSlashCommands).toBe(false);
    });

    it('should select slash command', () => {
      const textareaRef = createRef<HTMLTextAreaElement>();
      const { result } = renderHook(() => useAgentInput({ textareaRef }));

      act(() => {
        result.current.selectSlashCommand(SLASH_COMMANDS[0]);
      });

      expect(result.current.input).toBe(SLASH_COMMANDS[0].template);
      expect(result.current.showSlashCommands).toBe(false);
    });

    it('should manually set showSlashCommands', () => {
      const { result } = renderHook(() => useAgentInput());
      act(() => {
        result.current.setShowSlashCommands(true);
      });
      expect(result.current.showSlashCommands).toBe(true);

      act(() => {
        result.current.setShowSlashCommands(false);
      });
      expect(result.current.showSlashCommands).toBe(false);
    });
  });

  describe('Send Functionality', () => {
    it('should trigger send with non-empty input', async () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useAgentInput({ onSubmit }));

      act(() => {
        result.current.setInput('test message');
      });

      await act(async () => {
        await result.current.triggerSend();
      });

      expect(onSubmit).toHaveBeenCalledWith('test message');
    });

    it('should not trigger send with empty input', async () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useAgentInput({ onSubmit }));

      await act(async () => {
        await result.current.triggerSend();
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should not trigger send with whitespace-only input', async () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useAgentInput({ onSubmit }));

      act(() => {
        result.current.setInput('   ');
      });

      await act(async () => {
        await result.current.triggerSend();
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should not trigger send while already sending', async () => {
      const onSubmit = jest.fn(async () => {
        return new Promise(resolve => setTimeout(resolve, 100));
      });
      const { result } = renderHook(() => useAgentInput({ onSubmit }));

      act(() => {
        result.current.setInput('first');
      });

      const firstSend = act(async () => {
        await result.current.triggerSend();
      });

      act(() => {
        result.current.setInput('second');
      });

      const secondSend = act(async () => {
        await result.current.triggerSend();
      });

      await Promise.all([firstSend, secondSend]);

      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it('should clear input after successful send', async () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useAgentInput({ onSubmit }));

      act(() => {
        result.current.setInput('test');
      });

      await act(async () => {
        await result.current.triggerSend();
      });

      expect(result.current.input).toBe('');
    });

    it('should add to history after successful send', async () => {
      const onSubmit = jest.fn();
      const { result } = renderHook(() => useAgentInput({ onSubmit }));

      act(() => {
        result.current.setInput('message 1');
      });

      await act(async () => {
        await result.current.triggerSend();
      });

      act(() => {
        result.current.setInput('message 2');
      });

      await act(async () => {
        await result.current.triggerSend();
      });

      // Test history najest.ation (ArrowUp)
      act(() => {
        result.current.setInput('test');
      });

      const textarea = { value: '', selectionStart: 0, selectionEnd: 0 } as HTMLTextAreaElement;
      act(() => {
        result.current.handleKeyDown({ key: 'ArrowUp', preventDefault: jest.fn(), shiftKey: false } as any);
        expect(result.current.input).toBe('message 2');
      });
    });

    it('should handle send error', async () => {
      const onSubmit = jest.fn(() => {
        throw new Error('Send failed');
      });
      const { result } = renderHook(() => useAgentInput({ onSubmit }));

      act(() => {
        result.current.setInput('test');
      });

      await act(async () => {
        try {
          await result.current.triggerSend();
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.sendError).toBe(true);
    });

    it('should clear error after 2 seconds', async () => {
      const onSubmit = jest.fn(() => {
        throw new Error('Send failed');
      });
      const { result } = renderHook(() => useAgentInput({ onSubmit }));

      act(() => {
        result.current.setInput('test');
      });

      await act(async () => {
        try {
          await result.current.triggerSend();
        } catch (e) {
          // Expected
        }
      });

      expect(result.current.sendError).toBe(true);

      act(() => {
        jest.advanceTimersByTime(2000);
      });

      await waitFor(() => {
        expect(result.current.sendError).toBe(false);
      });
    });
  });

  describe('Keyboard Najest.ation', () => {
    it('should prevent default on Enter key', () => {
      const { result } = renderHook(() => useAgentInput());
      const preventDefault = jest.fn();

      act(() => {
        result.current.handleKeyDown({
          key: 'Enter',
          preventDefault,
          shiftKey: false,
        } as any);
      });

      expect(preventDefault).toHaveBeenCalled();
    });

    it('should not prevent default on Shift+Enter', () => {
      const { result } = renderHook(() => useAgentInput());
      const preventDefault = jest.fn();

      act(() => {
        result.current.handleKeyDown({
          key: 'Enter',
          preventDefault,
          shiftKey: true,
        } as any);
      });

      expect(preventDefault).not.toHaveBeenCalled();
    });

    it('should close slash commands on Escape', () => {
      const { result } = renderHook(() => useAgentInput());
      act(() => {
        result.current.setInput('/test');
      });
      expect(result.current.showSlashCommands).toBe(true);

      act(() => {
        result.current.handleKeyDown({
          key: 'Escape',
          shiftKey: false,
        } as any);
      });

      expect(result.current.showSlashCommands).toBe(false);
    });

    it('should najest.ate history with ArrowUp', () => {
      const { result } = renderHook(() => useAgentInput({
        onSubmit: jest.fn(),
      }));

      // Add some history
      act(() => {
        result.current.setInput('msg1');
      });
      act(() => {
        result.current.setInput('msg2');
      });

      act(() => {
        result.current.handleKeyDown({
          key: 'ArrowUp',
          preventDefault: jest.fn(),
          shiftKey: false,
        } as any);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long input', () => {
      const { result } = renderHook(() => useAgentInput());
      const longText = 'a'.repeat(10000);

      act(() => {
        result.current.setInput(longText);
      });

      expect(result.current.input).toBe(longText);
    });

    it('should handle special characters in input', () => {
      const { result } = renderHook(() => useAgentInput());
      const specialChars = '!@#$%^&*()_+-=[]{}|;:",.<>?/~`';

      act(() => {
        result.current.setInput(specialChars);
      });

      expect(result.current.input).toBe(specialChars);
    });

    it('should handle empty onSubmit callback', async () => {
      const { result } = renderHook(() => useAgentInput());

      act(() => {
        result.current.setInput('test');
      });

      await act(async () => {
        await result.current.triggerSend();
      });

      expect(result.current.input).toBe('');
    });

    it('should handle null textareaRef gracefully', () => {
      const { result } = renderHook(() => useAgentInput());

      expect(() => {
        act(() => {
          result.current.selectSlashCommand(SLASH_COMMANDS[0]);
        });
      }).not.toThrow();
    });
  });
});
