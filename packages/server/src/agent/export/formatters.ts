/**
 * Conversation Formatters
 * Format conversation data for different output formats
 */

import type { ConversationData } from './types.js';

/**
 * Formatted content for conversation export
 */
export interface FormattedContent {
  content: string;
  extension: string;
  mimeType: string;
}

/**
 * Conversation Formatters
 * This is extracted from agent/export/conversation-exporter.ts
 */
export class ConversationFormatters {
  /**
   * Format conversation as JSON
   */
  static formatAsJSON(data: ConversationData): FormattedContent {
    return {
      content: JSON.stringify(
        {
          sessionId: data.sessionId,
          task: data.task,
          conversation: data.conversation,
          result: data.result,
          success: data.success,
          iterations: data.iterations,
          strategyUsed: data.strategyUsed,
          elapsedSecs: data.elapsedSecs,
          actionsTaken: data.actionsTaken,
          metadata: data.metadata,
          exportedAt: new Date().toISOString(),
        },
        null,
        2
      ),
      extension: 'json',
      mimeType: 'application/json',
    };
  }

  /**
   * Format conversation as Markdown
   */
  static formatAsMarkdown(data: ConversationData): FormattedContent {
    const lines: string[] = [];

    lines.push(`# Agent Conversation`);
    lines.push();
    lines.push(`**Session ID:** ${data.sessionId}`);
    lines.push(`**Task:** ${data.task}`);
    lines.push(`**Success:** ${data.success ? '✅' : '❌'}`);
    lines.push(`**Iterations:** ${data.iterations}`);
    lines.push(`**Strategy:** ${data.strategyUsed}`);
    lines.push(`**Elapsed Time:** ${data.elapsedSecs}s`);
    lines.push(`**Actions Taken:** ${data.actionsTaken.join(', ')}`);
    lines.push(`**Result:** ${data.result}`);
    lines.push();

    if (data.metadata) {
      lines.push(`## Metadata`);
      lines.push();
      for (const [key, value] of Object.entries(data.metadata)) {
        lines.push(`- **${key}:** ${JSON.stringify(value)}`);
      }
      lines.push();
    }

    lines.push(`## Conversation`);
    lines.push();

    for (const [index, msg] of data.conversation.entries()) {
      lines.push(`### ${msg.role.toUpperCase()} #${index + 1}`);
      lines.push();
      lines.push(this.formatMessageContent(msg.content));
      lines.push();
    }

    return {
      content: lines.join('\n'),
      extension: 'md',
      mimeType: 'text/markdown',
    };
  }

  /**
   * Format conversation as plain text
   */
  static formatAsText(data: ConversationData): FormattedContent {
    const lines: string[] = [];

    lines.push('Agent Conversation');
    lines.push(`Session ID: ${data.sessionId}`);
    lines.push(`Task: ${data.task}`);
    lines.push(`Success: ${data.success}`);
    lines.push(`Iterations: ${data.iterations}`);
    lines.push(`Strategy: ${data.strategyUsed}`);
    lines.push(`Elapsed Time: ${data.elapsedSecs}s`);
    lines.push(`Actions Taken: ${data.actionsTaken.join(', ')}`);
    lines.push(`Result: ${data.result}`);
    lines.push();
    lines.push('='.repeat(80));
    lines.push();

    for (const [index, msg] of data.conversation.entries()) {
      lines.push(`${msg.role.toUpperCase()} #${index + 1}`);
      lines.push('-'.repeat(80));
      lines.push(this.formatMessageContent(msg.content));
      lines.push();
    }

    return {
      content: lines.join('\n'),
      extension: 'txt',
      mimeType: 'text/plain',
    };
  }

  /**
   * Format message content (handles string or array content)
   */
  private static formatMessageContent(content: string | any[]): string {
    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      const parts: string[] = [];
      for (const part of content) {
        if (part.type === 'text') {
          parts.push(part.text);
        } else if (part.type === 'image_url') {
          const urlPreview = part.image_url.url.slice(0, 60) + '...';
          parts.push(`[Image: ${urlPreview}]`);
        }
      }
      return parts.join('\n');
    }

    return String(content);
  }

  /**
   * Format conversation summary
   */
  static formatSummary(data: ConversationData): string {
    return [
      `Session: ${data.sessionId}`,
      `Task: ${data.task}`,
      `Success: ${data.success ? 'Yes' : 'No'}`,
      `Iterations: ${data.iterations}`,
      `Strategy: ${data.strategyUsed}`,
      `Time: ${data.elapsedSecs}s`,
    ].join(' | ');
  }

  /**
   * Get available formats
   */
  static getAvailableFormats(): Array<{ key: string; name: string; extension: string }> {
    return [
      { key: 'json', name: 'JSON', extension: 'json' },
      { key: 'markdown', name: 'Markdown', extension: 'md' },
      { key: 'txt', name: 'Plain Text', extension: 'txt' },
    ];
  }
}
