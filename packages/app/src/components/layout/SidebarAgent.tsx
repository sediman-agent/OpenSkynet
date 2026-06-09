/**
 * VS Code-Style Sidebar Agent
 * Conversation list with exact VS Code styling
 */

import {
  Plus,
  MessageSquare,
  Edit2,
  Trash2,
  Check,
  X,
  Search,
} from 'lucide-react';
import { useState, memo, useRef, useEffect } from 'react';
import { useChatStore } from '@/stores/useChatStore';

interface ConversationItemProps {
  id: string;
  title: string;
  isActive: boolean;
  isEditing: boolean;
  editTitle: string;
  onSelect: (id: string) => void;
  onStartEdit: (id: string, title: string) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => Promise<boolean>;
  onEditTitleChange: (value: string) => void;
}

const ConversationItem = memo(function ConversationItem({
  id,
  title,
  isActive,
  isEditing,
  editTitle,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onEditTitleChange,
}: ConversationItemProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className="group flex items-center gap-2 px-3 py-1.5 text-xs transition-all duration-150 border-l-2 mx-1"
      style={{
        borderColor: isActive ? 'var(--vscode-focus-border)' : 'transparent',
        backgroundColor: isActive ? 'rgba(0, 127, 212, 0.1)' : 'transparent',
        color: 'var(--vscode-sideBar-foreground)'
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'transparent';
        }
      }}
    >
      <button
        onClick={() => onSelect(id)}
        className="flex-1 text-left flex items-center gap-2 min-w-0"
      >
        <MessageSquare size={14} />
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => onEditTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSaveEdit(id);
              if (e.key === 'Escape') onCancelEdit();
            }}
            className="flex-1 min-w-0 font-mono text-xs outline-none border"
            style={{
              backgroundColor: 'var(--vscode-input-background)',
              borderColor: 'var(--vscode-input-border)',
              color: 'var(--vscode-input-foreground)',
              borderRadius: 'var(--vscode-corner-radius)',
              padding: '2px 6px',
              minHeight: '22px'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--vscode-focus-border)';
              e.currentTarget.style.boxShadow = '0 0 0 1px var(--vscode-focus-border)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--vscode-input-border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            autoFocus
            aria-label="Edit conversation title"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate">{title}</span>
        )}
      </button>

      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition-opacity">
        {isEditing ? (
          <>
            <button
              onClick={() => onSaveEdit(id)}
              className="h-5 w-5 flex items-center justify-center rounded transition-colors"
              style={{ color: 'var(--vscode-success-foreground)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              aria-label="Save title"
            >
              <Check size={12} />
            </button>
            <button
              onClick={onCancelEdit}
              className="h-5 w-5 flex items-center justify-center rounded transition-colors"
              style={{ color: 'var(--vscode-secondary-text)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              aria-label="Cancel editing"
            >
              <X size={12} />
            </button>
          </>
        ) : confirmDelete ? (
          <>
            <button
              onClick={async () => {
                await onDelete(id);
                setConfirmDelete(false);
              }}
              className="h-5 w-5 flex items-center justify-center rounded transition-colors"
              style={{ color: 'var(--vscode-error-foreground)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              aria-label="Confirm delete"
            >
              <Check size={12} />
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="h-5 w-5 flex items-center justify-center rounded transition-colors"
              style={{ color: 'var(--vscode-secondary-text)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              aria-label="Cancel delete"
            >
              <X size={12} />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => onStartEdit(id, title)}
              className="h-5 w-5 flex items-center justify-center rounded transition-colors"
              style={{ color: 'var(--vscode-secondary-text)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              aria-label={`Rename "${title}"`}
            >
              <Edit2 size={12} />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="h-5 w-5 flex items-center justify-center rounded transition-colors"
              style={{ color: 'var(--vscode-error-foreground)' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              aria-label={`Delete "${title}"`}
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </div>
  );
});

function groupByDate(conversations: { createdAt: Date; id: string; title: string }[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const lastWeek = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: typeof conversations }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Last 7 Days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const conv of conversations) {
    const d = new Date(conv.createdAt);
    if (d >= today) groups[0].items.push(conv);
    else if (d >= yesterday) groups[1].items.push(conv);
    else if (d >= lastWeek) groups[2].items.push(conv);
    else groups[3].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

export function SidebarAgent() {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const updateConversationTitle = useChatStore((state) => state.updateConversationTitle);
  const createConversation = useChatStore((state) => state.createConversation);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showSearch && searchRef.current) {
      searchRef.current.focus();
    }
  }, [showSearch]);

  const handleStartEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditTitle(title);
  };

  const handleSaveEdit = async (id: string) => {
    if (editTitle.trim()) {
      await updateConversationTitle(id, editTitle);
    }
    setEditingId(null);
    setEditTitle('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const handleNewChat = async () => {
    await createConversation('New Chat');
    // createConversation now sets activeConversationId, no need to select again
  };

  const filtered = searchQuery
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  const grouped = groupByDate(filtered);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--vscode-secondary-text)' }}>
          Conversations
        </span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setShowSearch(!showSearch)}
            className="h-6 w-6 flex items-center justify-center rounded transition-colors"
            style={{ color: 'var(--vscode-sideBar-foreground)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            aria-label="Search conversations"
          >
            <Search size={12} />
          </button>
          <button
            onClick={handleNewChat}
            className="h-6 w-6 flex items-center justify-center rounded transition-colors"
            style={{ color: 'var(--vscode-sideBar-foreground)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            aria-label="New conversation"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {showSearch && (
        <div className="px-2 pb-1">
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full px-2 py-1 text-xs font-mono outline-none border"
            style={{
              backgroundColor: 'var(--vscode-input-background)',
              borderColor: 'var(--vscode-input-border)',
              color: 'var(--vscode-input-foreground)',
              borderRadius: 'var(--vscode-corner-radius)',
              minHeight: '26px'
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'var(--vscode-focus-border)';
              e.currentTarget.style.boxShadow = '0 0 0 1px var(--vscode-focus-border)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--vscode-input-border)';
              e.currentTarget.style.boxShadow = 'none';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchQuery('');
                setShowSearch(false);
              }
            }}
          />
        </div>
      )}

      {conversations.length === 0 ? (
        <div className="px-3 py-3 text-center">
          <p className="text-xs mb-2" style={{ color: 'var(--vscode-secondary-text)' }}>
            No conversations yet
          </p>
          <button
            onClick={handleNewChat}
            className="w-full px-3 py-1 text-xs font-mono border transition-colors"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--vscode-foreground)',
              borderColor: 'var(--vscode-border-color)',
              borderRadius: 'var(--vscode-corner-radius)',
              minHeight: '26px'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Plus size={12} className="mr-1" />
            New Chat
          </button>
        </div>
      ) : (
        <div className="overflow-y-auto" style={{ maxHeight: '224px' }}>
          <nav className="space-y-0 py-1" aria-label="Conversations">
            {grouped.map((group) => (
              <div key={group.label}>
                <div className="px-3 pt-2 pb-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--vscode-secondary-text)' }}>
                    {group.label}
                  </span>
                </div>
                {group.items.map((conversation) => (
                  <ConversationItem
                    key={conversation.id}
                    id={conversation.id}
                    title={conversation.title}
                    isActive={activeConversationId === conversation.id}
                    isEditing={editingId === conversation.id}
                    editTitle={editTitle}
                    onSelect={selectConversation}
                    onStartEdit={handleStartEdit}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={handleCancelEdit}
                    onDelete={deleteConversation}
                    onEditTitleChange={setEditTitle}
                  />
                ))}
              </div>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

export default SidebarAgent;
