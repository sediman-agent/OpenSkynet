import { renderHook, act } from '@testing-library/react';
import { useChatStore } from '@/stores/useChatStore';
import type { Message } from '@/types';
import type { ConversationService } from '@/services/conversationService';

// Mock conversationService
jest.mock('@/services/conversationService', () => ({
  getConversationService: jest.fn(),
}));

describe('Streaming Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store before each test
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      version: 0,
    });
  });

  describe('Message ID Preservation', () => {
    it('should preserve message ID when provided', async () => {
      const mockService = {
        createConversation: jest.fn().mockImplementation((title) =>
          Promise.resolve({
            id: '123',
            title: title || 'New Chat',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      (getConversationService as jest.Mock).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      const messageId = 'test-message-id-123';

      await act(async () => {
        const conversation = await result.current.createConversation('Test Chat');
        // Add message with specific ID
        const message: Partial<Message> = {
          id: messageId,
          role: 'assistant',
          content: 'Test',
          status: 'streaming',
        };
        result.current.addMessage(conversation.id, message as Omit<Message, 'id' | 'timestamp'>);
      });

      // Verify message ID is preserved
      const storeState = result.current;
      const messages = storeState.conversations[0]?.messages || [];
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBe(messageId);
    });

    it('should generate new ID when not provided', async () => {
      const mockService = {
        createConversation: jest.fn().mockImplementation((title) =>
          Promise.resolve({
            id: '123',
            title: title || 'New Chat',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      (getConversationService as jest.Mock).mockReturnValue(mockService);
      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        const conversation = await result.current.createConversation('Test Chat');
        // Add message without ID
        result.current.addMessage(conversation.id, {
          role: 'assistant',
          content: 'Test',
          status: 'streaming',
        });
      });

      // Verify message has a generated ID
      const storeState = result.current;
      const messages = storeState.conversations[0]?.messages || [];
      expect(messages).toHaveLength(1);
      expect(messages[0].id).toBeTruthy();
      expect(messages[0].id).toMatch(/^[0-9a-f-]+$/); // UUID format
    });
  });

  describe('Chunk Accumulation', () => {
    it('should accumulate chunks via appendToMessage', async () => {
      const mockService = {
        createConversation: jest.fn().mockImplementation((title) =>
          Promise.resolve({
            id: '123',
            title: title || 'New Chat',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      (getConversationService as jest.Mock).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        const conversation = await result.current.createConversation('Test Chat');
        result.current.addMessage(conversation.id, {
          role: 'assistant',
          content: '',
          status: 'streaming',
        });
      });

      const conversation = result.current.conversations[0];
      const message = conversation.messages[0];

      // Simulate chunk accumulation
      act(() => {
        result.current.appendToMessage(conversation.id, message.id, 'Hello ');
        result.current.appendToMessage(conversation.id, message.id, 'World');
      });

      // Verify content is accumulated
      const updatedMessage = result.current.conversations[0].messages[0];
      expect(updatedMessage.content).toBe('Hello World');
    });

    it('should increment version on each chunk', async () => {
      const mockService = {
        createConversation: jest.fn().mockImplementation((title) =>
          Promise.resolve({
            id: '123',
            title: title || 'New Chat',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      (getConversationService as jest.Mock).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        const conversation = await result.current.createConversation('Test Chat');
        result.current.addMessage(conversation.id, {
          role: 'assistant',
          content: '',
          status: 'streaming',
        });
      });

      const conversation = result.current.conversations[0];
      const message = conversation.messages[0];
      const versionBefore = result.current.version;

      // Simulate chunk accumulation
      act(() => {
        result.current.appendToMessage(conversation.id, message.id, 'Chunk 1');
      });

      expect(result.current.version).toBeGreaterThan(versionBefore);
    });
  });

  describe('Complete Streaming Flow', () => {
    it('should handle complete streaming flow from start to finish', async () => {
      const mockService = {
        createConversation: jest.fn().mockImplementation((title) =>
          Promise.resolve({
            id: '123',
            title: title || 'New Chat',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      (getConversationService as jest.Mock).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      // Step 1: Create conversation
      let conversationId: string;
      let messageId: string;

      await act(async () => {
        const conversation = await result.current.createConversation('Test Chat');
        conversationId = conversation.id;

        // Add user message
        result.current.addMessage(conversationId, {
          role: 'user',
          content: 'Tell me a joke',
          status: 'done',
        });

        // Create assistant message with streaming status
        messageId = 'assistant-msg-id';
        result.current.addMessage(conversationId, {
          id: messageId,
          role: 'assistant',
          content: '',
          status: 'streaming',
        });
      });

      // Verify initial state
      let messages = result.current.conversations.find(c => c.id === conversationId)?.messages || [];
      expect(messages).toHaveLength(2); // User + Assistant
      expect(messages[1].content).toBe('');
      expect(messages[1].status).toBe('streaming');

      // Step 2: Simulate streaming chunks
      act(() => {
        result.current.appendToMessage(conversationId, messageId, 'Why ');
        result.current.appendToMessage(conversationId, messageId, 'did ');
        result.current.appendToMessage(conversationId, messageId, 'the ');
        result.current.appendToMessage(conversationId, messageId, 'chicken ');
        result.current.appendToMessage(conversationId, messageId, 'cross ');
        result.current.appendToMessage(conversationId, messageId, 'the ');
        result.current.appendToMessage(conversationId, messageId, 'road?');
      });

      // Verify chunks accumulated
      messages = result.current.conversations.find(c => c.id === conversationId)?.messages || [];
      expect(messages[1].content).toBe('Why did the chicken cross the road?');
      expect(messages[1].status).toBe('streaming');

      // Step 3: Mark as done
      act(() => {
        result.current.updateMessage(conversationId, messageId, {
          status: 'done',
        });
      });

      // Verify final state
      messages = result.current.conversations.find(c => c.id === conversationId)?.messages || [];
      expect(messages[1].content).toBe('Why did the chicken cross the road?');
      expect(messages[1].status).toBe('done');
    });

    it('should preserve content when marking done (not replace with result)', async () => {
      const mockService = {
        createConversation: jest.fn().mockImplementation((title) =>
          Promise.resolve({
            id: '123',
            title: title || 'New Chat',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      (getConversationService as jest.Mock).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      // Setup: Create message with accumulated content
      let conversationId: string;
      let messageId: string;

      await act(async () => {
        const conversation = await result.current.createConversation('Test Chat');
        conversationId = conversation.id;
        messageId = 'assistant-msg-id';

        result.current.addMessage(conversationId, {
          id: messageId,
          role: 'assistant',
          content: '',
          status: 'streaming',
        });

        // Simulate chunk accumulation
        result.current.appendToMessage(conversationId, messageId, 'Accumulated ');
        result.current.appendToMessage(conversationId, messageId, 'Content');
      });

      // Verify accumulated content
      let messages = result.current.conversations.find(c => c.id === conversationId)?.messages || [];
      expect(messages[0].content).toBe('Accumulated Content');

      // Mark as done (simulating onDone handler behavior)
      act(() => {
        result.current.updateMessage(conversationId, messageId, {
          status: 'done',
        });
      });

      // Verify content is NOT replaced
      messages = result.current.conversations.find(c => c.id === conversationId)?.messages || [];
      expect(messages[0].content).toBe('Accumulated Content');
      expect(messages[0].status).toBe('done');
    });
  });

  describe('Component Re-rendering', () => {
    it('should trigger re-renders when chunks are added', async () => {
      const mockService = {
        createConversation: jest.fn().mockImplementation((title) =>
          Promise.resolve({
            id: '123',
            title: title || 'New Chat',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      (getConversationService as jest.Mock).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      // Get initial version
      const initialVersion = result.current.version;

      // Create conversation and message
      await act(async () => {
        const conversation = await result.current.createConversation('Test Chat');
        result.current.addMessage(conversation.id, {
          role: 'assistant',
          content: '',
          status: 'streaming',
        });
      });

      // Version should have incremented
      expect(result.current.version).toBeGreaterThan(initialVersion);

      const conversation = result.current.conversations[0];
      const message = conversation.messages[0];
      const beforeChunkVersion = result.current.version;

      // Add chunks
      act(() => {
        result.current.appendToMessage(conversation.id, message.id, 'Chunk 1');
      });

      // Version should have incremented again
      expect(result.current.version).toBeGreaterThan(beforeChunkVersion);

      // Verify content is updated
      const updatedMessage = result.current.conversations[0].messages[0];
      expect(updatedMessage.content).toBe('Chunk 1');
    });
  });

  describe('Error Handling', () => {
    it('should handle updating non-existent message gracefully', async () => {
      const mockService = {
        createConversation: jest.fn().mockImplementation((title) =>
          Promise.resolve({
            id: '123',
            title: title || 'New Chat',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      (getConversationService as jest.Mock).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.createConversation('Test Chat');
      });

      const conversation = result.current.conversations[0];

      // Try to update non-existent message (should not throw)
      expect(() => {
        act(() => {
          result.current.updateMessage(conversation.id, 'non-existent-id', {
            status: 'done',
          });
        });
      }).not.toThrow();

      // Conversation should still be intact
      expect(result.current.conversations).toHaveLength(1);
    });

    it('should handle appending to non-existent message gracefully', async () => {
      const mockService = {
        createConversation: jest.fn().mockImplementation((title) =>
          Promise.resolve({
            id: '123',
            title: title || 'New Chat',
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        ),
      } as unknown as ConversationService;

      const { getConversationService } = await import('@/services/conversationService');
      (getConversationService as jest.Mock).mockReturnValue(mockService);

      const { result } = renderHook(() => useChatStore());

      await act(async () => {
        await result.current.createConversation('Test Chat');
      });

      const conversation = result.current.conversations[0];

      // Try to append to non-existent message (should not throw)
      expect(() => {
        act(() => {
          result.current.appendToMessage(conversation.id, 'non-existent-id', 'Test');
        });
      }).not.toThrow();

      // Conversation should still be intact
      expect(result.current.conversations).toHaveLength(1);
    });
  });
});
