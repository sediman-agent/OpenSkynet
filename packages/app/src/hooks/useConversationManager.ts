import { useState, useEffect, useCallback } from 'react';
import { useChatStore } from '@/stores/useChatStore';
import type { Message } from '@/types';

export interface UseConversationManagerOptions {
  autoInitialize?: boolean;
}

interface UseConversationManagerReturn {
  // State
  conversationId: string | null;
  setConversationId: (id: string | null) => void;
  activeConversation: ReturnType<UseConversationManagerReturn['getActiveConversation']>;
  messages: Message[];

  // Computed
  getActiveConversation: () => any;

  // Actions
  initializeConversation: () => void;
  selectLatestConversation: () => void;
  createNewConversation: (title?: string) => Promise<any>;
  addMessageToConversation: (conversationId: string, message: Message) => Promise<void>;
  updateMessageInConversation: (conversationId: string, messageId: string, updates: Partial<Message>) => Promise<void>;
}

export function useConversationManager(options: UseConversationManagerOptions = {}): UseConversationManagerReturn {
  const { autoInitialize = true } = options;

  const {
    createConversation,
    selectConversation,
    conversations,
    addMessage,
    updateMessage
  } = useChatStore();

  const [conversationId, setConversationId] = useState<string | null>(null);

  // Computed
  const getActiveConversation = useCallback(() => {
    return conversations.find(c => c.id === conversationId);
  }, [conversations, conversationId]);

  const activeConversation = getActiveConversation();
  const messages = activeConversation?.messages || [];

  // Initialize conversation on mount
  const initializeConversation = useCallback(() => {
    if (conversationId) return;

    if (conversations.length > 0) {
      // Select most recent conversation
      const sortedConvos = [...conversations].sort((a, b) => {
        const aTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        const bTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        return bTime - aTime;
      });
      const latestConv = sortedConvos[0];
      setConversationId(latestConv.id);
      selectConversation(latestConv.id);
    } else {
      // Create new conversation
      createConversation('New Chat').then(newConv => {
        setConversationId(newConv.id);
        selectConversation(newConv.id);
      });
    }
  }, [conversationId, conversations, createConversation, selectConversation]);

  // Auto-initialize on mount
  useEffect(() => {
    if (autoInitialize) {
      initializeConversation();
    }
  }, [autoInitialize, initializeConversation]);

  // Select latest conversation
  const selectLatestConversation = useCallback(() => {
    if (conversations.length === 0) {
      createNewConversation();
      return;
    }

    const sortedConvos = [...conversations].sort((a, b) => {
      const aTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
      const bTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
      return bTime - aTime;
    });

    const latestConv = sortedConvos[0];
    setConversationId(latestConv.id);
    selectConversation(latestConv.id);
  }, [conversations, createConversation, selectConversation]);

  // Create new conversation
  const createNewConversation = useCallback(async (title = 'New Chat') => {
    const newConv = await createConversation(title);
    setConversationId(newConv.id);
    selectConversation(newConv.id);
    return newConv;
  }, [createConversation, selectConversation]);

  // Add message to conversation
  const addMessageToConversation = useCallback(async (convId: string, message: Message) => {
    await addMessage(convId, message);
  }, [addMessage]);

  // Update message in conversation
  const updateMessageInConversation = useCallback(async (
    convId: string,
    messageId: string,
    updates: Partial<Message>
  ) => {
    await updateMessage(convId, messageId, updates);
  }, [updateMessage]);

  return {
    // State
    conversationId,
    setConversationId,
    activeConversation,
    messages,

    // Computed
    getActiveConversation,

    // Actions
    initializeConversation,
    selectLatestConversation,
    createNewConversation,
    addMessageToConversation,
    updateMessageInConversation,
  };
}
