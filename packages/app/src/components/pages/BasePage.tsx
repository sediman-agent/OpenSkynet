/**
 * VS Code-Style Base Page Template
 * All pages extend this for consistent VS Code styling
 */

import { ReactNode, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// VS Code Page Header Component
// ============================================================================

interface VSCodePageHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}

export function VSCodePageHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
  ...props
}: VSCodePageHeaderProps) {
  return (
    <div
      className={cn("flex items-center justify-between px-3 py-2 border-b", className)}
      style={{
        borderColor: 'var(--vscode-border-color)',
        backgroundColor: 'var(--vscode-background)',
        color: 'var(--vscode-foreground)',
        minHeight: '40px',
      }}
      {...props}
    >
      <div className="flex items-center gap-2 flex-1">
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <div>
          <h1 className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}

// ============================================================================
// VS Code Page Content Component
// ============================================================================

interface VSCodePageContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  scrollable?: boolean;
}

export function VSCodePageContent({
  children,
  scrollable = true,
  className,
  ...props
}: VSCodePageContentProps) {
  return (
    <div
      className={cn(
        scrollable && "overflow-y-auto",
        "font-mono text-sm",
        className
      )}
      style={{
        backgroundColor: 'var(--vscode-background)',
        color: 'var(--vscode-foreground)',
        fontSize: 'var(--vscode-font-size-base)',
      }}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// VS Code Page Footer Component
// ============================================================================

interface VSCodePageFooterProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function VSCodePageFooter({ children, className, ...props }: VSCodePageFooterProps) {
  return (
    <div
      className={cn("flex items-center justify-between px-3 py-1 border-t", className)}
      style={{
        borderColor: 'var(--vscode-border-color)',
        backgroundColor: 'var(--vscode-background)',
        color: 'var(--vscode-secondary-text)',
        minHeight: '22px',
        fontSize: 'var(--vscode-font-size-minus1)',
      }}
      {...props}
    >
      {children}
    </div>
  );
}

// ============================================================================
// Main Base Page Component
// ============================================================================

interface BasePageProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function BasePage({
  title,
  subtitle,
  icon,
  actions,
  children,
  footer,
  className
}: BasePageProps) {
  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--vscode-background)' }}>
      {/* Page Header */}
      <VSCodePageHeader
        title={title}
        subtitle={subtitle}
        icon={icon}
        actions={actions}
      />

      {/* Page Content */}
      <div className="flex-1 overflow-hidden">
        <VSCodePageContent>
          {children}
        </VSCodePageContent>
      </div>

      {/* Page Footer */}
      {footer && <VSCodePageFooter>{footer}</VSCodePageFooter>}
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default {
  BasePage,
  VSCodePageHeader,
  VSCodePageContent,
  VSCodePageFooter
};
