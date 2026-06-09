/**
 * Central Type Definitions for API
 * Shared types for all API communications
 */

// ============================================================================
// Response Types
// ============================================================================

export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  success: boolean;
}

export interface ApiError {
  error: string;
  code?: string;
  details?: any;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ============================================================================
// Common Request Types
// ============================================================================

export interface IdRequest {
  id: string;
}

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Agent API Types
// ============================================================================

export interface AgentRunRequest {
  task: string;
  model?: string;
  provider?: string;
  mode?: 'manager' | 'browser' | 'auto';
  conversation?: ConversationMessage[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface AgentStatus {
  state: 'idle' | 'running' | 'error';
  currentTask?: string;
  rpcConnected: boolean;
  browserConnected: boolean;
}

// ============================================================================
// Streaming Types
// ============================================================================

export type StreamEventType =
  | 'chunk'
  | 'progress'
  | 'done'
  | 'error'
  | 'intervention'
  | 'browser_open_required'
  | 'step_start'
  | 'step_complete'
  | 'thinking';

export interface StreamEvent {
  type: StreamEventType;
  data: any;
}

export interface ChunkData {
  delta: string;
  phase?: string;
}

export interface ProgressData {
  phase: string;
  message: string;
  detail?: string;
}

export interface StepStartData {
  phase: string;
  action: string;
  detail?: string;
}

export interface StepCompleteData {
  phase: string;
  action: string;
  output: any;
  success: boolean;
}

// ============================================================================
// Tool/Execution Types
// ============================================================================

export interface ToolCall {
  id: string;
  action: string;
  detail?: string;
  observation?: string;
  error?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  timestamp: number;
  duration?: number;
}

export interface ExecutionStep {
  id: string;
  type: 'thinking' | 'tool' | 'response' | 'planning' | 'executing' | 'reflecting' | 'retrying' | 'responding';
  timestamp: number;
  duration?: number;
  status: 'pending' | 'running' | 'success' | 'error';
  action?: string;
  detail?: string;
  observation?: string;
  error?: {
    message: string;
    code?: string;
    suggestion?: string;
    retryable?: boolean;
  };
}

// ============================================================================
// Conversation Types
// ============================================================================

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: 'pending' | 'streaming' | 'done' | 'error';
  timestamp: string;
  thinking?: ThinkingBlock[];
  toolCalls?: ToolCallRecord[];
}

export interface ThinkingBlock {
  content: string;
  label?: string;
}

export interface ToolCallRecord {
  id: string;
  action: string;
  detail?: string;
  observation?: string;
  error?: string;
  status: 'pending' | 'running' | 'success' | 'error';
  startedAt: number;
  completedAt?: number;
}

// ============================================================================
// Skill Types
// ============================================================================

export interface Skill {
  id: string;
  name: string;
  description: string;
  version?: string;
  category?: string;
  source?: string;
  installed: boolean;
  code?: string;
  metadata?: Record<string, any>;
}

export interface SkillRecording {
  id: string;
  name: string;
  startedAt: string;
  frameCount: number;
  status: 'active' | 'stopped' | 'error';
}

// ============================================================================
// Model/Provider Types
// ============================================================================

export interface ModelProvider {
  id: string;
  name: string;
  type: 'openai' | 'anthropic' | 'ollama' | 'local' | 'custom';
  baseUrl?: string;
  apiKey?: string;
  models: Model[];
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  context: number;
  maxTokens?: number;
}

export interface ProviderConfig {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  options?: Record<string, any>;
}
