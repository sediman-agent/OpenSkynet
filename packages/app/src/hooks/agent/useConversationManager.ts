/**
 * useConversationManager Hook
 * Manages conversation state and operations
 */

import { useEffect, useCallback } from 'react';
import { useChatStore } from '@/stores/useChatStore';
import type { Conversation } from '@/types';

export function useConversationManager() {
  const { createConversation, selectConversation, syncWithServer } = useChatStore();
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);

  // Get active conversation using store's activeConversationId
  // This ensures we re-render when activeConversationId changes
  const activeConversation = useChatStore((state) => {
    const conv = state.conversations.find((c) => c.id === state.activeConversationId) || null;
    console.log('[useConversationManager] Active conversation:', conv?.id, 'with', conv?.messages?.length, 'messages');
    return conv;
  });
  const messages = activeConversation?.messages || [];

  // Debug logging for messages changes
  console.log('[useConversationManager] Messages count:', messages.length, 'Active ID:', activeConversationId);

  // Handle when active conversation is deleted
  useEffect(() => {
    const currentConvos = useChatStore.getState().conversations;
    const currentActiveId = useChatStore.getState().activeConversationId;

    // If active conversation was deleted (null but there are other conversations), select the latest
    if (!currentActiveId && currentConvos.length > 0) {
      const sortedConvos = [...currentConvos].sort((a, b) => {
        const aTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
        const bTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
        return bTime - aTime;
      });
      const latestConv = sortedConvos[0];
      selectConversation(latestConv.id);
    }
    // If no conversations at all, create a new one
    else if (!currentActiveId && currentConvos.length === 0) {
      createConversation('New Chat');
    }
  }, [conversations, createConversation, selectConversation]);

  // Create new conversation
  const createNewConversation = useCallback(async () => {
    return await createConversation('New Chat');
  }, [createConversation]);

  // Switch conversation
  const switchConversation = useCallback(async (convId: string) => {
    await selectConversation(convId);
  }, [selectConversation]);

  // Refresh conversations from server
  const refreshConversations = useCallback(() => {
    syncWithServer();
  }, [syncWithServer]);

  return {
    conversationId: activeConversationId,
    activeConversation,
    messages,
    conversations,
    createNewConversation,
    switchConversation,
    refreshConversations
  };
}
