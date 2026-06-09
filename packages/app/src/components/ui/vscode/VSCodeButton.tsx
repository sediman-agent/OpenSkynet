/**
 * VS Code Button Component
 * Official VS Code Webview UI Toolkit button styles
 * All button variants: primary, secondary, icon, danger
 */

import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// VS Code Button Styles
// ============================================================================

const baseStyles = "inline-flex items-center justify-center font-mono text-sm cursor-pointer transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed border-none";

const primaryStyles = "bg-[var(--vscode-button-primaryBackground)] text-[var(--vscode-button-primaryForeground)] hover:bg-[var(--vscode-button-primaryHoverBackground)]";
const secondaryStyles = "bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] hover:bg-[var(--vscode-button-secondaryHoverBackground)]";
const dangerStyles = "bg-[var(--vscode-error-foreground)] text-white hover:opacity-90";
const iconStyles = "bg-[var(--vscode-button-iconBackground)] hover:bg-[var(--vscode-button-iconHoverBackground)]";

// ============================================================================
// Components
// ============================================================================

interface VSCodeButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'default' | 'icon';
  children?: React.ReactNode;
}

export const VSCodeButton = forwardRef<HTMLButtonElement, VSCodeButtonProps>(
  ({ variant = 'primary', size = 'default', className, children, style, ...props }, ref) => {
    const variantStyles = variant === 'primary' ? primaryStyles : variant === 'secondary' ? secondaryStyles : dangerStyles;
    const sizeStyles = size === 'icon' ? 'w-8 h-8 rounded-[var(--vscode-button-iconCornerRadius)] p-[var(--vscode-button-iconPadding)]' : `rounded-[var(--vscode-corner-radius)] px-[var(--vscode-button-paddingHorizontal)] py-[var(--vscode-button-paddingVertical)] h-[26px]`;

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantStyles, sizeStyles, className)}
        style={style}
        {...props}
      >
        {children}
      </button>
    );
  }
);

VSCodeButton.displayName = 'VSCodeButton';

// ============================================================================
// Icon Button Component
// ============================================================================

interface VSCodeIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  tooltip?: string;
}

export const VSCodeIconButton = forwardRef<HTMLButtonElement, VSCodeIconButtonProps>(
  ({ icon, tooltip, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          iconStyles,
          "w-8 h-8 rounded-[var(--vscode-button-iconCornerRadius)] p-[var(--vscode-button-iconPadding)]",
          className
        )}
        title={tooltip}
        {...props}
      >
        {icon}
      </button>
    );
  }
);

VSCodeIconButton.displayName = 'VSCodeIconButton';

// ============================================================================
// Exports
// ============================================================================

export default {
  Button: VSCodeButton,
  IconButton: VSCodeIconButton
};
