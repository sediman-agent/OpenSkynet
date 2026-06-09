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
    <div className="flex-1" style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Messages Container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto"
        style={{
          position: 'relative',
          width: '100%',
          overflowY: messages.length === 0 ? 'hidden' : 'auto',
          minHeight: 0  // Important for flex scrolling
        }}
      >
        <div className="max-w-3xl mx-auto px-4 py-6">
          {/* Welcome Message - Empty */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              {/* Empty state - no text */}
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

          {/* Execution Steps are now handled by parent component to avoid duplicates */}

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
