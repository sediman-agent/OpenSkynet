/**
 * VS Code Input Component
 * Official VS Code Webview UI Toolkit input styles
 * Exact 26px height, sharp corners, proper focus states
 */

import { forwardRef, InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// VS Code Input Styles
// ============================================================================

const baseInputStyles = "font-mono text-sm bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)] border border-[var(--vscode-input-border)] rounded-[var(--vscode-corner-radius)] outline-none transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed";

const focusedStyles = "focus:border-[var(--vscode-focusBorder)] focus:shadow-[0_0_0_1px_var(--vscode-focusBorder)]";

// ============================================================================
// Text Input Component
// ============================================================================

interface VSCodeInputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

export const VSCodeInput = forwardRef<HTMLInputElement, VSCodeInputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={cn(
          baseInputStyles,
          focusedStyles,
          error && "border-red-500/50 shadow-[0_0_0_1px_rgba(239,68,68,0.5)]",
          className
        )}
        style={{
          height: 'var(--vscode-input-height)',
          minHeight: '26px',
          padding: '0 var(--vscode-button-paddingHorizontal)',
          fontSize: 'var(--vscode-font-size-base)',
          fontFamily: 'var(--vscode-font-family)',
        }}
        {...props}
      />
    );
  }
);

VSCodeInput.displayName = 'VSCodeInput';

// ============================================================================
// Textarea Component
// ============================================================================

interface VSCodeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoResize?: boolean;
  error?: boolean;
}

export const VSCodeTextarea = forwardRef<HTMLTextAreaElement, VSCodeTextareaProps>(
  ({ className, autoResize = false, error, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          baseInputStyles,
          focusedStyles,
          "resize-none",
          error && "border-red-500/50 shadow-[0_0_0_1px_rgba(239,68,68,0.5)]",
          className
        )}
        style={{
          padding: 'var(--vscode-design-unit) var(--vscode-button-paddingHorizontal)',
          fontSize: 'var(--vscode-font-size-base)',
          fontFamily: 'var(--vscode-font-family)',
          lineHeight: 1.4,
        }}
        {...props}
      />
    );
  }
);

VSCodeTextarea.displayName = 'VSCodeTextarea';

// ============================================================================
// Select Component
// ============================================================================

interface VSCodeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

export const VSCodeSelect = forwardRef<HTMLSelectElement, VSCodeSelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          baseInputStyles,
          focusedStyles,
          "cursor-pointer",
          error && "border-red-500/50 shadow-[0_0_0_1px_rgba(239,68,68,0.5)]",
          className
        )}
        style={{
          height: 'var(--vscode-input-height)',
          minHeight: '26px',
          padding: '0 var(--vscode-button-paddingHorizontal)',
          fontSize: 'var(--vscode-font-size-base)',
          fontFamily: 'var(--vscode-font-family)',
        }}
        {...props}
      >
        {children}
      </select>
    );
  }
);

VSCodeSelect.displayName = 'VSCodeSelect';

// ============================================================================
// Checkbox Component
// ============================================================================

interface VSCodeCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
}

export const VSCodeCheckbox = forwardRef<HTMLInputElement, VSCodeCheckboxProps>(
  ({ className, label, ...props }, ref) => {
    return (
      <label className={cn("inline-flex items-center gap-2 cursor-pointer", className)}>
        <input
          ref={ref}
          type="checkbox"
          className={cn(
            "w-4 h-4 rounded-[var(--vscode-checkbox-foreground)] bg-[var(--vscode-checkbox-background)] border-[var(--vscode-checkbox-border)] checked:bg-[var(--vscode-focusBorder)] checked:border-[var(--vscode-focusBorder)] focus:ring-0 focus:shadow-[0_0_0_1px_var(--vscode-focusBorder)] transition-all duration-150"
          )}
          style={{
            appearance: 'none',
            WebkitAppearance: 'none',
            MozAppearance: 'none',
          }}
          {...props}
        />
        {label && <span className="text-sm font-mono" style={{ color: 'var(--vscode-foreground)' }}>{label}</span>}
      </label>
    );
  }
);

VSCodeCheckbox.displayName = 'VSCodeCheckbox';

// ============================================================================
// Exports
// ============================================================================

export default {
  Input: VSCodeInput,
  Textarea: VSCodeTextarea,
  Select: VSCodeSelect,
  Checkbox: VSCodeCheckbox
};
