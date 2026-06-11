/**
 * API routes for conversation management
 * Provides endpoints for CRUD operations on conversations and messages
 */

import { Hono } from "hono";
import {
  createConversation,
  getConversations,
  getConversation,
  updateConversationTitle,
  deleteConversation,
  addMessage,
  updateMessage,
  addToolCall,
  updateToolCall,
  searchConversations,
  type ConversationDb,
  type MessageDb,
  type ToolCallDb,
} from "../services/conversationService";

export function createConversationRoutes(): Hono {
  const router = new Hono();

  // GET /api/conversations - List all conversations
  router.get("/", (c) => {
    const limit = parseInt(c.req.query("limit") ?? "50", 10);
    const conversations = getConversations(limit);

    return c.json({
      conversations: conversations.map(conv => ({
        id: conv.id,
        title: conv.title,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
      })),
    });
  });

  // GET /api/conversations/search - Search conversations
  router.get("/search", (c) => {
    const query = c.req.query("q");
    if (!query) {
      return c.json({ error: "query parameter 'q' is required" }, 400);
    }

    const limit = parseInt(c.req.query("limit") ?? "20", 10);
    const conversations = searchConversations(query, limit);

    return c.json({
      conversations: conversations.map(conv => ({
        id: conv.id,
        title: conv.title,
        createdAt: conv.created_at,
        updatedAt: conv.updated_at,
      })),
    });
  });

  // GET /api/conversations/:id - Get a conversation with messages
  router.get("/:id", (c) => {
    const id = c.req.param("id");
    const conversation = getConversation(id);

    if (!conversation) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    return c.json({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      messages: conversation.messages.map(msg => {
        const message = {
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          status: msg.status,
          thinking: msg.thinking || undefined,
          screenshot: msg.screenshot || undefined,
        };

        // Add tool calls if present
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          (message as any).toolCalls = msg.tool_calls.map(tc => ({
            id: tc.id,
            action: tc.action,
            detail: tc.detail || undefined,
            observation: tc.observation || undefined,
            status: tc.status,
            startedAt: tc.started_at,
            completedAt: tc.completed_at || undefined,
          }));
        }

        return message;
      }),
    });
  });

  // POST /api/conversations - Create a new conversation
  router.post("/", async (c) => {
    try {
      const body = await c.req.json<{ title?: string }>();
      const conversation = createConversation(body.title);

      return c.json({
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
      }, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Failed to create conversation" },
        500
      );
    }
  });

  // PATCH /api/conversations/:id - Update conversation
  router.patch("/:id", async (c) => {
    const id = c.req.param("id");

    try {
      const body = await c.req.json<{ title?: string }>();

      if (body.title !== undefined) {
        const success = updateConversationTitle(id, body.title);
        if (!success) {
          return c.json({ error: "Conversation not found" }, 404);
        }
      }

      const conversation = getConversation(id);
      if (!conversation) {
        return c.json({ error: "Conversation not found" }, 404);
      }

      return c.json({
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.created_at,
        updatedAt: conversation.updated_at,
      });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Failed to update conversation" },
        500
      );
    }
  });

  // DELETE /api/conversations/:id - Delete a conversation
  router.delete("/:id", (c) => {
    const id = c.req.param("id");
    const success = deleteConversation(id);

    if (!success) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    return c.json({ success: true });
  });

  // POST /api/conversations/:id/messages - Add a message to a conversation
  router.post("/:id/messages", async (c) => {
    const conversationId = c.req.param("id");

    // Verify conversation exists
    const conv = getConversation(conversationId);
    if (!conv) {
      return c.json({ error: "Conversation not found" }, 404);
    }

    try {
      const body = await c.req.json<{
        role: string;
        content: string;
        status?: string;
        thinking?: string;
        metadata?: Record<string, unknown>;
      }>();

      const message = addMessage(conversationId, body);

      return c.json({
        id: message.id,
        conversationId: message.conversation_id,
        role: message.role,
        content: message.content,
        status: message.status,
        timestamp: message.timestamp,
        thinking: message.thinking || undefined,
      }, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Failed to add message" },
        500
      );
    }
  });

  // PATCH /api/conversations/:id/messages/:messageId - Update a message
  router.patch("/:id/messages/:messageId", async (c) => {
    const conversationId = c.req.param("id");
    const messageId = c.req.param("messageId");

    try {
      const body = await c.req.json<{
        content?: string;
        status?: string;
        thinking?: string;
      }>();

      const success = updateMessage(messageId, body);
      if (!success) {
        return c.json({ error: "Message not found" }, 404);
      }

      return c.json({ success: true });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Failed to update message" },
        500
      );
    }
  });

  // POST /api/conversations/:id/messages/:messageId/toolcalls - Add a tool call
  router.post("/:id/messages/:messageId/toolcalls", async (c) => {
    const messageId = c.req.param("messageId");

    try {
      const body = await c.req.json<{
        action: string;
        detail?: string;
        status?: string;
        startedAt: number;
        completedAt?: number;
      }>();

      const toolCall = addToolCall(messageId, body);

      return c.json({
        id: toolCall.id,
        messageId: toolCall.message_id,
        action: toolCall.action,
        detail: toolCall.detail || undefined,
        observation: toolCall.observation || undefined,
        status: toolCall.status,
        startedAt: toolCall.started_at,
        completedAt: toolCall.completed_at || undefined,
      }, 201);
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Failed to add tool call" },
        500
      );
    }
  });

  // PATCH /api/conversations/:id/toolcalls/:toolCallId - Update a tool call
  router.patch("/:id/toolcalls/:toolCallId", async (c) => {
    const toolCallId = c.req.param("toolCallId");

    try {
      const body = await c.req.json<{
        observation?: string;
        status?: string;
        completedAt?: number;
      }>();

      const success = updateToolCall(toolCallId, body);
      if (!success) {
        return c.json({ error: "Tool call not found" }, 404);
      }

      return c.json({ success: true });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "Failed to update tool call" },
        500
      );
    }
  });

  return router;
}
