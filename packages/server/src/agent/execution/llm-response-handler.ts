/**
 * LLM Response Handler Module
 * Handles LLM response processing, tool call extraction, and response formatting
 */

import type { Message } from "../../llm/provider";
import logger from "../../core/logging";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  raw?: any;
}

export interface LLMResponse {
  content: string;
  tool_calls: ToolCall[];
  raw?: any;
  thinking?: string;
  done?: boolean;
}

export interface ResponseProcessResult {
  success: boolean;
  response?: LLMResponse;
  error?: string;
}

/**
 * Process LLM response and extract content and tool calls
 */
export function processLLMResponse(rawResponse: any): ResponseProcessResult {
  try {
    if (!rawResponse) {
      return {
        success: false,
        error: 'Empty response from LLM'
      };
    }

    const response: LLMResponse = {
      content: '',
      tool_calls: [],
      raw: rawResponse
    };

    // Extract content
    if (rawResponse.content) {
      if (typeof rawResponse.content === 'string') {
        response.content = rawResponse.content;
      } else if (Array.isArray(rawResponse.content)) {
        // Handle array content (e.g., with image_url)
        response.content = rawResponse.content
          .filter((item: any) => item.type === 'text')
          .map((item: any) => item.text)
          .join('\n');
      }
    }

    // Extract tool calls
    if (rawResponse.tool_calls && Array.isArray(rawResponse.tool_calls)) {
      response.tool_calls = rawResponse.tool_calls.map((tc: any) => ({
        id: tc.id || tc.function?.name || `call_${Date.now()}`,
        name: tc.function?.name || tc.name,
        arguments: tc.function?.arguments || tc.arguments || {},
        raw: tc
      }));

      logger.info(`[LLMResponseHandler] Extracted ${response.tool_calls.length} tool calls`);
    }

    // Extract thinking if present
    if (rawResponse.thinking) {
      response.thinking = rawResponse.thinking;
    }

    // Check if done
    if (rawResponse.done || rawResponse.content?.includes('<done>')) {
      response.done = true;
    }

    return {
      success: true,
      response
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to process LLM response: ${(error as Error).message}`
    };
  }
}

/**
 * Extract tool calls from response
 */
export function extractToolCalls(response: LLMResponse): ToolCall[] {
  if (!response.tool_calls || response.tool_calls.length === 0) {
    return [];
  }

  return response.tool_calls;
}

/**
 * Check if response indicates completion
 */
export function isResponseComplete(response: LLMResponse): boolean {
  if (response.done) {
    return true;
  }

  // Check for completion indicators in content
  if (response.content) {
    const completionIndicators = [
      '<done>',
      'task complete',
      'task completed',
      'finished',
      'done'
    ];

    const lowerContent = response.content.toLowerCase();
    return completionIndicators.some(indicator =>
      lowerContent.includes(indicator.toLowerCase())
    );
  }

  return false;
}

/**
 * Format tool result for LLM
 */
export function formatToolResult(toolName: string, toolCallId: string, result: any): Message {
  let content = '';

  if (typeof result === 'string') {
    content = result;
  } else if (result && typeof result === 'object') {
    // Format object result
    if (result.error) {
      content = `Error: ${result.error}`;
      if (result.recovery) {
        content += `\nRecovery suggestion: ${result.recovery}`;
      }
    } else if (result.output) {
      content = typeof result.output === 'string'
        ? result.output
        : JSON.stringify(result.output, null, 2);
    } else {
      content = JSON.stringify(result, null, 2);
    }
  } else {
    content = String(result);
  }

  return {
    role: 'tool',
    tool_call_id: toolCallId,
    name: toolName,
    content
  } as Message;
}

/**
 * Parse thinking tags from content
 */
export function parseThinking(content: string): { thinking: string | null; visible: string | null } {
  const thinkMatch = content.match(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/i);
  if (thinkMatch) {
    const thinking = thinkMatch[1].trim();
    const visible = content.replace(/<think(?:ing)?>([\s\S]*?)<\/think(?:ing)? >/gi, '').trim();
    return { thinking, visible: visible || null };
  }
  return { thinking: null, visible: content };
}

/**
 * Build assistant message with tool calls
 */
export function buildAssistantMessage(response: LLMResponse): Message {
  const message: Message = {
    role: 'assistant',
    content: response.content || 'Executing actions...'
  };

  // Add tool_calls if present
  if (response.tool_calls && response.tool_calls.length > 0) {
    message.tool_calls = response.tool_calls.map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments)
      }
    }));
  }

  return message;
}

/**
 * Validate tool call structure
 */
export function validateToolCall(toolCall: ToolCall): boolean {
  if (!toolCall.name || typeof toolCall.name !== 'string') {
    return false;
  }

  if (!toolCall.arguments || typeof toolCall.arguments !== 'object') {
    return false;
  }

  if (!toolCall.id || typeof toolCall.id !== 'string') {
    return false;
  }

  return true;
}

/**
 * Extract error message from response
 */
export function extractErrorMessage(response: LLMResponse): string | null {
  if (!response.content) {
    return null;
  }

  const errorPatterns = [
    /error:\s*(.+)/i,
    /failed:\s*(.+)/i,
    /cannot\s+(.+)/i,
    /unable\s+to\s+(.+)/i
  ];

  for (const pattern of errorPatterns) {
    const match = response.content.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  return null;
}

/**
 * Check if response contains browser commands
 */
export function hasBrowserCommands(response: LLMResponse): boolean {
  if (!response.tool_calls || response.tool_calls.length === 0) {
    return false;
  }

  return response.tool_calls.some(tc =>
    tc.name?.startsWith('browser_') || tc.name === 'browser_end'
  );
}
