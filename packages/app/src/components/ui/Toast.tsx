/**
 * VS Code-Style Toast Notifications
 * Professional notification system with animations
 */

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Check, X, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

// ============================================================================
// Toast Context
// ============================================================================

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

// ============================================================================
// Toast Provider
// ============================================================================

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID();
    const newToast = { ...toast, id };

    setToasts(prev => [...prev, newToast]);

    // Auto-remove after duration
    const duration = toast.duration || 5000;
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

// ============================================================================
// Toast Container
// ============================================================================

interface ToastContainerProps {
  toasts: Toast[];
  onRemove: (id: string) => void;
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      style={{ maxWidth: '400px' }}
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
}

// ============================================================================
// Toast Item
// ============================================================================

interface ToastItemProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const [isExiting, setIsExiting] = useState(false);

  const handleRemove = () => {
    setIsExiting(true);
    setTimeout(() => onRemove(toast.id), 300);
  };

  const getVariantStyles = () => {
    switch (toast.variant) {
      case 'success':
        return {
          icon: <Check size={16} />,
          iconColor: 'var(--vscode-success-foreground)',
          bgColor: 'rgba(56, 138, 52, 0.1)',
          borderColor: 'var(--vscode-success-foreground)'
        };
      case 'error':
        return {
          icon: <AlertCircle size={16} />,
          iconColor: 'var(--vscode-error-foreground)',
          bgColor: 'rgba(244, 135, 113, 0.1)',
          borderColor: 'var(--vscode-error-foreground)'
        };
      case 'warning':
        return {
          icon: <AlertTriangle size={16} />,
          iconColor: 'var(--vscode-warning-foreground)',
          bgColor: 'rgba(220, 220, 170, 0.1)',
          borderColor: 'var(--vscode-warning-foreground)'
        };
      default:
        return {
          icon: <Info size={16} />,
          iconColor: 'var(--vscode-info-foreground)',
          bgColor: 'rgba(119, 161, 229, 0.1)',
          borderColor: 'var(--vscode-info-foreground)'
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <div
      className={cn(
        'pointer-events-auto flex items-start gap-3 p-4 border-l-4 shadow-lg',
        'transition-all duration-300 ease-in-out',
        isExiting ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'
      )}
      style={{
        backgroundColor: styles.bgColor,
        borderColor: styles.borderColor,
        borderRadius: '4px',
        minWidth: '300px'
      }}
    >
      {/* Icon */}
      <div className="flex-shrink-0 mt-0.5" style={{ color: styles.iconColor }}>
        {styles.icon}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: 'var(--vscode-foreground)' }}>
          {toast.message}
        </p>

        {/* Action */}
        {toast.action && (
          <button
            onClick={() => {
              toast.action!.onClick();
              handleRemove();
            }}
            className="mt-2 text-xs font-medium uppercase tracking-wide transition-colors"
            style={{ color: 'var(--vscode-link-foreground)' }}
            onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Close Button */}
      <button
        onClick={handleRemove}
        className="flex-shrink-0 p-1 rounded transition-colors"
        style={{ color: 'var(--vscode-secondary-text)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
          e.currentTarget.style.color = 'var(--vscode-foreground)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = 'var(--vscode-secondary-text)';
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ============================================================================
// Toast Hook Helpers
// ============================================================================

export function toast(message: string, variant?: ToastVariant) {
  // This will be replaced by the useToast hook in components
  console.warn('Toast hook not initialized. Make sure ToastProvider is in your app tree.');
}
