// ── Enums (const objects + string literal unions) ──

export const MemoryTarget = {
  memory: "memory",
  user: "user",
} as const;
export type MemoryTarget = (typeof MemoryTarget)[keyof typeof MemoryTarget];

export const MemoryType = {
  fact: "fact",
  procedure: "procedure",
  episodic: "episodic",
  preference: "preference",
} as const;
export type MemoryType = (typeof MemoryType)[keyof typeof MemoryType];

// ── Core types ──

export interface StepEvent {
  phase: string;
  action: string;
  detail?: string;
  observation?: string;
  url?: string;
  screenshot?: string;
}

export interface AgentResult {
  task: string;
  result: string;
  success: boolean;
  steps: StepEvent[];
  skill_created?: string;
  scheduled_job_id?: string;
  schedule_cron?: string;
  actions_taken: string[];
  iterations: number;
  strategy_used: string;
  elapsed_secs: number;
}

export interface ToolCall {
  id: string;
  name?: string;
  arguments?: Record<string, unknown>;
  // OpenAI-compatible format
  type?: string;
  function?: {
    name: string;
    arguments: string;
  };
}

export interface LLMResponse {
  text: string | null;
  tool_calls: ToolCall[];
  done: boolean;
  // Raw message from LLM provider to preserve all fields (e.g., reasoning_details for MiniMax)
  raw?: Record<string, any>;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; [key: string]: any }>;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string; // For tool result messages
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  toolset?: string;
}

export interface MemoryEntry {
  id?: string;
  content: string;
  target: MemoryTarget;
  type: MemoryType;
  source?: string;
  created_at?: string;
  updated_at?: string;
  score?: number;
}

export interface SkillData {
  name: string;
  description: string;
  steps: string[];
  category?: string;
  version: number;
  variables?: string[];
  when_to_use?: string;
  pitfalls?: string[];
  verification?: string;
}

export interface CronJob {
  id: string;
  task: string;
  cron_expr: string;
  skill_name?: string;
  enabled: boolean;
  last_run?: string;
  next_run?: string;
}

export interface SessionInfo {
  id: string;
  task: string;
  created_at: string;
  result?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  userDataDir: string;
  headless: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectConversation {
  id: string;
  projectId: string;
  task: string;
  stepsJson: string;
  result?: string;
  agentMode: string;
  createdAt: string;
}

export interface ProjectConfig {
  name: string;
  description?: string;
  headless?: boolean;
}

export interface SkillSearchResult {
  name: string;
  description: string;
  score: number;
  category?: string;
  source?: string;
}

export interface ProviderInfo {
  name: string;
  default_model: string;
  default_base_url?: string;
  category: string;
  needs_api_key: boolean;
  has_key: boolean;
  auto_detect: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

// ── RPC types ──

export interface RPCRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params: Record<string, unknown>;
}

export interface RPCResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface RPCNotification {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
}
