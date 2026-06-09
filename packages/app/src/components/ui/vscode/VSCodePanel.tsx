/**
 * VS Code Panel Component
 * Official VS Code Webview UI Toolkit panel styles
 * Maximize/restore functionality, tabs, proper VS Code panel architecture
 */

import { useState, useCallback, ReactNode, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

// ============================================================================
// VS Code Panel Styles
// ============================================================================

const panelStyles = "flex flex-col font-mono text-sm border";
const panelHeaderStyles = "flex items-center justify-between px-2 py-1 border-b cursor-pointer select-none";
const panelContentStyles = "flex-1 overflow-hidden";
const panelTabsStyles = "flex items-center gap-1 px-1 border-b";
const panelTabStyles = "px-3 py-1 text-xs rounded-t transition-colors duration-150 cursor-pointer border border-b-0 -mb-px";

// ============================================================================
// Panel Tab Component
// ============================================================================

interface VSCodePanelTabProps {
  id: string;
  label: string;
  icon?: ReactNode;
  active?: boolean;
  onClick: () => void;
  onClose?: () => void;
}

export function VSCodePanelTab({ id, label, icon, active, onClick, onClose }: VSCodePanelTabProps) {
  return (
    <div
      className={cn(panelTabStyles, active ? "bg-[var(--vscode-background)]" : "bg-transparent")}
      style={{
        borderColor: active ? 'var(--vscode-panel-tabActiveBorder)' : 'transparent',
        color: active ? 'var(--vscode-panel-tabActiveForeground)' : 'var(--vscode-panel-tabForeground)',
      }}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <span>{label}</span>
        {onClose && (
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="ml-2 p-0.5 rounded hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
            style={{ color: 'var(--vscode-secondary-foreground)' }}
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Panel Header Component
// ============================================================================

interface VSCodePanelHeaderProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  actions?: ReactNode;
  onDoubleClick?: () => void;
}

export function VSCodePanelHeader({ title, actions, onDoubleClick, className, children, ...props }: VSCodePanelHeaderProps) {
  return (
    <div
      className={cn(panelHeaderStyles, className)}
      onDoubleClick={onDoubleClick}
      style={{
        borderColor: 'var(--vscode-panel-border)',
        backgroundColor: 'var(--vscode-panel-background)',
        color: 'var(--vscode-foreground)',
        minHeight: '35px',
      }}
      {...props}
    >
      <div className="flex items-center gap-2 flex-1">
        {title && <span className="text-xs font-medium">{title}</span>}
        {children}
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </div>
  );
}

// ============================================================================
// Main Panel Component
// ============================================================================

interface VSCodePanelProps extends HTMLAttributes<HTMLDivElement> {
  title?: string;
  tabs?: Array<{ id: string; label: string; icon?: ReactNode }>;
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  maximizable?: boolean;
  defaultMaximized?: boolean;
  actions?: ReactNode;
}

export function VSCodePanel({
  title,
  tabs,
  activeTab,
  onTabChange,
  onTabClose,
  maximizable = true,
  defaultMaximized = false,
  actions,
  className,
  children,
  ...props
}: VSCodePanelProps) {
  const [isMaximized, setIsMaximized] = useState(defaultMaximized);
  const [showTabs, setShowTabs] = useState(!!tabs && tabs.length > 1);

  const toggleMaximize = useCallback(() => {
    setIsMaximized(prev => !prev);
  }, []);

  const handleTabChange = useCallback((tabId: string) => {
    onTabChange?.(tabId);
  }, [onTabChange]);

  const handleTabClose = useCallback((tabId: string) => {
    onTabClose?.(tabId);
  }, [onTabClose]);

  return (
    <div
      className={cn(panelStyles, isMaximized && "fixed inset-0 z-50", className)}
      style={{
        borderColor: 'var(--vscode-panel-border)',
        backgroundColor: 'var(--vscode-panel-background)',
      }}
      {...props}
    >
      {/* Panel Header */}
      <VSCodePanelHeader
        title={title}
        actions={
          <>
            {actions}
            {maximizable && (
              <button
                onClick={toggleMaximize}
                className="p-1 rounded hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
                style={{ color: 'var(--vscode-secondary-foreground)' }}
                title={isMaximized ? "Restore Panel" : "Maximize Panel"}
              >
                {isMaximized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            )}
          </>
        }
        onDoubleClick={toggleMaximize}
      />

      {/* Panel Tabs */}
      {showTabs && tabs && tabs.length > 0 && (
        <div className={panelTabsStyles} style={{ borderColor: 'var(--vscode-panel-border)' }}>
          {tabs.map(tab => (
            <VSCodePanelTab
              key={tab.id}
              id={tab.id}
              label={tab.label}
              icon={tab.icon}
              active={activeTab === tab.id}
              onClick={() => handleTabChange(tab.id)}
              onClose={tabs.length > 1 ? () => handleTabClose(tab.id) : undefined}
            />
          ))}
        </div>
      )}

      {/* Panel Content */}
      <div className={panelContentStyles} style={{ backgroundColor: 'var(--vscode-background)' }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Exports
// ============================================================================

export default {
  Panel: VSCodePanel,
  PanelHeader: VSCodePanelHeader,
  PanelTab: VSCodePanelTab
};
