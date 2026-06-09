/**
 * VS Code-Style ProjectPage
 * Project management page with threads and browser integration
 */

import { useState, useEffect, useRef } from 'react';
import { Columns, Loader2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRPCConnection } from '@/hooks/useRPCConnection';
import { useAppStore } from '@/stores/useAppStore';
import { useSandboxStore } from '@/stores/useSandboxStore';
import { getChatService } from '@/services/chatService';
import { ProjectSelector } from '@/components/project/ProjectSelector';
import { ThreadPanel } from '@/components/project/ThreadPanel';
import { VisualDiff } from '@/components/project/VisualDiff';
import { ContextWindow } from '@/components/project/ContextWindow';
import { GitStatus } from '@/components/project/GitStatus';
import { StreamingIndicator } from '@/components/agent/StreamingIndicator';
import { ProjectInput } from '@/components/project/ProjectInput';
import { useProjectManager } from '@/hooks/project/useProjectManager';
import { useProjectMessaging } from '@/hooks/project/useProjectMessaging';
import { useProjectView } from '@/hooks/project/useProjectView';
import type { ThreadMessage } from '@/types/project';

export function ProjectPage() {
  // Store hooks
  const agentStatus = useAppStore((state) => state.agentStatus);
  const model = useAppStore((state) => state.model);
  const provider = useAppStore((state) => state.provider);

  const sandboxOpen = useSandboxStore((state) => state.isOpen);
  const sandboxActive = useSandboxStore((state) => state.isActive);
  const toggleSandbox = useSandboxStore((state) => state.togglePanel);
  const setIsActive = useSandboxStore((state) => state.setIsActive);

  // Enable connection checking
  useRPCConnection();

  // Custom hooks
  const {
    activeProject,
    activeThread,
    isLoadingProjects,
    addMessage,
    updateMessage,
    createNewThread,
    switchThread
  } = useProjectManager();

  const {
    messages,
    isStreaming,
    streamingPhase,
    retryProgress,
    addMessage: addLocalMessage,
    updateMessage: updateLocalMessage,
    startStreaming,
    stopStreaming,
    updatePhase,
    updateRetryProgress
  } = useProjectMessaging(activeThread?.messages || []);

  const {
    viewMode,
    showDiff,
    contextUsed,
    contextMax,
    isStartingBrowser,
    toggleViewMode,
    toggleDiff,
    incrementContext,
    setBrowserStarting
  } = useProjectView();

  // Refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Local state
  const [input, setInput] = useState('');

  // Auto-scroll when messages change
  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Simulate context usage during streaming
  useEffect(() => {
    if (isStreaming) {
      const interval = setInterval(() => {
        incrementContext();
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isStreaming, incrementContext]);

  // Handle send message
  async function handleSend() {
    const messageText = input.trim();
    if (!messageText || !activeProject || !activeThread || isStreaming) return;

    if (!agentStatus.rpcConnected) {
      // Add user message
      const userMsg: ThreadMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: messageText,
        status: 'done',
        timestamp: new Date(),
      };
      addMessage(userMsg);
      addLocalMessage(userMsg);

      // Add error message
      const errorMsg: ThreadMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'Backend disconnected. Run: bun run backend',
        status: 'error',
        timestamp: new Date(),
      };
      addMessage(errorMsg);
      addLocalMessage(errorMsg);

      setInput('');
      return;
    }

    setInput('');

    // Add user message
    const userMsgId = crypto.randomUUID();
    const userMsg: ThreadMessage = {
      id: userMsgId,
      role: 'user',
      content: messageText,
      status: 'done',
      timestamp: new Date(),
    };
    addMessage(userMsg);
    addLocalMessage(userMsg);

    // Start streaming
    startStreaming();

    // Create assistant message placeholder
    const assistantMsgId = crypto.randomUUID();
    const assistantMsg: ThreadMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      timestamp: new Date(),
    };
    addMessage(assistantMsg);
    addLocalMessage(assistantMsg);

    try {
      const chatService = getChatService();

      // TODO: Implement project-specific streaming
      console.log('[ProjectPage] Sending message to project:', messageText);

      setInput('');
      stopStreaming();
    } catch (error) {
      updateLocalMessage(assistantMsgId, {
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        status: 'error',
      });
      stopStreaming();
    }
  }

  // Handle keyboard events
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Handle start browser
  async function handleStartBrowser() {
    if (!activeProject) return;
    setBrowserStarting(true);

    try {
      const response = await fetch('http://localhost:3001/api/browser/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: activeProject.id })
      });

      if (response.ok) {
        toggleSandbox();
        setIsActive(true);
      }
    } catch (error) {
      console.error('Failed to start browser:', error);
    } finally {
      setBrowserStarting(false);
    }
  }

  // Calculate context percentage
  const contextPercent = (contextUsed / contextMax) * 100;
  const changedFiles = activeProject?.files.filter(f => f.status !== 'deleted') || [];
  const hasMessages = messages.length > 0;
  const browserActive = sandboxOpen && sandboxActive;

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center" style={{ backgroundColor: 'var(--vscode-background)' }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" style={{ color: 'var(--vscode-secondary-text)' }} />
          <p style={{ color: 'var(--vscode-secondary-text)' }}>Loading project...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--vscode-background)' }}>
      {/* Header */}
      <div className="border-b px-4 py-3" style={{
        borderColor: 'var(--vscode-border-color)',
        backgroundColor: 'var(--vscode-background)'
      }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Project selector */}
            <ProjectSelector
              onProjectCreated={(project) => console.log('Project created:', project)}
            />

            {/* View mode toggle */}
            <button
              onClick={() => toggleViewMode()}
              className="p-2 rounded-lg transition-colors"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              title="Toggle view mode"
            >
              <Columns className="w-4 h-4" style={{ color: 'var(--vscode-foreground)' }} />
            </button>

            {/* New thread button */}
            <button
              onClick={() => createNewThread('New Thread')}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors text-sm"
              style={{ backgroundColor: 'transparent' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            >
              <Plus className="w-3.5 h-3.5" style={{ color: 'var(--vscode-foreground)' }} />
              <span style={{ color: 'var(--vscode-foreground)' }}>New Thread</span>
            </button>
          </div>

          {/* Context window & Git status */}
          <div className="flex items-center gap-4">
            <ContextWindow
              used={contextUsed}
              max={contextMax}
            />
            <GitStatus />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Thread panel */}
        <ThreadPanel />

        {/* Diff panel */}
        {showDiff && viewMode === 'split' && changedFiles.length > 0 && (
          <div className="w-96 border-l overflow-hidden" style={{ borderColor: 'var(--vscode-border-color)' }}>
            <VisualDiff
              files={changedFiles}
              onClose={() => toggleDiff()}
            />
          </div>
        )}

        {/* Full diff view */}
        {viewMode === 'diff' && (
          <div className="flex-1">
            <VisualDiff
              files={changedFiles}
              onClose={() => toggleDiff()}
            />
          </div>
        )}
      </div>

      {/* Streaming indicator */}
      {isStreaming && (
        <StreamingIndicator
          phase={streamingPhase}
          retryProgress={retryProgress}
        />
      )}

      {/* Input area */}
      <ProjectInput
        value={input}
        onChange={setInput}
        onSend={handleSend}
        onStartBrowser={handleStartBrowser}
        onToggleBrowser={toggleSandbox}
        disabled={!agentStatus.rpcConnected}
        isStreaming={isStreaming}
        browserActive={browserActive}
        projectName={activeProject.name}
        textareaRef={textareaRef}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
