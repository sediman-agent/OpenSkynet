import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Conversation, Message, MessageStatus, ToolCallRecord } from '@/types';
import { getConversationService } from '@/services/conversationService';

interface ChatState {
  // State
  conversations: Conversation[];
  activeConversationId: string | null;
  version: number; // Increment to force re-renders
  _synced: boolean; // Track if we've synced with server

  // Actions
  syncWithServer: () => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation>;
  selectConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<boolean>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;

  // Message actions
  addMessage: (conversationId: string, message: Omit<Message, 'id' | 'timestamp'> | Message) => Promise<Message>;
  updateMessage: (conversationId: string, messageId: string, updates: Partial<Message>) => Promise<void>;
  appendToMessage: (conversationId: string, messageId: string, delta: string) => void;
  setMessageStatus: (conversationId: string, messageId: string, status: MessageStatus) => Promise<void>;
  addToolCall: (conversationId: string, messageId: string, toolCall: ToolCallRecord) => Promise<void>;
  updateToolCall: (conversationId: string, messageId: string, toolCallId: string, updates: Partial<ToolCallRecord>) => Promise<void>;

  // Utility
  getConversation: (id: string) => Conversation | undefined;
}

const createDefaultConversation = (): Conversation => ({
  id: crypto.randomUUID(),
  title: 'New Chat',
  messages: [],
  createdAt: new Date(),
  updatedAt: new Date(),
});

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      conversations: [],
      activeConversationId: null,
      version: 0,
      _synced: false,

      /**
       * Sync conversations with server
       * Merges server conversations with local ones
       */
      syncWithServer: async () => {
        const state = get();
        if (state._synced) return; // Already synced

        try {
          const service = getConversationService();
          const serverConvos = await service.getConversations();

          // Create a map of existing conversations by ID
          const localMap = new Map(state.conversations.map(c => [c.id, c]));
          const serverMap = new Map(serverConvos.map(c => [c.id, c]));

          // Merge conversations: server takes precedence for metadata,
          // but we preserve local messages that haven't been synced
          const mergedConversations: Conversation[] = [];

          // Add server conversations
          for (const [id, serverConvo] of serverMap) {
            const local = localMap.get(id);
            if (local) {
              // Merge: use server metadata but keep local messages if newer
              mergedConversations.push({
                ...serverConvo,
                messages: local.messages.length > 0 ? local.messages : serverConvo.messages,
              });
            } else {
              // New conversation from server
              mergedConversations.push(serverConvo);
            }
          }

          // Add local conversations that don't exist on server yet
          // (they'll be synced when created or modified)
          for (const [id, localConvo] of localMap) {
            if (!serverMap.has(id)) {
              mergedConversations.push(localConvo);
            }
          }

          set({
            conversations: mergedConversations,
            _synced: true,
          });

          console.log('[ChatStore] Synced with server:', mergedConversations.length, 'conversations');
        } catch (error) {
          console.error('[ChatStore] Failed to sync with server:', error);
          // Don't set synced=true on error, so we can retry
        }
      },

      /**
       * Create a new conversation (syncs to server)
       */
      createConversation: async (title) => {
        const newConversation: Conversation = {
          ...createDefaultConversation(),
          title: title || 'New Chat',
        };

        // Sync to server first (no optimistic update to avoid race conditions)
        try {
          const service = getConversationService();
          const serverConvo = await service.createConversation(title);

          if (serverConvo) {
            // Add server conversation to store
            set((state) => ({
              conversations: [serverConvo, ...state.conversations],
              activeConversationId: serverConvo.id,
              version: state.version + 1,
            }));
            console.log('[ChatStore] Created new conversation:', serverConvo.id, 'with', serverConvo.messages.length, 'messages');
            return serverConvo;
          }
        } catch (error) {
          console.error('[ChatStore] Failed to create conversation on server:', error);
          // Fall back to local-only conversation
          set((state) => ({
            conversations: [newConversation, ...state.conversations],
            activeConversationId: newConversation.id,
            version: state.version + 1,
          }));
        }

        return newConversation;
      },

      selectConversation: async (id) => {
        // First set the active ID and increment version to force re-render
        set({ activeConversationId: id, version: get().version + 1 });

        // Then load the full conversation with messages from server
        try {
          const service = getConversationService();
          const serverConvo = await service.getConversation(id);

          if (serverConvo) {
            // Update the conversation in the store with the loaded messages
            set((state) => ({
              conversations: state.conversations.map((c) =>
                c.id === id
                  ? { ...c, messages: serverConvo.messages, updatedAt: serverConvo.updatedAt }
                  : c
              ),
              version: state.version + 1,
            }));
            console.log('[ChatStore] Loaded conversation with messages:', serverConvo.messages.length, 'messages');
          }
        } catch (error) {
          console.error('[ChatStore] Failed to load conversation messages:', error);
        }
      },

      deleteConversation: async (id) => {
        console.log('[ChatStore] Deleting conversation:', id);
        const prevState = get();
        console.log('[ChatStore] Before delete, conversations count:', prevState.conversations.length);

        // Optimistic update
        set((state) => {
          const newConversations = state.conversations.filter((c) => c.id !== id);
          console.log('[ChatStore] After delete, conversations count:', newConversations.length);
          return {
            conversations: newConversations,
            activeConversationId:
              state.activeConversationId === id ? null : state.activeConversationId,
            version: state.version + 1,
          };
        });

        // Sync to server
        try {
          const service = getConversationService();
          const success = await service.deleteConversation(id);
          console.log('[ChatStore] Delete conversation result:', success);
          return success;
        } catch (error) {
          console.error('[ChatStore] Failed to delete conversation on server:', error);
          return false;
        }
      },

      updateConversationTitle: async (id, title) => {
        // Optimistic update
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === id ? { ...c, title, updatedAt: new Date() } : c
          ),
        }));

        // Sync to server
        try {
          const service = getConversationService();
          await service.updateConversationTitle(id, title);
        } catch (error) {
          console.error('[ChatStore] Failed to update title on server:', error);
        }
      },

      addMessage: async (conversationId, message) => {
        const newMessage: Message = {
          ...message,
          id: 'id' in message && message.id ? message.id : crypto.randomUUID(),
          timestamp: 'timestamp' in message && message.timestamp ? message.timestamp : new Date(),
        };

        // Optimistic update
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id === conversationId) {
              return {
                ...c,
                messages: [...c.messages, newMessage],
                updatedAt: new Date(),
              };
            }
            return c;
          }),
          version: state.version + 1,
        }));

        // Sync to server and return server message
        try {
          const service = getConversationService();
          const serverMessage = await service.addMessage(conversationId, {
            role: newMessage.role,
            content: newMessage.content,
            status: newMessage.status,
            thinking: newMessage.thinking,
          });

          if (serverMessage) {
            // Update with server ID and return the server message
            set((state) => ({
              conversations: state.conversations.map((c) => {
                if (c.id === conversationId) {
                  return {
                    ...c,
                    messages: c.messages.map(m =>
                      m.id === newMessage.id ? { ...m, id: serverMessage.id } : m
                    ),
                  };
                }
                return c;
              }),
            }));
            return { ...newMessage, id: serverMessage.id };
          }
        } catch (error) {
          console.error('[ChatStore] Failed to add message on server:', error);
        }

        return newMessage;
      },

      updateMessage: async (conversationId, messageId, updates) => {
        // Optimistic update
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id === conversationId) {
              const updated = c.messages.map((m) =>
                m.id === messageId ? { ...m, ...updates } : m
              );
              return {
                ...c,
                messages: updated,
                updatedAt: new Date(),
              };
            }
            return c;
          }),
          version: state.version + 1,
        }));

        // Sync to server (debounced in practice, but immediate here)
        try {
          const service = getConversationService();
          await service.updateMessage(conversationId, messageId, updates);
        } catch (error) {
          console.error('[ChatStore] Failed to update message on server:', error);
        }
      },

      appendToMessage: (conversationId, messageId, delta) => {
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id === conversationId) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId
                    ? { ...m, content: m.content + delta }
                    : m
                ),
              };
            }
            return c;
          }),
          version: state.version + 1,
        }));
      },

      setMessageStatus: async (conversationId, messageId, status) => {
        await get().updateMessage(conversationId, messageId, { status });
      },

      addToolCall: async (conversationId, messageId, toolCall) => {
        // Optimistic update
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id === conversationId) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId
                    ? { ...m, toolCalls: [...(m.toolCalls || []), toolCall] }
                    : m
                ),
              };
            }
            return c;
          }),
          version: state.version + 1,
        }));

        // Sync to server
        try {
          const service = getConversationService();
          await service.addToolCall(conversationId, messageId, toolCall);
        } catch (error) {
          console.error('[ChatStore] Failed to add tool call on server:', error);
        }
      },

      updateToolCall: async (conversationId, messageId, toolCallId, updates) => {
        // Optimistic update
        set((state) => ({
          conversations: state.conversations.map((c) => {
            if (c.id === conversationId) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === messageId
                    ? {
                        ...m,
                        toolCalls: (m.toolCalls || []).map((tc) =>
                          tc.id === toolCallId ? { ...tc, ...updates } : tc
                        ),
                      }
                    : m
                ),
              };
            }
            return c;
          }),
          version: state.version + 1,
        }));

        // Sync to server
        try {
          const service = getConversationService();
          await service.updateToolCall(conversationId, toolCallId, updates);
        } catch (error) {
          console.error('[ChatStore] Failed to update tool call on server:', error);
        }
      },

      getConversation: (id) => {
        return get().conversations.find((c) => c.id === id);
      },
    }),
    {
      name: 'openskynet-chat-store',
      partialize: (state) => ({
        conversations: state.conversations,
        activeConversationId: state.activeConversationId,
        // Don't persist _synced flag
        _synced: false,
      }),
    }
  )
);
