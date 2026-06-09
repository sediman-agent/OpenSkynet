/**
 * VS Code-Style Execution Display - Industrial Grade
 * Enhanced tool call visualization with professional styling and interactions
 */

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronRight, Bot, Check, X, Loader2, Globe, FileText, Terminal, Settings, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ThinkBlock } from '@/types';

// ============================================================================
// Imports
// ============================================================================
import { VS_CODES } from '@/styles/vscode-constants';

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
// VS Code-Style Status Badge - Enhanced
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
    <div className="flex items-center gap-2" style={{ fontSize: VS_CODES.fontSizeSmall }}>
      {Icon && (
        <div className="flex items-center" style={{ color: style.color }}>
          <Icon size={11} className={status === 'running' ? 'animate-spin' : ''} />
        </div>
      )}

      <span
        className="uppercase px-2 py-0.5 rounded"
        style={{
          color: style.color,
          fontSize: '10px',
          fontWeight: 500,
          backgroundColor: 'var(--vscode-badge-background)',
          opacity: 0.9
        }}
      >
        {status}
      </span>

      {duration !== undefined && (
        <span style={{ color: 'var(--vscode-secondary-text)', fontSize: '11px' }}>
          {formatDuration(duration)}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// VS Code-Style Summary - Enhanced
// ============================================================================

function VSCodeSummary({ steps }: { steps: ExecutionStep[] }) {
  const completed = steps.filter(s => s.status !== 'pending' && s.status !== 'running').length;
  const failed = steps.filter(s => s.status === 'error').length;
  const totalDuration = steps.reduce((sum, s) => sum + (s.duration || 0), 0);
  const thinkingCount = steps.filter(s => s.type === 'thinking').length;

  if (steps.length === 0) return null;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 mb-3 border font-mono"
      style={{
        borderColor: 'var(--vscode-border-color)',
        borderRadius: VS_CODES.radiusSm,
        backgroundColor: 'var(--vscode-panel-background)',
        fontSize: VS_CODES.fontSize
      }}
    >
      {/* Steps count */}
      <span style={{ color: 'var(--vscode-foreground)', fontWeight: 500 }}>
        {completed}/{steps.length} steps
      </span>

      {/* Separator */}
      <span style={{ color: 'var(--vscode-border-color)', opacity: 0.5 }}>|</span>

      {/* Thinking count */}
      {thinkingCount > 0 && (
        <>
          <span className="flex items-center gap-1" style={{ color: 'var(--vscode-foreground)' }}>
            <Bot size={11} style={{ color: 'var(--vscode-secondary-text)' }} />
            {thinkingCount} thinking
          </span>
          <span style={{ color: 'var(--vscode-border-color)', opacity: 0.5 }}>|</span>
        </>
      )}

      {/* Failed count */}
      {failed > 0 && (
        <>
          <span className="flex items-center gap-1" style={{ color: 'var(--vscode-error-foreground)', fontWeight: 500 }}>
            <AlertTriangle size={11} />
            {failed} failed
          </span>
          <span style={{ color: 'var(--vscode-border-color)', opacity: 0.5 }}>|</span>
        </>
      )}

      {/* Total duration */}
      {totalDuration > 0 && (
        <span style={{ color: 'var(--vscode-foreground)', fontSize: '11px' }}>
          {formatDuration(totalDuration)}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// VS Code-Style Accordion Item - Enhanced
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
      className="border font-mono text-xs transition-all duration-150"
      style={{
        borderColor: 'var(--vscode-border-color)',
        borderRadius: VS_CODES.radius,
        marginBottom: VS_CODES.xs,
        backgroundColor: expanded ? 'var(--vscode-list-hoverBackground)' : 'transparent'
      }}
    >
      {/* Header Row - VS Code Style */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer"
        onClick={handleToggle}
        style={{ minHeight: '28px' }}
        onMouseEnter={(e) => {
          if (!expanded) {
            e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
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
        <div className="flex-1 min-w-0">
          <span
            className="font-medium truncate block"
            style={{
              color: isThinking ? 'var(--vscode-warning-foreground)' : 'var(--vscode-foreground)',
              fontWeight: isThinking ? 600 : 500
            }}
          >
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
                className="px-2 py-0.5 text-xs transition-colors rounded"
                style={{
                  color: 'var(--vscode-info-foreground)',
                  background: 'transparent',
                  border: '1px solid var(--vscode-border-color)',
                  borderRadius: VS_CODES.radius
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
                  e.currentTarget.style.borderColor = 'var(--vscode-focus-border)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'var(--vscode-border-color)';
                }}
              >
                retry
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); handleDismiss(); }}
              className="px-2 py-0.5 text-xs transition-colors rounded"
              style={{
                color: 'var(--vscode-secondary-text)',
                background: 'transparent',
                border: '1px solid var(--vscode-border-color)',
                borderRadius: VS_CODES.radius
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              dismiss
            </button>
          </div>
        )}
      </div>

      {/* Preview (when collapsed) */}
      {!expanded && !isThinking && step.detail && (
        <div
          className="px-2 pb-1.5 text-xs truncate"
          style={{
            color: 'var(--vscode-secondary-text)',
            marginLeft: '36px'
          }}
        >
          {formatPreview(step.detail)}
        </div>
      )}

      {/* Expanded Content - VS Code Style */}
      {expanded && (
        <div
          className="border-t overflow-hidden transition-all"
          style={{
            borderColor: 'var(--vscode-border-color)',
            padding: `${VS_CODES.md} ${VS_CODES.lg}`
          }}
        >
          {/* Error Message - Enhanced */}
          {hasError && step.error && (
            <div
              className="mb-3 p-3 border-l-2"
              style={{
                backgroundColor: 'rgba(244, 135, 113, 0.08)',
                borderColor: 'var(--vscode-error-foreground)',
                color: 'var(--vscode-error-foreground)',
                borderRadius: VS_CODES.radiusSm
              }}
            >
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="text-xs font-semibold mb-1">Error</div>
                  <div className="text-xs">{step.error.message}</div>
                  {step.error.code && (
                    <div className="text-[10px] mt-1 font-mono" style={{ opacity: 0.8 }}>
                      {step.error.code}
                    </div>
                  )}
                </div>
              </div>
              {step.error.suggestion && (
                <div
                  className="mt-2 p-2 border-l-2"
                  style={{
                    backgroundColor: 'rgba(55, 148, 255, 0.08)',
                    borderColor: 'var(--vscode-info-foreground)',
                    color: 'var(--vscode-foreground)',
                    borderRadius: VS_CODES.radiusSm
                  }}
                >
                  <div className="text-xs">Suggestion: {step.error.suggestion}</div>
                </div>
              )}
            </div>
          )}

          {/* Thinking Content - Enhanced */}
          {isThinking && step.thinking?.content && (
            <div
              className="mb-3 p-3 border-l-2"
              style={{
                backgroundColor: 'rgba(220, 220, 170, 0.08)',
                borderColor: 'var(--vscode-warning-foreground)',
                color: 'var(--vscode-foreground)',
                borderRadius: VS_CODES.radiusSm
              }}
            >
              <div className="text-[10px] uppercase mb-2 font-medium tracking-wider" style={{ opacity: 0.8 }}>
                Reasoning
                {step.thinking.content && (
                  <span style={{ color: 'var(--vscode-secondary-text)', marginLeft: '8px' }}>
                    ({step.thinking.content.length} chars)
                  </span>
                )}
              </div>
              <div
                className="text-xs whitespace-pre-wrap break-words max-h-48 overflow-y-auto"
                style={{
                  lineHeight: VS_CODES.lineHeight
                }}
              >
                {step.thinking.content}
              </div>
            </div>
          )}

          {/* Tool Input - Enhanced */}
          {!isThinking && step.detail && (
            <div className="mb-3">
              <div className="text-[10px] uppercase mb-2 font-medium tracking-wider" style={{ color: 'var(--vscode-secondary-text)', opacity: 0.8 }}>
                Input
              </div>
              <pre
                className="p-3 overflow-x-auto max-h-32 whitespace-pre-wrap break-all font-mono border rounded"
                style={{
                  backgroundColor: 'var(--vscode-sideBar-background)',
                  border: `1px solid var(--vscode-border-color)`,
                  borderRadius: VS_CODES.radius,
                  color: 'var(--vscode-foreground)',
                  fontSize: VS_CODES.fontSize,
                  lineHeight: VS_CODES.lineHeight
                }}
              >
                {step.detail}
              </pre>
            </div>
          )}

          {/* Tool Output - Enhanced */}
          {!isThinking && step.observation && (
            <div>
              <div className="text-[10px] uppercase mb-2 font-medium tracking-wider" style={{ color: 'var(--vscode-secondary-text)', opacity:0.8 }}>
                Output
              </div>
              <pre
                className="p-3 overflow-x-auto max-h-40 whitespace-pre-wrap break-all font-mono border-l-2 rounded"
                style={{
                  backgroundColor: hasError ? 'rgba(244, 135, 113, 0.05)' : 'var(--vscode-sideBar-background)',
                  borderColor: hasError ? 'var(--vscode-error-foreground)' : 'var(--vscode-success-foreground)',
                  fontSize: VS_CODES.fontSize,
                  lineHeight: VS_CODES.lineHeight,
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

      <div>
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
