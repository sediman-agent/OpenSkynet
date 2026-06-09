/**
 * AgentInput Component
 * Copilot-style compact input - minimal, functional, professional
 * Matches VS Code design tokens: 26px height, sharp corners, #007fd4 focus
 */

import { forwardRef, useEffect, useRef, useCallback, useState } from 'react';
import { Send, Square, AlertCircle, Paperclip, Upload, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SuggestionChip } from '@/components/ui/SuggestionChip';
import type { SLASH_COMMANDS } from '@/hooks/agent/useAgentInput';
import { VS_CODE_DESIGN, spacing, borderRadius, vscodeStyles } from '@/styles/vscode-design-system';

// ============================================================================
// VS Code Design Tokens (using CSS variables for theme support)
// ============================================================================
const VS_CODES = {
  inputHeight: 26,             // EXACT 26px from design tokens
  cornerRadius: 0,             // Sharp corners
  borderWidth: 1,
  fontSize: 13,                // typeRampBaseFontSize
  designUnit: 4,               // Base spacing unit
  buttonIconPadding: 3,        // Exact from tokens
  buttonIconCornerRadius: 5,    // Exact from tokens
} as const;

// ============================================================================
// Component
// ============================================================================

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
    placeholder = 'Tell me what you need...',
    showSlashCommands = false,
    filteredSlashCommands = [],
    onSelectSlashCommand,
    onToggleFileUpload,
    showFileUpload = false,
    textareaRef,
    onKeyDown
  }, ref) => {
    const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
    const activeTextareaRef = (ref as any) || textareaRef || internalTextareaRef;
    const [isFocused, setIsFocused] = useState(false);

    // Auto-resize textarea - Copilot compact style
    useEffect(() => {
      const textarea = activeTextareaRef.current;
      if (!textarea) return;

      const autoResize = () => {
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        const minHeight = VS_CODES.inputHeight;
        const maxHeight = 180 - VS_CODES.designUnit * 2;
        const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);
        textarea.style.height = `${newHeight}px`;
      };

      autoResize();
      textarea.addEventListener('input', autoResize);
      return () => textarea.removeEventListener('input', autoResize);
    }, [activeTextareaRef]);

    // Handle keyboard shortcuts
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (value.trim() && !isSending) onSend();
      }
      onKeyDown?.(e);
    }, [value, isSending, onSend, onKeyDown]);

    const hasContent = value.trim().length > 0;

    return (
      <div className="relative group font-mono">
        {/* Slash Commands Dropdown */}
        {showSlashCommands && filteredSlashCommands.length > 0 && (
          <div
            className="absolute bottom-full left-0 right-0 mb-2 shadow-lg overflow-hidden z-50"
            style={{
              backgroundColor: 'var(--vscode-input-background)',
              border: '1px solid var(--vscode-divider-color)',
              borderRadius: `${VS_CODES.buttonIconCornerRadius}px`
            }}
          >
            <div style={{ padding: `${VS_CODES.designUnit}px` }}>
              <div
                className="font-medium mb-0.5"
                style={{
                  color: 'var(--vscode-input-placeholder)',
                  fontSize: `${VS_CODES.fontSize}px`,
                  paddingLeft: `${VS_CODES.designUnit}px`,
                  paddingRight: `${VS_CODES.designUnit}px`,
                  paddingTop: `${VS_CODES.designUnit}px`,
                  paddingBottom: `${VS_CODES.designUnit / 2}px`
                }}
              >
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
          </div>
        )}

        {/* Input Container - VS Code Exact Style */}
        <div
          className={cn(
            "relative flex items-center gap-1",
            "transition-colors duration-150"
          )}
          style={{
            height: 'auto',
            minHeight: `${VS_CODES.inputHeight + VS_CODES.designUnit * 2}px`,
            maxHeight: `${180}px`,
          }}
        >
          {/* Border Container */}
          <div
            className={cn(
              "flex-1 flex items-center gap-1 px-1",
              "border",
              sendError
                ? "border-red-500/50"
                : (isFocused ? "border-[var(--vscode-focus-border)]" : "border-[var(--vscode-input-border)]"),
              // Focus ring - exact VS Code style
              isFocused && "shadow-[0_0_0_1px_var(--vscode-focus-border)]"
            )}
            style={{
              borderRadius: `${VS_CODES.cornerRadius}px`,
              borderColor: sendError ? 'rgba(239, 68, 68, 0.5)' : (
                isFocused ? 'var(--vscode-focus-border)' : 'var(--vscode-input-border)'
              )
            }}
          >
            {/* File Upload Button - VS Code Icon Button Style */}
            <button
              onClick={onToggleFileUpload}
              disabled={disabled}
              className={cn(
                "shrink-0 flex items-center justify-center",
                "transition-colors duration-150",
                "disabled:opacity-40",
                showFileUpload
                  ? "text-[var(--vscode-focus-border)]"
                  : "text-[var(--vscode-secondary-text)]"
              )}
              style={{
                width: `${VS_CODES.inputHeight - 2}px`,
                height: `${VS_CODES.inputHeight - 2}px`,
                padding: `${VS_CODES.buttonIconPadding}px`,
                borderRadius: `${VS_CODES.buttonIconCornerRadius}px`,
                backgroundColor: 'transparent',
                border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!disabled && !showFileUpload) {
                  e.currentTarget.style.backgroundColor = 'var(--vscode-list-hover-background)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title={showFileUpload ? "Upload" : "Attach file"}
            >
              {showFileUpload ? (
                <Upload className="w-3.5 h-3.5" />
              ) : (
                <Paperclip className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Textarea - VS Code Style */}
            <textarea
              ref={activeTextareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isSending}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              className={cn(
                "flex-1 bg-transparent outline-none resize-none",
                "font-mono",
                disabled && "cursor-not-allowed opacity-50"
              )}
              style={{
                color: 'var(--vscode-input-foreground)',
                fontSize: `${VS_CODES.fontSize}px`,
                lineHeight: 1.4,
                fontFamily: VS_CODE_DESIGN.fontFamily,
                minHeight: `${VS_CODES.inputHeight}px`,
                maxHeight: `${180 - VS_CODES.designUnit * 2}px`,
                padding: `${VS_CODES.designUnit - 1}px 0`,
                height: 'auto',
              }}
            />

            {/* Send Button - VS Code Primary Button Style */}
            <button
              onClick={isSending ? onStop : onSend}
              disabled={disabled || (!hasContent && !isSending)}
              className={cn(
                "shrink-0 flex items-center justify-center",
                "transition-colors duration-150",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
              style={{
                width: `${VS_CODES.inputHeight + VS_CODES.designUnit}px`,
                height: `${VS_CODES.inputHeight - 2}px`,
                padding: `${VS_CODES.buttonIconPadding}px`,
                borderRadius: `${VS_CODES.buttonIconCornerRadius}px`,
                backgroundColor: hasContent && !isSending ? 'var(--vscode-button-primary-background)' : 'transparent',
                border: 'none',
                color: hasContent && !isSending ? 'var(--vscode-button-primary-foreground)' : (
                  isSending ? 'var(--vscode-error-foreground)' : 'var(--vscode-secondary-text)'
                ),
                cursor: disabled || (!hasContent && !isSending) ? 'not-allowed' : 'pointer',
                fontFamily: VS_CODE_DESIGN.fontFamily,
                fontSize: `${VS_CODES.fontSize}px`,
              }}
              onMouseEnter={(e) => {
                if (!disabled && hasContent && !isSending) {
                  e.currentTarget.style.backgroundColor = 'var(--vscode-button-primary-hover-background)';
                } else if (!disabled && !hasContent && !isSending) {
                  e.currentTarget.style.backgroundColor = 'var(--vscode-list-hover-background)';
                }
              }}
              onMouseLeave={(e) => {
                if (hasContent && !isSending) {
                  e.currentTarget.style.backgroundColor = 'var(--vscode-button-primary-background)';
                } else {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
              title={isSending ? "Stop" : hasContent ? "Send" : "Ask Copilot"}
            >
              {isSending ? (
                <Square className="w-3.5 h-3.5" fill="currentColor" />
              ) : hasContent ? (
                <Send className="w-3.5 h-3.5" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Error Indicator - Compact */}
        {sendError && (
          <div className="absolute -top-6 left-0 flex items-center gap-1.5 text-red-400 text-[11px] font-mono">
            <AlertCircle className="w-3 h-3" />
            <span>FAILED TO SEND</span>
          </div>
        )}

        {/* Character Counter - Compact */}
        {value.length > 800 && (
          <div className="absolute -bottom-5 right-0 text-[10px] font-mono" style={{ color: 'var(--vscode-secondary-text)' }}>
            {value.length.toLocaleString()}
          </div>
        )}
      </div>
    );
  }
);

AgentInput.displayName = 'AgentInput';

export default AgentInput;
