/**
 * useChatStore Tests
 * Comprehensive test coverage for useChatStore
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useChatStore } from '@/stores/useChatStore';
import type { Conversation, Message, ToolCallRecord } from '@/types';
import type { ConversationService } from '@/services/conversationService';

// Mock conversationService
jest.mock('@/services/conversationService', () => ({
  getConversationService: jest.fn(),
}));

describe('useChatStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store between tests
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      version: 0,
      _synced: false,
  });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with empty conversations', () => {
      const { result } = renderHook(() => useChatStore());
      expect(result.current.conversations).toEqual([]);
  });

    it('should initialize with null active conversation', () => {
      const { result } = renderHook(() => useChatStore());
      expect(result.current.activeConversationId).toBeNull();
  });

    it('should initialize with version 0', () => {
      const { result } = renderHook(() => useChatStore());
      expect(result.current.version).toBe(0);
  });

    it('should initialize with synced flag false', () => {
      const { result } = renderHook(() => useChatStore());
      expect(result.current._synced).toBe(false);
  });
  });

  describe('Conversation Management', () => {
    it('should create a new conversation', async () => {
      const mockService = {
        createConversation: jest.fn().mockResolvedValue({
          id: '123',
          title: 'New Chat',
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.createConversation('Test Chat');
  });

      expect(result.current.conversations).toHaveLength(1);
      expect(result.current.conversations[0].title).toBe('Test Chat');
      expect(result.current.activeConversationId).toBe('123');
  });

    it('should create conversation with default title when none provided', async () => {
      const mockService = {
        createConversation: jest.fn().mockResolvedValue({
          id: '123',
          title: 'New Chat',
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.createConversation();
  });

      expect(result.current.conversations[0].title).toBe('New Chat');
  });

    it('should handle server error when creating conversation', async () => {
      const mockService = {
        createConversation: jest.fn().mockRejectedValue(new Error('Server error')),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        const convo = await result.current.createConversation('Test');
        expect(convo).toBeDefined();
        expect(convo.title).toBe('Test');
  });

      expect(result.current.conversations).toHaveLength(1);
  });

    it('should delete a conversation', async () => {
      const mockService = {
        deleteConversation: jest.fn().mockResolvedValue(true),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      // Add a conversation first
      act(() => {
        result.current.setState({
          conversations: [
            { id: '1', title: 'Test', messages: [], createdAt: new Date(), updatedAt: new Date() },
          ],
          activeConversationId: '1',
  });
  });

      expect(result.current.conversations).toHaveLength(1);

      await act(async () => {
        const success = await result.current.deleteConversation('1');
        expect(success).toBe(true);
  });

      expect(result.current.conversations).toHaveLength(0);
      expect(result.current.activeConversationId).toBeNull();
  });

    it('should update conversation title', async () => {
      const mockService = {
        updateConversationTitle: jest.fn().mockResolvedValue(undefined),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      // Add a conversation
      act(() => {
        result.current.setState({
          conversations: [
            { id: '1', title: 'Old Title', messages: [], createdAt: new Date(), updatedAt: new Date() },
          ],
  });
  });

      await act(async () => {
        await result.current.updateConversationTitle('1', 'New Title');
  });

      expect(result.current.conversations[0].title).toBe('New Title');
  });

    it('should select conversation', async () => {
      const mockService = {
        getConversation: jest.fn().mockResolvedValue({
          id: '1',
          title: 'Test',
          messages: [
            { id: 'm1', role: 'user', content: 'Hello', timestamp: new Date() },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setState({
          conversations: [
            { id: '1', title: 'Test', messages: [], createdAt: new Date(), updatedAt: new Date() },
          ],
  });
  });

      await act(async () => {
        await result.current.selectConversation('1');
  });

      expect(result.current.activeConversationId).toBe('1');
      expect(result.current.conversations[0].messages).toHaveLength(1);
  });
  });

  describe('Message Management', () => {
    it('should add message to conversation', async () => {
      const mockService = {
        addMessage: jest.fn().mockResolvedValue({
          id: 'server-id',
          role: 'user',
          content: 'Hello',
          timestamp: new Date(),
        }),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setState({
          conversations: [
            { id: '1', title: 'Test', messages: [], createdAt: new Date(), updatedAt: new Date() },
          ],
  });
  });

      const message: Omit<Message, 'id' | 'timestamp'> = {
        role: 'user',
        content: 'Hello',
      };

      await act(async () => {
        await result.current.addMessage('1', message);
  });

      expect(result.current.conversations[0].messages).toHaveLength(1);
      expect(result.current.conversations[0].messages[0].id).toBe('server-id');
  });

    it('should update message content', async () => {
      const mockService = {
        updateMessage: jest.fn().mockResolvedValue(undefined),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setState({
          conversations: [
            {
              id: '1',
              title: 'Test',
              messages: [
                { id: 'm1', role: 'user', content: 'Old', timestamp: new Date() },
              ],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
  });
  });

      await act(async () => {
        await result.current.updateMessage('1', 'm1', { content: 'New' });
  });

      expect(result.current.conversations[0].messages[0].content).toBe('New');
  });

    it('should append to message content', () => {
      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setState({
          conversations: [
            {
              id: '1',
              title: 'Test',
              messages: [
                { id: 'm1', role: 'user', content: 'Hello', timestamp: new Date() },
              ],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
  });
  });

      act(() => {
        result.current.appendToMessage('1', 'm1', ' World');
  });

      expect(result.current.conversations[0].messages[0].content).toBe('Hello World');
  });

    it('should set message status', async () => {
      const mockService = {
        updateMessage: jest.fn().mockResolvedValue(undefined),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setState({
          conversations: [
            {
              id: '1',
              title: 'Test',
              messages: [
                { id: 'm1', role: 'user', content: 'Hello', status: 'streaming', timestamp: new Date() },
              ],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
  });
  });

      await act(async () => {
        await result.current.setMessageStatus('1', 'm1', 'done');
  });

      expect(result.current.conversations[0].messages[0].status).toBe('done');
  });
  });

  describe('Tool Call Management', () => {
    it('should add tool call to message', async () => {
      const mockService = {
        addToolCall: jest.fn().mockResolvedValue(undefined),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setState({
          conversations: [
            {
              id: '1',
              title: 'Test',
              messages: [
                { id: 'm1', role: 'assistant', content: 'Response', toolCalls: [], timestamp: new Date() },
              ],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
  });
  });

      const toolCall: ToolCallRecord = {
        id: 'tc1',
        action: 'click',
        detail: 'Click button',
        status: 'success',
        startedAt: Date.now(),
        completedAt: Date.now() + 100,
      };

      await act(async () => {
        await result.current.addToolCall('1', 'm1', toolCall);
  });

      expect(result.current.conversations[0].messages[0].toolCalls).toHaveLength(1);
      expect(result.current.conversations[0].messages[0].toolCalls?.[0].id).toBe('tc1');
  });

    it('should update tool call', async () => {
      const mockService = {
        updateToolCall: jest.fn().mockResolvedValue(undefined),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      const toolCall: ToolCallRecord = {
        id: 'tc1',
        action: 'click',
        detail: 'Click button',
        status: 'pending',
        startedAt: Date.now(),
      };

      act(() => {
        result.current.setState({
          conversations: [
            {
              id: '1',
              title: 'Test',
              messages: [
                { id: 'm1', role: 'assistant', content: 'Response', toolCalls: [toolCall], timestamp: new Date() },
              ],
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
  });
  });

      await act(async () => {
        await result.current.updateToolCall('1', 'm1', 'tc1', { status: 'success' });
  });

      expect(result.current.conversations[0].messages[0].toolCalls?.[0].status).toBe('success');
  });
  });

  describe('Utility Functions', () => {
    it('should get conversation by id', () => {
      const { result } = renderHook(() => useChatStore());

      const conversation: Conversation = {
        id: '123',
        title: 'Test',
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      act(() => {
        result.current.setState({
          conversations: [conversation],
  });
  });

      const found = result.current.getConversation('123');
      expect(found).toBe(conversation);
  });

    it('should return undefined for non-existent conversation', () => {
      const { result } = renderHook(() => useChatStore());

      const found = result.current.getConversation('non-existent');
      expect(found).toBeUndefined();
  });
  });

  describe('Version Increment', () => {
    it('should increment version on create conversation', async () => {
      const mockService = {
        createConversation: jest.fn().mockResolvedValue({
          id: '123',
          title: 'New',
          messages: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());
      const initialVersion = result.current.version;

      await act(async () => {
        await result.current.createConversation();
  });

      expect(result.current.version).toBe(initialVersion + 1);
  });

    it('should increment version on add message', async () => {
      const mockService = {
        addMessage: jest.fn().mockResolvedValue({
          id: 'm1',
          role: 'user',
          content: 'Test',
          timestamp: new Date(),
        }),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      act(() => {
        result.current.setState({
          conversations: [
            { id: '1', title: 'Test', messages: [], createdAt: new Date(), updatedAt: new Date() },
          ],
  });
  });

      const initialVersion = result.current.version;

      await act(async () => {
        await result.current.addMessage('1', { role: 'user', content: 'Test' });
  });

      expect(result.current.version).toBe(initialVersion + 1);
  });
  });

  describe('Sync with Server', () => {
    it('should sync conversations with server', async () => {
      const serverConversations = [
        { id: '1', title: 'Server Chat', messages: [], createdAt: new Date(), updatedAt: new Date() },
      ];

      const mockService = {
        getConversations: jest.fn().mockResolvedValue(serverConversations),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.syncWithServer();
  });

      expect(result.current.conversations).toEqual(serverConversations);
      expect(result.current._synced).toBe(true);
  });

    it('should not sync twice', async () => {
      const mockService = {
        getConversations: jest.fn().mockResolvedValue([]),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      jest.mocked(getConversationService).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.syncWithServer();
  });

      const callCount = mockService.getConversations as Mock;

      await act(async () => {
        await result.current.syncWithServer();
  });

      expect(callCount).toHaveBeenCalledTimes(1);
  });
  });
  });
