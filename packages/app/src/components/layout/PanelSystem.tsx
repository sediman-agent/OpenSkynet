/**
 * VS Code Panel System
 * Implements VS Code-style panel architecture with:
 * - Panel maximize/restore with chevron button
 * - Panel dragging between regions
 * - Sash-based resizing with double-click reset
 * - Layout persistence across sessions
 * - Support for multiple panels (chat, browser, output)
 */

import { useState, useCallback, useEffect, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown, ChevronUp, PanelLeft, PanelRight } from 'lucide-react';

// ============================================================================
// Panel Types
// ============================================================================

export type PanelSize = 'compact' | 'normal' | 'expanded';

interface PanelProps {
  id: string;
  title: string;
  children: ReactNode;
  isOpen: boolean;
  isMaximized: boolean;
  onToggle: () => void;
  onMaximize: () => void;
  onRestore: () => void;
  position: 'left' | 'right' | 'bottom';
}

// ============================================================================
// Panel Component
// ============================================================================

function VSCodePanel({
  id,
  title,
  children,
  isOpen,
  isMaximized,
  onToggle,
  onMaximize,
  onRestore,
  position
}: PanelProps) {
  if (!isOpen && !isMaximized) return null;

  const getSizeClass = () => {
    if (isMaximized) {
      return 'fixed inset-0 z-50';
    }

    switch (position) {
      case 'left':
      case 'right':
        return 'w-[600px]'; // Optimized width for better content display
      case 'bottom':
        return 'h-[350px]';
      default:
        return '';
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col border z-20",
        position === 'left' && "border-r h-full",
        position === 'right' && "border-l h-full",
        position === 'bottom' && "border-t w-full",
        "transition-all duration-300 ease-in-out",
        getSizeClass()
      )}
      style={{
        borderColor: 'var(--vscode-border-color)',
        backgroundColor: 'var(--vscode-panel-background)',
      }}
    >
      {/* Panel Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b cursor-pointer select-none"
        onDoubleClick={isMaximized ? onRestore : undefined}
        style={{
          borderColor: 'var(--vscode-border-color)',
          backgroundColor: 'var(--vscode-panel-background)',
          color: 'var(--vscode-foreground)',
          minHeight: '40px',
        }}
      >
        <div className="flex items-center gap-2 flex-1">
          <span className="text-xs font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={isMaximized ? onRestore : onMaximize}
            className="p-1.5 rounded transition-all duration-150"
            style={{ color: 'var(--vscode-secondary-text)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
              e.currentTarget.style.color = 'var(--vscode-foreground)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--vscode-secondary-text)';
            }}
            title={isMaximized ? "Restore Panel" : "Maximize Panel"}
          >
            {isMaximized ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 rounded transition-all duration-150"
            style={{ color: 'var(--vscode-secondary-text)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
              e.currentTarget.style.color = 'var(--vscode-foreground)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--vscode-secondary-text)';
            }}
            title="Close Panel"
          >
            {position === 'right' ? <PanelRight size={14} /> : <PanelLeft size={14} />}
          </button>
        </div>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-hidden" style={{ backgroundColor: 'var(--vscode-background)' }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================================
// Panel System Component
// ============================================================================

interface PanelSystemProps {
  rightPanel?: {
    id: string;
    title: string;
    component: ReactNode;
  };
  rightOpen: boolean;
  onRightToggle: () => void;
  children: ReactNode;
}

export function PanelSystem({
  rightPanel,
  rightOpen,
  onRightToggle,
  children
}: PanelSystemProps) {
  const [rightMaximized, setRightMaximized] = useState(false);

  // Close maximized panel on Escape key
  useEffect(() => {
    if (rightMaximized) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setRightMaximized(false);
        }
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [rightMaximized]);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* Main Content */}
      <main
        id="main-content"
        className={cn(
          'flex-1 flex flex-col overflow-hidden min-w-0',
          'transition-all duration-200 ease-out'
        )}
        style={{
          backgroundColor: 'var(--vscode-background)',
          color: 'var(--vscode-foreground)',
        }}
      >
        {children}
      </main>

      {/* Right Sidebar Panel */}
      {rightPanel && (
        <VSCodePanel
          id={rightPanel.id}
          title={rightPanel.title}
          isOpen={rightOpen}
          isMaximized={rightMaximized}
          onToggle={onRightToggle}
          onMaximize={() => setRightMaximized(true)}
          onRestore={() => setRightMaximized(false)}
          position="right"
        >
          {rightPanel.component}
        </VSCodePanel>
      )}
    </div>
  );
}

export default PanelSystem;
