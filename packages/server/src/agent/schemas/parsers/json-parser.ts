/**
 * JSON Parsing Strategy
 * Parses JSON responses from LLMs
 */

import { createLogger } from '../../core/logging.js';

const logger = createLogger('JsonParser');

export interface ParseResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface SchemaInfo {
  type: string;
  properties?: Record<string, any>;
  items?: any;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * JSON Parser handles JSON extraction and validation
 */
export class JsonParser {
  /**
   * Parse JSON from text
   */
  parse(text: string, schema?: SchemaInfo): ParseResult {
    try {
      let jsonText = text;

      // Extract JSON from markdown code blocks
      const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        jsonText = codeBlockMatch[1];
      }

      // Find JSON object in text if not in code block
      if (!codeBlockMatch) {
        const objectMatch = text.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          jsonText = objectMatch[0];
        }
      }

      const parsed = JSON.parse(jsonText);

      // Validate against schema if provided
      if (schema) {
        const validation = this.validate(parsed, schema);
        if (!validation.valid) {
          return {
            success: false,
            error: `Schema validation failed: ${validation.errors.join(', ')}`
          };
        }
      }

      logger.debug('[JsonParser] JSON parsed successfully');
      return { success: true, data: parsed };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.debug(`[JsonParser] JSON parse failed: ${message}`);
      return {
        success: false,
        error: `Failed to parse JSON: ${message}`
      };
    }
  }

  /**
   * Validate parsed data against schema
   */
  private validate(data: any, schema: SchemaInfo): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const value = data[key];

        // Check required properties
        if (schema.required?.includes(key) && value === undefined) {
          errors.push(`Missing required property: ${key}`);
          continue;
        }

        // Type validation
        if (value !== undefined) {
          const propType = propSchema.type || typeof value;
          const actualType = Array.isArray(value) ? 'array' : typeof value;

          if (propType !== actualType && propType !== 'any') {
            errors.push(`Property "${key}": expected ${propType}, got ${actualType}`);
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Extract JSON from text
   */
  extractJson(text: string): string | null {
    const patterns = [
      /```(?:json)?\s*\n?([\s\S]*?)\n?```/,
      /\{[\s\S]*\}/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }

    return null;
  }
}
