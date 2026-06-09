/**
 * VS Code-Style Execution Display
 * Exact replica of VS Code Copilot's tool call visualization
 */

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Bot, Check, X, Loader2, Globe, FileText, Terminal, Settings, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThinkBlock } from '@/types';

// ============================================================================
// VS Code Design Tokens (using CSS variables for theme support)
// ============================================================================
const VS_CODES = {
  // Spacing
  xs: '2px',
  sm: '4px',
  md: '8px',
  lg: '12px',

  // Typography
  fontSize: '12px',
  fontSizeSmall: '11px',
  lineHeight: 1.4,

  // Border radius
  radius: '2px',
  radiusSm: '3px',
} as const;

// ============================================================================
// Types
// ============================================================================

export interface ExecutionStep {
  id: string;
  type: 'thinking' | 'tool' | 'response' | 'planning' | 'executing' | 'reflecting' | 'retrying' | 'responding';
  timestamp: number;
  duration?: number;
  status: 'pending' | 'running' | 'success' | 'error';
  thinking?: ThinkBlock;
  action?: string;
  detail?: string;
  observation?: string;
  error?: {
    message: string;
    code?: string;
    suggestion?: string;
    retryable?: boolean;
  };
}

export interface ExecutionDisplayProps {
  steps: ExecutionStep[];
  isStreaming?: boolean;
  showSummary?: boolean;
  className?: string;
  onRetry?: (stepId: string) => void;
  onDismiss?: (stepId: string) => void;
}

// ============================================================================
// Utilities
// ============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getStepIcon(type: string, action?: string): any {
  switch (type) {
    case 'thinking':
      return Bot;
    case 'tool':
      if (action?.startsWith('browser_')) return Globe;
      if (action?.includes('file') || action?.includes('read') || action?.includes('write')) return FileText;
      if (action?.includes('shell') || action?.includes('exec')) return Terminal;
      return Settings;
    default:
      return Settings;
  }
}

// ============================================================================
// VS Code-Style Status Badge
// ============================================================================

