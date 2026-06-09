/**
 * Message Handler
 * Centralizes all conversation message operations
 */

import { ConversationManager } from '../conversation-manager.js';
import { createLogger } from '../../../core/logging.js';

const logger = createLogger('MessageHandler');

/**
 * Message Handler manages all conversation message operations
 * This extracts message-related methods from AgentLoop
 */
export class MessageHandler {
  constructor(private conversationManager: ConversationManager) {}

  /**
   * Add a user message to the conversation
   */
  addUserMessage(content: string): void {
    this.conversationManager.addUserMessage(content);
    logger.debug(`[MessageHandler] Added user message, total: ${this.conversationManager.length}`);
  }

  /**
   * Add an assistant message to the conversation
   */
  addAssistantMessage(content: string): void {
    this.conversationManager.addAssistantMessage(content);
    logger.debug(`[MessageHandler] Added assistant message, total: ${this.conversationManager.length}`);
  }

  /**
   * Add a system message to the conversation
   */
  addSystemMessage(content: string): void {
    this.conversationManager.addSystemMessage(content);
    logger.debug(`[MessageHandler] Added system message, total: ${this.conversationManager.length}`);
  }

  /**
   * Add a tool result message to the conversation
   */
  addToolResult(toolCallId: string, toolName: string, content: string): void {
    logger.info(`[MessageHandler] Adding tool result for ${toolName} (id: ${toolCallId})`);
    logger.debug(`[MessageHandler] Tool result content: ${JSON.stringify(content).slice(0, 200)}...`);

    this.conversationManager.addToolResult(toolCallId, toolName, content);

    logger.info(`[MessageHandler] Conversation now has ${this.conversationManager.length} messages`);
  }

  /**
   * Add a message with tool calls to the conversation
   */
  addToolCallMessage(content: string, toolCalls: any[]): void {
    this.conversationManager.addToolCallMessage(content, toolCalls);
    logger.debug(`[MessageHandler] Added tool call message with ${toolCalls.length} tools`);
  }

  /**
   * Get conversation history
   */
  getConversation(): any[] {
    return this.conversationManager.getHistory();
  }

  /**
   * Get conversation length
   */
  getLength(): number {
    return this.conversationManager.length;
  }

  /**
   * Clear conversation
   */
  clearConversation(): void {
    this.conversationManager.clear();
  }

  /**
   * Set conversation from history
   */
  setConversation(history: any[]): void {
    this.conversationManager = new ConversationManager({ initialHistory: history });
  }
}
