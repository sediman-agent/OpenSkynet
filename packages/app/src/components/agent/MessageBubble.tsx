/**
 * MessageBubble Component - Industrial Grade with Elegant Violet Theme
 * Professional message display with enhanced readability and visual hierarchy
 */

import { Copy, Check, FileText, FileImage, FileType, File, Bot, ChevronDown } from 'lucide-react';
import { Message } from '@/types';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
// @ts-ignore - rehype-highlight types are incompatible with react-markdown
import rehypeHighlight from 'rehype-highlight';
import { useState, memo, useCallback } from 'react';
import { ExecutionDisplay } from './ExecutionDisplay';
import { formatThinkLabel, parseThinkTags } from '@/utils/thinkTagParser';
import { VS_CODES, SPACING, TYPOGRAPHY, RADIUS } from '@/styles/vscode-constants';

// ============================================================================
// VS Code Chat Theme - Clean, Minimal Design
// ============================================================================

const VSCODE_CHAT = {
  // User message - Subtle background like VS Code input
  userBg: 'var(--vscode-input-background)',
  userFg: 'var(--vscode-input-foreground)',
  userBorder: 'var(--vscode-input-border)',

  // User message hover
  userBgHover: 'var(--vscode-list-hoverBackground)',

  // Spacing - Professional 4px grid
  messageSpacing: '16px',
  userPadding: '12px 16px',
  assistantPadding: '0',

  // Border radius - Minimal
  radius: '6px',

  // Shadow - Subtle
  shadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
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
// Thinking Block Component - Enhanced
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
    <div className="mb-2 font-mono" style={{ fontSize: '12px' }}>
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 transition-all duration-150 px-2 py-1 rounded"
        style={{
          color: 'var(--vscode-descriptionForeground)',
          backgroundColor: 'transparent',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = 'var(--vscode-foreground)';
          e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = 'var(--vscode-descriptionForeground)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <div
          className="transition-transform duration-150"
          style={{
            transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
          }}
        >
          <ChevronDown size={12} />
        </div>
        <span
          className="uppercase tracking-wide"
          style={{
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '0.05em'
          }}
        >
          {label || 'Thinking'}
        </span>
      </button>

      {isExpanded && (
        <div
          className="mt-1.5 pl-4 whitespace-pre-wrap break-words border-l-2"
          style={{
            color: 'var(--vscode-descriptionForeground)',
            borderColor: 'var(--vscode-border-color)',
            padding: '8px 12px',
            lineHeight: 1.5,
          }}
        >
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

  // Debug logging
  console.log('[MessageBubble] Rendering message:', {
    id: message.id,
    role: message.role,
    content: message.content?.substring(0, 50),
    contentLength: message.content?.length,
    status: message.status,
    isStreaming
  });

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

  // Parse thinking content from message.thinking OR from message.content
  let thinkBlocks: Array<{ content: string; label?: string }> = [];
  let visibleContent = content;

  if (message.thinking) {
    // Use stored thinking if available
    if (typeof message.thinking === 'string') {
      thinkBlocks = [{ content: message.thinking, label: 'Thinking' }];
    } else {
      thinkBlocks = message.thinking.map(tb => ({
        content: tb.content,
        label: formatThinkLabel(tb),
      }));
    }
  } else if (content && content.includes('<think')) {
    // Extract think tags from content if not already stored
    const parsed = parseThinkTags(content);
    if (parsed.hasThinking) {
      thinkBlocks = parsed.thinking.map(tb => ({
        content: tb.content,
        label: formatThinkLabel(tb),
      }));
      visibleContent = parsed.visible;
    }
  }

  const hasThinking = thinkBlocks.length > 0;
  const hasToolCalls = message.toolCalls && message.toolCalls.length > 0;

  const toolCallsSafe = message.toolCalls ?? [];

  return (
    <div
      className={cn(
        "transition-all duration-150",
        isUser ? "px-3 py-3 flex justify-end" : "px-3 py-3"
      )}
      style={{
        fontFamily: isUser ? 'var(--font-system)' : 'var(--font-mono)',
      }}
    >
      {/* Message Header - Avatar + Name for Assistant */}
      {!isUser && (
        <div className="flex items-center gap-2 mb-2">
          <Bot size={14} style={{ color: 'var(--vscode-secondary-text)' }} />
          <span
            className="font-medium uppercase tracking-wide"
            style={{
              fontSize: '11px',
              color: 'var(--vscode-secondary-text)',
              fontWeight: 500
            }}
          >
            ASSISTANT
          </span>
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
        <div className="mb-3">
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

      {/* Attachments - Minimal VS Code Style */}
      {attachments && attachments.length > 0 && (
        <div
          className={cn(
            "flex flex-wrap gap-2 mb-2",
            isUser ? "justify-end" : "justify-start"
          )}
        >
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 px-2.5 py-1.5 border transition-colors duration-150 cursor-default"
              style={{
                borderColor: 'var(--vscode-border-color)',
                backgroundColor: 'var(--vscode-editor-background)',
                borderRadius: '3px',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--vscode-focus-border)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--vscode-border-color)';
              }}
            >
              <div style={{ color: 'var(--vscode-descriptionForeground)' }}>
                {getFileIcon(attachment.type)}
              </div>
              <div className="flex flex-col">
                <span
                  className="text-xs truncate"
                  style={{
                    color: 'var(--vscode-foreground)',
                    maxWidth: '120px',
                    fontFamily: 'var(--font-system)',
                  }}
                >
                  {attachment.name}
                </span>
                <span
                  className="text-[10px]"
                  style={{ color: 'var(--vscode-descriptionForeground)' }}
                >
                  {formatFileSize(attachment.size)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Content */}
      <div className="relative group">
        {/* User Message - VS Code Style */}
        {isUser ? (
          <div className="relative inline-block max-w-[85%]">
            <div
              className="px-4 py-2.5 inline-block transition-colors duration-150"
              style={{
                backgroundColor: VSCODE_CHAT.userBg,
                color: VSCODE_CHAT.userFg,
                borderRadius: VSCODE_CHAT.radius,
                fontSize: '13px',
                lineHeight: '1.5',
                fontWeight: 400,
                border: '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = VSCODE_CHAT.userBgHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = VSCODE_CHAT.userBg;
              }}
            >
              <div className="whitespace-pre-wrap break-words">
                {visibleContent}
              </div>
            </div>

            {/* Copy Button - User - VS Code Style */}
            <button
              onClick={handleCopy}
              className="absolute -top-2 -right-10 p-1.5 rounded transition-all duration-150 opacity-0 group-hover:opacity-100"
              style={{
                backgroundColor: 'var(--vscode-editor-background)',
                border: '1px solid var(--vscode-widget-border)',
                color: 'var(--vscode-foreground)',
                cursor: 'pointer',
                opacity: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)';
                e.currentTarget.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--vscode-editor-background)';
                e.currentTarget.style.opacity = '';
              }}
              title="Copy"
            >
              {copied ? (
                <Check size={14} />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        ) : (
          /* Assistant Message - Enhanced Markdown */
          <div className={cn("relative", isStreaming && "streaming-content is-streaming")}>
            <div
              className="max-w-none"
              style={{
                color: 'var(--vscode-foreground)',
                fontSize: `${VS_CODES.fontSize}px`,
                lineHeight: `${VS_CODES.lineHeight}`
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  p: ({ children }) => <p className="my-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="my-2 space-y-1 pl-4">{children}</ul>,
                  ol: ({ children }) => <ol className="my-2 space-y-1 pl-4">{children}</ol>,
                  strong: ({ children }) => (
                    <strong
                      className="font-semibold"
                      style={{ color: 'var(--vscode-foreground)' }}
                    >
                      {children}
                    </strong>
                  ),
                  code: ({ children, className }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code
                        className="px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: 'var(--vscode-text-block-background)',
                          color: 'var(--vscode-text-block-foreground)',
                          fontSize: '12px',
                          fontFamily: 'var(--font-mono)'
                        }}
                      >
                        {children}
                      </code>
                    ) : (
                      <code className={className}>{children}</code>
                    );
                  },
                  pre: ({ children }) => (
                    <pre
                      className="p-3 overflow-x-auto my-3 text-xs border-l-2"
                      style={{
                        backgroundColor: 'var(--vscode-textBlock-background)',
                        borderColor: 'var(--vscode-textBlock-border)',
                        borderRadius: VS_CODES.radiusLg,
                        fontFamily: 'var(--font-mono)',
                        lineHeight: 1.4
                      }}
                    >
                      {children}
                    </pre>
                  ),
                  a: ({ children, href }) => (
                    <a
                      href={href}
                      style={{
                        color: 'var(--vscode-link-foreground)',
                        textDecoration: 'underline'
                      }}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  )
                }}
              >
                {visibleContent}
              </ReactMarkdown>
            </div>

            {/* Copy Button - Assistant - VS Code Style */}
            <button
              onClick={handleCopy}
              className="absolute top-0 right-0 p-1.5 rounded transition-all duration-150 opacity-0 group-hover:opacity-100"
              style={{
                backgroundColor: 'var(--vscode-editor-background)',
                border: '1px solid var(--vscode-widget-border)',
                color: 'var(--vscode-foreground)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--vscode-toolbar-hoverBackground)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--vscode-editor-background)';
              }}
              title="Copy"
            >
              {copied ? (
                <Check size={14} />
              ) : (
                <Copy size={14} />
              )}
            </button>

            {isStreaming && <span className="typing-cursor" />}
          </div>
        )}

        {/* Timestamp - Minimal */}
        {message.timestamp && (
          <span
            className="text-[11px] mt-1.5 block opacity-50"
            style={{
              color: 'var(--vscode-descriptionForeground)',
              fontFamily: 'var(--font-system)'
            }}
          >
            {formatRelativeTime(message.timestamp)}
          </span>
        )}
      </div>
    </div>
  );
});

export default MessageBubble;
