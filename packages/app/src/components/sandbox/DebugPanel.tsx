/**
 * DebugPanel Component - Industrial Grade
 * Enhanced VS Code-style debug controls for browser panel
 * Professional styling with proper visual hierarchy and interactions
 */

import { useState, useCallback, useEffect } from 'react';
import { Bug, Play, Pause, RefreshCw, Settings, ChevronRight, ChevronDown, Copy, Trash2, Terminal, Globe, Code, History } from 'lucide-react';
import { useSandboxStore } from '@/stores/useSandboxStore';
import { browserService } from '@/services/BrowserService';
import { VS_CODES } from '@/styles/vscode-constants';

// ============================================================================
// Types
// ============================================================================

interface DebugSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  icon?: React.ReactNode;
}

interface DebugItemProps {
  label: string;
  value: string | number | boolean;
  onCopy?: () => void;
  onClear?: () => void;
}

// ============================================================================
// Debug Section Component - Enhanced
// ============================================================================

function DebugSection({ title, defaultExpanded = false, children, icon }: DebugSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className="border transition-all duration-150"
      style={{
        borderColor: 'var(--vscode-border-color)',
        borderRadius: VS_CODES.radiusSm,
        marginBottom: VS_CODES.spacing.sm
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 text-left transition-all duration-150"
        style={{
          minHeight: '28px',
          padding: `${VS_CODES.spacing.md}px ${VS_CODES.spacing.lg}px`,
          backgroundColor: isHovered ? 'var(--vscode-list-hoverBackground)' : 'transparent',
          cursor: 'pointer'
        }}
        onMouseEnter={(e) => {
          setIsHovered(true);
          e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
        }}
        onMouseLeave={(e) => {
          setIsHovered(false);
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        {expanded ? (
          <ChevronDown size={12} style={{ color: 'var(--vscode-secondary-text)' }} />
        ) : (
          <ChevronRight size={12} style={{ color: 'var(--vscode-secondary-text)' }} />
        )}
        {icon && <span style={{ color: 'var(--vscode-secondary-text)' }}>{icon}</span>}
        <span
          className="font-mono uppercase tracking-wider"
          style={{
            color: 'var(--vscode-foreground)',
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '0.5px'
          }}
        >
          {title}
        </span>
      </button>

      {expanded && (
        <div
          className="border-t"
          style={{
            borderColor: 'var(--vscode-border-color)',
            backgroundColor: 'var(--vscode-sideBar-background)',
            padding: `${VS_CODES.spacing.md}px ${VS_CODES.spacing.lg}px`
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Debug Item Component - Enhanced
// ============================================================================

function DebugItem({ label, value, onCopy, onClear }: DebugItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const displayValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);

  const handleCopy = useCallback(() => {
    if (onCopy) {
      onCopy();
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  }, [onCopy]);

  return (
    <div
      className="flex items-center font-mono transition-all duration-150"
      style={{
        gap: VS_CODES.spacing.md,
        padding: `${VS_CODES.spacing.sm}px ${VS_CODES.spacing.md}px`,
        minHeight: '24px',
        fontSize: '12px',
        backgroundColor: isHovered ? 'var(--vscode-list-hoverBackground)' : 'transparent',
        borderRadius: VS_CODES.radiusSm,
        cursor: 'default'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span style={{ color: 'var(--vscode-secondary-text)', fontWeight: 500 }}>
        {label}:
      </span>
      <span
        className="flex-1 truncate"
        style={{
          color: 'var(--vscode-foreground)',
          fontFamily: 'var(--font-mono)'
        }}
      >
        {displayValue || 'empty'}
      </span>
      {(onCopy || onClear) && (
        <div className="flex items-center gap-1">
          {onCopy && (
            <button
              onClick={handleCopy}
              className="p-1 rounded transition-all duration-150"
              style={{
                color: isCopied ? 'var(--vscode-success-foreground)' : 'var(--vscode-secondary-text)',
                transform: isHovered ? 'scale(1.1)' : 'scale(1)'
              }}
              onMouseEnter={(e) => {
                if (!isCopied) e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              title={isCopied ? 'Copied!' : 'Copy value'}
            >
              {isCopied ? <Copy size={10} fill="currentColor" /> : <Copy size={10} />}
            </button>
          )}
          {onClear && (
            <button
              onClick={onClear}
              className="p-1 rounded transition-all duration-150"
              style={{ color: 'var(--vscode-secondary-text)' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                e.currentTarget.style.color = 'var(--vscode-error-foreground)';
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--vscode-secondary-text)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
              title="Clear value"
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DebugPanel() {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);

  const isOpen = useSandboxStore(state => state.isOpen);

  // Refresh debug info
  const refreshDebugInfo = useCallback(() => {
    const info = {
      panelOpen: isOpen,
      connectionStatus: useSandboxStore.getState().connectionStatus,
      controlMode: useSandboxStore.getState().controlMode,
      isActive: useSandboxStore.getState().isActive,
      timestamp: new Date().toISOString()
    };
    setDebugInfo(info);
  }, [isOpen]);

  // Test browser command (simulated)
  const testCommand = useCallback((command: string) => {
    setCommandHistory(prev => [...prev, command]);
    console.log('[DebugPanel] Command would be sent:', command);
  }, []);

  // Clear history
  const clearHistory = useCallback(() => {
    setCommandHistory([]);
  }, []);

  // Copy value to clipboard
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  // Auto-refresh debug info on mount
  useEffect(() => {
    refreshDebugInfo();
  }, []);

  const quickCommands = [
    { label: 'Navigate to Google', cmd: 'browser_navigate', args: 'https://www.google.com', icon: <Globe size={10} /> },
    { label: 'Take Screenshot', cmd: 'browser_snapshot', args: '', icon: <Play size={10} /> },
    { label: 'Get Page Info', cmd: 'browser_info', args: '', icon: <Terminal size={10} /> },
    { label: 'Execute Script', cmd: 'browser_execute', args: 'document.title', icon: <Code size={10} /> }
  ] as const;

  return (
    <div
      className="font-mono flex flex-col"
      style={{
        backgroundColor: 'var(--vscode-sideBar-background)',
        color: 'var(--vscode-foreground)',
        height: '100%',
        fontSize: '12px'
      }}
    >
      {/* Header - Enhanced */}
      <div
        className="flex items-center justify-between border-b"
        style={{
          padding: `${VS_CODES.spacing.md}px ${VS_CODES.spacing.lg}px`,
          borderColor: 'var(--vscode-border-color)',
          backgroundColor: 'var(--vscode-editorHoverWidget-background)',
          minHeight: '36px'
        }}
      >
        <div className="flex items-center gap-2">
          <Bug size={12} style={{ color: 'var(--vscode-warning-foreground)' }} />
          <span
            className="uppercase tracking-wider font-semibold"
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.5px'
            }}
          >
            Debug Panel
          </span>
        </div>
        <button
          onClick={refreshDebugInfo}
          className="p-1.5 rounded transition-all duration-150"
          style={{ color: 'var(--vscode-secondary-text)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
            e.currentTarget.style.color = 'var(--vscode-foreground)';
            e.currentTarget.style.transform = 'scale(1.05)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--vscode-secondary-text)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Refresh debug info"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Content - Enhanced */}
      <div
        className="overflow-y-auto"
        style={{
          padding: VS_CODES.spacing.lg,
          maxHeight: 'calc(100% - 36px)'
        }}
      >
        {/* Browser State */}
        <DebugSection
          title="Panel State"
          defaultExpanded
          icon={<Terminal size={11} />}
        >
          {debugInfo && (
            <>
              <DebugItem label="Panel" value={debugInfo.panelOpen ? 'Open' : 'Closed'} />
              <DebugItem label="Connection" value={debugInfo.connectionStatus} />
              <DebugItem label="Control Mode" value={debugInfo.controlMode} />
              <DebugItem label="Active" value={debugInfo.isActive ? 'Yes' : 'No'} />
              <DebugItem
                label="Timestamp"
                value={debugInfo.timestamp}
                onCopy={() => copyToClipboard(debugInfo.timestamp)}
              />
            </>
          )}
        </DebugSection>

        {/* Quick Commands - Enhanced */}
        <DebugSection title="Quick Commands" icon={<Play size={11} />}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: VS_CODES.spacing.sm }}>
            {quickCommands.map((item, idx) => {
              const [isHovered, setIsHovered] = useState(false);
              return (
                <button
                  key={idx}
                  onClick={() => testCommand(JSON.stringify({ action: item.cmd, args: item.args }))}
                  className="text-left transition-all duration-150 flex items-center gap-2"
                  style={{
                    minHeight: '28px',
                    padding: `${VS_CODES.spacing.sm}px ${VS_CODES.spacing.md}px`,
                    backgroundColor: isHovered ? 'var(--vscode-list-hoverBackground)' : 'transparent',
                    borderRadius: VS_CODES.radiusSm,
                    border: `1px solid transparent`
                  }}
                  onMouseEnter={() => setIsHovered(true)}
                  onMouseLeave={() => setIsHovered(false)}
                >
                  <span style={{ color: 'var(--vscode-secondary-text)' }}>{item.icon}</span>
                  <div className="flex-1">
                    <div
                      className="font-medium"
                      style={{ color: 'var(--vscode-foreground)', fontSize: '12px' }}
                    >
                      {item.label}
                    </div>
                    <div
                      className="font-mono"
                      style={{ color: 'var(--vscode-secondary-text)', fontSize: '10px' }}
                    >
                      {item.cmd}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </DebugSection>

        {/* Command History - Enhanced */}
        <DebugSection title="Command History" icon={<History size={11} />}>
          {commandHistory.length === 0 ? (
            <div
              className="text-center py-3"
              style={{ color: 'var(--vscode-secondary-text)', fontSize: '11px' }}
            >
              No commands sent yet
            </div>
          ) : (
            <>
              {commandHistory.map((cmd, idx) => (
                <div
                  key={idx}
                  className="transition-all duration-150"
                  style={{
                    padding: `${VS_CODES.spacing.sm}px ${VS_CODES.spacing.md}px`,
                    minHeight: '24px',
                    backgroundColor: 'transparent',
                    borderRadius: VS_CODES.radiusSm
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <div
                    className="truncate font-mono"
                    style={{ color: 'var(--vscode-foreground)', fontSize: '10px' }}
                  >
                    {cmd}
                  </div>
                </div>
              ))}
              <div className="pt-2">
                <button
                  onClick={clearHistory}
                  className="w-full font-mono uppercase transition-all duration-150"
                  style={{
                    padding: `${VS_CODES.spacing.sm}px ${VS_CODES.spacing.md}px`,
                    backgroundColor: 'var(--vscode-list-hoverBackground)',
                    color: 'var(--vscode-secondary-text)',
                    border: `1px solid var(--vscode-border-color)`,
                    borderRadius: VS_CODES.radiusSm,
                    fontSize: '11px',
                    fontWeight: 500
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--vscode-button-secondaryHoverBackground)';
                    e.currentTarget.style.borderColor = 'var(--vscode-focus-border)';
                    e.currentTarget.style.transform = 'scale(1.02)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                    e.currentTarget.style.borderColor = 'var(--vscode-border-color)';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  Clear History
                </button>
              </div>
            </>
          )}
        </DebugSection>

        {/* Configuration */}
        <DebugSection title="Configuration" icon={<Settings size={11} />}>
          <DebugItem label="Panel Type" value="Browser" />
          <DebugItem label="Default Width" value="600px" />
          <DebugItem label="CDP Support" value="Enabled" />
        </DebugSection>
      </div>
    </div>
  );
}

export default DebugPanel;
