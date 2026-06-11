/**
 * Agent Schemas - Simplified
 *
 * Refactored from 420 lines to ~100 lines
 * Schema definitions extracted to schema-definitions.ts
 * Validation functions extracted to SchemaValidators
 * Builder functions extracted to SchemaBuilders
 */

// Re-export all types and schemas from definitions
export * from './definitions/index.js';

// Import validation and builder modules
import { SchemaValidators } from './validation/index.js';
import { SchemaBuilders } from './builders/index.js';
import { schemas } from './definitions/index.js';

// ============================================================================
// Exported Utility Functions (for backward compatibility)
// ============================================================================

/**
 * Validate agent response against schema
 */
export function validateAgentResponse(data: unknown): {
  success: boolean;
  data?: import('./definitions/index.js').AgentResponse;
  errors?: string[];
} {
  return SchemaValidators.validateAgentResponse(data);
}

/**
 * Validate and coerce agent response
 */
export function coerceAgentResponse(data: unknown): import('./definitions/index.js').AgentResponse {
  return SchemaValidators.coerceAgentResponse(data);
}

/**
 * Create a valid agent response from partial data
 */
export function createAgentResponse(
  partial: Partial<import('./definitions/index.js').AgentResponse>
): import('./definitions/index.js').AgentResponse {
  return SchemaBuilders.createAgentResponse(partial);
}

/**
 * Create a minimal valid agent response
 */
export function createMinimalResponse(
  thinking: string,
  memory: string,
  nextGoal: string,
  done: boolean = false
): import('./definitions/index.js').AgentResponse {
  return SchemaBuilders.createMinimalResponse(thinking, memory, nextGoal, done);
}

/**
 * Create a success completion response
 */
export function createSuccessResponse(
  summary: string,
  memory: string
): import('./definitions/index.js').AgentResponse {
  return SchemaBuilders.createSuccessResponse(summary, memory);
}

/**
 * Create a failure completion response
 */
export function createFailureResponse(
  reason: string,
  memory: string
): import('./definitions/index.js').AgentResponse {
  return SchemaBuilders.createFailureResponse(reason, memory);
}

// Re-export classes for direct use
export { SchemaValidators, SchemaBuilders };

// Re-export schemas registry
export { schemas };
