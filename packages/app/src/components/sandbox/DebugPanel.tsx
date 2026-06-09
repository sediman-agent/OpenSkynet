/**
 * DebugPanel Component
 * VS Code-style debug controls for browser panel
 * Allows debugging and configuration through web UI
 */

import { useState, useCallback } from 'react';
import { Bug, Play, Pause, RefreshCw, Settings, ChevronRight, ChevronDown, Copy, Trash2 } from 'lucide-react';
import { useSandboxStore } from '@/stores/useSandboxStore';
import { browserService } from '@/services/BrowserService';

// ============================================================================
// VS Code Design Tokens
// ============================================================================
const VS_CODES = {
  border: '#3c3c3c',
  bg: '#1e1e1e',
  bgHover: '#2a2d2e',
  bgSecondary: '#252526',
  text: '#cccccc',
  textMuted: '#858585',
  success: '#4ec9b0',
  warning: '#dcdcaa',
  error: '#f48771',
  info: '#3794ff',
  radius: '2px',
} as const;

// ============================================================================
// Types
// ============================================================================

interface DebugSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

interface DebugItemProps {
  label: string;
  value: string | number | boolean;
  onCopy?: () => void;
  onClear?: () => void;
}

// ============================================================================
// Debug Section Component
// ============================================================================

function DebugSection({ title, defaultExpanded = false, children }: DebugSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="mb-2 border" style={{ borderColor: VS_CODES.border, borderRadius: VS_CODES.radius }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-2 py-1 flex items-center gap-2 text-left hover:bg-[#2a2d2e]/50 transition-colors"
        style={{ minHeight: '24px' }}
      >
        {expanded ? (
          <ChevronDown size={12} style={{ color: VS_CODES.textMuted }} />
        ) : (
          <ChevronRight size={12} style={{ color: VS_CODES.textMuted }} />
        )}
        <span className="text-xs font-mono uppercase tracking-wider" style={{ color: VS_CODES.text }}>
          {title}
        </span>
      </button>

      {expanded && (
        <div className="px-2 py-2 border-t" style={{ borderColor: VS_CODES.border, backgroundColor: VS_CODES.bgSecondary }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Debug Item Component
// ============================================================================

function DebugItem({ label, value, onCopy, onClear }: DebugItemProps) {
  const displayValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);

  return (
    <div className="flex items-center gap-2 py-1 px-2 text-xs font-mono" style={{ minHeight: '20px' }}>
      <span style={{ color: VS_CODES.textMuted }}>{label}:</span>
      <span className="flex-1 truncate" style={{ color: VS_CODES.text }}>
        {displayValue || 'empty'}
      </span>
      {onCopy && (
        <button
          onClick={onCopy}
          className="p-0.5 hover:bg-[#2a2d2e] rounded transition-colors"
          title="Copy value"
        >
          <Copy size={10} style={{ color: VS_CODES.textMuted }} />
        </button>
      )}
      {onClear && (
        <button
          onClick={onClear}
          className="p-0.5 hover:bg-[#2a2d2e] rounded transition-colors"
          title="Clear value"
        >
          <Trash2 size={10} style={{ color: VS_CODES.textMuted }} />
        </button>
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

  return (
    <div className="font-mono text-xs" style={{ backgroundColor: VS_CODES.bg, color: VS_CODES.text }}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 border-b" style={{ borderColor: VS_CODES.border }}>
        <div className="flex items-center gap-2">
          <Bug size={12} style={{ color: VS_CODES.warning }} />
          <span className="font-medium">Debug Panel</span>
        </div>
        <button
          onClick={refreshDebugInfo}
          className="p-1 hover:bg-[#2a2d2e] rounded transition-colors"
          title="Refresh debug info"
        >
          <RefreshCw size={12} style={{ color: VS_CODES.textMuted }} />
        </button>
      </div>

      {/* Content */}
      <div className="p-2 space-y-2 max-h-[400px] overflow-y-auto">
        {/* Browser State */}
        <DebugSection title="Panel State" defaultExpanded>
          {debugInfo && (
            <>
              <DebugItem
                label="Panel"
            value={debugInfo.panelOpen ? 'Open' : 'Closed'}
              />
              <DebugItem
                label="Connection"
            value={debugInfo.connectionStatus}
              />
              <DebugItem
                label="Control Mode"
            value={debugInfo.controlMode}
              />
              <DebugItem
                label="Active"
            value={debugInfo.isActive ? 'Yes' : 'No'}
              />
              <DebugItem
                label="Timestamp"
            value={debugInfo.timestamp}
              onCopy={() => copyToClipboard(debugInfo.timestamp)}
              />
            </>
          )}
        </DebugSection>

        {/* Quick Commands */}
        <DebugSection title="Quick Commands">
          <div className="space-y-1">
            {[
              { label: 'Navigate to Google', cmd: 'browser_navigate', args: 'https://www.google.com' },
              { label: 'Take Screenshot', cmd: 'browser_snapshot', args: '' },
              { label: 'Get Page Info', cmd: 'browser_info', args: '' },
              { label: 'Execute Script', cmd: 'browser_execute', args: 'document.title' }
            ].map((item, idx) => (
              <button
                key={idx}
                onClick={() => testCommand(JSON.stringify({ action: item.cmd, args: item.args }))}
                className="w-full text-left px-2 py-1 text-xs hover:bg-[#2a2d2e] transition-colors"
                style={{ minHeight: '24px' }}
              >
                <div className="font-medium" style={{ color: VS_CODES.text }}>{item.label}</div>
                <div className="text-[10px]" style={{ color: VS_CODES.textMuted }}>
                  {item.cmd}
                </div>
              </button>
            ))}
          </div>
        </DebugSection>

        {/* Command History */}
        <DebugSection title="Command History">
          {commandHistory.length === 0 ? (
            <div className="px-2 py-2 text-center" style={{ color: VS_CODES.textMuted }}>
              No commands sent yet
            </div>
          ) : (
            <>
              {commandHistory.map((cmd, idx) => (
                <div
                  key={idx}
                  className="px-2 py-1 hover:bg-[#2a2d2e]/50"
                  style={{ minHeight: '20px' }}
                >
                  <div className="truncate text-[10px] font-mono" style={{ color: VS_CODES.text }}>
                    {cmd}
                  </div>
                </div>
              ))}
              <div className="px-2 pt-1">
                <button
                  onClick={clearHistory}
                  className="w-full px-2 py-1 text-xs font-mono uppercase transition-colors"
                  style={{
                    backgroundColor: VS_CODES.bgHover,
                    color: VS_CODES.textMuted,
                    border: `1px solid ${VS_CODES.border}`,
                    borderRadius: VS_CODES.radius
                  }}
                >
                  Clear History
                </button>
              </div>
            </>
          )}
        </DebugSection>

        {/* Configuration */}
        <DebugSection title="Configuration">
          <DebugItem label="Panel Type" value="Browser" />
          <DebugItem label="Default Width" value="600px" />
          <DebugItem label="CDP Support" value="Enabled" />
        </DebugSection>
      </div>
    </div>
  );
}

export default DebugPanel;
