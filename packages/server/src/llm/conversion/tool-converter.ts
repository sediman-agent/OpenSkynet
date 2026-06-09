/**
 * Tool Converter
 * Handles conversion between internal and OpenAI tool formats
 */

import type { ToolDefinition, ToolCall } from "../../../core/types.js";

/**
 * Tool Converter handles tool format conversions
 * This is extracted from llm/provider.ts
 */
export class ToolConverter {
  /**
   * Convert internal tools to OpenAI format
   */
  static toOpenAITools(tools: ToolDefinition[]): any[] | undefined {
    if (!tools.length) return undefined;

    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      },
    }));
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
   * Validate tool definition
   */
  static validateTool(tool: ToolDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!tool.name || typeof tool.name !== 'string') {
      errors.push('Tool must have a valid name');
    }

    if (!tool.description || typeof tool.description !== 'string') {
      errors.push('Tool must have a description');
    }

    if (!tool.parameters || typeof tool.parameters !== 'object') {
      errors.push('Tool must have parameters object');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get tool parameter names
   */
  static getToolParameters(tool: ToolDefinition): string[] {
    if (!tool.parameters || typeof tool.parameters !== 'object') {
      return [];
    }

    return Object.keys(tool.parameters);
  }

  /**
   * Format tool for display
   */
  static formatTool(tool: ToolDefinition): string {
    const params = this.getToolParameters(tool);
    const paramsStr = params.length > 0
      ? `Parameters: ${params.join(', ')}`
      : 'No parameters';

    return `${tool.name}: ${tool.description}\n${paramsStr}`;
  }
}
