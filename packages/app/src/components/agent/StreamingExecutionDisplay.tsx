/**
 * VS Code-Style Streaming Execution Display - Industrial Grade
 * Enhanced real-time tool call visualization with professional styling
 * Matching VS Code Copilot quality with improved visual hierarchy
 */

import { useState, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronRight, Check, X, Loader2, Globe, FileText, Terminal, Settings, AlertTriangle } from 'lucide-react';
import { VS_CODES } from '@/styles/vscode-constants';

// ============================================================================
// Types
// ============================================================================
export interface StreamingToolCall {
  id: string;
  action: string;
  detail?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  timestamp: number;
  duration?: number;
  output?: string;
  error?: string;
}

interface StreamingExecutionDisplayProps {
  toolCalls: StreamingToolCall[];
  phase?: string;
  isStreaming?: boolean;
  className?: string;
}

// ============================================================================
// Utilities
// ============================================================================
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getActionIcon(action: string): any {
  if (action?.startsWith('browser_')) return Globe;
  if (action?.includes('file') || action?.includes('read') || action?.includes('write')) return FileText;
  if (action?.includes('shell') || action?.includes('exec')) return Terminal;
  return Settings;
}

function getElapsedTime(startTime: number): string {
  const elapsed = Date.now() - startTime;
  return formatDuration(elapsed);
}

