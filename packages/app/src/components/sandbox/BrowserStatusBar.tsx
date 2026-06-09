/**
 * VS Code-Style BrowserStatusBar Component - Industrial Grade
 * Enhanced status bar with professional visual hierarchy and styling
 */

import { Wifi, AlertCircle, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { BrowserStatus } from '@/hooks/browser/types';
import { VS_CODES } from '@/styles/vscode-constants';

// ============================================================================
// Types
// ============================================================================

interface BrowserStatusBarProps {
  browserStatus: BrowserStatus;
  browserUrl: string;
}

// ============================================================================
// Status Item Component - Enhanced
// ============================================================================
interface StatusItemProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  isAnimated?: boolean;
}

function StatusItem({ icon, label, color, isAnimated = false }: StatusItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 transition-all duration-150"
      style={{
        cursor: 'default',
        backgroundColor: isHovered ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
        borderRadius: '2px'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span style={{ color }} className={isAnimated ? 'animate-spin' : ''}>
        {icon}
      </span>
      <span
        className="font-mono uppercase tracking-wider"
        style={{
          color: 'var(--vscode-statusBar-foreground)',
          fontSize: '11px',
          fontWeight: 500,
          letterSpacing: '0.3px'
        }}
      >
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
            icon={<Wifi size={11} />}
            label="READY"
            color="var(--vscode-success-foreground)"
          />
        );
      case 'connecting':
        return (
          <StatusItem
            icon={<Loader2 size={11} />}
            label="CONNECTING"
            color="var(--vscode-warning-foreground)"
            isAnimated={true}
          />
        );
      case 'error':
        return (
          <StatusItem
            icon={<AlertCircle size={11} />}
            label="ERROR"
            color="var(--vscode-error-foreground)"
          />
        );
      default:
        return (
          <StatusItem
            icon={<Wifi size={11} />}
            label="IDLE"
            color="var(--vscode-secondary-text)"
          />
        );
    }
  };

  const displayUrl = browserUrl || 'about:blank';
  const truncatedUrl = displayUrl.length > 60 ? displayUrl.slice(0, 60) + '...' : displayUrl;

  return (
    <div
      className="flex items-center justify-between font-mono"
      style={{
        backgroundColor: 'var(--vscode-statusBar-background)',
        color: 'var(--vscode-statusBar-foreground)',
        borderTop: `1px solid var(--vscode-statusBar-border)`,
        height: '22px',
        padding: '0 8px'
      }}
    >
      {getStatusDisplay()}

      <div
        className="truncate font-mono"
        style={{
          color: 'var(--vscode-statusBar-foreground)',
          fontSize: '11px',
          opacity: 0.85,
          maxWidth: '400px'
        }}
        title={displayUrl}
      >
        {truncatedUrl}
      </div>
    </div>
  );
}

export default BrowserStatusBar;
