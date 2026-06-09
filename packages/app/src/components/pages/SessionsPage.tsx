/**
 * VS Code-Style SessionsPage
 * Session management with VS Code design system
 */

import { useState, useEffect } from 'react';
import { History, Trash2, Plus, MessageSquare, Search, Clock } from 'lucide-react';
import { useChatStore } from '@/stores/useChatStore';
import { toast } from 'sonner';

interface Session {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  lastMessage?: string;
  status: 'active' | 'archived';
}

export function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');

  const conversations = useChatStore((state) => state.conversations);
  const createConversation = useChatStore((state) => state.createConversation);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const activeConversationId = useChatStore((state) => state.activeConversationId);

  useEffect(() => {
    loadSessions();
  }, [conversations, activeConversationId]);

  const loadSessions = () => {
    const sessionData: Session[] = conversations.map(conv => ({
      id: conv.id,
      title: conv.title || 'Untitled',
      createdAt: conv.createdAt instanceof Date ? conv.createdAt.toISOString() : conv.createdAt,
      updatedAt: conv.updatedAt instanceof Date ? conv.updatedAt.toISOString() : conv.updatedAt,
      messageCount: conv.messages.length,
      lastMessage: conv.messages[conv.messages.length - 1]?.content || '',
      status: conv.id === activeConversationId ? 'active' : 'archived'
    }));
    setSessions(sessionData);
  };

  const handleCreateSession = () => {
    createConversation('New Session').then(newConv => {
      selectConversation(newConv.id);
      toast.success('Session created');
    });
  };

  const handleSelectSession = (sessionId: string) => {
    selectConversation(sessionId);
    toast.success('Session selected');
  };

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleDeleteSession = async (sessionId: string) => {
    if (confirmDeleteId !== sessionId) {
      setConfirmDeleteId(sessionId);
      setTimeout(() => setConfirmDeleteId(null), 3000);
      return;
    }
    setConfirmDeleteId(null);

    try {
      console.log('[SessionsPage] Deleting session:', sessionId);
      const success = await deleteConversation(sessionId);
      console.log('[SessionsPage] Delete result:', success);
      if (success) {
        toast.success('Session deleted');
        // Force reload of sessions list
        loadSessions();
      } else {
        toast.error('Failed to delete session');
      }
    } catch (error) {
      console.error('Delete session error:', error);
      toast.error('Failed to delete session');
    }
  };

  const filteredSessions = sessions.filter(session => {
    const matchesSearch = session.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         (session.lastMessage && session.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesFilter = filter === 'all' || session.status === filter;
    return matchesSearch && matchesFilter;
  });

  const activeCount = sessions.filter(s => s.status === 'active').length;
  const archivedCount = sessions.filter(s => s.status === 'archived').length;

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--vscode-background)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{
        borderColor: 'var(--vscode-border-color)',
        backgroundColor: 'var(--vscode-background)',
        color: 'var(--vscode-foreground)',
        minHeight: '40px'
      }}>
        <History size={18} style={{ color: 'var(--vscode-secondary-text)' }} />
        <div className="flex-1">
          <h1 className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>Sessions</h1>
          <p className="text-xs" style={{ color: 'var(--vscode-secondary-text)' }}>
            {activeCount} active, {archivedCount} archived
          </p>
        </div>
        <button
          onClick={handleCreateSession}
          className="px-3 py-1 text-xs font-mono uppercase tracking-wider transition-colors flex items-center gap-1"
          style={{
            backgroundColor: 'var(--vscode-button-primary-background)',
            color: 'var(--vscode-button-primary-foreground)',
            border: '1px solid transparent',
            borderRadius: 'var(--vscode-corner-radius)',
            minHeight: '26px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--vscode-button-primary-hover-background)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--vscode-button-primary-background)';
          }}
        >
          <Plus size={12} />
          New Session
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="px-4 py-2 flex items-center gap-2 border-b" style={{ borderColor: 'var(--vscode-border-color)' }}>
        <button
          onClick={() => setFilter('all')}
          className="px-3 py-1 text-xs font-mono uppercase transition-colors"
          style={{
            color: filter === 'all' ? 'var(--vscode-foreground)' : 'var(--vscode-secondary-text)',
            borderBottom: filter === 'all' ? '1px solid var(--vscode-focus-border)' : '1px solid transparent'
          }}
        >
          All ({sessions.length})
        </button>
        <button
          onClick={() => setFilter('active')}
          className="px-3 py-1 text-xs font-mono uppercase transition-colors"
          style={{
            color: filter === 'active' ? 'var(--vscode-foreground)' : 'var(--vscode-secondary-text)',
            borderBottom: filter === 'active' ? '1px solid var(--vscode-focus-border)' : '1px solid transparent'
          }}
        >
          Active ({activeCount})
        </button>
        <button
          onClick={() => setFilter('archived')}
          className="px-3 py-1 text-xs font-mono uppercase transition-colors"
          style={{
            color: filter === 'archived' ? 'var(--vscode-foreground)' : 'var(--vscode-secondary-text)',
            borderBottom: filter === 'archived' ? '1px solid var(--vscode-focus-border)' : '1px solid transparent'
          }}
        >
          Archived ({archivedCount})
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
            placeholder="Search sessions..."
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
        <div className="p-4 space-y-2">
          {filteredSessions.map((session) => (
            <div
              key={session.id}
              className="px-3 py-2 border cursor-pointer transition-colors group"
              style={{
                borderColor: 'var(--vscode-border-color)',
                backgroundColor: 'var(--vscode-panel-background)'
              }}
              onClick={() => handleSelectSession(session.id)}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--vscode-focus-border)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--vscode-border-color)';
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <MessageSquare size={14} style={{ color: 'var(--vscode-secondary-text)' }} />
                    <h3 className="text-sm font-medium" style={{ color: 'var(--vscode-foreground)' }}>
                      {session.title}
                    </h3>
                    <span className="text-[10px] px-2 py-0.5 rounded" style={{
                      backgroundColor: session.status === 'active' ? 'var(--vscode-success-foreground)' : 'var(--vscode-badge-background)',
                      color: session.status === 'active' ? 'white' : 'var(--vscode-badge-foreground)'
                    }}>
                      {session.status}
                    </span>
                  </div>
                  {session.lastMessage && (
                    <p className="text-xs line-clamp-2" style={{ color: 'var(--vscode-secondary-text)' }}>
                      {session.lastMessage}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={12} style={{ color: 'var(--vscode-secondary-text)' }} />
                  <span className="text-[10px]" style={{ color: 'var(--vscode-secondary-text)' }}>
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </span>
                  <button
                    className="p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                    style={{ color: 'var(--vscode-secondary-text)' }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--vscode-error-foreground)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = 'var(--vscode-secondary-text)';
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(session.id);
                    }}
                  >
                    {confirmDeleteId === session.id ? (
                      <span className="text-[10px] uppercase mr-1">Confirm?</span>
                    ) : (
                      <Trash2 size={12} />
                    )}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2 text-[10px]" style={{ color: 'var(--vscode-secondary-text)' }}>
                <span>{session.messageCount} messages</span>
                {session.status === 'archived' && (
                  <>
                    <span>•</span>
                    <span>Archived</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SessionsPage;
