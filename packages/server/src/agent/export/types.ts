/**
 * Conversation Export Types
 * Shared types for conversation export functionality
 */

export interface ConversationExportFormat {
  json: boolean;
  markdown: boolean;
  txt: boolean;
}

export interface ConversationData {
  sessionId: string;
  task: string;
  conversation: Array<{ role: string; content: string | any[] }>;
  result: string;
  success: boolean;
  iterations: number;
  strategyUsed: string;
  elapsedSecs: number;
  actionsTaken: string[];
  metadata?: Record<string, unknown>;
}

export interface ExportedConversationInfo {
  filename: string;
  sessionId: string;
  timestamp: string;
  format: string;
}

export interface ExportOptions {
  formats?: ConversationExportFormat;
  timestamp?: string;
  sessionId?: string;
}

export interface ExportResult {
  files: string[];
  sessionId: string;
  timestamp: string;
}

export interface ConversationStats {
  totalConversations: number;
  byFormat: Record<string, number>;
  totalSize: number;
}
