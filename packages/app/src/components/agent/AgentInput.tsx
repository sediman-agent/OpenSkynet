/**
 * AgentInput Component - Optimized
 * Minimal design, clean code, efficient rendering
 */

import { forwardRef, useEffect, useRef, useCallback, useState } from 'react';
import { Send, Square, AlertCircle, Paperclip, Upload, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SuggestionChip } from '@/components/ui/SuggestionChip';
import type { SLASH_COMMANDS } from '@/hooks/agent/useAgentInput';

interface AgentInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isSending?: boolean;
  sendError?: boolean;
  disabled?: boolean;
  placeholder?: string;
  showSlashCommands?: boolean;
  filteredSlashCommands?: typeof SLASH_COMMANDS;
  onSelectSlashCommand?: (command: typeof SLASH_COMMANDS[number]) => void;
  onToggleFileUpload?: () => void;
  showFileUpload?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

export const AgentInput = forwardRef<HTMLTextAreaElement, AgentInputProps>(
  ({
    value,
    onChange,
    onSend,
    onStop,
    isSending = false,
    sendError = false,
    disabled = false,
    placeholder = 'Ask anything...',
    showSlashCommands = false,
    filteredSlashCommands = [],
    onSelectSlashCommand,
    onToggleFileUpload,
    showFileUpload = false,
    textareaRef,
    onKeyDown
  }, ref) => {
    const internalRef = useRef<HTMLTextAreaElement>(null);
    const currentRef = (ref as any) || textareaRef || internalRef;
    const [isFocused, setIsFocused] = useState(false);

    useEffect(() => {
      const el = currentRef.current;
      if (!el) return;

      const resize = () => {
        el.style.height = '26px';
        const h = Math.min(Math.max(el.scrollHeight, 26), 180);
        el.style.height = `${h}px`;
      };

      resize();
      el.addEventListener('input', resize);
      return () => el.removeEventListener('input', resize);
    }, [currentRef]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (value.trim() && !isSending) onSend();
      }
      onKeyDown?.(e);
    }, [value, isSending, onSend, onKeyDown]);

    const hasContent = value.trim().length > 0;

    return (
      <div className="relative">
        {/* Slash Commands Dropdown */}
        {showSlashCommands && filteredSlashCommands.length > 0 && (
          <div
            className="absolute bottom-full left-0 right-0 mb-1 z-50"
            style={{
              backgroundColor: 'var(--vscode-dropdown-background)',
              border: '1px solid var(--vscode-dropdown-border)',
              borderRadius: '3px',
              maxHeight: '200px',
              overflowY: 'auto',
              padding: '4px'
            }}
          >
            <div style={{
              color: 'var(--vscode-description-foreground)',
              fontSize: '11px',
              fontWeight: 500,
              padding: '0 4px 4px 4px',
              opacity: 0.8
            }}>
              QUICK ACTIONS
            </div>
            {filteredSlashCommands.map(cmd => (
              <SuggestionChip
                key={cmd.id}
                label={cmd.label}
                onClick={() => onSelectSlashCommand?.(cmd)}
                className="w-full text-left"
              />
            ))}
          </div>
        )}

        {/* Input Container */}
        <div
          className={cn(
            "flex items-center gap-1 border transition-colors duration-150",
            sendError
              ? "border-[var(--vscode-error-border)]"
              : isFocused
                ? "border-[var(--vscode-focus-border)]"
                : "border-[var(--vscode-input-border)]"
          )}
          style={{
            borderRadius: '3px',
            height: '34px',
            padding: '0 4px'
          }}
        >
          {/* File Upload Button */}
          <button
            type="button"
            onClick={onToggleFileUpload}
            disabled={disabled}
            className={cn(
              "shrink-0 flex items-center justify-center",
              "w-[26px] h-[26px] rounded",
              "transition-colors duration-150",
              "disabled:opacity-40 disabled:cursor-not-allowed",
              showFileUpload && "bg-[var(--vscode-toolbar-hoverBackground)]",
              !disabled && !showFileUpload && "hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            )}
            style={{ padding: 0 }}
            title={showFileUpload ? "Close file upload" : "Attach file"}
          >
            {showFileUpload ? (
              <Upload size={14} style={{ color: 'var(--vscode-foreground)' }} />
            ) : (
              <Paperclip size={14} style={{ color: 'var(--vscode-foreground)' }} />
            )}
          </button>

          {/* Textarea */}
          <textarea
            ref={currentRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isSending}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="flex-1 bg-transparent outline-none resize-none disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              color: 'var(--vscode-input-foreground)',
              fontSize: '13px',
              lineHeight: '20px',
              fontFamily: 'var(--font-mono)',
              height: '26px',
              padding: '3px 6px',
              border: 'none',
              background: 'transparent',
              minHeight: '26px'
            }}
          />

          {/* Send Button */}
          <button
            type="button"
            onClick={isSending ? onStop : onSend}
            disabled={disabled || (!hasContent && !isSending)}
            className={cn(
              "shrink-0 flex items-center justify-center",
              "w-[26px] h-[26px] rounded",
              "transition-colors duration-150",
              "disabled:opacity-40 disabled:cursor-default",
              !disabled && (hasContent || isSending) && "hover:bg-[var(--vscode-toolbar-hoverBackground)]"
            )}
            style={{
              padding: 0,
              color: hasContent && !isSending
                ? 'var(--vscode-button-primary-foreground)'
                : isSending
                  ? 'var(--vscode-error-foreground)'
                  : 'var(--vscode-foreground)',
              opacity: hasContent || isSending ? 1 : 0.5,
              cursor: disabled || (!hasContent && !isSending) ? 'default' : 'pointer'
            }}
            title={isSending ? "Stop generation" : hasContent ? "Send message" : "Type a message to send"}
          >
            {isSending ? (
              <Square size={13} fill="currentColor" />
            ) : hasContent ? (
              <Send size={13} />
            ) : (
              <Sparkles size={13} />
            )}
          </button>
        </div>

        {/* Error Indicator */}
        {sendError && (
          <div className="absolute -top-5 left-0 flex items-center gap-1" style={{
            fontSize: '11px',
            color: 'var(--vscode-error-foreground)',
          }}>
            <AlertCircle size={11} />
            <span>Failed to send</span>
          </div>
        )}

        {/* Character Counter */}
        {value.length > 1000 && (
          <div className="absolute -bottom-4 right-0" style={{
            fontSize: '10px',
            color: 'var(--vscode-description-foreground)',
            opacity: 0.6
          }}>
            {value.length.toLocaleString()}
          </div>
        )}
      </div>
    );
  });

AgentInput.displayName = 'AgentInput';

export default AgentInput;
