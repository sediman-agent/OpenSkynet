import { getRPCClient } from './rpcClient';

export interface ChatStreamOptions {
  onChunk: (delta: string, phase?: string) => void;
  onProgress?: (progress: { phase: string; message: string; detail?: string }) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
}

class ChatService {
  private rpc = getRPCClient();

  async sendMessage(
    conversationId: string,
    content: string,
    options: ChatStreamOptions
  ): Promise<void> {
    try {
      await this.rpc.stream(
        'agent.chat',
        options.onChunk,
        { conversationId, content },
        options.onDone,
        options.onError
      );
    } catch (error) {
      options.onError?.(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async runTask(
    task: string,
    options: ChatStreamOptions
  ): Promise<void> {
    try {
      await this.rpc.stream(
        'agent.run',
        options.onChunk,
        { task },
        options.onDone,
        options.onError
      );
    } catch (error) {
      options.onError?.(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async stopCurrentTask(): Promise<void> {
    await this.rpc.call('agent.stop');
  }

  async getAgentStatus(): Promise<{
    state: 'idle' | 'running' | 'error';
    currentTask?: string;
  }> {
    return await this.rpc.call('status.get');
  }
}

// Singleton instance
let chatService: ChatService | null = null;

export function getChatService(): ChatService {
  if (!chatService) {
    chatService = new ChatService();
  }
  return chatService;
}

export default ChatService;
