// RPC client types

export interface RPCRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface RPCResponse<T = unknown> {
  jsonrpc: '2.0';
  id: string | number;
  result?: T;
  error?: RPCError;
}

export interface RPCError {
  code: number;
  message: string;
  data?: unknown;
}

export interface RPCNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export type RPCMethod =
  | 'agent.run'
  | 'agent.chat'
  | 'agent.stream'
  | 'agent.stop'
  | 'skill.list'
  | 'skill.install'
  | 'skill.uninstall'
  | 'browser.start'
  | 'browser.stop'
  | 'browser.screenshot'
  | 'status.get';

export interface StreamEvent {
  type: 'chunk' | 'done' | 'error';
  data: {
    delta?: string;
    finished?: boolean;
    error?: string;
    usage?: TokenUsage;
  };
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}
