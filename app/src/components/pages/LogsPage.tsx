import { useState } from 'react';
import { Download, Trash2, Bug, Info, AlertTriangle, AlertCircle, FileText, Search } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { Card } from '@/components/shared/Card';
import { ScrollArea } from '@/components/shared/ScrollArea';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { type LogEntry } from '@/types';

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warning' | 'error' | 'debug'>('all');

  // TODO: Load real logs from backend
  // For now, empty state
  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.source?.toLowerCase() || '').includes(searchQuery.toLowerCase());

    const matchesLevel =
      levelFilter === 'all' || log.level === levelFilter;

    return matchesSearch && matchesLevel;
  });

  const getLevelIcon = (level: LogEntry['level']) => {
    const iconClass = 'w-3.5 h-3.5';
    switch (level) {
      case 'error':
        return <AlertCircle className={`${iconClass} text-destructive`} />;
      case 'warning':
        return <AlertTriangle className={`${iconClass} text-warning`} />;
      case 'info':
        return <Info className={`${iconClass} text-info`} />;
      case 'debug':
        return <Bug className={`${iconClass} text-muted-foreground`} />;
      default:
        return null;
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

  const handleClear = () => {
    setLogs([]);
  };

  const errorCount = logs.filter((l) => l.level === 'error').length;
  const warningCount = logs.filter((l) => l.level === 'warning').length;
  const infoCount = logs.filter((l) => l.level === 'info').length;
  const debugCount = logs.filter((l) => l.level === 'debug').length;

  return (
    <div className="flex flex-col h-screen bg-muted/40">
      {/* Header */}
      <PageHeader
        icon={FileText}
        title="Logs"
        subtitle="System events and debugging"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={handleClear}>
              <Trash2 className="w-4 h-4 mr-2" />
              Clear
            </Button>
          </>
        }
      />

      {/* Search & Filter */}
      <div className="p-6 border-b border-border bg-background space-y-4">
        <div className="relative max-w-3xl mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="pl-9"
          />
        </div>

        <div className="flex gap-2 max-w-3xl mx-auto">
          <Button
            variant={levelFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLevelFilter('all')}
          >
            All ({logs.length})
          </Button>
          <Button
            variant={levelFilter === 'error' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLevelFilter('error')}
          >
            Errors ({errorCount})
          </Button>
          <Button
            variant={levelFilter === 'warning' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLevelFilter('warning')}
          >
            Warnings ({warningCount})
          </Button>
          <Button
            variant={levelFilter === 'info' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLevelFilter('info')}
          >
            Info ({infoCount})
          </Button>
          <Button
            variant={levelFilter === 'debug' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLevelFilter('debug')}
          >
            Debug ({debugCount})
          </Button>
        </div>
      </div>

      {/* Logs */}
      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto py-6 px-6">
          {filteredLogs.length === 0 ? (
            <Card className="p-16 text-center">
              <Bug className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">
                {searchQuery || levelFilter !== 'all'
                  ? 'No logs found matching your criteria'
                  : 'No logs available'}
              </p>
            </Card>
          ) : (
            <div className="font-mono text-xs space-y-1">
              {filteredLogs.map((log) => (
                <Card key={log.id} className="flex gap-3 py-2 px-3 hover:bg-accent transition-colors">
                  {/* Level badge */}
                  <StatusBadge
                    status={log.level === 'error' ? 'error' : log.level === 'warning' ? 'warning' : 'info'}
                    size="sm"
                  >
                    {log.level.toUpperCase()}
                  </StatusBadge>

                  {/* Timestamp */}
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {log.timestamp.toLocaleTimeString()}
                  </span>

                  {/* Source */}
                  {log.source && (
                    <span className="text-muted-foreground shrink-0">
                      [{log.source}]
                    </span>
                  )}

                  {/* Icon */}
                  <span className="shrink-0">{getLevelIcon(log.level)}</span>

                  {/* Message */}
                  <span className="text-foreground flex-1 break-words">
                    {log.message}
                  </span>
                </Card>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
