import { useState } from 'react';
import { Plus, MessageSquare, Edit2, Trash2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores/useChatStore';
import { Button } from '@/components/shared/Button';
import { ScrollArea } from '@/components/shared/ScrollArea';

export function SidebarAgent() {
  const conversations = useChatStore((state) => state.conversations);
  const activeConversationId = useChatStore((state) => state.activeConversationId);
  const createConversation = useChatStore((state) => state.createConversation);
  const selectConversation = useChatStore((state) => state.selectConversation);
  const deleteConversation = useChatStore((state) => state.deleteConversation);
  const updateConversationTitle = useChatStore((state) => state.updateConversationTitle);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const handleNewChat = () => {
    const conversation = createConversation('New Chat');
    selectConversation(conversation.id);
  };

  const handleStartEdit = (id: string, title: string) => {
    setEditingId(id);
    setEditTitle(title);
  };

  const handleSaveEdit = (id: string) => {
    if (editTitle.trim()) {
      updateConversationTitle(id, editTitle);
    }
    setEditingId(null);
    setEditTitle('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
  };

  return (
    <div className="px-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-muted-foreground px-3">
          Agent History
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={handleNewChat}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      <ScrollArea className="h-64">
        <nav className="space-y-1">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={cn(
                'group flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                activeConversationId === conversation.id
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              )}
            >
              <button
                onClick={() => selectConversation(conversation.id)}
                className="flex-1 text-left flex items-center gap-2"
              >
                <MessageSquare className="h-4 w-4 shrink-0" />
                {editingId === conversation.id ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(conversation.id);
                      if (e.key === 'Escape') handleCancelEdit();
                    }}
                    className="flex-1 bg-background border border-input rounded px-1 py-0.5 text-xs"
                    autoFocus
                  />
                ) : (
                  <span className="truncate">{conversation.title}</span>
                )}
              </button>

              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                {editingId === conversation.id ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() => handleSaveEdit(conversation.id)}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={handleCancelEdit}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={() =>
                        handleStartEdit(conversation.id, conversation.title)
                      }
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 text-destructive"
                      onClick={() => deleteConversation(conversation.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </nav>
      </ScrollArea>
    </div>
  );
}
