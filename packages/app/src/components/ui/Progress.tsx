/**
 * VS Code-Style Progress Indicators
 * Professional progress and activity feedback components
 */

import { ReactNode } from 'react';
import { Loader2, Check, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type ProgressStatus = 'idle' | 'loading' | 'success' | 'error' | 'warning';

interface ProgressProps {
  status: ProgressStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  text?: string;
}

// ============================================================================
// Progress Spinner
// ============================================================================

export function Progress({ status, size = 'md', className, text }: ProgressProps) {
  const sizes = {
    sm: 14,
    md: 18,
    lg: 24
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'loading':
        return <Loader2 size={sizes[size]} className="animate-spin" />;
      case 'success':
        return <Check size={sizes[size]} />;
      case 'error':
        return <X size={sizes[size]} />;
      case 'warning':
        return <AlertCircle size={sizes[size]} />;
      default:
        return null;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case 'loading':
        return 'var(--vscode-info-foreground)';
      case 'success':
        return 'var(--vscode-success-foreground)';
      case 'error':
        return 'var(--vscode-error-foreground)';
      case 'warning':
        return 'var(--vscode-warning-foreground)';
      default:
        return 'var(--vscode-secondary-text)';
    }
  };

  if (status === 'idle') {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div style={{ color: getStatusColor() }}>
        {getStatusIcon()}
      </div>
      {text && (
        <span className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
          {text}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Linear Progress Bar
// ============================================================================

interface ProgressBarProps {
  value: number; // 0-100
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  label?: string;
  status?: ProgressStatus;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  size = 'md',
  showLabel = false,
  label,
  status = 'loading',
  className
}: ProgressBarProps) {
  const sizes = {
    sm: 2,
    md: 3,
    lg: 4
  };

  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  const getStatusColor = () => {
    switch (status) {
      case 'success':
        return 'var(--vscode-success-foreground)';
      case 'error':
        return 'var(--vscode-error-foreground)';
      case 'warning':
        return 'var(--vscode-warning-foreground)';
      default:
        return 'var(--vscode-info-foreground)';
    }
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Label */}
      {(label || showLabel) && (
        <div className="flex items-center justify-between mb-1">
          {label && (
            <span className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
              {label}
            </span>
          )}
          {showLabel && (
            <span className="text-xs font-mono" style={{ color: 'var(--vscode-secondary-text)' }}>
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}

      {/* Progress Bar */}
      <div
        className="w-full rounded overflow-hidden"
        style={{
          backgroundColor: 'var(--vscode-input-background)',
          height: `${sizes[size]}px`
        }}
      >
        <div
          className="h-full transition-all duration-300 ease-out rounded"
          style={{
            width: `${percentage}%`,
            backgroundColor: getStatusColor()
          }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Steps Progress
// ============================================================================

interface Step {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
}

interface StepsProgressProps {
  steps: Step[];
  currentStep?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StepsProgress({ steps, currentStep = 0, size = 'md', className }: StepsProgressProps) {
  const sizes = {
    sm: 20,
    md: 24,
    lg: 32
  };

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCurrent = index === currentStep;
          const isCompleted = index < currentStep;
          const isError = step.status === 'error';

          return (
            <div key={step.id} className="flex items-center flex-1">
              {/* Step Circle */}
              <div
                className="flex items-center justify-center rounded-full border-2 transition-all duration-200"
                style={{
                  width: `${sizes[size]}px`,
                  height: `${sizes[size]}px`,
                  backgroundColor: isError
                    ? 'rgba(244, 135, 113, 0.1)'
                    : isCompleted || isCurrent
                    ? 'var(--vscode-info-foreground)'
                    : 'var(--vscode-input-background)',
                  borderColor: isError
                    ? 'var(--vscode-error-foreground)'
                    : isCompleted || isCurrent
                    ? 'var(--vscode-info-foreground)'
                    : 'var(--vscode-border-color)',
                  color: isError
                    ? 'var(--vscode-error-foreground)'
                    : isCompleted || isCurrent
                    ? 'var(--vscode-background)'
                    : 'var(--vscode-secondary-text)'
                }}
              >
                {isCompleted ? (
                  <Check size={sizes[size] * 0.6} />
                ) : isError ? (
                  <X size={sizes[size] * 0.6} />
                ) : (
                  <span className="text-xs font-medium">{index + 1}</span>
                )}
              </div>

              {/* Step Label */}
              <div
                className="ml-2 flex-1 min-w-0 text-xs truncate transition-colors duration-200"
                style={{
                  color: isCurrent ? 'var(--vscode-foreground)' : 'var(--vscode-secondary-text)',
                  fontWeight: isCurrent ? 500 : 400
                }}
              >
                {step.label}
              </div>

              {/* Connector Line */}
              {index < steps.length - 1 && (
                <div
                  className="flex-1 mx-2 h-px transition-colors duration-200"
                  style={{
                    backgroundColor: isCompleted
                      ? 'var(--vscode-info-foreground)'
                      : 'var(--vscode-border-color)',
                    minHeight: '2px'
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Dotted Progress (for indeterminate progress)
// ============================================================================

interface DottedProgressProps {
  text?: string;
  className?: string;
}

export function DottedProgress({ text, className }: DottedProgressProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-8', className)}>
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2 h-2 rounded-full animate-bounce"
            style={{
              backgroundColor: 'var(--vscode-info-foreground)',
              animationDelay: `${i * 0.15}s`,
              animationDuration: '0.6s'
            }}
          />
        ))}
      </div>
      {text && (
        <span className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
          {text}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Activity Status Badge
// ============================================================================

interface ActivityStatusProps {
  status: 'active' | 'idle' | 'busy' | 'offline';
  showDot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function ActivityStatus({ status, showDot = true, size = 'sm', className }: ActivityStatusProps) {
  const getStatusInfo = () => {
    switch (status) {
      case 'active':
        return {
          color: 'var(--vscode-success-foreground)',
          label: 'Active',
          dotColor: 'var(--vscode-success-foreground)'
        };
      case 'idle':
        return {
          color: 'var(--vscode-secondary-text)',
          label: 'Idle',
          dotColor: 'var(--vscode-secondary-text)'
        };
      case 'busy':
        return {
          color: 'var(--vscode-warning-foreground)',
          label: 'Busy',
          dotColor: 'var(--vscode-warning-foreground)'
        };
      case 'offline':
        return {
          color: 'var(--vscode-error-foreground)',
          label: 'Offline',
          dotColor: 'var(--vscode-error-foreground)'
        };
    }
  };

  const info = getStatusInfo();
  const sizes = { sm: 8, md: 10 };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Status Dot */}
      {showDot && (
        <div
          className="rounded-full"
          style={{
            width: `${sizes[size]}px`,
            height: `${sizes[size]}px`,
            backgroundColor: info.dotColor,
            animation: status === 'active' ? 'pulse 2s ease-in-out infinite' : undefined
          }}
        />
      )}

      {/* Status Label */}
      <span
        className="text-xs uppercase tracking-wide"
        style={{ color: info.color }}
      >
        {info.label}
      </span>
    </div>
  );
}
