// Global type definitions for Sediman Desktop

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: MessageStatus;
}

export type MessageStatus = 'idle' | 'sending' | 'streaming' | 'done' | 'error';

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  createdAt: Date;
  completedAt?: Date;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  installed: boolean;
  tags: string[];
}

export interface AgentStatus {
  state: 'idle' | 'running' | 'error';
  currentTask?: string;
  rpcConnected: boolean;
  browserConnected: boolean;
}

export interface AppSettings {
  rpcUrl: string;
  autoConnect: boolean;
  theme: 'dark' | 'light';
  model?: string;
  provider?: 'openai' | 'ollama';
  headless?: boolean;
  stealth?: boolean;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: Date;
}

export interface LogEntry {
  id: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
  timestamp: Date;
  source?: string;
}
