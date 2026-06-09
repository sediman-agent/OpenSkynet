/**
 * VS Code-Style MemoryPage
 * Memory management with VS Code design system
 */

import { useState, useEffect } from 'react';
import { Database, Trash2, Search, Clock, Tag } from 'lucide-react';
import { toast } from 'sonner';

interface MemoryEntry {
  id: string;
  content: string;
  timestamp: string;
  type: string;
  importance?: number;
  metadata?: Record<string, unknown>;
}

export function MemoryPage() {
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemory, setSelectedMemory] = useState<MemoryEntry | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    loadMemories();
  }, []);

  const loadMemories = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/memory', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const data = await response.json();
        setMemories(data.memories || []);
      }
    } catch {
      console.log('Server not available');
      setMemories([
        {
          id: '1',
          content: 'Example: User asked about Python test migration',
          timestamp: new Date().toISOString(),
          type: 'conversation',
          importance: 0.8,
          metadata: { category: 'task' }
        },
        {
          id: '2',
          content: 'Example: Fixed Electron build errors',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          type: 'development',
          importance: 0.9,
          metadata: { category: 'bug-fix' }
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`http://localhost:3001/api/memory/${id}`, {
        method: 'DELETE',
      });
      setMemories(prev => prev.filter(m => m.id !== id));
      toast.success('Memory deleted');
    } catch {
      console.error('Failed to delete memory');
      toast.error('Failed to delete memory');
    }
  };

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 3000);
      return;
    }
    setConfirmClear(false);
    try {
      await fetch('http://localhost:3001/api/memory/clear', {
        method: 'POST',
      });
      setMemories([]);
      toast.success('All memories cleared');
    } catch {
      console.error('Failed to clear memories');
      toast.error('Failed to clear memories');
    }
  };

  const filteredMemories = memories.filter(memory =>
    memory.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    memory.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedMemories = filteredMemories.reduce((acc, memory) => {
    const type = memory.type || 'general';
    if (!acc[type]) acc[type] = [];
    acc[type].push(memory);
    return acc;
  }, {} as Record<string, MemoryEntry[]>);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--vscode-background)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{
        borderColor: 'var(--vscode-border-color)',
        backgroundColor: 'var(--vscode-background)',
        color: 'var(--vscode-foreground)',
        minHeight: '40px'
      }}>
        <Database size={18} style={{ color: 'var(--vscode-secondary-text)' }} />
        <div className="flex-1">
          <h1 className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>Memory</h1>
          <p className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>Agent memory and context</p>
        </div>
        <button
          onClick={handleClear}
          className="px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors"
          style={{
            backgroundColor: confirmClear ? 'var(--vscode-error-foreground)' : 'var(--vscode-button-secondary-background)',
            color: confirmClear ? 'white' : 'var(--vscode-button-secondary-foreground)',
            border: '1px solid transparent',
            borderRadius: 'var(--vscode-corner-radius)',
            minHeight: '26px'
          }}
        >
          <Trash2 className="w-3 h-3 mr-1" />
          {confirmClear ? 'Confirm Clear' : 'Clear All'}
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--vscode-border-color)' }}>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2" size={14} style={{ color: 'var(--vscode-secondary-text)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memories..."
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
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{
              borderColor: 'var(--vscode-progress-background)',
              borderTopColor: 'transparent'
            }} />
          </div>
        ) : filteredMemories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Database className="w-12 h-12 mb-4" style={{ color: 'var(--vscode-secondary-text)' }} />
            <p style={{ color: 'var(--vscode-secondary-text)' }}>
              {searchQuery ? 'No memories found' : 'No memories yet'}
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Total Memories', value: memories.length },
                { label: 'Types', value: Object.keys(groupedMemories).length },
                { label: 'High Importance', value: memories.filter(m => (m.importance || 0) > 0.7).length }
              ].map((stat, i) => (
                <div
                  key={i}
                  className="px-4 py-3 border"
                  style={{
                    borderColor: 'var(--vscode-border-color)',
                    backgroundColor: 'var(--vscode-panel-background)'
                  }}
                >
                  <div className="text-2xl font-bold" style={{ color: 'var(--vscode-foreground)' }}>{stat.value}</div>
                  <div className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Grouped Memories */}
            {Object.entries(groupedMemories).map(([type, typeMemories]) => (
              <div key={type}>
                <div className="flex items-center gap-2 mb-3">
                  <Tag size={14} style={{ color: 'var(--vscode-info-foreground)' }} />
                  <h3 className="text-sm font-semibold uppercase" style={{ color: 'var(--vscode-secondary-text)' }}>
                    {type}
                  </h3>
                  <span className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
                    ({typeMemories.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {typeMemories.map((memory) => (
                    <div
                      key={memory.id}
                      className="px-3 py-2 border cursor-pointer transition-colors"
                      style={{
                        borderColor: 'var(--vscode-border-color)',
                        backgroundColor: 'var(--vscode-panel-background)'
                      }}
                      onClick={() => setSelectedMemory(memory)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--vscode-focus-border)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--vscode-border-color)';
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm line-clamp-2" style={{ color: 'var(--vscode-foreground)' }}>{memory.content}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] px-2 py-0.5 rounded" style={{
                              backgroundColor: 'var(--vscode-badge-background)',
                              color: 'var(--vscode-badge-foreground)'
                            }}>
                              {type}
                            </span>
                            {memory.importance && (
                              <span className="text-[10px]" style={{ color: 'var(--vscode-secondary-text)' }}>
                              {Math.round(memory.importance * 100)}% importance
                            </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock size={12} style={{ color: 'var(--vscode-secondary-text)' }} />
                          <span className="text-[10px]" style={{ color: 'var(--vscode-secondary-text)' }}>
                            {new Date(memory.timestamp).toLocaleString()}
                          </span>
                          <button
                            className="p-1 rounded transition-colors"
                            style={{ color: 'var(--vscode-secondary-text)' }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--vscode-error-foreground)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--vscode-secondary-text)';
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(memory.id);
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Memory Detail Modal */}
      {selectedMemory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }} onClick={() => setSelectedMemory(null)}>
          <div
            className="w-full max-w-2xl mx-4 p-4 border"
            style={{
              backgroundColor: 'var(--vscode-panel-background)',
              borderColor: 'var(--vscode-border-color)',
              borderRadius: 'var(--vscode-corner-radius-round)',
              maxHeight: '80vh',
              overflow: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>Memory Details</h2>
              <button
                onClick={() => setSelectedMemory(null)}
                className="text-2xl hover:text-[var(--vscode-secondary-text)] transition-colors"
                style={{ color: 'var(--vscode-foreground)' }}
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--vscode-foreground)' }}>Content</label>
                <p className="text-sm p-3 border rounded" style={{
                  backgroundColor: 'var(--vscode-input-background)',
                  borderColor: 'var(--vscode-border-color)',
                  color: 'var(--vscode-foreground)'
                }}>
                  {selectedMemory.content}
                </p>
              </div>
              {selectedMemory.importance && (
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>Importance</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--vscode-input-background)' }}>
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${selectedMemory.importance * 100}%`,
                          backgroundColor: 'var(--vscode-progress-background)'
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>
                      {Math.round(selectedMemory.importance * 100)}%
                    </span>
                  </div>
                </div>
              )}
              {selectedMemory.metadata && (
                <div>
                  <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--vscode-foreground)' }}>Metadata</label>
                  <pre className="text-xs p-3 border rounded overflow-x-auto" style={{
                    backgroundColor: 'var(--vscode-input-background)',
                    borderColor: 'var(--vscode-border-color)',
                    color: 'var(--vscode-foreground)'
                  }}>
                    {JSON.stringify(selectedMemory.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default MemoryPage;
