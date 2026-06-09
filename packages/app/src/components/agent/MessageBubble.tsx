/**
 * VS Code-Style Message Bubble
 * Exact replica of VS Code Copilot message display
 * Using official VS Code Webview UI Toolkit design tokens
 */

import { Copy, Check, FileText, FileImage, FileType, File, Bot, ChevronDown, ChevronRight } from 'lucide-react';
import { Message } from '@/types';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useState, memo, useCallback } from 'react';
import { ExecutionDisplay } from './ExecutionDisplay';
import { formatThinkLabel } from '@/utils/thinkTagParser';
import { VS_CODE_DESIGN } from '@/styles/vscode-design-system';

// ============================================================================
// VS Code Design Tokens (using CSS variables for theme support)
// ============================================================================
const VS_CODES = {
  // Typography
  fontSize: 13,                // typeRampBaseFontSize
  fontSizeSmall: 11,          // typeRampMinus1FontSize
  lineHeight: 1.4,

  // Spacing
  padding: '8px',              // 2x designUnit
  borderRadius: 0,             // Sharp corners
  borderRadiusRound: 2,       // 2px for specific elements
} as const;

// ============================================================================
// Types
// ============================================================================

interface MessageBubbleProps {
  message: Message;
  isStreaming?: boolean;
  onCopy?: () => void;
  onToggleThinking?: () => void;
  isThinkingExpanded?: boolean;
}

// ============================================================================
// Utilities
// ============================================================================

