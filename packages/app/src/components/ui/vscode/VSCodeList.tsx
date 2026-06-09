/**
 * VS Code List Component
 * Official VS Code Webview UI Toolkit list styles
 * Hover states, selection states, proper spacing
 */

import { forwardRef, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// VS Code List Styles
// ============================================================================

const listContainerStyles = "font-mono text-sm overflow-hidden border rounded-[var(--vscode-corner-radius-round)]";
const listStyles = "max-h-[var(--vscode-dropdown-listMaxHeight)] overflow-y-auto";
const listItemStyles = "px-[var(--vscode-button-paddingHorizontal)] py-[var(--vscode-design-unit)] cursor-pointer transition-colors duration-150 border-b last:border-b-0";

const hoverStyles = "hover:bg-[var(--vscode-list-hoverBackground)]";
const selectedStyles = "bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]";

// ============================================================================
// List Container Component
// ============================================================================

interface VSCodeListProps extends HTMLAttributes<HTMLDivElement> {
  maxHeight?: string;
}

export const VSCodeList = forwardRef<HTMLDivElement, VSCodeListProps>(
  ({ className, maxHeight, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(listContainerStyles, className)}
        style={{
          borderColor: 'var(--vscode-dropdown-border)',
          backgroundColor: 'var(--vscode-dropdown-background)',
        }}
        {...props}
      >
        <div className={listStyles} style={{ maxHeight: maxHeight || 'var(--vscode-dropdown-listMaxHeight)' }}>
          {children}
        </div>
      </div>
    );
  }
);

VSCodeList.displayName = 'VSCodeList';

// ============================================================================
// List Item Component
// ============================================================================

interface VSCodeListItemProps extends HTMLAttributes<HTMLDivElement> {
  selected?: boolean;
  icon?: ReactNode;
}

export const VSCodeListItem = forwardRef<HTMLDivElement, VSCodeListItemProps>(
  ({ className, selected, icon, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          listItemStyles,
          hoverStyles,
          selected && selectedStyles,
          "flex items-center gap-2",
          className
        )}
        style={{
          borderColor: 'var(--vscode-divider-background)',
          color: selected ? undefined : 'var(--vscode-dropdown-foreground)',
        }}
        {...props}
      >
        {icon && <span className="flex-shrink-0" style={{ color: 'var(--vscode-secondary-foreground)' }}>{icon}</span>}
        <span className="flex-1 truncate">{children}</span>
      </div>
    );
  }
);

VSCodeListItem.displayName = 'VSCodeListItem';

// ============================================================================
// List Section Component
// ============================================================================

interface VSCodeListSectionProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
}

export const VSCodeListSection = forwardRef<HTMLDivElement, VSCodeListSectionProps>(
  ({ className, title, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("flex flex-col", className)} {...props}>
        {title && (
          <div
            className="px-[var(--vscode-button-paddingHorizontal)] py-[var(--vscode-design-unit)] text-xs font-medium uppercase tracking-wider border-b"
            style={{
              color: 'var(--vscode-secondary-foreground)',
              borderColor: 'var(--vscode-divider-background)',
            }}
          >
            {title}
          </div>
        )}
        {children}
      </div>
    );
  }
);

VSCodeListSection.displayName = 'VSCodeListSection';

// ============================================================================
// Exports
// ============================================================================

export default {
  List: VSCodeList,
  ListItem: VSCodeListItem,
  ListSection: VSCodeListSection
};
