/**
 * ResizeHandle Component - Industrial Grade
 * VS Code-style sash for resizing panels
 * Enhanced with professional visual feedback and states
 */

import { useState, useCallback } from 'react';
import { GripVertical } from 'lucide-react';
import { VS_CODES } from '@/styles/vscode-constants';

// ============================================================================
// Types
// ============================================================================

interface ResizeHandleProps {
  panelWidth: number;
  isResizing: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

// ============================================================================
// Main Component
// ============================================================================
export function ResizeHandle({ panelWidth, isResizing, onMouseDown }: ResizeHandleProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = useCallback(() => setIsHovered(true), []);
  const handleMouseLeave = useCallback(() => setIsHovered(false), []);

  // VS Code sash colors for different states
  const getBackgroundColor = () => {
    if (isResizing) return 'var(--vscode-focus-border)';
    if (isHovered) return 'var(--vscode-border-color)';
    return 'transparent';
  };

  const getIconColor = () => {
    if (isResizing) return 'var(--vscode-focus-border)';
    if (isHovered) return 'var(--vscode-foreground)';
    return 'var(--vscode-border-color)';
  };

  return (
    <div
      className="fixed top-0 cursor-col-resize z-[50] transition-all duration-150 flex items-center justify-center"
      style={{
        width: '4px',
        height: '100%',
        left: `calc(100% - ${panelWidth}px - 2px)`,
        backgroundColor: getBackgroundColor(),
        // Subtle border for visibility
        borderLeft: '1px solid transparent',
        borderRight: '1px solid transparent',
        ...(isHovered && {
          borderLeft: '1px solid var(--vscode-border-color)',
          borderRight: '1px solid var(--vscode-border-color)'
        })
      }}
      onMouseDown={onMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      aria-hidden="true"
      aria-label="Resize panel"
    >
      {/* VS Code-style grip icon */}
      <div
        className="transition-all duration-150"
        style={{
          opacity: (isHovered || isResizing) ? 1 : 0.5,
          transform: (isHovered || isResizing) ? 'scale(1)' : 'scale(0.8)',
          color: getIconColor()
        }}
      >
        <GripVertical size={16} />
      </div>

      {/* Tooltip on hover */}
      {isHovered && !isResizing && (
        <div
          className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            backgroundColor: 'var(--vscode-editorHoverWidget-background)',
            border: '1px solid var(--vscode-editorHoverWidget-border)',
            color: 'var(--vscode-editorHoverWidget-foreground)',
            padding: '4px 8px',
            borderRadius: '3px',
            fontSize: '11px',
            whiteSpace: 'nowrap',
            marginTop: '-40px'
          }}
        >
          Drag to resize
        </div>
      )}
    </div>
  );
}
