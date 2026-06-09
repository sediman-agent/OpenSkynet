/**
 * VS Code-Style Keyboard Shortcuts
 * Display and manage keyboard shortcuts with professional UI
 */

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface KeyboardShortcut {
  key: string;
  description: string;
  category?: 'navigation' | 'editing' | 'panel' | 'agent' | 'general';
  icon?: ReactNode;
}

// ============================================================================
// Keyboard Key Component
// ============================================================================

interface KeyProps {
  children: ReactNode;
  className?: string;
}

export function Key({ children, className }: KeyProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center',
        'px-2 py-1 text-xs font-mono',
        'border rounded shadow-sm',
        'transition-all duration-150',
        className
      )}
      style={{
        backgroundColor: 'var(--vscode-input-background)',
        borderColor: 'var(--vscode-border-color)',
        color: 'var(--vscode-foreground)',
        minWidth: '24px',
        fontFamily: 'var(--font-mono)'
      }}
    >
      {children}
    </kbd>
  );
}

// ============================================================================
// Keyboard Shortcut Component
// ============================================================================

interface ShortcutProps {
  shortcut: KeyboardShortcut;
  showCategory?: boolean;
}

export function KeyboardShortcut({ shortcut, showCategory }: ShortcutProps) {
  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded transition-colors group"
      style={{
        backgroundColor: 'transparent'
      }}
      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
    >
      {/* Icon */}
      {shortcut.icon && (
        <div className="flex-shrink-0" style={{ color: 'var(--vscode-secondary-text)' }}>
          {shortcut.icon}
        </div>
      )}

      {/* Keys */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {shortcut.key.split('+').map((k, i, arr) => (
          <span key={i} className="flex items-center">
            <Key>{k.trim()}</Key>
            {i < arr.length - 1 && (
              <span className="mx-0.5 text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>+</span>
            )}
          </span>
        ))}
      </div>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <span className="text-sm truncate" style={{ color: 'var(--vscode-foreground)' }}>
          {shortcut.description}
        </span>
      </div>

      {/* Category Badge */}
      {showCategory && shortcut.category && (
        <span
          className="text-[10px] px-2 py-0.5 rounded uppercase tracking-wider"
          style={{
            backgroundColor: 'var(--vscode-badge-background)',
            color: 'var(--vscode-badge-foreground)'
          }}
        >
          {shortcut.category}
        </span>
      )}
    </div>
  );
}

// ============================================================================
// Keyboard Shortcuts Panel
// ============================================================================

interface ShortcutsPanelProps {
  shortcuts: KeyboardShortcut[];
  title?: string;
  className?: string;
}

export function KeyboardShortcutsPanel({ shortcuts, title = 'Keyboard Shortcuts', className }: ShortcutsPanelProps) {
  // Group by category
  const grouped = shortcuts.reduce((acc, shortcut) => {
    const category = shortcut.category || 'general';
    if (!acc[category]) acc[category] = [];
    acc[category].push(shortcut);
    return acc;
  }, {} as Record<string, KeyboardShortcut[]>);

  const categoryOrder: (keyof typeof grouped | 'general')[] = ['navigation', 'editing', 'panel', 'agent', 'general'];

  return (
    <div className={cn('p-6', className)} style={{ backgroundColor: 'var(--vscode-background)' }}>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold mb-1" style={{ color: 'var(--vscode-foreground)' }}>
          {title}
        </h2>
        <p className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
          Master these shortcuts to boost your productivity
        </p>
      </div>

      {/* Shortcuts by Category */}
      <div className="space-y-6">
        {categoryOrder.map(category => {
          const categoryShortcuts = grouped[category];
          if (!categoryShortcuts || categoryShortcuts.length === 0) return null;

          return (
            <div key={category}>
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 flex items-center gap-2"
                style={{ color: 'var(--vscode-secondary-text)' }}>
                {category === 'navigation' && '📍 Navigation'}
                {category === 'editing' && '✏️ Editing'}
                {category === 'panel' && '📑 Panels'}
                {category === 'agent' && '🤖 Agent'}
                {category === 'general' && '⚙️ General'}
              </h3>
              <div className="border rounded overflow-hidden"
                style={{
                  borderColor: 'var(--vscode-border-color)',
                  borderRadius: '4px'
                }}
              >
                {categoryShortcuts.map(shortcut => (
                  <div
                    key={shortcut.key}
                    className="border-b last:border-b-0"
                    style={{ borderColor: 'var(--vscode-border-color)' }}
                  >
                    <KeyboardShortcut shortcut={shortcut} />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Shortcut Hint Tooltip
// ============================================================================

interface ShortcutHintProps {
  shortcut: string;
  description?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export function ShortcutHint({ shortcut, description, position = 'bottom' }: ShortcutHintProps) {
  return (
    <div
      className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs"
      style={{
        backgroundColor: 'var(--vscode-input-background)',
        border: '1px solid var(--vscode-border-color)',
        color: 'var(--vscode-secondary-text)'
      }}
      title={description}
    >
      {shortcut.split('+').map((k, i, arr) => (
        <span key={i} className="flex items-center">
          <Key>{k.trim()}</Key>
          {i < arr.length - 1 && <span className="text-xs">+</span>}
        </span>
      ))}
    </div>
  );
}

// ============================================================================
// Common Shortcuts
// ============================================================================

export const COMMON_SHORTCUTS: KeyboardShortcut[] = [
  // Navigation
  { key: 'Ctrl+K', description: 'Command Palette', category: 'navigation' },
  { key: 'Ctrl+B', description: 'Toggle sidebar', category: 'navigation' },
  { key: 'Ctrl+J', description: 'Toggle panel', category: 'navigation' },
  { key: 'Ctrl+P', description: 'Quick open file', category: 'navigation' },

  // Editing
  { key: 'Ctrl+Enter', description: 'Send message', category: 'editing' },
  { key: 'Ctrl+Shift+Enter', description: 'Send with new line', category: 'editing' },
  { key: 'Escape', description: 'Close panel / Cancel', category: 'editing' },
  { key: 'Ctrl+/', description: 'Focus input', category: 'editing' },

  // Panel
  { key: 'Ctrl+`', description: 'Toggle terminal', category: 'panel' },
  { key: 'Ctrl+Shift+M', description: 'Toggle maximized panel', category: 'panel' },

  // Agent
  { key: 'Ctrl+Shift+S', description: 'Stop generation', category: 'agent' },
  { key: 'Ctrl+Shift+N', description: 'New conversation', category: 'agent' },

  // General
  { key: 'Ctrl+,', description: 'Open settings', category: 'general' },
  { key: 'Ctrl+Q', description: 'Quit', category: 'general' },
];
