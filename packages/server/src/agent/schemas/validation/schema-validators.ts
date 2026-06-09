/**
 * Schema Validators
 * Validation and coercion functions for agent schemas
 */

import { z } from 'zod';
import type { AgentResponse } from '../agent-schemas.js';
import { AgentResponseSchema } from '../definitions/index.js';

/**
 * Schema Validators handles validation and coercion of agent responses
 * This is extracted from agent/schemas/agent-schemas.ts
 */
export class SchemaValidators {
  /**
   * Validate agent response against schema
   */
  static validateAgentResponse(data: unknown): {
    success: boolean;
    data?: AgentResponse;
    errors?: string[];
  } {
    const result = AgentResponseSchema.safeParse(data);

    if (result.success) {
      return { success: true, data: result.data };
    }

    return {
      success: false,
      errors: result.error.errors.map(e =>
        `${e.path.join('.')}: ${e.message}`
      )
    };
  }

  /**
   * Validate and coerce agent response
   * Attempts to fix common errors
   */
  static coerceAgentResponse(data: unknown): AgentResponse {
    try {
      // Direct parse first
      return AgentResponseSchema.parse(data);
    } catch (error) {
      // Attempt coercion
      const obj = data as any;

      // Ensure required fields exist
      if (!obj.thought) {
        obj.thought = {
          thinking: obj.thinking || 'No reasoning provided',
          evaluation: obj.evaluation || 'uncertain',
          memory: obj.memory || 'No memory tracking',
          nextGoal: obj.nextGoal || 'Continue task'
        };
      }

      // Ensure done is boolean
      if (typeof obj.done !== 'boolean') {
        obj.done = obj.done === 'true' || obj.done === true;
      }

      // Ensure actions is array
      if (!Array.isArray(obj.actions)) {
        if (obj.actions) {
          obj.actions = [obj.actions];
        } else {
          obj.actions = [];
        }
      }

      // Parse again
      return AgentResponseSchema.parse(obj);
    }
  }

  /**
   * Validate with detailed error reporting
   */
  static validateWithDetails(data: unknown): {
    valid: boolean;
    data?: AgentResponse;
    errors: Array<{
      path: string[];
      message: string;
      code: string;
    }>;
  } {
    const result = AgentResponseSchema.safeParse(data);

    if (result.success) {
      return {
        valid: true,
        data: result.data,
        errors: []
      };
    }

    return {
      valid: false,
      errors: result.error.errors.map(e => ({
        path: e.path,
        message: e.message,
        code: e.code
      }))
    };
  }

  /**
   * Validate partial data (for updates)
   */
  static validatePartial(data: unknown): {
    valid: boolean;
    errors?: string[];
  } {
    try {
      AgentResponseSchema.partial().parse(data);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(e =>
            `${e.path.join('.')}: ${e.message}`
          )
        };
      }
      return {
        valid: false,
        errors: ['Unknown validation error']
      };
    }
  }

  /**
   * Check if data is valid without throwing
   */
  static isValid(data: unknown): boolean {
    return AgentResponseSchema.safeParse(data).success;
  }

  /**
   * Get validation errors as readable string
   */
  static getErrorsAsString(data: unknown): string {
    const result = AgentResponseSchema.safeParse(data);

    if (result.success) return '';

    return result.error.errors.map(e =>
      `${e.path.join('.')}: ${e.message}`
    ).join('\n');
  }
}
