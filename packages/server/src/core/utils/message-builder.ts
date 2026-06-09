/**
 * Message Builder Utility
 * Provides fluent API for constructing LLM messages consistently
 */

import type { Message } from "../../llm/provider";

/**
 * Message content can be a string or array of content parts
 */
export type MessageContent = string | Array<{ type: string; [key: string]: any }>;

/**
 * Builder for constructing LLM messages with fluent API
 */
export class MessageBuilder {
  private message: Partial<Message> = {};

  private constructor() {}

  /**
   * Start building an assistant message
   */
  static assistant(): MessageBuilder {
    return new MessageBuilder().withRole('assistant');
  }

  /**
   * Start building a user message
   */
  static user(): MessageBuilder {
    return new MessageBuilder().withRole('user');
  }

  /**
   * Start building a system message
   */
  static system(): MessageBuilder {
    return new MessageBuilder().withRole('system');
  }

  /**
   * Start building a tool result message
   */
  static tool(toolCallId: string, toolName: string): MessageBuilder {
    return new MessageBuilder()
      .withRole('tool')
      .withToolCallId(toolCallId)
      .withToolName(toolName);
  }

  /**
   * Set the role of the message
   */
  withRole(role: 'user' | 'assistant' | 'system' | 'tool'): this {
    this.message.role = role;
    return this;
  }

  /**
   * Set the content of the message
   */
  withContent(content: MessageContent): this {
    this.message.content = content as any;
    return this;
  }

  /**
   * Set text content (convenience method)
   */
  withText(text: string): this {
    return this.withContent(text);
  }

  /**
   * Add image content to the message
   */
  withImage(base64Data: string, detail: 'low' | 'high' | 'auto' = 'low'): this {
    const currentContent = this.message.content;

    if (typeof currentContent === 'string') {
      // Convert existing text to array format
      this.message.content = [
        { type: 'text', text: currentContent },
        { type: 'image_url', image_url: { url: base64Data, detail } }
      ] as any;
    } else if (Array.isArray(currentContent)) {
      // Append image to existing array
      (this.message.content as any).push({
        type: 'image_url',
        image_url: { url: base64Data, detail }
      });
    } else {
      // Just image content
      this.message.content = [
        { type: 'image_url', image_url: { url: base64Data, detail } }
      ] as any;
    }

    return this;
  }

  /**
   * Set tool calls (for assistant messages)
   */
  withToolCalls(toolCalls: any[]): this {
    this.message.tool_calls = toolCalls;
    return this;
  }

  /**
   * Add a single tool call
   */
  withToolCall(id: string, name: string, args: any): this {
    if (!this.message.tool_calls) {
      this.message.tool_calls = [];
    }
    this.message.tool_calls!.push({
      id,
      type: 'function',
      function: {
        name,
        arguments: typeof args === 'string' ? args : JSON.stringify(args)
      }
    });
    return this;
  }

  /**
   * Set tool call ID (for tool result messages)
   */
  withToolCallId(id: string): this {
    this.message.tool_call_id = id;
    return this;
  }

  /**
   * Set tool name (for tool result messages)
   */
  withToolName(name: string): this {
    this.message.name = name;
    return this;
  }

  /**
   * Add metadata to the message
   */
  withMetadata(metadata: Record<string, any>): this {
    (this.message as any).metadata = metadata;
    return this;
  }

  /**
   * Build and validate the message
   */
  build(): Message {
    if (!this.message.role) {
      throw new Error('Message must have a role');
    }

    // For tool messages, ensure tool_call_id and name are set
    if (this.message.role === 'tool') {
      if (!this.message.tool_call_id) {
        throw new Error('Tool message must have tool_call_id');
      }
      if (!this.message.name) {
        throw new Error('Tool message must have tool name');
      }
      // Tool messages must have content
      if (this.message.content === undefined || this.message.content === null) {
        this.message.content = '';
      }
    }

    return this.message as Message;
  }

  /**
   * Build without validation (for advanced use cases)
   */
  buildUnsafe(): Message {
    return this.message as Message;
  }

  /**
   * Create a copy of this builder
   */
  clone(): MessageBuilder {
    const clone = new MessageBuilder();
    clone.message = { ...this.message };
    if (this.message.tool_calls) {
      clone.message.tool_calls = [...this.message.tool_calls];
    }
    if (Array.isArray(this.message.content)) {
      clone.message.content = [...this.message.content];
    }
    return clone;
  }
}

/**
 * Convenience function to create a user message
 */
export function createUserMessage(content: string | any[]): Message {
  return MessageBuilder.user().withContent(content).build();
}

/**
 * Convenience function to create an assistant message
 */
export function createAssistantMessage(content: string, toolCalls?: any[]): Message {
  const builder = MessageBuilder.assistant().withContent(content);
  if (toolCalls) {
    builder.withToolCalls(toolCalls);
  }
  return builder.build();
}

/**
 * Convenience function to create a system message
 */
export function createSystemMessage(content: string): Message {
  return MessageBuilder.system().withContent(content).build();
}

/**
 * Convenience function to create a tool result message
 */
export function createToolResultMessage(toolCallId: string, toolName: string, result: string): Message {
  return MessageBuilder.tool(toolCallId, toolName).withContent(result).build();
}

/**
 * Create a message with vision content (text + image)
 */
export function createVisionMessage(text: string, base64Image: string, detail: 'low' | 'high' | 'auto' = 'low'): Message {
  return MessageBuilder.user()
    .withText(text)
    .withImage(base64Image, detail)
    .build();
}
