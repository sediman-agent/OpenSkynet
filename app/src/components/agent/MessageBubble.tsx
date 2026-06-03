import { User, Bot } from 'lucide-react';
import { Message } from '@/types';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';

  return (
    <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Bot className="w-4 h-4 text-primary" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[80%]',
          'rounded-lg px-4 py-2.5',
          'text-sm leading-relaxed',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted text-foreground rounded-bl-sm'
        )}
      >
        <div className="markdown-content prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={{
              p: ({ children }) => <p className="my-1">{children}</p>,
              ul: ({ children }) => <ul className="my-1">{children}</ul>,
              ol: ({ children }) => <ol className="my-1">{children}</ol>,
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {isStreaming && !isUser && <span className="typing-cursor" />}

        {message.status === 'error' && (
          <div className="mt-2 text-xs font-medium text-destructive">
            ⚠️ Failed to send message
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <User className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
    </div>
  );
}
