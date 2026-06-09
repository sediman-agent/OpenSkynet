/**
 * SuggestionChip Component - Industrial Grade
 * Enhanced suggestion button with VS Code styling and proper theme support
 */

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { VS_CODES } from '@/styles/vscode-constants';

// ============================================================================
// Types
// ============================================================================
interface SuggestionChipProps {
  label: string;
  onClick?: () => void;
  className?: string;
  variant?: 'default' | 'active' | 'success' | 'warning';
}

// ============================================================================
// Main Component
// ============================================================================
export function SuggestionChip({ label, onClick, className, variant = 'default' }: SuggestionChipProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);

  const handleMouseDown = useCallback(() => setIsPressed(true), []);
  const handleMouseUp = useCallback(() => setIsPressed(false), []);

  const getVariantStyles = () => {
    switch (variant) {
      case 'active':
        return {
          backgroundColor: 'var(--vscode-button-primary-background)',
          color: 'var(--vscode-button-primary-foreground)',
          border: 'none'
        };
      case 'success':
        return {
          backgroundColor: 'var(--vscode-success-foreground)',
          color: '#ffffff',
          border: 'none'
        };
      case 'warning':
        return {
          backgroundColor: 'var(--vscode-warning-foreground)',
          color: '#000000',
          border: 'none'
        };
      default:
        return {
          backgroundColor: isHovered ? 'var(--vscode-list-hoverBackground)' : 'var(--vscode-button-secondary-background)',
          color: 'var(--vscode-button-secondary-foreground)',
          border: `1px solid var(--vscode-border-color)`
        };
    }
  };

  const styles = getVariantStyles();

  return (
    <button
      onClick={onClick}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsPressed(false);
      }}
      className={cn('font-medium transition-all duration-150 outline-none', className)}
      style={{
        padding: `${VS_CODES.padding.y} ${VS_CODES.padding.x}`,
        borderRadius: VS_CODES.radiusButton,
        fontSize: `${VS_CODES.fontSize}px`,
        backgroundColor: styles.backgroundColor,
        color: styles.color,
        border: styles.border,
        cursor: 'pointer',
        transform: isPressed ? 'scale(0.98)' : (isHovered ? 'scale(1.02)' : 'scale(1)'),
        fontWeight: 500,
        fontFamily: 'var(--font-system)',
        // Enhanced focus state
        outline: 'none'
      }}
      onFocus={(e) => {
        e.currentTarget.style.boxShadow = '0 0 0 2px var(--vscode-focus-border), 0 0 0 4px rgba(0,127,212,0.2)';
      }}
      onBlur={(e) => {
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {label}
    </button>
  );
}
