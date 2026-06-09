/**
 * Service for managing conversations and messages
 * Handles CRUD operations for the app-wide conversation system
 */

import { randomUUID } from "node:crypto";
import { getDb } from "../../store/db";
import logger from "../../core/logging";

export interface ConversationDb {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface MessageDb {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  status: string;
  timestamp: string;
  metadata_json: string;
  thinking: string | null;
}

export interface ToolCallDb {
  id: string;
  message_id: string;
  action: string;
  detail: string | null;
  observation: string | null;
  status: string;
  started_at: number;
  completed_at: number | null;
}

export interface MessageWithToolCalls extends MessageDb {
  tool_calls?: ToolCallDb[];
}

export interface ConversationWithMessages extends ConversationDb {
  messages: MessageWithToolCalls[];
}

/**
 * Create a new conversation
 */
export function createConversation(title: string = 'New Chat'): ConversationDb {
  const db = getDb();
  const id = randomUUID();

  db.run(
    "INSERT INTO conversations (id, title) VALUES (?, ?)",
    [id, title]
  );

  logger.info({ conversationId: id, title }, "conversation_created");

  const row = db.query("SELECT * FROM conversations WHERE id = ?").get(id) as any;
  return row;
}

/**
 * Get all conversations
 */
export function getConversations(limit: number = 50): ConversationDb[] {
  const db = getDb();
  const rows = db.query(
    "SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?"
  ).all(limit) as any[];

  return rows;
}

/**
 * Get a conversation by ID with all messages
 */
export function getConversation(id: string): ConversationWithMessages | null {
  const db = getDb();

  console.log('[ConversationService] Getting conversation:', id);

  const conversationRow = db.query("SELECT * FROM conversations WHERE id = ?").get(id) as any;
  if (!conversationRow) {
    console.log('[ConversationService] Conversation not found:', id);
    return null;
  }

  const messageRows = db.query(
    "SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC"
  ).all(id) as any[];

  console.log('[ConversationService] Found messages:', messageRows.length, 'for conversation:', id);

  // Get tool calls for each message
  const messagesWithToolCalls = messageRows.map((msg) => {
    const toolCallRows = db.query(
      "SELECT * FROM tool_calls WHERE message_id = ?"
    ).all(msg.id) as any[];

    return {
      ...msg,
      tool_calls: toolCallRows.length > 0 ? toolCallRows : undefined,
    };
  });

  console.log('[ConversationService] Returning conversation with messages:', messagesWithToolCalls.length);

  return {
    ...conversationRow,
    messages: messagesWithToolCalls,
  };
}

/**
 * Update conversation title
 */
export function updateConversationTitle(id: string, title: string): boolean {
  const db = getDb();
  const result = db.run(
    "UPDATE conversations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [title, id]
  );

  if (result.changes > 0) {
    logger.info({ conversationId: id, title }, "conversation_title_updated");
    return true;
  }
  return false;
}

/**
 * Delete a conversation
 */
export function deleteConversation(id: string): boolean {
  const db = getDb();
  const result = db.run("DELETE FROM conversations WHERE id = ?", [id]);

  if (result.changes > 0) {
    logger.info({ conversationId: id }, "conversation_deleted");
    return true;
  }
  return false;
}

/**
 * Add a message to a conversation
 */
export function addMessage(
  conversationId: string,
  message: {
    role: string;
    content: string;
    status?: string;
    metadata?: Record<string, unknown>;
    thinking?: string;
  }
): MessageDb {
  const db = getDb();
  const id = randomUUID();
  const metadataJson = JSON.stringify(message.metadata || {});

  console.log('[ConversationService] Adding message:', { messageId: id, conversationId, role: message.role, content: message.content });

  db.run(
    `INSERT INTO messages (id, conversation_id, role, content, status, metadata_json, thinking)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, conversationId, message.role, message.content, message.status || 'done', metadataJson, message.thinking || null]
  );

  // Update conversation's updated_at
  db.run(
    "UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [conversationId]
  );

  logger.debug({ messageId: id, conversationId, role: message.role }, "message_added");

  const row = db.query("SELECT * FROM messages WHERE id = ?").get(id) as any;
  console.log('[ConversationService] Message saved successfully:', { messageId: id, conversationId });

  return row;
}

/**
 * Update a message
 */
export function updateMessage(
  messageId: string,
  updates: {
    content?: string;
    status?: string;
    thinking?: string;
    metadata?: Record<string, unknown>;
  }
): boolean {
  const db = getDb();

  const parts: string[] = [];
  const values: unknown[] = [];

  if (updates.content !== undefined) {
    parts.push("content = ?");
    values.push(updates.content);
  }
  if (updates.status !== undefined) {
    parts.push("status = ?");
    values.push(updates.status);
  }
  if (updates.thinking !== undefined) {
    parts.push("thinking = ?");
    values.push(updates.thinking);
  }
  if (updates.metadata !== undefined) {
    parts.push("metadata_json = ?");
    values.push(JSON.stringify(updates.metadata));
  }

  if (parts.length === 0) return false;

  values.push(messageId);
  const sql = `UPDATE messages SET ${parts.join(', ')} WHERE id = ?`;
  const result = db.run(sql, values as any[]);

  if (result.changes > 0) {
    logger.debug({ messageId }, "message_updated");
    return true;
  }
  return false;
}

/**
 * Add a tool call to a message
 */
export function addToolCall(
  messageId: string,
  toolCall: {
    action: string;
    detail?: string;
    observation?: string;
    status?: string;
    startedAt: number;
    completedAt?: number;
  }
): ToolCallDb {
  const db = getDb();
  const id = randomUUID();

  db.run(
    `INSERT INTO tool_calls (id, message_id, action, detail, observation, status, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      messageId,
      toolCall.action,
      toolCall.detail || null,
      toolCall.observation || null,
      toolCall.status || 'pending',
      toolCall.startedAt,
      toolCall.completedAt || null,
    ]
  );

  logger.debug({ toolCallId: id, messageId, action: toolCall.action }, "tool_call_added");

  const row = db.query("SELECT * FROM tool_calls WHERE id = ?").get(id) as any;
  return row;
}

/**
 * Update a tool call
 */
export function updateToolCall(
  toolCallId: string,
  updates: {
    observation?: string;
    status?: string;
    completedAt?: number;
  }
): boolean {
  const db = getDb();

  const parts: string[] = [];
  const values: unknown[] = [];

  if (updates.observation !== undefined) {
    parts.push("observation = ?");
    values.push(updates.observation);
  }
  if (updates.status !== undefined) {
    parts.push("status = ?");
    values.push(updates.status);
  }
  if (updates.completedAt !== undefined) {
    parts.push("completed_at = ?");
    values.push(updates.completedAt);
  }

  if (parts.length === 0) return false;

  values.push(toolCallId);
  const sql = `UPDATE tool_calls SET ${parts.join(', ')} WHERE id = ?`;
  const result = db.run(sql, values as any[]);

  if (result.changes > 0) {
    logger.debug({ toolCallId }, "tool_call_updated");
    return true;
  }
  return false;
}

/**
 * Search conversations by title
 */
export function searchConversations(query: string, limit: number = 20): ConversationDb[] {
  const db = getDb();
  const rows = db.query(
    "SELECT c.* FROM conversations c JOIN conversations_fts f ON c.id = f.rowid WHERE conversations_fts MATCH ? ORDER BY c.updated_at DESC LIMIT ?"
  ).all(query, limit) as any[];

  return rows;
}
