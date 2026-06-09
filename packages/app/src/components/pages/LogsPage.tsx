/**
 * VS Code-Style LogsPage
 * System logs with VS Code design system
 */

import { useState, useEffect } from 'react';
import { Download, Trash2, Bug, Info, AlertTriangle, AlertCircle, FileText, Search } from 'lucide-react';
import { type LogEntry } from '@/types';

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warning' | 'error' | 'debug'>('all');

  const apiBaseUrl = 'http://localhost:3001';

  // Load logs from server
  const loadLogs = async () => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/logs?limit=100`);
      if (response.ok) {
        const data = await response.json();
        const logEntries = (data.logs || []).map((log: any) => ({
          id: log.id,
          level: log.level as LogEntry['level'],
          message: log.message,
          source: log.source,
          timestamp: new Date(log.timestamp),
        }));
        setLogs(logEntries);
      }
    } catch (error) {
      console.error('Failed to load logs:', error);
    }
  };

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.source?.toLowerCase() || '').includes(searchQuery.toLowerCase());

    const matchesLevel =
      levelFilter === 'all' || log.level === levelFilter;

    return matchesSearch && matchesLevel;
  });

  const getLevelIcon = (level: LogEntry['level']) => {
    const size = 14;
    switch (level) {
      case 'error':
        return <AlertCircle size={size} style={{ color: 'var(--vscode-error-foreground)' }} />;
      case 'warning':
        return <AlertTriangle size={size} style={{ color: 'var(--vscode-warning-foreground)' }} />;
      case 'info':
        return <Info size={size} style={{ color: 'var(--vscode-info-foreground)' }} />;
      case 'debug':
        return <Bug size={size} style={{ color: 'var(--vscode-secondary-text)' }} />;
      default:
        return null;
    }
  };

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'var(--vscode-error-foreground)';
      case 'warning':
        return 'var(--vscode-warning-foreground)';
      case 'info':
        return 'var(--vscode-info-foreground)';
      case 'debug':
        return 'var(--vscode-secondary-text)';
      default:
        return 'var(--vscode-secondary-text)';
    }
  };

  const handleExport = () => {
    const text = filteredLogs
      .map(
        (log) =>
          `[${log.level.toUpperCase()}] ${log.timestamp.toISOString()} [${log.source || 'app'}] ${log.message}`
      )
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openskynet-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = async () => {
    try {
      await fetch(`${apiBaseUrl}/api/logs`, { method: 'DELETE' });
      setLogs([]);
    } catch (error) {
      console.error('Failed to clear logs:', error);
    }
  };

  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warningCount = logs.filter((l) => l.level === 'warning').length;
  const infoCount = logs.filter((l) => l.level === 'info').length;
  const debugCount = logs.filter((l) => l.level === 'debug').length;

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--vscode-background)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{
        borderColor: 'var(--vscode-border-color)',
        backgroundColor: 'var(--vscode-background)',
        color: 'var(--vscode-foreground)',
        minHeight: '40px'
      }}>
        <FileText size={18} style={{ color: 'var(--vscode-secondary-text)' }} />
        <div className="flex-1">
          <h1 className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>Logs</h1>
          <p className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
            System events and debugging
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="px-3 py-1 text-xs font-mono border transition-colors flex items-center gap-1"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--vscode-foreground)',
              borderColor: 'var(--vscode-border-color)',
              borderRadius: 'var(--vscode-corner-radius)',
              minHeight: '26px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Download size={12} />
            Export
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-1 text-xs font-mono border transition-colors flex items-center gap-1"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--vscode-foreground)',
              borderColor: 'var(--vscode-border-color)',
              borderRadius: 'var(--vscode-corner-radius)',
              minHeight: '26px'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <Trash2 size={12} />
            Clear
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="px-6 py-4 border-b space-y-4" style={{ borderColor: 'var(--vscode-border-color)' }}>
        <div className="relative max-w-3xl mx-auto">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--vscode-secondary-text)' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="w-full pl-9 pr-3 py-1 text-sm outline-none font-mono border"
            style={{
              backgroundColor: 'var(--vscode-input-background)',
              borderColor: 'var(--vscode-input-border)',
              borderRadius: 'var(--vscode-corner-radius)',
              color: 'var(--vscode-input-foreground)',
              minHeight: '26px',
              fontFamily: 'var(--vscode-font-family)'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--vscode-focus-border)';
              e.currentTarget.style.boxShadow = '0 0 0 1px var(--vscode-focus-border)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--vscode-input-border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        <div className="flex gap-2 max-w-3xl mx-auto">
          {(['all', 'error', 'warning', 'info', 'debug'] as const).map((level) => (
            <button
              key={level}
              onClick={() => setLevelFilter(level)}
              className="px-3 py-1 text-xs font-mono uppercase transition-colors"
              style={{
                backgroundColor: levelFilter === level ? 'var(--vscode-button-primary-background)' : 'transparent',
                color: levelFilter === level ? 'var(--vscode-button-primary-foreground)' : 'var(--vscode-secondary-text)',
                border: levelFilter === level ? '1px solid transparent' : '1px solid var(--vscode-border-color)',
                borderRadius: 'var(--vscode-corner-radius)'
              }}
              onMouseEnter={(e) => {
                if (levelFilter !== level) {
                  e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                }
              }}
              onMouseLeave={(e) => {
                if (levelFilter !== level) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              {level === 'all' && `All (${logs.length})`}
              {level === 'error' && `Errors (${errorCount})`}
              {level === 'warning' && `Warnings (${warningCount})`}
              {level === 'info' && `Info (${infoCount})`}
              {level === 'debug' && `Debug (${debugCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto py-6 px-6">
          {filteredLogs.length === 0 ? (
            <div className="px-16 py-16 text-center border" style={{
              borderColor: 'var(--vscode-border-color)',
              backgroundColor: 'var(--vscode-panel-background)',
              borderRadius: 'var(--vscode-corner-radius-round)'
            }}>
              <Bug size={48} className="mx-auto mb-4" style={{ color: 'var(--vscode-secondary-text)' }} />
              <p style={{ color: 'var(--vscode-secondary-text)' }}>
                {searchQuery || levelFilter !== 'all'
                  ? 'No logs found matching your criteria'
                  : 'No logs available'}
              </p>
            </div>
          ) : (
            <div className="font-mono text-xs space-y-1">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex gap-3 py-2 px-3 border transition-colors"
                  style={{
                    borderColor: 'var(--vscode-border-color)',
                    backgroundColor: 'var(--vscode-panel-background)',
                    borderRadius: 'var(--vscode-corner-radius-round)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--vscode-panel-background)';
                  }}
                >
                  {/* Level badge */}
                  <span
                    className="shrink-0 text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: 'var(--vscode-badge-background)',
                      color: getLevelColor(log.level)
                    }}
                  >
                    {log.level.toUpperCase()}
                  </span>

                  {/* Timestamp */}
                  <span className="shrink-0" style={{
                    color: 'var(--vscode-secondary-text)',
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    {log.timestamp.toLocaleTimeString()}
                  </span>

                  {/* Source */}
                  {log.source && (
                    <span className="shrink-0" style={{ color: 'var(--vscode-secondary-text)' }}>
                      [{log.source}]
                    </span>
                  )}

                  {/* Icon */}
                  <span className="shrink-0">{getLevelIcon(log.level)}</span>

                  {/* Message */}
                  <span className="flex-1 break-words" style={{ color: 'var(--vscode-foreground)' }}>
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LogsPage;
