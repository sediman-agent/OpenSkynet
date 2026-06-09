/**
 * VS Code-Style BrowserHeader Component
 * Header with navigation controls and URL bar - matching VS Code browser UI
 */

import { X, Maximize2, RefreshCw, Globe, ArrowLeft, ArrowRight } from 'lucide-react';

// ============================================================================
// VS Code Design Tokens
// ============================================================================
const VS_CODES = {
  border: '#3c3c3c',
  bg: '#252526',
  bgHover: '#2a2d2e',
  bgInput: '#3c3c3c',
  text: '#cccccc',
  textMuted: '#858585',
  textDim: '#6e6e6e',
  success: '#4ec9b0',
  warning: '#dcdcaa',
  error: '#f48771',
  info: '#3794ff',
  focusBorder: '#007fd4',
  radius: '2px',
  radiusSm: '3px',
} as const;

// ============================================================================
// Types
// ============================================================================
import { BrowserStatus } from '@/hooks/browser/types';

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
// Status Indicator Component
// ============================================================================
function StatusIndicator({ status }: { status: BrowserStatus }) {
  const getStatusStyle = () => {
    switch (status) {
      case 'connecting':
        return { color: VS_CODES.warning, icon: '🔄', label: 'CONNECTING' };
      case 'ready':
        return { color: VS_CODES.success, icon: '●', label: 'READY' };
      case 'error':
        return { color: VS_CODES.error, icon: '●', label: 'ERROR' };
      default:
        return { color: VS_CODES.textDim, icon: '○', label: 'IDLE' };
    }
  };

  const style = getStatusStyle();

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-xs animate-spin"
        style={{
          color: style.color,
          display: status === 'connecting' ? 'inline' : 'none'
        }}
      >
        {style.icon}
      </span>
      <span className="text-xs font-mono" style={{ color: style.color }}>
        {style.label}
      </span>
    </div>
  );
}

// ============================================================================
// Navigation Button Component
// ============================================================================
interface NavButtonProps {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  disabled?: boolean;
}

function NavButton({ icon, title, onClick, disabled = false }: NavButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="p-1 transition-colors disabled:opacity-40"
      style={{
        backgroundColor: 'transparent',
        border: 'none',
        borderRadius: VS_CODES.radius
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = VS_CODES.bgHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
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
  return (
    <div
      className="border-b font-mono text-xs"
      style={{ borderColor: VS_CODES.border, backgroundColor: VS_CODES.bg }}
    >
      {/* Top Bar - Status & Controls */}
      <div className="flex items-center justify-between px-2 py-1">
        <StatusIndicator status={browserStatus} />

        <div className="flex items-center gap-1">
          <NavButton
            icon={<ArrowLeft size={12} style={{ color: VS_CODES.text }} />}
            title="Back"
            onClick={onBack}
          />
          <NavButton
            icon={<ArrowRight size={12} style={{ color: VS_CODES.text }} />}
            title="Forward"
            onClick={onForward}
          />
          <NavButton
            icon={<RefreshCw size={12} style={{ color: VS_CODES.text }} />}
            title="Refresh"
            onClick={onRefresh}
          />
          <NavButton
            icon={<Maximize2 size={12} style={{ color: VS_CODES.text }} />}
            title="Toggle fullscreen"
            onClick={onToggleFullscreen}
          />
          <div style={{ width: '1px', height: '16px', backgroundColor: VS_CODES.border, margin: '0 4px' }} />
          <NavButton
            icon={<X size={12} style={{ color: VS_CODES.error }} />}
            title="Close"
            onClick={onClose}
          />
        </div>
      </div>

      {/* URL Bar */}
      <div className="flex items-center px-2 py-1">
        <div
          className="flex-1 flex items-center px-2 py-0.5 border transition-colors"
          style={{
            backgroundColor: VS_CODES.bgInput,
            borderColor: VS_CODES.border,
            borderRadius: VS_CODES.radiusSm,
            minHeight: '22px'
          }}
          onFocus={(e) => (e.currentTarget as HTMLElement).style.borderColor = VS_CODES.focusBorder}
          onBlur={(e) => (e.currentTarget as HTMLElement).style.borderColor = VS_CODES.border}
        >
          <Globe size={10} className="mr-2" style={{ color: VS_CODES.textMuted, flexShrink: 0 }} />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={onUrlKeyDown}
            placeholder="Enter URL..."
            className="flex-1 bg-transparent outline-none text-xs"
            style={{
              color: VS_CODES.text,
              minHeight: '20px'
            }}
            spellCheck={false}
          />
        </div>
      </div>
    </div>
  );
}

export default BrowserHeader;
