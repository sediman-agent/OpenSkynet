import { useEffect, useState, useRef } from 'react';
import { Send, Plus, Moon, Sun } from 'lucide-react';
import { useAppStore } from '@/stores/useAppStore';
import { useChatStore } from '@/stores/useChatStore';
import { getChatService } from '@/services/chatService';
import { PageHeader } from '@/components/shared/PageHeader';
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
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingPhase, setStreamingPhase] = useState<'thinking' | 'planning' | 'executing' | 'reflecting' | 'retrying'>('thinking');
  const [retryProgress, setRetryProgress] = useState<{ attempt: number; max: number; countdown: number } | null>(null);
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
    setStreamingPhase('thinking');
    setRetryProgress(null);

    try {
      const chatService = getChatService();
      const messages = activeConversation?.messages || [];
      const lastMessage = messages[messages.length - 1];

      await chatService.sendMessage(
        activeConversationId,
        userMessage,
        {
          onChunk: (delta, phase = 'responding') => {
            // Update streaming phase based on phase from backend
            if (phase === 'planning') {
              setStreamingPhase('planning');
            } else if (phase === 'executing') {
              setStreamingPhase('executing');
            } else if (phase === 'thinking') {
              setStreamingPhase('thinking');
            } else if (phase === 'reflecting') {
              setStreamingPhase('reflecting');
            }

            // For planning/reflection, append to a separate field or show differently
            if (phase === 'planning' || phase === 'thinking' || phase === 'reflecting') {
              // Show planning/thinking in a subtle way
              if (lastMessage) {
                appendToMessage(activeConversationId, lastMessage.id, delta);
              }
            } else if (phase === 'progress') {
              // Handle progress events (retry countdown, etc.)
              try {
                const progress = JSON.parse(delta);
                if (progress.retry) {
                  setStreamingPhase('retrying');
                  setRetryProgress({
                    attempt: progress.retry.attempt,
                    max: progress.retry.max,
                    countdown: progress.retry.countdown
                  });
                }
              } catch {
                // Not JSON, treat as normal text
                if (lastMessage) {
                  appendToMessage(activeConversationId, lastMessage.id, delta);
                }
              }
            } else {
              // Normal execution response
              if (lastMessage) {
                appendToMessage(activeConversationId, lastMessage.id, delta);
              }
            }
          },
          onProgress: (progress) => {
            // Handle structured progress events
            if (progress.phase === 'retrying') {
              setStreamingPhase('retrying');
              const match = progress.detail.match(/attempt (\d+)\/(\d+)/);
              if (match) {
                setRetryProgress({
                  attempt: parseInt(match[1]),
                  max: parseInt(match[2]),
                  countdown: 0
                });
              }
            }
          },
          onDone: () => {
            if (lastMessage) {
              setMessageStatus(activeConversationId, lastMessage.id, 'done');
            }
            setIsStreaming(false);
            setRetryProgress(null);
          },
          onError: (error) => {
            if (lastMessage) {
              setMessageStatus(activeConversationId, lastMessage.id, 'error');
              appendToMessage(activeConversationId, lastMessage.id, `\n\nError: ${error}`);
            }
            setIsStreaming(false);
            setRetryProgress(null);
          },
        }
      );
    } catch (error) {
      setIsStreaming(false);
      setRetryProgress(null);
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

  const hasMessages = activeConversation?.messages && activeConversation.messages.length > 0;

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="h-10 border-b border-border flex items-center justify-between px-3">
        <h1 className="text-xs font-medium">Chat</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={toggleTheme} className="h-6 w-6 shrink-0 p-0">
            {theme === 'dark' ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleNewChat} className="h-6 px-2 text-xs">
            <Plus className="w-3 h-3" />
            <span className="ml-1">New</span>
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className={cn(
          "mx-auto transition-all duration-200",
          hasMessages ? "max-w-3xl py-2 px-3 space-y-2" : "max-w-2xl py-12 px-3"
        )}>
          {hasMessages ? (
            activeConversation?.messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          ) : (
            <div className="flex flex-col items-center justify-center text-center space-y-3 py-12">
              <h2 className="text-sm font-medium">New conversation</h2>
              <p className="text-xs text-muted-foreground max-w-sm">
                Type a message below to get started.
              </p>
            </div>
          )}
          {isStreaming && (
            <div className="flex flex-col gap-1 text-muted-foreground text-xs">
              <div className="flex items-center gap-2">
                {streamingPhase === 'thinking' && (
                  <>
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                    <span>Thinking…</span>
                  </>
                )}
                {streamingPhase === 'planning' && (
                  <>
                    <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                    <span>Planning…</span>
                  </>
                )}
                {streamingPhase === 'executing' && (
                  <>
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    <span>Executing…</span>
                  </>
                )}
                {streamingPhase === 'reflecting' && (
                  <>
                    <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse" />
                    <span>Reflecting…</span>
                  </>
                )}
                {streamingPhase === 'retrying' && retryProgress && (
                  <>
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
                    <span>Retrying ({retryProgress.attempt}/{retryProgress.max})…</span>
                  </>
                )}
              </div>
              {retryProgress && retryProgress.countdown > 0 && (
                <div className="text-[10px] text-muted-foreground pl-4">
                  Retrying in {retryProgress.countdown.toFixed(1)}s…
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-2">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isStreaming}
            autoResize
            className="min-h-[32px] max-h-[160px] resize-none"
            style={{ fieldSizing: 'content' }}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            size="md"
            className="h-8 px-3 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
