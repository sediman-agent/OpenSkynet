import { useEffect, useState, useRef } from 'react';
import { Send, Plus, Bot } from 'lucide-react';
import { useChatStore } from '@/stores/useChatStore';
import { getChatService } from '@/services/chatService';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/shared/Button';
import { Textarea } from '@/components/shared/Textarea';
import { ScrollArea } from '@/components/shared/ScrollArea';
import { MessageBubble } from '@/components/agent/MessageBubble';

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (conversations.length === 0) {
      const conversation = createConversation('New Chat');
      selectConversation(conversation.id);
    } else if (!activeConversationId && conversations.length > 0) {
      selectConversation(conversations[0].id);
    }
  }, [conversations, activeConversationId, createConversation, selectConversation]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [activeConversation?.messages]);

  const handleSend = async () => {
    if (!input.trim() || !activeConversationId || isStreaming) return;

    const userMessage = input.trim();
    setInput('');

    addMessage(activeConversationId, {
      role: 'user',
      content: userMessage,
      status: 'done',
    });

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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <PageHeader
        icon={Bot}
        title="Agent"
        subtitle="AI-powered conversation"
        iconVariant="primary"
        actions={
          <Button variant="outline" size="sm" onClick={handleNewChat}>
            <Plus className="w-4 h-4 mr-2" />
            New Chat
          </Button>
        }
      />

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="max-w-3xl mx-auto py-6 px-6 space-y-6">
          {activeConversation?.messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {isStreaming && (
            <div className="flex items-center gap-3 text-muted-foreground text-sm">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                <span className="w-1.5 h-1.5 bg-foreground/60 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
              </div>
              <span>OpenSkynet is thinking...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border bg-background p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-end gap-3">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message OpenSkynet... (Press Enter to send, Shift+Enter for new line)"
              disabled={isStreaming}
              autoResize
              className="min-h-[56px]"
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              size="lg"
            >
              {isStreaming ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-transparent rounded-full animate-spin" />
                  <span>Sending</span>
                </div>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
