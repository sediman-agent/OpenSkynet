import { useEffect, useState } from 'react';
import { Send, Plus } from 'lucide-react';
import { useChatStore } from '@/stores/useChatStore';
import { useAppStore } from '@/stores/useAppStore';
import { getChatService } from '@/services/chatService';
import { Button } from '@/components/shared/Button';
import { Textarea } from '@/components/shared/Textarea';
import { ScrollArea } from '@/components/shared/ScrollArea';
import { MessageBubble } from '@/components/agent/MessageBubble';
import { cn } from '@/lib/utils';

export function AgentPage() {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const activeConversation = useChatStore((state) => state.activeConversation);
  const createConversation = useChatStore((state) => state.createConversation);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const addMessage = useChatStore((state) => state.addMessage);
  const setMessageStatus = useChatStore((state) => state.setMessageStatus);
  const appendToMessage = useChatStore((state) => state.appendToMessage);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [inputHeight, setInputHeight] = useState(60);

  useEffect(() => {
    // Create a conversation if none exists
    if (conversations.length === 0) {
      const conversation = createConversation('New Chat');
      selectConversation(conversation.id);
    } else if (!activeConversationId && conversations.length > 0) {
      // Select most recent conversation
      selectConversation(conversations[0].id);
    }
  }, [conversations, activeConversationId, createConversation, selectConversation]);

  const handleSend = async () => {
    if (!input.trim() || !activeConversationId || isStreaming) return;

    const userMessage = input.trim();
    setInput('');

    // Add user message
    addMessage(activeConversationId, {
      role: 'user',
      content: userMessage,
      status: 'done',
    });

    // Create assistant message for streaming
    addMessage(activeConversationId, {
      role: 'assistant',
      content: '',
      status: 'streaming',
    });

    setIsStreaming(true);

    try {
      const chatService = getChatService();
      const messages = activeConversation?.messages || [];
      const lastMessage = messages[messages.length - 1];

      await chatService.sendMessage(
        activeConversationId,
        userMessage,
        {
          onChunk: (delta) => {
            if (lastMessage) {
              appendToMessage(activeConversationId, lastMessage.id, delta);
            }
          },
          onDone: () => {
            if (lastMessage) {
              setMessageStatus(activeConversationId, lastMessage.id, 'done');
            }
            setIsStreaming(false);
          },
          onError: (error) => {
            if (lastMessage) {
              setMessageStatus(activeConversationId, lastMessage.id, 'error');
              appendToMessage(activeConversationId, lastMessage.id, `\n\nError: ${error}`);
            }
            setIsStreaming(false);
          },
        }
      );
    } catch (error) {
      setIsStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleNewChat = () => {
    const conversation = createConversation('New Chat');
    selectConversation(conversation.id);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4">
        <div>
          <h2 className="text-lg font-semibold">Agent</h2>
          <p className="text-xs text-muted-foreground">
            {activeConversation?.title || 'New Chat'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleNewChat}>
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="max-w-3xl mx-auto space-y-4">
          {activeConversation?.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isStreaming && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="typing-cursor" />
              <span className="text-sm">Agent is thinking...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setInputHeight(Math.max(60, Math.min(200, e.target.scrollHeight)));
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type your message... (Enter to send, Shift+Enter for new line)"
              className="min-h-[60px] max-h-[200px] resize-none"
              style={{ height: `${inputHeight}px` }}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="h-[60px] px-4"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
