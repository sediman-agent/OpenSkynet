/**
 * VS Code-Style Streaming Execution Display
 * Unified real-time tool call visualization matching VS Code Copilot
 */

import { useState, useCallback, useEffect } from 'react';
import { ChevronDown, ChevronRight, Bot, Check, X, Loader2, Globe, FileText, Terminal, Settings } from 'lucide-react';

// ============================================================================
// VS Code Design Tokens (Exact)
// ============================================================================
const VS_CODES = {
  border: '#3c3c3c',
  borderLight: '#454545',
  borderFocus: '#007fd4',

  bg: '#1e1e1e',
  bgHover: '#2a2d2e',
  bgSecondary: '#252526',

  text: '#cccccc',
  textMuted: '#858585',
  textDim: '#6e6e6e',

  success: '#4ec9b0',
  error: '#f48771',
  warning: '#dcdcaa',
  info: '#3794ff',

  radius: '2px',
  fontSize: '12px',
  fontSizeSmall: '11px',
} as const;

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
// VS Code-Style Status Badge
// ============================================================================
function StatusBadge({ status, startTime }: { status: StreamingToolCall['status']; startTime?: number }) {
  const getStatusStyle = () => {
    switch (status) {
      case 'pending':
        return { color: VS_CODES.textMuted, icon: null };
      case 'running':
        return { color: VS_CODES.info, icon: Loader2 };
      case 'success':
        return { color: VS_CODES.success, icon: Check };
      case 'error':
        return { color: VS_CODES.error, icon: X };
      default:
        return { color: VS_CODES.textMuted, icon: null };
    }
  };

  const style = getStatusStyle();
  const Icon = style.icon;

  return (
    <div className="flex items-center gap-2 font-mono" style={{ fontSize: VS_CODES.fontSizeSmall }}>
      {Icon && (
        <div className="flex items-center" style={{ color: style.color }}>
          <Icon size={10} className={status === 'running' ? 'animate-spin' : ''} />
        </div>
      )}

      <span className="uppercase" style={{ color: style.color, fontSize: '10px' }}>
        {status}
      </span>

      {status === 'running' && startTime && (
        <span style={{ color: VS_CODES.textDim }}>
          {getElapsedTime(startTime)}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// VS Code-Style Tool Call Item
// ============================================================================
interface ToolCallItemProps {
  toolCall: StreamingToolCall;
  isStreaming: boolean;
}

function ToolCallItem({ toolCall, isStreaming }: ToolCallItemProps) {
  const [expanded, setExpanded] = useState(false);
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

  return (
    <div
      className="border font-mono"
      style={{
        borderColor: VS_CODES.border,
        borderRadius: VS_CODES.radius,
        marginBottom: '2px',
        backgroundColor: expanded ? VS_CODES.bgHover : VS_CODES.bg
      }}
    >
      {/* Header Row */}
      <div
        className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-[#2a2d2e]/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
        style={{ minHeight: '22px' }}
      >
        {/* Expand/Collapse Icon */}
        <div className="flex items-center shrink-0" style={{ width: '14px' }}>
          {expanded ? (
            <ChevronDown size={11} style={{ color: VS_CODES.textMuted }} />
          ) : (
            <ChevronRight size={11} style={{ color: VS_CODES.textMuted }} />
          )}
        </div>

        {/* Action Icon */}
        <div className="flex items-center shrink-0" style={{ color: VS_CODES.textMuted }}>
          <ActionIcon size={11} />
        </div>

        {/* Action Name */}
        <div className="flex-1 truncate">
          <span style={{ color: VS_CODES.text }}>
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
          className="px-2 pb-1 truncate"
          style={{
            color: VS_CODES.textDim,
            fontSize: VS_CODES.fontSizeSmall,
            marginLeft: '28px'
          }}
        >
          {formatPreview(toolCall.detail)}
        </div>
      )}

      {/* Expanded Content */}
      {expanded && (
        <div
          className="border-t overflow-hidden"
          style={{
            borderColor: VS_CODES.border,
            padding: '4px 8px'
          }}
        >
          {/* Input/Detail */}
          {toolCall.detail && (
            <div className="mb-2">
              <div className="text-[10px] uppercase mb-1 font-medium tracking-wider" style={{ color: VS_CODES.textMuted }}>
                Input
              </div>
              <pre
                className="p-2 overflow-x-auto max-h-24 whitespace-pre-wrap break-all font-mono"
                style={{
                  backgroundColor: VS_CODES.bgSecondary,
                  border: `1px solid ${VS_CODES.border}`,
                  borderRadius: VS_CODES.radius,
                  fontSize: VS_CODES.fontSize,
                  color: VS_CODES.text
                }}
              >
                {toolCall.detail}
              </pre>
            </div>
          )}

          {/* Output */}
          {toolCall.output && (
            <div className="mb-2">
              <div className="text-[10px] uppercase mb-1 font-medium tracking-wider" style={{ color: VS_CODES.textMuted }}>
                Output
              </div>
              <pre
                className="p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all font-mono border-l-2"
                style={{
                  backgroundColor: VS_CODES.bgSecondary,
                  borderColor: VS_CODES.success,
                  fontSize: VS_CODES.fontSize,
                  color: VS_CODES.text
                }}
              >
                {toolCall.output.length > 1000 ? toolCall.output.slice(0, 1000) + '...' : toolCall.output}
              </pre>
            </div>
          )}

          {/* Error */}
          {toolCall.error && (
            <div>
              <div className="text-[10px] uppercase mb-1 font-medium tracking-wider" style={{ color: VS_CODES.error }}>
                Error
              </div>
              <pre
                className="p-2 overflow-x-auto max-h-24 whitespace-pre-wrap break-all font-mono border-l-2"
                style={{
                  backgroundColor: 'rgba(244, 135, 113, 0.1)',
                  borderColor: VS_CODES.error,
                  fontSize: VS_CODES.fontSize,
                  color: VS_CODES.error
                }}
              >
                {toolCall.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Summary Component
// ============================================================================
function ExecutionSummary({
  toolCalls,
  isStreaming
}: {
  toolCalls: StreamingToolCall[];
  isStreaming: boolean;
}) {
  const completed = toolCalls.filter(tc => tc.status === 'success' || tc.status === 'error').length;
  const running = toolCalls.filter(tc => tc.status === 'running').length;
  const failed = toolCalls.filter(tc => tc.status === 'error').length;
  const totalDuration = toolCalls.reduce((sum, tc) => sum + (tc.duration || 0), 0);

  if (toolCalls.length === 0) return null;

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 mb-2 border font-mono"
      style={{
        borderColor: VS_CODES.border,
        borderRadius: VS_CODES.radius,
        backgroundColor: VS_CODES.bgSecondary,
        fontSize: VS_CODES.fontSize
      }}
    >
      <span style={{ color: VS_CODES.text }}>
        {completed}/{toolCalls.length} steps
      </span>

      {running > 0 && (
        <>
          <span style={{ color: VS_CODES.textDim }}>•</span>
          <span style={{ color: VS_CODES.info }}>{running} running</span>
        </>
      )}

      {failed > 0 && (
        <>
          <span style={{ color: VS_CODES.textDim }}>•</span>
          <span style={{ color: VS_CODES.error }}>{failed} failed</span>
        </>
      )}

      {!isStreaming && totalDuration > 0 && (
        <>
          <span style={{ color: VS_CODES.textDim }}>•</span>
          <span style={{ color: VS_CODES.text }}>{formatDuration(totalDuration)}</span>
        </>
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