function getFileIcon(type: string) {
  const iconClass = 'w-3.5 h-3.5';
  if (type.includes('pdf')) return <FileText className={iconClass} />;
  if (type.includes('image')) return <FileImage className={iconClass} />;
  if (type.includes('powerpoint') || type.includes('presentation') || type.includes('ppt')) {
    return <FileType className={iconClass} />;
  }
  return <File className={iconClass} />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================================================
// Thinking Block Component
// ============================================================================

interface ThinkingBlockProps {
  content: string;
  label?: string;
  isExpanded: boolean;
  onToggle: () => void;
}

const ThinkingBlock = memo(function ThinkingBlock({
  content,
  label,
  isExpanded,
  onToggle
}: ThinkingBlockProps) {
  return (
    <div className="mb-2 font-mono text-xs">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 transition-colors"
        style={{ color: 'var(--vscode-secondary-text)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--vscode-foreground)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--vscode-secondary-text)';
        }}
      >
        {isExpanded ? (
          <ChevronDown size={12} />
        ) : (
          <ChevronRight size={12} />
        )}
        <span className="uppercase tracking-wider">
          {label || 'Thinking'}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-1 pl-4 whitespace-pre-wrap break-words" style={{ color: 'var(--vscode-secondary-text)' }}>
          {content}
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming = false,
  onCopy,
  onToggleThinking,
  isThinkingExpanded = false
}: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);
  const [localThinkingExpanded, setLocalThinkingExpanded] = useState(isThinkingExpanded);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  }, [message.content, onCopy]);

  const handleToggleThinking = useCallback(() => {
    setLocalThinkingExpanded(prev => !prev);
    onToggleThinking?.();
  }, [onToggleThinking]);

  const attachments = message.attachments;
  const content = message.content || (isStreaming ? '▊' : '');

  // Parse thinking content
  let thinkBlocks: Array<{ content: string; label?: string }> = [];
  if (message.thinking) {
    if (typeof message.thinking === 'string') {
      thinkBlocks = [{ content: message.thinking, label: 'Thinking' }];
    } else {
      thinkBlocks = message.thinking.map(tb => ({
        content: tb.content,
        label: formatThinkLabel(tb),
      }));
    }
  }

  const hasThinking = thinkBlocks.length > 0;
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

  const toolCallsSafe = message.toolCalls ?? [];

  return (
    <div className={cn(
      "font-mono text-sm py-1",
      isUser ? "px-2" : "px-2"
    )}>
      {/* Message Header - Avatar + Name for Assistant */}
      {!isUser && (
        <div className="flex items-center gap-2 mb-1">
          <Bot size={14} style={{ color: 'var(--vscode-secondary-text)' }} />
          <span className="text-[11px] font-medium" style={{ color: 'var(--vscode-secondary-text)' }}>ASSISTANT</span>
        </div>
      )}

      {/* Thinking Blocks */}
      {hasThinking && !isUser && thinkBlocks.map((think, idx) => (
        <ThinkingBlock
          key={idx}
          content={think.content}
          label={think.label}
          isExpanded={localThinkingExpanded}
          onToggle={handleToggleThinking}
        />
      ))}

      {/* Tool Calls / Execution Display */}
      {hasToolCalls && (
        <div className="mb-2">
          <ExecutionDisplay
            steps={toolCallsSafe.map(tc => ({
              id: tc.id,
              type: 'tool' as const,
              timestamp: tc.startedAt,
              duration: tc.completedAt ? tc.completedAt - tc.startedAt : undefined,
              status: tc.status,
              action: tc.action,
              detail: tc.detail,
              observation: tc.observation,
              error: tc.status === 'error' ? {
                message: tc.observation || 'An error occurred',
                retryable: true
              } : undefined
            }))}
            showSummary
          />
        </div>
      )}

      {/* Attachments */}
      {attachments && attachments.length > 0 && (
        <div className={cn(
          "flex flex-wrap gap-1 mb-1",
          isUser ? "justify-end" : "justify-start"
        )}>
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 px-2 py-1 rounded border"
              style={{
                borderColor: 'var(--vscode-border-color)',
                backgroundColor: 'var(--vscode-panel-background)'
              }}
            >
              <div style={{ color: 'var(--vscode-secondary-text)' }}>
                {getFileIcon(attachment.type)}
              </div>
              <div className="flex flex-col">
                <span className="text-xs max-w-[120px] truncate" style={{ color: 'var(--vscode-foreground)' }}>
                  {attachment.name}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--vscode-secondary-text)' }}>
                  {formatFileSize(attachment.size)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div className="relative group">
        {/* User Message - VS Code Primary Button Style */}
        {isUser ? (
          <div className="relative inline-block max-w-full">
            <div
              className="px-3 py-1"
              style={{
                backgroundColor: 'var(--vscode-user-message-bg)',
                color: 'var(--vscode-user-message-fg)',
                borderRadius: `${VS_CODES.borderRadius}px`,
                fontFamily: VS_CODE_DESIGN.fontFamily,
                fontSize: `${VS_CODES.fontSize}px`,
                lineHeight: `${VS_CODES.lineHeight}`,
              }}
            >
              <div className="whitespace-pre-wrap break-words">
                {content}
              </div>
            </div>

            {/* Copy Button - User */}
            <button
              onClick={handleCopy}
              className="absolute -top-5 -right-5 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
              title="Copy"
            >
              {copied ? (
                <Check size={12} style={{ color: 'var(--vscode-secondary-text)' }} />
              ) : (
                <Copy size={12} style={{ color: 'var(--vscode-secondary-text)' }} />
              )}
            </button>
          </div>
        ) : (
          /* Assistant Message - Clean markdown */
          <div className={cn("relative", isStreaming && "streaming-content is-streaming")}>
            <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1" style={{ color: 'var(--vscode-foreground)' }}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  p: ({ children }) => <p className="my-1 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="my-1 space-y-0.5 pl-4">{children}</ul>,
                  ol: ({ children }) => <ol className="my-1 space-y-0.5 pl-4">{children}</ol>,
                  strong: ({ children }) => (
                    <strong className="font-semibold" style={{ color: 'var(--vscode-foreground)' }}>{children}</strong>
                  ),
                  code: ({ children, className }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="px-1 py-0.5 rounded text-xs font-mono" style={{
                        backgroundColor: 'var(--vscode-background)',
                        color: 'var(--vscode-foreground)'
                      }}>
                        {children}
                      </code>
                    ) : (
                      <code className={className}>{children}</code>
                    );
                  },
                  pre: ({ children }) => (
                    <pre className="p-2 rounded-sm text-xs overflow-x-auto my-2" style={{
                      backgroundColor: 'var(--vscode-background)',
                      border: '1px solid var(--vscode-border-color)'
                    }}>
                      {children}
                    </pre>
                  ),
                  a: ({ children, href }) => (
                    <a
                      href={href}
                      style={{ color: 'var(--vscode-link-foreground)' }}
                      className="hover:underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  )
                }}
              >
                {content}
              </ReactMarkdown>
            </div>

            {/* Copy Button - Assistant */}
            <button
              onClick={handleCopy}
              className="absolute top-0 right-0 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              title="Copy"
            >
              {copied ? (
                <Check size={12} style={{ color: 'var(--vscode-secondary-text)' }} />
              ) : (
                <Copy size={12} style={{ color: 'var(--vscode-secondary-text)' }} />
              )}
            </button>

            {isStreaming && <span className="typing-cursor" />}
          </div>
        )}
      </div>

      {/* Timestamp */}
      {message.timestamp && (
        <span className="text-[10px] mt-0.5 block" style={{ color: 'var(--vscode-secondary-text)' }}>
          {formatRelativeTime(message.timestamp)}
        </span>
      )}
    </div>
  );
});

export default MessageBubble;
