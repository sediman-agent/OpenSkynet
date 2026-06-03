// Chat-specific types

export interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  isStreaming: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: MessageStatus;
  metadata?: MessageMetadata;
}

export type MessageStatus = 'idle' | 'sending' | 'streaming' | 'done' | 'error';

export interface MessageMetadata {
  model?: string;
  tokens?: number;
  duration?: number;
}

export interface MessageChunk {
  delta: string;
  finished: boolean;
  error?: string;
  usage?: TokenUsage;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface StreamingState {
  isStreaming: boolean;
  currentMessage: string;
  buffer: string;
}
