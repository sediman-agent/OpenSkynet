/**
 * AgentMessages Component
 * Message list with scroll control
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { ExecutionDisplay } from './ExecutionDisplay';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';
import type { ExecutionStep } from './ExecutionDisplay';

interface AgentMessagesProps {
  messages: Message[];
  isStreaming?: boolean;
  executionSteps?: ExecutionStep[];
  scrollRef?: React.RefObject<HTMLDivElement>;
  messagesEndRef?: React.RefObject<HTMLDivElement>;
  onScroll?: () => void;
  showScrollButton?: boolean;
  onScrollToBottom?: () => void;
  expandedThinkingMessages?: Set<string>;
  onToggleThinking?: (messageId: string) => void;
}

export function AgentMessages({
  messages,
  isStreaming = false,
  executionSteps = [],
  scrollRef,
  messagesEndRef,
  onScroll,
  showScrollButton = false,
  onScrollToBottom,
  expandedThinkingMessages = new Set(),
  onToggleThinking
}: AgentMessagesProps) {
  const [hasScrolled, setHasScrolled] = useState(false);

  const handleScroll = () => {
    if (!hasScrolled) setHasScrolled(true);
    if (onScroll) onScroll();
  };

  return (
    <div className="flex-1 overflow-hidden" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* Messages Container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        style={{
          position: 'relative',
          width: '100%',
          overflowY: messages.length === 0 ? 'hidden' : 'auto'
        }}
      >
        <div className="max-w-3xl mx-auto px-4 py-6">
          {/* Welcome Message */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <div className="w-8 h-8 rounded-full bg-primary/20" />
              </div>
              <h2 className="text-lg font-semibold mb-2">Welcome to Agent</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Start a conversation with the AI agent. It can help you browse the web, analyze pages, and complete tasks.
              </p>
            </div>
          )}

          {/* Messages */}
          {messages.map(message => (
            <MessageBubble
              key={message.id}
              message={message}
              isThinkingExpanded={expandedThinkingMessages.has(message.id)}
              onToggleThinking={() => onToggleThinking?.(message.id)}
            />
          ))}

          {/* Execution Steps (historical) */}
          {executionSteps.length > 0 && (
            <ExecutionDisplay steps={executionSteps} />
          )}

          {/* Scroll Anchor */}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <button
          onClick={onScrollToBottom}
          className={cn(
            "absolute bottom-4 right-4 z-10",
            "p-2 rounded-full bg-background shadow-lg border border-border",
            "hover:bg-muted transition-all"
          )}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
