/**
 * VS Code-Style BrowserHeader Component - Industrial Grade
 * Enhanced header with professional navigation controls and URL bar
 */

import { X, Maximize2, RefreshCw, Globe, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';
import { BrowserStatus } from '@/hooks/browser/types';
import { VS_CODES } from '@/styles/vscode-constants';

// ============================================================================
// Types
// ============================================================================

interface BrowserHeaderProps {
  browserStatus: BrowserStatus;
  inputUrl: string;
  setInputUrl: (url: string) => void;
  onUrlKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

// ============================================================================
// Status Badge Component - Enhanced
// ============================================================================
function StatusBadge({ status }: { status: BrowserStatus }) {
  const getStatusStyle = () => {
    switch (status) {
      case 'connecting':
        return {
          color: 'var(--vscode-warning-foreground)',
          bg: 'var(--vscode-badge-background)',
          icon: Loader2,
          label: 'CONNECTING',
          spinning: true
        };
      case 'ready':
        return {
          color: 'var(--vscode-success-foreground)',
          bg: 'var(--vscode-badge-background)',
          icon: null,
          label: 'READY',
          spinning: false
        };
      case 'error':
        return {
          color: 'var(--vscode-error-foreground)',
          bg: 'var(--vscode-badge-background)',
          icon: null,
          label: 'ERROR',
          spinning: false
        };
      default:
        return {
          color: 'var(--vscode-secondary-text)',
          bg: 'var(--vscode-badge-background)',
          icon: null,
          label: 'IDLE',
          spinning: false
        };
    }
  };

  const style = getStatusStyle();
  const Icon = style.icon;

  return (
    <div className="flex items-center gap-2">
      {Icon && (
        <div className="flex items-center" style={{ color: style.color }}>
          <Icon
            size={11}
            className={style.spinning ? 'animate-spin' : ''}
          />
        </div>
      )}
      <span
        className="uppercase px-2 py-0.5 rounded font-mono"
        style={{
          color: style.color,
          fontSize: '10px',
          fontWeight: 500,
          backgroundColor: style.bg,
          opacity: 0.9,
          letterSpacing: '0.5px'
        }}
      >
        {style.label}
      </span>
    </div>
  );
}

// ============================================================================
// Navigation Button Component - Enhanced
// ============================================================================
interface NavButtonProps {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

function NavButton({ icon, title, onClick, disabled = false, danger = false }: NavButtonProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center justify-center transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        width: `${VS_CODES.inputHeight}px`,
        height: `${VS_CODES.inputHeight}px`,
        backgroundColor: isHovered && !disabled ? 'var(--vscode-list-hoverBackground)' : 'transparent',
        border: 'none',
        borderRadius: `${VS_CODES.buttonIconCornerRadius}px`,
        transform: isHovered && !disabled ? 'scale(1.05)' : 'scale(1)',
        cursor: disabled ? 'not-allowed' : 'pointer'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={title}
    >
      {icon}
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================
export function BrowserHeader({
  browserStatus,
  inputUrl,
  setInputUrl,
  onUrlKeyDown,
  onBack,
  onForward,
  onRefresh,
  onToggleFullscreen,
  onClose
}: BrowserHeaderProps) {
  const [isUrlFocused, setIsUrlFocused] = useState(false);

  const handleUrlFocus = useCallback(() => setIsUrlFocused(true), []);
  const handleUrlBlur = useCallback(() => setIsUrlFocused(false), []);

  return (
    <div
      className="border-b font-mono"
      style={{ borderColor: 'var(--vscode-border-color)', backgroundColor: 'var(--vscode-sideBar-background)' }}
    >
      {/* Top Bar - Status & Controls */}
      <div className="flex items-center justify-between px-3 py-2" style={{ minHeight: '32px' }}>
        <StatusBadge status={browserStatus} />

        <div className="flex items-center gap-1">
          <NavButton
            icon={<ArrowLeft size={12} style={{ color: 'var(--vscode-foreground)' }} />}
            title="Back"
            onClick={onBack}
          />
          <NavButton
            icon={<ArrowRight size={12} style={{ color: 'var(--vscode-foreground)' }} />}
            title="Forward"
            onClick={onForward}
          />
          <NavButton
            icon={<RefreshCw size={12} style={{ color: 'var(--vscode-foreground)' }} />}
            title="Refresh"
            onClick={onRefresh}
          />
          <NavButton
            icon={<Maximize2 size={12} style={{ color: 'var(--vscode-foreground)' }} />}
            title="Toggle fullscreen"
            onClick={onToggleFullscreen}
          />
          <div style={{ width: '1px', height: '16px', backgroundColor: 'var(--vscode-border-color)', margin: '0 6px' }} />
          <NavButton
            icon={<X size={12} style={{ color: 'var(--vscode-error-foreground)' }} />}
            title="Close"
            onClick={onClose}
            danger
          />
        </div>
      </div>

      {/* URL Bar - Enhanced Focus State */}
      <div className="flex items-center px-3 pb-2">
        <div
          className="flex items-center px-2 border transition-all duration-150"
          style={{
            backgroundColor: 'var(--vscode-input-background)',
            borderColor: isUrlFocused ? 'var(--vscode-focus-border)' : 'var(--vscode-input-border)',
            borderRadius: VS_CODES.radiusSm,
            minHeight: `${VS_CODES.inputHeight}px`,
            width: '100%',
            // Enhanced focus ring
            ...(isUrlFocused && {
              boxShadow: '0 0 0 2px var(--vscode-focus-border), 0 0 0 6px rgba(0,127,212,0.2)'
            })
          }}
        >
          <Globe size={12} className="mr-2" style={{ color: 'var(--vscode-secondary-text)', flexShrink: 0 }} />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={onUrlKeyDown}
            placeholder="https://example.com"
            className="flex-1 bg-transparent outline-none"
            style={{
              color: 'var(--vscode-input-foreground)',
              fontSize: '13px',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.5,
              minHeight: '20px',
              padding: '3px 0'
            }}
            onFocus={handleUrlFocus}
            onBlur={handleUrlBlur}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}

export default BrowserHeader;