// ============================================================================
// VS Code-Style Status Badge - Enhanced
// ============================================================================
function StatusBadge({ status, startTime }: { status: StreamingToolCall['status']; startTime?: number }) {
  const getStatusStyle = () => {
    switch (status) {
      case 'pending':
        return {
          color: 'var(--vscode-secondary-text)',
          bg: 'var(--vscode-badge-background)',
          icon: null
        };
      case 'running':
        return {
          color: 'var(--vscode-info-foreground)',
          bg: 'var(--vscode-badge-background)',
          icon: Loader2,
          spinning: true
        };
      case 'success':
        return {
          color: 'var(--vscode-success-foreground)',
          bg: 'var(--vscode-badge-background)',
          icon: Check,
          spinning: false
        };
      case 'error':
        return {
          color: 'var(--vscode-error-foreground)',
          bg: 'var(--vscode-badge-background)',
          icon: X,
          spinning: false
        };
      default:
        return {
          color: 'var(--vscode-secondary-text)',
          bg: 'var(--vscode-badge-background)',
          icon: null,
          spinning: false
        };
    }
  };

  const style = getStatusStyle();
  const Icon = style.icon;

  return (
    <div className="flex items-center gap-2 font-mono" style={{ fontSize: '11px' }}>
      {Icon && (
        <div className="flex items-center" style={{ color: style.color }}>
          <Icon size={11} className={style.spinning ? 'animate-spin' : ''} />
        </div>
      )}

      <span
        className="uppercase px-2 py-0.5 rounded"
        style={{
          color: style.color,
          fontSize: '10px',
          fontWeight: 500,
          backgroundColor: style.bg,
          opacity: 0.9,
          letterSpacing: '0.3px'
        }}
      >
        {status}
      </span>

      {status === 'running' && startTime && (
        <span style={{ color: 'var(--vscode-secondary-text)' }}>
          {getElapsedTime(startTime)}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// VS Code-Style Tool Call Item - Enhanced
// ============================================================================
interface ToolCallItemProps {
  toolCall: StreamingToolCall;
  isStreaming: boolean;
}

function ToolCallItem({ toolCall, isStreaming }: ToolCallItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [headerHovered, setHeaderHovered] = useState(false);
  const ActionIcon = getActionIcon(toolCall.action);

  // Auto-expand on error
  useEffect(() => {
    if (toolCall.status === 'error') {
      setExpanded(true);
    }
  }, [toolCall.status]);

  // Auto-expand when running (for the first time)
  useEffect(() => {
    if (toolCall.status === 'running' && !expanded) {
      setExpanded(true);
    }
  }, [toolCall.status]);

  const formatPreview = (text: string | undefined, maxLength: number = 60) => {
    if (!text) return '';
    try {
      const parsed = JSON.parse(text);
      const entries = Object.entries(parsed).slice(0, 2);
      const short = entries.map(([k, v]) =>
        `${k}: ${typeof v === 'string' ? v.slice(0, 20) : String(v).slice(0, 20)}`
      ).join(', ');
      return short.length > maxLength ? short.slice(0, maxLength) + '...' : short;
    } catch {
      return text.length > maxLength ? text.slice(0, maxLength) + '...' : text;
    }
  };

  const hasError = toolCall.status === 'error';

  return (
    <div
      className="border font-mono transition-all duration-150"
      style={{
        borderColor: 'var(--vscode-border-color)',
        borderRadius: VS_CODES.radiusSm,
        marginBottom: VS_CODES.spacing.xs,
        backgroundColor: expanded ? 'var(--vscode-list-hoverBackground)' : 'transparent',
        // Highlight border for errors
        ...(hasError && {
          borderColor: 'var(--vscode-error-foreground)',
          borderWidth: '1px'
        })
      }}
    >
      {/* Header Row - Enhanced */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer transition-all duration-150"
        onClick={() => setExpanded(!expanded)}
        style={{
          minHeight: '28px',
          backgroundColor: headerHovered && !expanded ? 'var(--vscode-list-hoverBackground)' : 'transparent'
        }}
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
      >
        {/* Expand/Collapse Icon */}
        <div className="flex items-center shrink-0" style={{ width: '16px' }}>
          {expanded ? (
            <ChevronDown size={12} style={{ color: 'var(--vscode-secondary-text)' }} />
          ) : (
            <ChevronRight size={12} style={{ color: 'var(--vscode-secondary-text)' }} />
          )}
        </div>

        {/* Action Icon */}
        <div className="flex items-center shrink-0" style={{ color: 'var(--vscode-secondary-text)' }}>
          <ActionIcon size={12} />
        </div>

        {/* Action Name */}
        <div className="flex-1 truncate">
          <span
            className="font-medium"
            style={{
              color: 'var(--vscode-foreground)',
              fontSize: '12px'
            }}
          >
            {toolCall.action}
          </span>
        </div>

        {/* Status Badge */}
        <StatusBadge
          status={toolCall.status}
          startTime={toolCall.status === 'running' ? toolCall.timestamp : undefined}
        />
      </div>

      {/* Preview (when collapsed) */}
      {!expanded && toolCall.detail && (
        <div
          className="px-2 pb-1.5 truncate transition-all duration-150"
          style={{
            color: 'var(--vscode-secondary-text)',
            fontSize: '11px',
            marginLeft: '32px',
            lineHeight: 1.4
          }}
        >
          {formatPreview(toolCall.detail)}
        </div>
      )}

      {/* Expanded Content - Enhanced */}
      {expanded && (
        <div
          className="border-t overflow-hidden transition-all duration-150"
          style={{
            borderColor: 'var(--vscode-border-color)',
            padding: `${VS_CODES.spacing.md}px ${VS_CODES.spacing.lg}px`
          }}
        >
          {/* Input/Detail - Enhanced */}
          {toolCall.detail && (
            <div style={{ marginBottom: VS_CODES.spacing.md }}>
              <div
                className="uppercase font-medium tracking-wider"
                style={{
                  color: 'var(--vscode-secondary-text)',
                  fontSize: '10px',
                  marginBottom: VS_CODES.spacing.sm,
                  opacity: 0.8
                }}
              >
                Input
              </div>
              <pre
                className="p-2 overflow-x-auto max-h-28 whitespace-pre-wrap break-all font-mono border rounded transition-all duration-150"
                style={{
                  backgroundColor: 'var(--vscode-sideBar-background)',
                  border: `1px solid var(--vscode-border-color)`,
                  borderRadius: VS_CODES.radiusSm,
                  fontSize: '12px',
                  color: 'var(--vscode-foreground)',
                  lineHeight: 1.4
                }}
              >
                {toolCall.detail}
              </pre>
            </div>
          )}

          {/* Output - Enhanced */}
          {toolCall.output && (
            <div style={{ marginBottom: hasError ? VS_CODES.spacing.md : 0 }}>
              <div
                className="uppercase font-medium tracking-wider"
                style={{
                  color: 'var(--vscode-secondary-text)',
                  fontSize: '10px',
                  marginBottom: VS_CODES.spacing.sm,
                  opacity: 0.8
                }}
              >
                Output
              </div>
              <pre
                className="p-2 overflow-x-auto max-h-36 whitespace-pre-wrap break-all font-mono border-l-2 rounded transition-all duration-150"
                style={{
                  backgroundColor: hasError ? 'rgba(244, 135, 113, 0.05)' : 'var(--vscode-sideBar-background)',
                  borderColor: hasError ? 'var(--vscode-error-foreground)' : 'var(--vscode-success-foreground)',
                  fontSize: '12px',
                  lineHeight: 1.4,
                  color: hasError ? 'var(--vscode-error-foreground)' : 'var(--vscode-foreground)'
                }}
              >
                {toolCall.output.length > 1000 ? toolCall.output.slice(0, 1000) + '...' : toolCall.output}
              </pre>
            </div>
          )}

          {/* Error - Enhanced */}
          {toolCall.error && (
            <div
              className="p-2 border-l-2 rounded"
              style={{
                backgroundColor: 'rgba(244, 135, 113, 0.08)',
                borderColor: 'var(--vscode-error-foreground)',
                borderRadius: VS_CODES.radiusSm
              }}
            >
              <div className="flex items-start gap-2 mb-1">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" style={{ color: 'var(--vscode-error-foreground)' }} />
                <div className="flex-1">
                  <div
                    className="uppercase font-semibold tracking-wider mb-1"
                    style={{
                      color: 'var(--vscode-error-foreground)',
                      fontSize: '10px'
                    }}
                  >
                    Error
                  </div>
                  <pre
                    className="whitespace-pre-wrap break-all font-mono"
                    style={{
                      fontSize: '12px',
                      color: 'var(--vscode-error-foreground)',
                      lineHeight: 1.4
                    }}
                  >
                    {toolCall.error}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// VS Code-Style Summary - Enhanced
// ============================================================================
function ExecutionSummary({
  toolCalls,
  isStreaming
}: {
  toolCalls: StreamingToolCall[];
  isStreaming: boolean;
}) {
  const completed = toolCalls.filter(tc => tc.status === 'success' || tc.status === 'error').length;
  const running = toolCalls.filter(tc => tc.status === 'running' || tc.status === 'pending').length;
  const failed = toolCalls.filter(tc => tc.status === 'error').length;
  const totalDuration = toolCalls.reduce((sum, tc) => sum + (tc.duration || 0), 0);

  if (toolCalls.length === 0) return null;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 mb-2 border font-mono transition-all duration-150"
      style={{
        borderColor: 'var(--vscode-border-color)',
        borderRadius: VS_CODES.borderRadiusRound,
        backgroundColor: 'var(--vscode-panel-background)',
        fontSize: '12px',
        fontWeight: 500
      }}
    >
      {/* Steps count */}
      <span style={{ color: 'var(--vscode-foreground)' }}>
        {completed}/{toolCalls.length} steps
      </span>

      {/* Separator */}
      <span style={{ color: 'var(--vscode-border-color)', opacity: 0.5 }}>|</span>

      {/* Running count */}
      {running > 0 && (
        <>
          <span className="flex items-center gap-1" style={{ color: 'var(--vscode-foreground)' }}>
            <Loader2 size={11} className="animate-spin" style={{ color: 'var(--vscode-info-foreground)' }} />
            {running} running
          </span>
          <span style={{ color: 'var(--vscode-border-color)', opacity: 0.5 }}>|</span>
        </>
      )}

      {/* Failed count */}
      {failed > 0 && (
        <>
          <span className="flex items-center gap-1" style={{ color: 'var(--vscode-error-foreground)', fontWeight: 600 }}>
            <AlertTriangle size={11} />
            {failed} failed
          </span>
          <span style={{ color: 'var(--vscode-border-color)', opacity: 0.5 }}>|</span>
        </>
      )}

      {/* Total duration */}
      {!isStreaming && totalDuration > 0 && (
        <span style={{ color: 'var(--vscode-foreground)', fontSize: '11px' }}>
          {formatDuration(totalDuration)}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================
export function StreamingExecutionDisplay({
  toolCalls,
  phase,
  isStreaming = false,
  className
}: StreamingExecutionDisplayProps) {
  // Sort tool calls: running/pending first, then by timestamp (newest first)
  const sortedToolCalls = [...toolCalls].sort((a, b) => {
    // Show running/pending first
    const aPriority = a.status === 'running' || a.status === 'pending' ? 1 : 0;
    const bPriority = b.status === 'running' || b.status === 'pending' ? 1 : 0;
    if (aPriority !== bPriority) return bPriority - aPriority;

    // Then by timestamp (newest first)
    return b.timestamp - a.timestamp;
  });

  if (sortedToolCalls.length === 0) return null;

  return (
    <div className={className}>
      <ExecutionSummary toolCalls={sortedToolCalls} isStreaming={isStreaming} />

      <div>
        {sortedToolCalls.map(toolCall => (
          <ToolCallItem
            key={toolCall.id}
            toolCall={toolCall}
            isStreaming={isStreaming}
          />
        ))}
      </div>
    </div>
  );
}

export default StreamingExecutionDisplay;