function VSCodeStatusBadge({ status, duration }: { status: ExecutionStep['status']; duration?: number }) {
  const getStatusStyle = () => {
    switch (status) {
      case 'pending':
        return { color: 'var(--vscode-secondary-text)', bg: 'transparent', icon: null };
      case 'running':
        return { color: 'var(--vscode-info-foreground)', bg: 'transparent', icon: Loader2 };
      case 'success':
        return { color: 'var(--vscode-success-foreground)', bg: 'transparent', icon: Check };
      case 'error':
        return { color: 'var(--vscode-error-foreground)', bg: 'transparent', icon: X };
      default:
        return { color: 'var(--vscode-secondary-text)', bg: 'transparent', icon: null };
    }
  };

  const style = getStatusStyle();
  const Icon = style.icon;

  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      {Icon && (
        <div className="flex items-center" style={{ color: style.color }}>
          <Icon size={11} className={status === 'running' ? 'animate-spin' : ''} />
        </div>
      )}

      <span style={{ color: style.color }} className="uppercase text-[10px]">
        {status}
      </span>

      {duration !== undefined && (
        <span style={{ color: 'var(--vscode-secondary-text)' }}>
          {formatDuration(duration)}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// VS Code-Style Summary (Exact format)
// ============================================================================

function VSCodeSummary({ steps }: { steps: ExecutionStep[] }) {
  const completed = steps.filter(s => s.status !== 'pending' && s.status !== 'running').length;
  const failed = steps.filter(s => s.status === 'error').length;
  const totalDuration = steps.reduce((sum, s) => sum + (s.duration || 0), 0);
  const thinkingCount = steps.filter(s => s.type === 'thinking').length;

  if (steps.length === 0) return null;

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 mb-2 border font-mono text-xs"
      style={{
        borderColor: 'var(--vscode-border-color)',
        borderRadius: VS_CODES.radiusSm,
        backgroundColor: 'var(--vscode-panel-background)'
      }}
    >
      {/* Steps count */}
      <span style={{ color: 'var(--vscode-foreground)' }}>
        {completed}/{steps.length} steps
      </span>

      {/* Thinking count */}
      {thinkingCount > 0 && (
        <span style={{ color: 'var(--vscode-secondary-text)' }}>
          •
        </span>
      )}

      {thinkingCount > 0 && (
        <span className="flex items-center gap-1" style={{ color: 'var(--vscode-foreground)' }}>
          <Bot size={11} />
          {thinkingCount} thinking
        </span>
      )}

      {/* Failed count */}
      {failed > 0 && (
        <>
          <span style={{ color: 'var(--vscode-secondary-text)' }}>•</span>
          <span style={{ color: 'var(--vscode-error-foreground)' }}>{failed} failed</span>
        </>
      )}

      {/* Total duration */}
      {totalDuration > 0 && (
        <>
          <span style={{ color: 'var(--vscode-secondary-text)' }}>•</span>
          <span style={{ color: 'var(--vscode-foreground)' }}>{formatDuration(totalDuration)}</span>
        </>
      )}
    </div>
  );
}

// ============================================================================
// VS Code-Style Accordion Item
// ============================================================================

interface VSCodeAccordionItemProps {
  step: ExecutionStep;
  onRetry?: (stepId: string) => void;
  onDismiss?: (stepId: string) => void;
}

function VSCodeAccordionItem({ step, onRetry, onDismiss }: VSCodeAccordionItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const isThinking = step.type === 'thinking';
  const hasError = step.status === 'error';
  const StepIcon = getStepIcon(step.type, step.action);

  // Format detail for preview
  const formatPreview = (text: string | undefined, maxLength: number = 50) => {
    if (!text) return '';
    if (text.length > maxLength) return text.slice(0, maxLength) + '...';
    return text;
  };

  const handleToggle = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const handleRetry = useCallback(() => {
    setDismissed(true);
    onRetry?.(step.id);
  }, [step.id, onRetry]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onDismiss?.(step.id);
  }, [step.id, onDismiss]);

  return (
    <div
      className="border font-mono text-xs"
      style={{
        borderColor: 'var(--vscode-border-color)',
        borderRadius: VS_CODES.radiusSm,
        marginBottom: VS_CODES.sm,
        backgroundColor: expanded ? 'var(--vscode-list-hover-background)' : 'var(--vscode-panel-background)'
      }}
    >
      {/* Header Row - VS Code Style */}
      <div
        className="flex items-center gap-2 px-2 py-1 cursor-pointer transition-colors"
        onClick={handleToggle}
        style={{ minHeight: '24px' }}
        onMouseEnter={(e) => {
          if (!expanded) {
            e.currentTarget.style.backgroundColor = 'var(--vscode-list-hover-background)';
          }
        }}
        onMouseLeave={(e) => {
          if (!expanded) {
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        {/* Expand/Collapse Icon */}
        <div className="flex items-center shrink-0" style={{ width: '16px' }}>
          {expanded ? (
            <ChevronDown size={12} style={{ color: 'var(--vscode-secondary-text)' }} />
          ) : (
            <ChevronRight size={12} style={{ color: 'var(--vscode-secondary-text)' }} />
          )}
        </div>

        {/* Step Icon */}
        <div className="flex items-center shrink-0" style={{ color: 'var(--vscode-secondary-text)' }}>
          <StepIcon size={12} />
        </div>

        {/* Action Name */}
        <div className="flex-1 truncate">
          <span style={{
            color: isThinking ? 'var(--vscode-warning-foreground)' : 'var(--vscode-foreground)',
            fontWeight: isThinking ? 500 : 400
          }}>
            {isThinking ? 'Reasoning' : (step.action || 'Unknown')}
          </span>
        </div>

        {/* Status Badge */}
        <VSCodeStatusBadge status={step.status} duration={step.duration} />

        {/* Error Actions */}
        {hasError && (
          <div className="flex items-center gap-1 shrink-0">
            {step.error?.retryable && (
              <button
                onClick={(e) => { e.stopPropagation(); handleRetry(); }}
                className="px-2 py-0.5 text-xs transition-colors"
                style={{
                  color: 'var(--vscode-info-foreground)',
                  background: 'transparent',
                  border: 'none'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--vscode-list-hover-background)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                retry
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
              className="px-2 py-0.5 text-xs transition-colors"
              style={{
                color: 'var(--vscode-secondary-text)',
                background: 'transparent',
                border: 'none'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--vscode-list-hover-background)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              dismiss
            </button>
          </div>
        )}
      </div>

      {/* Preview (when collapsed) */}
      {!expanded && !isThinking && step.detail && (
        <div
          className="px-2 pb-1 text-xs truncate"
          style={{ color: 'var(--vscode-secondary-text)', marginLeft: '36px' }}
        >
          {formatPreview(step.detail)}
        </div>
      )}

      {/* Expanded Content - VS Code Style */}
      {expanded && (
        <div
          className="border-t overflow-hidden"
          style={{
            borderColor: 'var(--vscode-border-color)',
            padding: VS_CODES.md
          }}
        >
          {/* Error Message */}
          {hasError && step.error && (
            <div
              className="mb-2 p-2 border-l-2"
              style={{
                backgroundColor: 'rgba(244, 135, 113, 0.1)',
                borderColor: 'var(--vscode-error-foreground)',
                color: 'var(--vscode-error-foreground)'
              }}
            >
              <div className="flex items-start gap-2 mb-1">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-xs font-medium mb-0.5">Error</div>
                  <div className="text-xs" style={{ color: 'var(--vscode-foreground)' }}>{step.error.message}</div>
                  {step.error.code && (
                    <div className="text-[10px] mt-1 font-mono" style={{ color: 'var(--vscode-error-foreground)' }}>
                      {step.error.code}
                    </div>
                  )}
                </div>
              </div>
              {step.error.suggestion && (
                <div
                  className="mt-2 p-2 border-l-2"
                  style={{
                    backgroundColor: 'rgba(55, 148, 255, 0.1)',
                    borderColor: 'var(--vscode-info-foreground)',
                    color: 'var(--vscode-info-foreground)'
                  }}
                >
                  <div className="text-xs">{step.error.suggestion}</div>
                </div>
              )}
            </div>
          )}

          {/* Thinking Content */}
          {isThinking && step.thinking?.content && (
            <div
              className="p-2 border-l-2 mb-2"
              style={{
                backgroundColor: 'rgba(220, 220, 170, 0.1)',
                borderColor: 'var(--vscode-warning-foreground)',
                color: 'var(--vscode-warning-foreground)'
              }}
            >
              <div className="text-[10px] uppercase mb-1 font-medium tracking-wider">
                Reasoning
                {step.thinking.content && (
                  <span style={{ color: 'var(--vscode-secondary-text)' }} className="ml-2">
                    ({step.thinking.content.length} chars)
                  </span>
                )}
              </div>
              <div
                className="text-xs whitespace-pre-wrap break-words max-h-48 overflow-y-auto"
                style={{
                  color: 'var(--vscode-foreground)',
                  lineHeight: VS_CODES.lineHeight
                }}
              >
                {step.thinking.content}
              </div>
            </div>
          )}

          {/* Tool Input */}
          {!isThinking && step.detail && (
            <div className="mb-2">
              <div className="text-[10px] uppercase mb-1 font-medium tracking-wider" style={{ color: 'var(--vscode-secondary-text)' }}>
                Input
              </div>
              <pre
                className="p-2 overflow-x-auto max-h-32 whitespace-pre-wrap break-all font-mono text-xs"
                style={{
                  backgroundColor: 'var(--vscode-panel-background)',
                  border: '1px solid var(--vscode-border-color)',
                  borderRadius: VS_CODES.radius,
                  color: 'var(--vscode-foreground)'
                }}
              >
                {step.detail}
              </pre>
            </div>
          )}

          {/* Tool Output */}
          {!isThinking && step.observation && (
            <div>
              <div className="text-[10px] uppercase mb-1 font-medium tracking-wider" style={{ color: 'var(--vscode-secondary-text)' }}>
                Output
              </div>
              <pre
                className="p-2 overflow-x-auto max-h-40 whitespace-pre-wrap break-all font-mono text-xs border-l-2"
                style={{
                  backgroundColor: hasError ? 'rgba(244, 135, 113, 0.05)' : 'var(--vscode-panel-background)',
                  borderColor: hasError ? 'var(--vscode-error-foreground)' : 'var(--vscode-success-foreground)',
                  color: hasError ? 'var(--vscode-error-foreground)' : 'var(--vscode-foreground)'
                }}
              >
                {step.observation.length > 1000 ? step.observation.slice(0, 1000) + '...' : step.observation}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function ExecutionDisplay({
  steps,
  showSummary = true,
  className,
  onRetry,
  onDismiss
}: ExecutionDisplayProps) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className={cn('font-mono text-xs', className)}>
      {showSummary && <VSCodeSummary steps={steps} />}

      <div className="space-y-0">
        {steps.map((step, index) => (
          <VSCodeAccordionItem
            key={`${step.id}-${index}`}
            step={step}
            onRetry={onRetry}
            onDismiss={onDismiss}
          />
        ))}
      </div>
    </div>
  );
}

export default ExecutionDisplay;
