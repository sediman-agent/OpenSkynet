/**
 * VS Code-Style Error Boundary
 * Professional error handling with recovery options
 */

import { Component, ReactNode, useState } from 'react';
import { AlertCircle, RefreshCw, Home, Copy, Terminal } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: any) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
}

// ============================================================================
// Error Info Component
// ============================================================================

interface ErrorInfoProps {
  error: Error;
  errorInfo: any;
  onReset: () => void;
  onCopy: () => void;
  onGoHome: () => void;
}

function ErrorInfo({ error, errorInfo, onReset, onCopy, onGoHome }: ErrorInfoProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const errorText = `Error: ${error.message}\n\nStack: ${errorInfo.componentStack}\n\n${error.stack || ''}`;
    navigator.clipboard.writeText(errorText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8">
      <div
        className="max-w-2xl w-full border rounded-lg shadow-xl overflow-hidden"
        style={{
          backgroundColor: 'var(--vscode-panel-background)',
          borderColor: 'var(--vscode-border-color)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-6 py-4 border-b"
          style={{
            backgroundColor: 'rgba(244, 135, 113, 0.1)',
            borderColor: 'var(--vscode-error-foreground)'
          }}
        >
          <AlertCircle
            size={24}
            className="flex-shrink-0"
            style={{ color: 'var(--vscode-error-foreground)' }}
          />
          <div className="flex-1">
            <h1
              className="text-lg font-semibold"
              style={{ color: 'var(--vscode-error-foreground)' }}
            >
              Something went wrong
            </h1>
            <p className="text-sm" style={{ color: 'var(--vscode-secondary-text)' }}>
              The application encountered an unexpected error
            </p>
          </div>
        </div>

        {/* Error Details */}
        <div className="p-6">
          {/* Error Message */}
          <div className="mb-6">
            <label
              className="text-xs font-semibold uppercase tracking-wider mb-2 block"
              style={{ color: 'var(--vscode-secondary-text)' }}
            >
              Error Message
            </label>
            <div
              className="p-3 rounded font-mono text-sm break-all"
              style={{
                backgroundColor: 'var(--vscode-input-background)',
                color: 'var(--vscode-error-foreground)',
                borderLeft: '3px solid var(--vscode-error-foreground)'
              }}
            >
              {error.message}
            </div>
          </div>

          {/* Stack Trace (Collapsed by default) */}
          <details className="mb-6">
            <summary
              className="text-xs font-semibold uppercase tracking-wider mb-2 cursor-pointer select-none"
              style={{ color: 'var(--vscode-secondary-text)' }}
            >
              Technical Details
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label
                  className="text-xs font-medium mb-1 block"
                  style={{ color: 'var(--vscode-secondary-text)' }}
                >
                  Component Stack
                </label>
                <pre
                  className="p-3 rounded text-xs overflow-x-auto"
                  style={{
                    backgroundColor: 'var(--vscode-sideBar-background)',
                    color: 'var(--vscode-foreground)',
                    fontFamily: 'var(--font-mono)',
                    lineHeight: 1.4
                  }}
                >
                  {errorInfo.componentStack}
                </pre>
              </div>

              {error.stack && (
                <div>
                  <label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: 'var(--vscode-secondary-text)' }}
                  >
                    Stack Trace
                  </label>
                  <pre
                    className="p-3 rounded text-xs overflow-x-auto"
                    style={{
                      backgroundColor: 'var(--vscode-sideBar-background)',
                      color: 'var(--vscode-foreground)',
                      fontFamily: 'var(--font-mono)',
                      lineHeight: 1.4,
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}
                  >
                    {error.stack}
                  </pre>
                </div>
              )}
            </div>
          </details>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-6 pt-6 border-t"
            style={{ borderColor: 'var(--vscode-border-color)' }}
          >
            <button
              onClick={onReset}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded transition-all"
              style={{
                backgroundColor: 'var(--vscode-button-primary-background)',
                color: 'var(--vscode-button-primary-foreground)',
                border: 'none'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--vscode-button-primary-hover-background)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--vscode-button-primary-background)';
              }}
            >
              <RefreshCw size={16} />
              Try Again
            </button>

            <button
              onClick={handleCopy}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded border transition-all"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--vscode-foreground)',
                borderColor: 'var(--vscode-border-color)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Copy size={16} />
              {copied ? 'Copied!' : 'Copy Error'}
            </button>

            <button
              onClick={onGoHome}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded border transition-all"
              style={{
                backgroundColor: 'transparent',
                color: 'var(--vscode-foreground)',
                borderColor: 'var(--vscode-border-color)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Home size={16} />
              Go to Home
            </button>
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-6 py-3 border-t text-xs"
          style={{
            borderColor: 'var(--vscode-border-color)',
            backgroundColor: 'var(--vscode-input-background)',
            color: 'var(--vscode-secondary-text)'
          }}
        >
          <div className="flex items-center justify-between">
            <span>Error ID: {Date.now().toString(36)}</span>
            <span>Please report this issue if it persists</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Error Boundary Component
// ============================================================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error, errorInfo: any): ErrorBoundaryState {
    return {
      hasError: true,
      error,
      errorInfo
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleCopy = () => {
    // Copy handled by ErrorInfo component
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Use default error UI
      return (
        <ErrorInfo
          error={this.state.error!}
          errorInfo={this.state.errorInfo}
          onReset={this.handleReset}
          onCopy={this.handleCopy}
          onGoHome={this.handleGoHome}
        />
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// Fallback Components
// ============================================================================

export function ErrorFallback({ error }: { error?: Error }) {
  return (
    <div className="flex items-center justify-center min-h-screen p-8">
      <div
        className="text-center p-8 border rounded-lg"
        style={{
          backgroundColor: 'var(--vscode-panel-background)',
          borderColor: 'var(--vscode-border-color)'
        }}
      >
        <AlertCircle
          size={48}
          className="mx-auto mb-4"
          style={{ color: 'var(--vscode-error-foreground)' }}
        />
        <h2
          className="text-lg font-semibold mb-2"
          style={{ color: 'var(--vscode-foreground)' }}
        >
          Something went wrong
        </h2>
        {error && (
          <p
            className="text-sm mb-4"
            style={{ color: 'var(--vscode-secondary-text)' }}
          >
            {error.message}
          </p>
        )}
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 text-sm font-medium rounded"
          style={{
            backgroundColor: 'var(--vscode-button-primary-background)',
            color: 'var(--vscode-button-primary-foreground)'
          }}
        >
          Reload Page
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Hook for Error Reporting
// ============================================================================

export function useErrorHandler() {
  const reportError = (error: Error, context?: string) => {
    console.error(`[ErrorReporter] ${context || 'Unknown context'}:`, error);

    // In production, send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      // TODO: Send to Sentry or similar service
    }
  };

  const reportWarning = (message: string, context?: string) => {
    console.warn(`[ErrorReporter] ${context || 'Unknown context'}:`, message);
  };

  return { reportError, reportWarning };
}
