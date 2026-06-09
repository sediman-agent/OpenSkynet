/**
 * VS Code-Style BrowserStatusBar Component
 * Status bar showing browser state - matching VS Code status bar
 */

import { Wifi, AlertCircle } from 'lucide-react';

// ============================================================================
// VS Code Design Tokens
// ============================================================================
const VS_CODES = {
  border: '#3c3c3c',
  bg: '#007acc', // VS Code status bar blue
  text: '#cccccc',
  textMuted: '#858585',
  success: '#4ec9b0',
  error: '#f48771',
  warning: '#dcdcaa',
} as const;

// ============================================================================
// Types
// ============================================================================
import { BrowserStatus } from '@/hooks/browser/types';

interface BrowserStatusBarProps {
  browserStatus: BrowserStatus;
  browserUrl: string;
}

// ============================================================================
// Status Item Component
// ============================================================================
interface StatusItemProps {
  icon: React.ReactNode;
  label: string;
  color: string;
}

function StatusItem({ icon, label, color }: StatusItemProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span style={{ color }}>{icon}</span>
      <span className="text-[10px] font-mono" style={{ color: VS_CODES.text }}>
        {label}
      </span>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================
export function BrowserStatusBar({ browserStatus, browserUrl }: BrowserStatusBarProps) {
  const getStatusDisplay = () => {
    switch (browserStatus) {
      case 'ready':
        return (
          <StatusItem
            icon={<Wifi size={10} />}
            label="READY"
            color={VS_CODES.success}
          />
        );
      case 'connecting':
        return (
          <StatusItem
            icon={<Wifi size={10} className="animate-pulse" />}
            label="CONNECTING"
            color={VS_CODES.warning}
          />
        );
      case 'error':
        return (
          <StatusItem
            icon={<AlertCircle size={10} />}
            label="ERROR"
            color={VS_CODES.error}
          />
        );
      default:
        return (
          <StatusItem
            icon={<Wifi size={10} />}
            label="IDLE"
            color={VS_CODES.textMuted}
          />
        );
    }
  };

  return (
    <div
      className="flex items-center justify-between px-2 py-0.5 font-mono text-[10px]"
      style={{
        backgroundColor: VS_CODES.bg,
        color: VS_CODES.text,
        borderTop: `1px solid ${VS_CODES.border}`
      }}
    >
      {getStatusDisplay()}

      <span
        className="truncate max-w-[300px]"
        style={{ color: VS_CODES.textMuted }}
      >
        {browserUrl || 'about:blank'}
      </span>
    </div>
  );
}

export default BrowserStatusBar;
