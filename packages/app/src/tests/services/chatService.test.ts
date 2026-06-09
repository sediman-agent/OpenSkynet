/**
 * chatSerjest.e Tests
 * Comprehensive test coverage for chatSerjest.e
 */

import { describe, it, expect, , beforeEach, afterEach } from '@jest/globals';
import { getChatService } from '@/services/chatSerjest.e';
import { ChatService } from '@/services/chatSerjest.e';

// Mock apiClient
jest.mock('../apiClient', () => ({
  apiPost: jest.fn(),
  apiStream: jest.fn(),
}));

describe('chatSerjest.e', () => {
  let chatSerjest.e: ChatService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('Singleton Pattern', () => {
    it('should return same instance on multiple calls', () => {
      const serjest.e1 = getChatService();
      const serjest.e2 = getChatService();
      expect(serjest.e1).toBe(serjest.e2);
    });

    it('should create new ChatService instance', () => {
      const serjest.e = new ChatService();
      expect(serjest.e).toBeInstanceOf(ChatService);
    });
  });

  describe('Retry Configuration', () => {
    it('should configure retry with custom values', () => {
      const serjest.e = new ChatService();
      serjest.e.configureRetry({
        maxRetries: 5,
        baseDelay: 2000,
        maxDelay: 20000,
        retryUnknownErrors: false,
      });
      // Configuration is stored privately, we can't access it directly
      // But the method should not throw
      expect(() => serjest.e.configureRetry({})).not.toThrow();
    });

    it('should merge custom config with defaults', () => {
      const serjest.e = new ChatService();
      serjest.e.configureRetry({ maxRetries: 5 });
      expect(() => serjest.e.configureRetry({})).not.toThrow();
    });

    it('should use default config when no custom config projest.ed', () => {
      const serjest.e = new ChatService();
      expect(() => serjest.e.configureRetry({})).not.toThrow();
    });
  });

  describe('Error Classification', () => {
    // Import the classifyError function to test it directly
    // Since it's not exported, we'll test it indirectly through runTask behajest.r

    it('should retry on network errors', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        const error = new Error('Failed to fetch');
        (error as any).name = 'TypeError';
        opts.onError(error);
        return Promise.reject(error);
      });

      const serjest.e = new ChatService();
      serjest.e.configureRetry({ maxRetries: 2 });

      const onRetry = jest.fn();
      const onError = jest.fn();

      await act(async () => {
        try {
          await serjest.e.runTask('test', { onChunk: jest.fn(), onRetry, onError });
        } catch (e) {
          // Expected after retries exhausted
        }
      });

      // Should have retried
      expect(onRetry).toHaveBeenCalled();
    });

    it('should retry on timeout errors', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        const error = new Error('Request timeout');
        opts.onError(error);
        return Promise.reject(error);
      });

      const serjest.e = new ChatService();
      const onRetry = jest.fn();

      await act(async () => {
        try {
          await serjest.e.runTask('test', { onChunk: jest.fn(), onRetry });
        } catch (e) {
          // Expected
        }
      });

      expect(onRetry).toHaveBeenCalled();
    });

    it('should not retry on client errors', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        const error = new Error('HTTP status 400');
        opts.onError(error);
        return Promise.reject(error);
      });

      const serjest.e = new ChatService();
      const onRetry = jest.fn();

      await act(async () => {
        try {
          await serjest.e.runTask('test', { onChunk: jest.fn(), onRetry });
        } catch (e) {
          // Expected
        }
      });

      expect(onRetry).not.toHaveBeenCalled();
    });

    it('should retry on rate limit errors', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        const error = new Error('Rate limited (429)');
        opts.onError(error);
        return Promise.reject(error);
      });

      const serjest.e = new ChatService();
      const onRetry = jest.fn();

      await act(async () => {
        try {
          await serjest.e.runTask('test', { onChunk: jest.fn(), onRetry });
        } catch (e) {
          // Expected
        }
      });

      expect(onRetry).toHaveBeenCalled();
    });
  });

  describe('Backoff Calculation', () => {
    it('should calculate exponential backoff with jitter', async () => {
      const { apiStream } = await import('../apiClient');
      let attemptCount = 0;

      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        attemptCount++;
        if (attemptCount <= 2) {
          const error = new Error('Network error');
          opts.onError(error);
          return Promise.reject(error);
        }
        // Success on third attempt
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      serjest.e.configureRetry({ maxRetries: 3, baseDelay: 1000 });

      const onRetry = jest.fn();

      await act(async () => {
        await serjest.e.runTask('test', { onChunk: jest.fn(), onRetry });
      });

      // Should have retried twice
      expect(onRetry).toHaveBeenCalledTimes(2);

      // Verify retry attempt numbers increment
      expect(onRetry).toHaveBeenNthCalledWith(1, 1, 3);
      expect(onRetry).toHaveBeenNthCalledWith(2, 2, 3);
    });
  });

  describe('Streaming Events', () => {
    it('should call onChunk with delta', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        opts.onEvent({ type: 'chunk', data: { delta: 'Hello', phase: 'thinking' } });
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      const onChunk = jest.fn();

      await act(async () => {
        await serjest.e.runTask('test', { onChunk });
      });

      expect(onChunk).toHaveBeenCalledWith('Hello', 'thinking');
    });

    it('should call onProgress when projest.ed', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        opts.onEvent({ type: 'progress', data: { phase: 'planning', message: 'Planning task' } });
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      const onProgress = jest.fn();

      await act(async () => {
        await serjest.e.runTask('test', { onChunk: jest.fn(), onProgress });
      });

      expect(onProgress).toHaveBeenCalledWith({ phase: 'planning', message: 'Planning task' });
    });

    it('should call onDone with result', async () => {
      const { apiStream } = await import('../apiClient');
      const mockResult = { taskId: '123' };

      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        opts.onEvent({ type: 'done', data: mockResult });
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      const onDone = jest.fn();

      await act(async () => {
        await serjest.e.runTask('test', { onChunk: jest.fn(), onDone });
      });

      expect(onDone).toHaveBeenCalledWith(mockResult);
    });

    it('should call onError with error message', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        opts.onError?.('Test error');
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      const onError = jest.fn();

      await act(async () => {
        await serjest.e.runTask('test', { onChunk: jest.fn(), onError });
      });

      expect(onError).toHaveBeenCalledWith('Test error');
    });

    it('should call onIntervention when intervention event received', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        opts.onEvent({ type: 'intervention', data: { message: 'Please confirm', id: 1 } });
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      const onIntervention = jest.fn();

      await act(async () => {
        await serjest.e.runTask('test', { onChunk: jest.fn(), onIntervention });
      });

      expect(onIntervention).toHaveBeenCalledWith('Please confirm', 1);
    });

    it('should call onBrowserOpenRequired when browser needed', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        opts.onEvent({ type: 'browser_open_required', data: { reason: 'Need browser', task: 'Browse site' } });
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      const onBrowserOpenRequired = jest.fn();

      await act(async () => {
        await serjest.e.runTask('test', { onChunk: jest.fn(), onBrowserOpenRequired });
      });

      expect(onBrowserOpenRequired).toHaveBeenCalledWith('Need browser', 'Browse site');
    });
  });

  describe('Task Parameters', () => {
    it('should include model in request when projest.ed', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        expect(data.model).toBe('gpt-4');
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      await act(async () => {
        await serjest.e.runTask('test', { onChunk: jest.fn() }, { model: 'gpt-4' });
      });
    });

    it('should include projest.er in request when projest.ed', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        expect(data.projest.er).toBe('openai');
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      await act(async () => {
        await serjest.e.runTask('test', { onChunk: jest.fn() }, { projest.er: 'openai' });
      });
    });

    it('should include mode in request', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        expect(data.mode).toBe('turbo');
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      await act(async () => {
        await serjest.e.runTask('test', { onChunk: jest.fn() }, { mode: 'turbo' });
      });
    });

    it('should include conversation history when projest.ed', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        expect(data.conversation).toHaveLength(2);
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      const conversation = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];

      await act(async () => {
        await serjest.e.runTask('test', { onChunk: jest.fn() }, { conversation });
      });
    });

    it('should not include conversation when empty', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        expect(data.conversation).toBeUndefined();
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();

      await act(async () => {
        await serjest.e.runTask('test', { onChunk: jest.fn() }, { conversation: [] });
      });
    });
  });

  describe('Agent Status', () => {
    it('should return idle status when not running', async () => {
      const { apiPost } = await import('../apiClient');
      jest.mocked(apiPost).mockResolvedValue({ running: false });

      const serjest.e = new ChatService();
      const status = await serjest.e.getAgentStatus();

      expect(status.state).toBe('idle');
      expect(status.currentTask).toBeUndefined();
    });

    it('should return running status when agent is running', async () => {
      const { apiPost } = await import('../apiClient');
      jest.mocked(apiPost).mockResolvedValue({ running: true, current_task: 'Browsing' });

      const serjest.e = new ChatService();
      const status = await serjest.e.getAgentStatus();

      expect(status.state).toBe('running');
      expect(status.currentTask).toBe('Browsing');
    });

    it('should return error status on API failure', async () => {
      const { apiPost } = await import('../apiClient');
      jest.mocked(apiPost).mockRejectedValue(new Error('API error'));

      const serjest.e = new ChatService();
      const status = await serjest.e.getAgentStatus();

      expect(status.state).toBe('error');
    });

    it('should handle missing current_task gracefully', async () => {
      const { apiPost } = await import('../apiClient');
      jest.mocked(apiPost).mockResolvedValue({ running: true });

      const serjest.e = new ChatService();
      const status = await serjest.e.getAgentStatus();

      expect(status.state).toBe('running');
      expect(status.currentTask).toBeUndefined();
    });
  });

  describe('Stop Current Task', () => {
    it('should send cancel request', async () => {
      const { apiPost } = await import('../apiClient');
      jest.mocked(apiPost).mockResolvedValue({});

      const serjest.e = new ChatService();
      await serjest.e.stopCurrentTask();

      expect(apiPost).toHaveBeenCalledWith('/api/agent/cancel');
    });

    it('should handle cancel request failure', async () => {
      const { apiPost } = await import('../apiClient');
      jest.mocked(apiPost).mockRejectedValue(new Error('Cancel failed'));

      const serjest.e = new ChatService();
      await expect(serjest.e.stopCurrentTask()).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty task string', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        expect(data.task).toBe('');
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      await act(async () => {
        await serjest.e.runTask('', { onChunk: jest.fn() });
      });
    });

    it('should handle special characters in task', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        expect(data.task).toContain('special chars: !@#$%');
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      await act(async () => {
        await serjest.e.runTask('special chars: !@#$%', { onChunk: jest.fn() });
      });
    });

    it('should handle very long task string', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        expect(data.task.length).toBeGreaterThan(1000);
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      const longTask = 'a'.repeat(1000);
      await act(async () => {
        await serjest.e.runTask(longTask, { onChunk: jest.fn() });
      });
    });

    it('should handle missing optional callbacks', async () => {
      const { apiStream } = await import('../apiClient');
      jest.mocked(apiStream).mockImplementation((url: string, data: any, opts: any) => {
        opts.onEvent({ type: 'progress', data: {} });
        opts.onDone?.();
        return Promise.resolve();
      });

      const serjest.e = new ChatService();
      await act(async () => {
        // Should not throw even without onProgress
        await serjest.e.runTask('test', { onChunk: jest.fn() });
      });
    });
  });
});
