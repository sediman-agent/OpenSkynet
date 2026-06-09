/**
 * Response Parser
 * Handles parsing of LLM responses
 */

import type { LLMResponse, ToolCall } from "../../../core/types.js";
import logger from "../../../core/logging.js";

/**
 * Response Parser handles LLM response parsing
 * This is extracted from llm/provider.ts
 */
export class ResponseParser {
  /**
   * Parse OpenAI choice to LLM response
   */
  static parseResponse(choice: any): LLMResponse {
    const msg = choice.message;
    return {
      text: msg.content ?? null,
      tool_calls: this.parseToolCalls(msg.tool_calls),
      done: choice.finish_reason === "stop",
    };
  }

  /**
   * Parse tool calls from OpenAI format
   */
  static parseToolCalls(raw: any[] | undefined): ToolCall[] {
    if (!raw) return [];

    return raw.map((tc: any) => {
      let args: Record<string, unknown> = {};

      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {}

      return {
        id: tc.id,
        name: tc.function.name,
        arguments: args
      };
    });
  }

  /**
   * Parse streaming response chunks
   */
  static parseStreamChunk(chunk: any): {
    text?: string;
    toolCalls?: ToolCall[];
    finishReason?: string;
    error?: string;
  } {
    const result: any = {};

    try {
      const choice = chunk.choices?.[0];
      if (!choice) {
        return { error: 'No choice in response' };
      }

      const delta = choice.delta;

      if (delta?.content) {
        result.text = delta.content;
      }

      if (delta?.tool_calls) {
        result.toolCalls = this.parsePartialToolCalls(delta.tool_calls);
      }

      if (choice.finish_reason) {
        result.finishReason = choice.finish_reason;
      }

      return result;
    } catch (error) {
      return {
        error: `Parse error: ${(error as Error).message}`
      };
    }
  }

  /**
   * Parse partial tool calls from streaming delta
   */
  static parsePartialToolCalls(toolCalls: any[]): ToolCall[] {
    const calls: ToolCall[] = [];
    const map = new Map<number, { id: string; name: string; arguments: string }>();

    for (const tc of toolCalls) {
      const idx = tc.index;
      if (!map.has(idx)) {
        map.set(idx, {
          id: tc.id ?? "",
          name: tc.function?.name ?? "",
          arguments: "",
        });
      }
      const entry = map.get(idx)!;

      if (tc.id) entry.id = tc.id;
      if (tc.function?.name) entry.name = tc.function.name;
      if (tc.function?.arguments) entry.arguments += tc.function.arguments;
    }

    for (const [, tc] of map) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.arguments || "{}");
      } catch {}
      calls.push({ id: tc.id, name: tc.name, arguments: args });
    }

    return calls;
  }

  /**
   * Validate response structure
   */
  static validateResponse(response: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!response) {
      errors.push('Response is null or undefined');
      return { valid: false, errors };
    }

    if (typeof response !== 'object') {
      errors.push('Response must be an object');
      return { valid: false, errors };
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Extract text from response
   */
  static extractText(response: LLMResponse): string {
    return response.text ?? "";
  }

  /**
   * Extract tool calls from response
   */
  static extractToolCalls(response: LLMResponse): ToolCall[] {
    return response.tool_calls ?? [];
  }

  /**
   * Check if response is complete
   */
  static isComplete(response: LLMResponse): boolean {
    return response.done === true;
  }

  /**
   * Get response summary
   */
  static getSummary(response: LLMResponse): {
    text: string;
    toolCallCount: number;
    isComplete: boolean;
  } {
    return {
      text: response.text?.slice(0, 100) ?? "",
      toolCallCount: response.tool_calls?.length ?? 0,
      isComplete: response.done ?? false
    };
  }
}
