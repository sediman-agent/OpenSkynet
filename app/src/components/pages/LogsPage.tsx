import { useState } from 'react';
import { Search, Download, Trash2, Filter } from 'lucide-react';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { ScrollArea } from '@/components/shared/ScrollArea';
import { cn } from '@/lib/utils';
import { type LogEntry } from '@/types';

// Mock logs data - will be replaced with RPC calls
const mockLogs: LogEntry[] = [
  {
    id: '1',
    level: 'info',
    message: 'Agent started',
    timestamp: new Date('2024-01-15T10:30:00'),
    source: 'agent',
  },
  {
    id: '2',
    level: 'debug',
    message: 'Connecting to RPC server at ws://localhost:8765',
    timestamp: new Date('2024-01-15T10:30:01'),
    source: 'rpc',
  },
  {
    id: '3',
    level: 'info',
    message: 'Browser started',
    timestamp: new Date('2024-01-15T10:30:02'),
    source: 'browser',
  },
  {
    id: '4',
    level: 'warning',
    message: 'Slow response from LLM API (>5s)',
    timestamp: new Date('2024-01-15T10:30:15'),
    source: 'llm',
  },
  {
    id: '5',
    level: 'error',
    message: 'Failed to navigate to page: timeout',
    timestamp: new Date('2024-01-15T10:30:30'),
    source: 'browser',
  },
];

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>(mockLogs);
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warning' | 'error' | 'debug'>('all');

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.source?.toLowerCase() || '').includes(searchQuery.toLowerCase());

    const matchesLevel =
      levelFilter === 'all' || log.level === levelFilter;

    return matchesSearch && matchesLevel;
  });

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-destructive bg-destructive/10';
      case 'warning':
        return 'text-yellow-500 bg-yellow-500/10';
      case 'info':
        return 'text-blue-500 bg-blue-500/10';
      case 'debug':
        return 'text-muted-foreground bg-muted';
      default:
        return 'text-muted-foreground bg-muted';
    }
  };

  const handleExport = () => {
    const text = filteredLogs
      .map((log) => `[${log.level.toUpperCase()}] ${log.timestamp.toISOString()} - ${log.message}`)
      .join('\n');

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sediman-logs-${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    setLogs([]);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-14 border-b border-border flex items-center justify-between px-4">
        <h2 className="text-lg font-semibold">Logs</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleClear}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="pl-9"
          />
        </div>

        <div className="flex gap-2">
          <Button
            variant={levelFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLevelFilter('all')}
          >
            All
          </Button>
          <Button
            variant={levelFilter === 'error' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLevelFilter('error')}
          >
            Errors
          </Button>
          <Button
            variant={levelFilter === 'warning' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLevelFilter('warning')}
          >
            Warnings
          </Button>
          <Button
            variant={levelFilter === 'info' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLevelFilter('info')}
          >
            Info
          </Button>
          <Button
            variant={levelFilter === 'debug' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setLevelFilter('debug')}
          >
            Debug
          </Button>
        </div>
      </div>

      {/* Logs */}
      <ScrollArea className="flex-1 p-4">
        <div className="font-mono text-sm space-y-1">
          {filteredLogs.map((log) => (
            <div
              key={log.id}
              className="flex gap-3 py-1 px-2 rounded hover:bg-muted/50"
            >
              <span className={cn('px-2 py-0.5 rounded text-xs font-semibold', getLevelColor(log.level))}>
                {log.level.toUpperCase()}
              </span>
              <span className="text-muted-foreground flex-shrink-0">
                {log.timestamp.toLocaleTimeString()}
              </span>
              {log.source && (
                <span className="text-muted-foreground flex-shrink-0">
                  [{log.source}]
                </span>
              )}
              <span className="text-foreground">{log.message}</span>
            </div>
          ))}

          {filteredLogs.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No logs found matching your criteria
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
