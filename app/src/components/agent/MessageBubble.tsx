import { User, Bot } from 'lucide-react';
import { Message } from '@/types';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isStreaming = message.status === 'streaming';

  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {!isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
          <Bot className="h-4 w-4 text-accent" />
        </div>
      )}

      <div
        className={cn(
          'rounded-lg px-4 py-3 max-w-[80%]',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-foreground'
        )}
      >
        <div className="markdown-content prose prose-invert max-w-none">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {isStreaming && !isUser && (
          <span className="typing-cursor ml-1" />
        )}

        {message.status === 'error' && (
          <div className="mt-2 text-sm text-destructive">
            ⚠️ Failed to send message
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <User className="h-4 w-4 text-primary" />
        </div>
      )}
    </div>
  );
}
