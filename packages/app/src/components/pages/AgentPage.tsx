/**
 * Copilot-Style AgentPage
 * Main agent UI - Minimal, professional layout matching VS Code Copilot
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRPCConnection } from '@/hooks/useRPCConnection';
import { useAppStore } from '@/stores/useAppStore';
import { useSandboxStore } from '@/stores/useSandboxStore';
import { useChatStore } from '@/stores/useChatStore';
import { getChatService } from '@/services/chatService';
import { FileUploadZone } from '@/elements/form/FileUploadZone';
import { AgentMessages } from '@/components/agent/AgentMessages';
import { AgentInput } from '@/components/agent/AgentInput';
import { FileAttachmentBar } from '@/components/agent/FileAttachmentBar';
import { StreamingExecutionDisplay } from '@/components/agent/StreamingExecutionDisplay';
import { useAgentInput } from '@/hooks/agent/useAgentInput';
import { useAgentStreaming } from '@/hooks/agent/useAgentStreaming';
import { useScrollControl } from '@/hooks/agent/useScrollControl';
import { useFileAttachments } from '@/hooks/agent/useFileAttachments';
import { useConversationManager } from '@/hooks/agent/useConversationManager';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';

// ============================================================================
// VS Code Design Tokens for Chat Layout (using CSS variables for theme support)
// ============================================================================
const LAYOUT_TOKENS = {
  headerHeight: 40,
  inputPadding: 8,
  maxWidth: 800,
} as const;

export function AgentPage() {
  // Store hooks
  const model = useAppStore((state) => state.model);
  const provider = useAppStore((state) => state.provider);
  const agentStatus = useAppStore((state) => state.agentStatus);

  // Enable connection checking
  useRPCConnection();

  // Custom hooks
  const {
    messages,
    conversationId
  } = useConversationManager();

  // Chat store for message operations
  const { addMessage, updateMessage } = useChatStore();

  const {
    scrollRef,
    messagesEndRef,
    showScrollButton,
    scrollToBottom,
    handleScroll
  } = useScrollControl();

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    input,
    setInput,
    sendError,
    triggerSend,
    handleKeyDown,
    showSlashCommands,
    filteredSlashCommands,
    selectSlashCommand
  } = useAgentInput({
    onSubmit: handleSend,
    textareaRef
  });

  const {
    isStreaming,
    streamingPhase,
    startStreaming,
    stopStreaming,
    updatePhase,
    updateAction,
    executionSteps,
    addExecutionStep,
    updateLastExecutionStep,
    clearExecutionSteps
  } = useAgentStreaming();

  const {
    attachedFiles,
    showFileUpload,
    isDragOver,
    addFile,
    removeFile,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    toggleFileUpload
  } = useFileAttachments();

  // Thinking messages expansion state
  const [expandedThinkingMessages, setExpandedThinkingMessages] = useState<Set<string>>(new Set());

  // Force connection status to true (backend is running) and sync conversations
  useEffect(() => {
    if (!agentStatus.rpcConnected) {
      fetch('http://localhost:3001/api/health')
        .then(res => {
          if (res.ok) {
            const setAgentStatus = useAppStore.getState().setAgentStatus;
            setAgentStatus({ rpcConnected: true });
          }
        })
        .catch(err => {
          console.log('Connection check failed:', err);
        });
    }
  }, [agentStatus.rpcConnected]);

  // Handle send message
  async function handleSend(inputText: string) {
    if (!inputText.trim() || isStreaming) return;

    if (!conversationId) {
      console.error('[AgentPage] No active conversation');
      return;
    }

    // Start streaming and clear previous steps
    startStreaming();
    clearExecutionSteps();

    // Add user message to conversation
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputText,
      timestamp: new Date(),
    };
    await addMessage(conversationId, userMessage);

    // Create placeholder for assistant message
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      timestamp: new Date(),
    };
    await addMessage(conversationId, assistantMessage);

    // Track accumulated content
    let accumulatedContent = '';

    const chatService = getChatService();

    // Track active tool calls
    const activeToolCalls = new Map<string, { startTime: number; action: string; detail?: string }>();

    // Run task with streaming
    await chatService.runTask(inputText, {
      onChunk: (delta, phase) => {
        if (delta) {
          accumulatedContent += delta;
          updateMessage(conversationId, assistantMessageId, {
            content: accumulatedContent
          });
        }
        if (phase) updatePhase(phase as any);
      },
      onProgress: (progress) => {
        if (progress.phase) updatePhase(progress.phase as any);

        // Handle tool call start - action might be in different fields
        const action = (progress as any).action || progress.phase;
        const detail = progress.detail || progress.message;

        if (action && action !== 'thinking' && action !== 'planning') {
          // Tool call started
          const toolId = `${action}-${Date.now()}`;
          activeToolCalls.set(toolId, {
            startTime: Date.now(),
            action: action,
            detail: detail
          });
          addExecutionStep({
            id: toolId,
            type: 'tool',
            timestamp: Date.now(),
            status: 'running',
            action: action,
            detail: detail
          });
        }
        if (detail) updateAction(progress.phase, detail);
      },
      onDone: () => {
        // Update all running tool calls to success
        activeToolCalls.forEach((_, toolId) => {
          const existing = executionSteps.find(s => s.id === toolId);
          if (existing && existing.status === 'running') {
            updateLastExecutionStep({
              status: 'success',
              duration: Date.now() - existing.timestamp
            });
          }
        });
        activeToolCalls.clear();

        // Finalize assistant message
        updateMessage(conversationId, assistantMessageId, {
          status: 'done',
          content: accumulatedContent
        });

        // Note: Tool calls will be saved to the message by the backend
        // The execution steps are cleared after a brief delay to allow UI to update
        setTimeout(() => {
          clearExecutionSteps();
        }, 100);

        stopStreaming();
      },
      onError: (error) => {
        console.error('Task error:', error);
        // Update all running tool calls to error
        activeToolCalls.forEach((_, toolId) => {
          const existing = executionSteps.find(s => s.id === toolId);
          if (existing && existing.status === 'running') {
            updateLastExecutionStep({
              status: 'error',
              error: error
            });
          }
        });
        activeToolCalls.clear();

        // Update assistant message with error
        updateMessage(conversationId, assistantMessageId, {
          status: 'error',
          content: accumulatedContent || `Error: ${error}`
        });

        stopStreaming();
      },
      onBrowserOpenRequired: (reason, task) => {
        console.log('[AgentPage] Browser open required:', reason, task);
        // Open browser panel when browser task starts
        const { togglePanel } = useSandboxStore.getState();
        const { isOpen } = useSandboxStore.getState();
        if (!isOpen) {
          togglePanel();
        }
      },
    }, {
      model,
      provider,
      conversation: messages.map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp?.toISOString()
      }))
    });
  }

  // Handle file paste
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          addFile({
            id: `${file.name}-${Date.now()}`,
            name: file.name,
            size: file.size,
            type: file.type,
            status: 'done'
          });
        }
      }
    }
  };

  // Toggle thinking expansion
  const toggleThinking = useCallback((messageId: string) => {
    setExpandedThinkingMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <div
      className={cn(
        "flex flex-col h-full font-mono text-sm",
        isStreaming && "request-in-progress"
      )}
      style={{ backgroundColor: 'var(--vscode-background)' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Connection Warning - Compact */}
      {!agentStatus.rpcConnected && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b" style={{
          backgroundColor: 'var(--vscode-input-background)',
          borderColor: 'var(--vscode-border-color)',
          color: 'var(--vscode-foreground)'
        }}>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
            <span className="font-medium">DISCONNECTED</span>
            <span style={{ color: 'var(--vscode-secondary-text)' }}>— Backend not responding</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-[11px] hover:underline transition-colors"
            style={{ color: 'var(--vscode-link-foreground)' }}
          >
            RECONNECT
          </button>
        </div>
      )}

      {/* Messages Area - Copilot Style */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-2"
        style={{ maxWidth: LAYOUT_TOKENS.maxWidth, margin: '0 auto', width: '100%' }}
        onPaste={handlePaste}
      >
        {/* Welcome Message */}
        {!hasMessages && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="mb-4" style={{ color: 'var(--vscode-secondary-text)' }}>
              <p className="text-xs">Start a conversation with the agent</p>
            </div>
          </div>
        )}

        {/* Messages List */}
        <div className="space-y-0">
          {messages.map((message, index) => (
            <AgentMessages
              key={message.id}
              messages={[message]}
              isStreaming={isStreaming && index === messages.length - 1}
              scrollRef={scrollRef}
              messagesEndRef={messagesEndRef}
              onScroll={handleScroll}
              showScrollButton={showScrollButton}
              onScrollToBottom={() => scrollToBottom(true)}
              expandedThinkingMessages={expandedThinkingMessages}
              onToggleThinking={toggleThinking}
            />
          ))}

          {/* Streaming Execution Display - VS Code Style */}
          {isStreaming && executionSteps.length > 0 && (
            <div className="px-2 pb-2">
              <StreamingExecutionDisplay
                toolCalls={executionSteps.map(step => ({
                  id: step.id,
                  action: step.action || 'Unknown',
                  detail: step.detail,
                  status: step.status,
                  timestamp: step.timestamp,
                  duration: step.duration,
                  output: step.observation,
                  error: step.error?.message
                }))}
                phase={streamingPhase}
                isStreaming={true}
              />
            </div>
          )}
        </div>

        {/* Scroll to bottom button */}
        {showScrollButton && (
          <button
            onClick={() => scrollToBottom(true)}
            className="fixed bottom-20 right-4 p-2 rounded border transition-all z-10"
            style={{
              backgroundColor: 'var(--vscode-input-background)',
              borderColor: 'var(--vscode-border-color)',
              color: 'var(--vscode-secondary-text)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--vscode-foreground)';
              e.currentTarget.style.borderColor = 'var(--vscode-secondary-text)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--vscode-secondary-text)';
              e.currentTarget.style.borderColor = 'var(--vscode-border-color)';
            }}
            title="Scroll to bottom"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 11L3 6h10l-5 5z" />
            </svg>
          </button>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* File Upload Zone */}
      {showFileUpload && (
        <FileUploadZone
          onFilesUploaded={(files) => files.forEach(file => addFile({
            id: file.id,
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            status: 'done'
          }))}
        />
      )}

      {/* File Attachments Bar - Compact */}
      {attachedFiles.length > 0 && (
        <FileAttachmentBar
          files={attachedFiles}
          onRemove={removeFile}
          isDragOver={isDragOver}
        />
      )}

      {/* Input Area - Copilot Style */}
      <div
        className="border-t"
        style={{
          borderColor: 'var(--vscode-border-color)',
          backgroundColor: 'var(--vscode-background)',
          padding: `${LAYOUT_TOKENS.inputPadding}px 0`
        }}
      >
        <div style={{ maxWidth: LAYOUT_TOKENS.maxWidth, margin: '0 auto', padding: '0 16px' }}>
          <AgentInput
            value={input}
            onChange={setInput}
            onSend={triggerSend}
            onStop={stopStreaming}
            isSending={isStreaming}
            sendError={sendError}
            disabled={!agentStatus.rpcConnected}
            placeholder={agentStatus.rpcConnected ? "Message agent..." : "Waiting for connection..."}
            showSlashCommands={showSlashCommands}
            filteredSlashCommands={filteredSlashCommands}
            onSelectSlashCommand={selectSlashCommand}
            onToggleFileUpload={toggleFileUpload}
            showFileUpload={showFileUpload}
            textareaRef={textareaRef}
            onKeyDown={handleKeyDown}
          />

          {/* Status Bar - Compact */}
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex items-center gap-2 text-[11px" style={{ color: 'var(--vscode-secondary-text)' }}>
              {agentStatus.rpcConnected ? (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span>CONNECTED</span>
                  {model && <span>• {model}</span>}
                  {provider && <span>• {provider}</span>}
                </>
              ) : (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                  <span>DISCONNECTED</span>
                </>
              )}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--vscode-secondary-text)' }}>
              {hasMessages && `${messages.length} MESSAGE${messages.length !== 1 ? 'S' : ''}`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
