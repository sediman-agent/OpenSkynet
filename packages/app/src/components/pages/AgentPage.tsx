/**
 * VS Code-Style AgentPage - Industrial Grade
 * Main agent UI with professional layout, spacing, and visual hierarchy
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRPCConnection } from '@/hooks/useRPCConnection';
import { useAppStore } from '@/stores/useAppStore';
import { useChatStore } from '@/stores/useChatStore';
import { useSandboxStore } from '@/stores/useSandboxStore';
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
import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Message } from '@/types';

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
  const { addMessage, updateMessage, addToolCall, updateToolCall } = useChatStore();

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
    scrollRef,
    messagesEndRef,
    showScrollButton,
    scrollToBottom
  } = useScrollControl({ messages, isStreaming });

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

  // Track active tool calls
  const activeToolCalls = useRef(new Map<string, { startTime: number; action: string; detail?: string }>()).current;

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

    console.log('[AgentPage] handleSend called with:', inputText);
    console.log('[AgentPage] Current conversationId:', conversationId);

    if (!conversationId) {
      console.error('[AgentPage] No active conversation');
      return;
    }

    // Start streaming and clear previous steps
    console.log('[AgentPage] Starting streaming...');
    startStreaming();
    clearExecutionSteps();

    // Add user message to conversation and get server-assigned ID
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputText,
      timestamp: new Date(),
    };
    const serverUserMessage = await addMessage(conversationId, userMessage);

    // Create placeholder for assistant message and get server-assigned ID
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      status: 'streaming',
      timestamp: new Date(),
    };
    const serverAssistantMessage = await addMessage(conversationId, assistantMessage);

    // Use server-assigned IDs for updates
    const actualAssistantId = serverAssistantMessage.id;

    // Track accumulated content
    let accumulatedContent = '';

    const chatService = getChatService();

    // Run task with streaming
    await chatService.runTask(inputText, {
      onChunk: (delta, phase) => {
        console.log('[AgentPage] onChunk called:', { delta, phase });
        // Update streaming phase - cast phase to StreamingPhase if valid
        if (phase && phase !== streamingPhase) {
          const validPhases: (typeof phase)[] = ['thinking', 'planning', 'executing', 'reflecting', 'retrying', 'responding'];
          if (validPhases.includes(phase as any)) {
            updatePhase(phase as any);
          }
        }

        // Show content during all phases so user can see real-time response
        // This improves UX by showing the agent's thinking process as it happens
        if (delta) {
          accumulatedContent += delta;
          console.log('[AgentPage] Updating message with content length:', accumulatedContent.length);
          updateMessage(conversationId, actualAssistantId, {
            content: accumulatedContent
          });
        }
      },
      onProgress: (progress) => {
        console.log('[AgentPage] onProgress called:', progress);
        // Update streaming phase from progress if available
        if (progress.phase && progress.phase !== streamingPhase) {
          const validPhases: string[] = ['thinking', 'planning', 'executing', 'reflecting', 'retrying', 'responding'];
          if (validPhases.includes(progress.phase)) {
            updatePhase(progress.phase as any);
          }
        }

        // Create execution step from tool call information
        if (progress.action && progress.phase === 'executing') {
          const stepId = crypto.randomUUID();
          const startTime = Date.now();

          // Add to active tool calls tracker
          activeToolCalls.set(stepId, {
            startTime,
            action: progress.action,
            detail: progress.detail
          });

          // Add execution step for streaming display
          addExecutionStep({
            id: stepId,
            type: 'tool',
            timestamp: startTime,
            action: progress.action,
            detail: progress.detail || '',
            status: 'running'
          });

          // If this is completing a step (has observation), update it and add to message
          if (progress.observation !== undefined) {
            updateLastExecutionStep({
              status: progress.success ? 'success' : 'error',
              observation: progress.observation,
              duration: Date.now() - startTime
            });

            // Add tool call to message for persistence
            addToolCall(conversationId, actualAssistantId, {
              id: stepId,
              action: progress.action,
              detail: progress.detail,
              observation: progress.observation,
              status: progress.success ? 'success' : 'error',
              startedAt: startTime,
              completedAt: Date.now()
            });

            activeToolCalls.delete(stepId);
          }
        } else if (progress.observation !== undefined && progress.action) {
          // Handle step completion that comes separately
          const stepId = crypto.randomUUID();
          const startTime = activeToolCalls.values().next().value?.startTime || Date.now();

          updateLastExecutionStep({
            status: progress.success ? 'success' : 'error',
            observation: progress.observation,
            duration: Date.now() - startTime
          });

          // Add tool call to message for persistence
          addToolCall(conversationId, actualAssistantId, {
            id: stepId,
            action: progress.action,
            detail: progress.detail,
            observation: progress.observation,
            status: progress.success ? 'success' : 'error',
            startedAt: startTime,
            completedAt: Date.now()
          });
        }
      },
      onDone: () => {
        console.log('[AgentPage] onDone called, accumulatedContent length:', accumulatedContent.length);
        // Finalize assistant message
        updateMessage(conversationId, actualAssistantId, {
          status: 'done',
          content: accumulatedContent
        });

        setTimeout(() => {
          clearExecutionSteps();
        }, 100);

        stopStreaming();
      },
      onError: (error) => {
        console.error('Task error:', error);
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

        updateMessage(conversationId, actualAssistantId, {
          status: 'error',
          content: accumulatedContent || `Error: ${error}`
        });

        stopStreaming();
      },
      onBrowserOpenRequired: (reason, task) => {
        console.log('[AgentPage] Browser open required:', reason, task);
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

    setInput('');
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
    <div className="flex flex-col h-full" style={{ fontFamily: 'var(--font-system)' }}>
      {/* Connection Warning - Professional */}
      {!agentStatus.rpcConnected && (
        <div className="flex items-center justify-between px-4 py-2 border-b" style={{
          backgroundColor: 'var(--vscode-input-background)',
          borderColor: 'var(--vscode-border-color)',
          color: 'var(--vscode-foreground)'
        }}>
          <div className="flex items-center gap-2" style={{ fontSize: '12px' }}>
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--vscode-warning-foreground)' }} />
            <span style={{ fontWeight: 500 }}>DISCONNECTED</span>
            <span style={{ color: 'var(--vscode-secondary-text)', opacity: 0.7 }}>— Backend not responding</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="text-xs font-medium transition-colors px-2 py-1 rounded"
            style={{
              color: 'var(--vscode-link-foreground)',
              border: 'none',
              backgroundColor: 'transparent'
            }}
            onMouseEnter={(e) => e.currentTarget.style.textDecoration = 'underline'}
            onMouseLeave={(e) => e.currentTarget.style.textDecoration = 'none'}
          >
            RECONNECT
          </button>
        </div>
      )}

      {/* Messages Area - Professional Layout */}
      <div
        className="flex-1 overflow-hidden"
        onPaste={handlePaste}
        style={{
          maxWidth: 900,
          margin: '0 auto',
          width: '100%',
          padding: '0 20px'
        }}
      >
        {/* Welcome Message - Empty State */}
        {!hasMessages && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center" style={{ padding: '48px 16px' }}>
            <div style={{ color: 'var(--vscode-secondary-text)' }}>
              <p style={{ fontSize: '13px', marginBottom: '8px' }}>Start a conversation with the agent</p>
              <p style={{ fontSize: '11px', opacity: 0.7 }}>
                Type your message below or use slash commands for quick actions
              </p>
            </div>
          </div>
        )}

        {/* Messages List - Better Spacing */}
        <div className="space-y-1">
          <AgentMessages
            messages={messages}
            isStreaming={isStreaming}
            scrollRef={scrollRef}
            messagesEndRef={messagesEndRef}
            showScrollButton={showScrollButton}
            onScrollToBottom={() => scrollToBottom(true)}
            expandedThinkingMessages={expandedThinkingMessages}
            onToggleThinking={toggleThinking}
          />

          {/* Streaming Execution Display - Integrated */}
          {isStreaming && executionSteps.length > 0 && (
            <div className="mx-1 mb-2">
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

        {/* Scroll to bottom button - Professional */}
        {showScrollButton && (
          <button
            onClick={() => scrollToBottom(true)}
            className="fixed bottom-24 right-6 p-2 rounded transition-all z-10 shadow-sm"
            style={{
              backgroundColor: 'var(--vscode-button-secondary-background)',
              borderColor: 'var(--vscode-border-color)',
              color: 'var(--vscode-button-secondary-foreground)',
              border: '1px solid'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--vscode-button-secondaryHoverBackground)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--vscode-button-secondary-background)';
            }}
            title="Scroll to bottom"
          >
            <ArrowDown size={16} />
          </button>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* File Upload Zone */}
      {showFileUpload && (
        <div className="border-t" style={{ borderColor: 'var(--vscode-border-color)' }}>
          <FileUploadZone
            onFilesUploaded={(files) => files.forEach(file => addFile({
              id: file.id,
              name: file.name,
              size: file.size,
              type: file.type || 'application/octet-stream',
              status: 'done'
            }))}
          />
        </div>
      )}

      {/* File Attachments Bar - Professional */}
      {attachedFiles.length > 0 && (
        <div className="border-t" style={{ borderColor: 'var(--vscode-border-color)' }}>
          <FileAttachmentBar
            files={attachedFiles}
            onRemove={removeFile}
            isDragOver={isDragOver}
          />
        </div>
      )}

      {/* Input Area - Professional */}
      <div
        className="border-t"
        style={{
          borderColor: 'var(--vscode-border-color)',
          backgroundColor: 'var(--vscode-background)',
          padding: '12px 0'
        }}
      >
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px' }}>
          <AgentInput
            value={input}
            onChange={setInput}
            onSend={triggerSend}
            onStop={stopStreaming}
            isSending={isStreaming}
            sendError={sendError}
            placeholder="Ask anything..."
            showSlashCommands={showSlashCommands}
            filteredSlashCommands={filteredSlashCommands}
            onSelectSlashCommand={selectSlashCommand}
            onToggleFileUpload={toggleFileUpload}
            textareaRef={textareaRef}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>
    </div>
  );
}

export default AgentPage;
