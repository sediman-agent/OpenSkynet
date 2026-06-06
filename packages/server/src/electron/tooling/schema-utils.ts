/**
 * Schema utility functions for electron tools
 * Provides consistent schema conversion and helpers
 */

import { z } from 'zod';

/**
 * Convert a Zod schema to JSON Schema format
 * Note: This is a simplified implementation. For production use,
 * consider using the 'zod-to-json-schema' library for full schema support.
 *
 * @param schema - Zod schema to convert
 * @param jsonSchemaOverride - Optional hardcoded JSON schema to use instead
 * @returns JSON Schema object
 */
export function zodToJsonSchema(
  schema?: z.ZodType,
  jsonSchemaOverride?: Record<string, unknown>
): Record<string, unknown> {
  // If a hardcoded schema is provided, use it
  if (jsonSchemaOverride) {
    return jsonSchemaOverride;
  }

  // If no schema provided, return empty object schema
  if (!schema) {
    return {
      type: 'object',
      properties: {},
    };
  }

  // Basic Zod to JSON Schema conversion
  // This handles common types but is not exhaustive
  // For full support, use zod-to-json-schema library
  return convertZodToJsonSchema(schema);
}

/**
 * Convert Zod schema to JSON Schema format
 * Internal implementation for common Zod types
 */
function convertZodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const zodObj = schema as z.ZodObject<z.ZodRawShape>;
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  // Get the shape of the Zod object
  const shape = zodObj._def.shape();

  for (const [key, def] of Object.entries(shape)) {
    const propSchema = convertZodTypeToJsonSchema(def);
    properties[key] = propSchema;

    // Check if property is required (not optional)
    if (!def.isOptional()) {
      required.push(key);
    }
  }

  const result: Record<string, unknown> = {
    type: 'object',
    properties,
  };

  if (required.length > 0) {
    result.required = required;
  }

  return result;
}

/**
 * Convert a single Zod type to JSON Schema format
 */
function convertZodTypeToJsonSchema(zodType: z.ZodTypeAny): Record<string, unknown> {
  // Handle undefined types (fallback)
  if (!zodType || typeof zodType !== 'object') {
    return {};
  }

  const def = zodType._def;

  // Handle string types
  if (def.typeName === 'ZodString') {
    const schema: Record<string, unknown> = { type: 'string' };

    // Handle min/max length
    if (def.minLength !== undefined) {
      schema.minLength = def.minLength;
    }
    if (def.maxLength !== undefined) {
      schema.maxLength = def.maxLength;
    }

    return schema;
  }

  // Handle number types
  if (def.typeName === 'ZodNumber' || def.typeName === 'ZodInt' || def.typeName === 'ZodFloat') {
    const schema: Record<string, unknown> = { type: 'number' };

    if (def.min !== undefined) {
      schema.minimum = def.min;
    }
    if (def.max !== undefined) {
      schema.maximum = def.max;
    }

    return schema;
  }

  // Handle boolean
  if (def.typeName === 'ZodBoolean') {
    return { type: 'boolean' };
  }

  // Handle arrays
  if (def.typeName === 'ZodArray') {
    return {
      type: 'array',
      items: convertZodTypeToJsonSchema(def.element as z.ZodTypeAny),
    };
  }

  // Handle objects
  if (def.typeName === 'ZodObject') {
    return convertZodToJsonSchema(zodType);
  }

  // Handle records (dictionaries)
  if (def.typeName === 'ZodRecord') {
    return {
      type: 'object',
      additionalProperties: convertZodTypeToJsonSchema(def.valueType as z.ZodTypeAny),
    };
  }

  // Handle literals
  if (def.typeName === 'ZodLiteral') {
    return { const: def.value };
  }

  // Handle enums
  if (def.typeName === 'ZodEnum') {
    return {
      type: typeof def.values[0] === 'number' ? 'number' : 'string',
      enum: def.values
    };
  }

  // Handle unions (oneOf)
  if (def.typeName === 'ZodUnion' || def.typeName === 'ZodDiscriminatedUnion') {
    return {
      oneOf: def.options.map((opt: z.ZodTypeAny) => convertZodTypeToJsonSchema(opt)),
    };
  }

  // Handle optional/nullable
  if (def.typeName === 'ZodOptional' || def.typeName === 'ZodNullable') {
    return convertZodTypeToJsonSchema(def.innerType as z.ZodTypeAny);
  }

  // Handle defaults
  if (def.typeName === 'ZodDefault') {
    const schema = convertZodTypeToJsonSchema(def.innerType as z.ZodTypeAny);
    schema.default = def.defaultValue();
    return schema;
  }

  // Handle effects (transformations, refinements)
  if (def.typeName === 'ZodEffects') {
    return convertZodTypeToJsonSchema(def.innerType as z.ZodTypeAny);
  }

  // Handle any/unknown
  if (def.typeName === 'ZodAny' || def.typeName === 'ZodUnknown') {
    return {};
  }

  // Fallback for unknown types
  return {};
}

/**
 * Create a oneOf schema for action-based tools
 * Useful for tools that support multiple actions with different schemas
 */
export function createOneOfSchema(
  actions: Array<{
    description: string;
    properties: Record<string, unknown>;
    required?: string[];
  }>
): Record<string, unknown> {
  return {
    type: 'object',
    oneOf: actions.map((action) => ({
      description: action.description,
      properties: action.properties,
      required: action.required || [],
    })),
  };
}

/**
 * Merge multiple JSON Schema objects into one
 */
export function mergeJsonSchemas(...schemas: Record<string, unknown>[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {
    type: 'object',
    properties: {},
  };

  const allRequired: string[] = [];

  for (const schema of schemas) {
    if (schema.properties) {
      Object.assign(merged.properties, schema.properties);
    }
    if (schema.required) {
      allRequired.push(...(schema.required as string[]));
    }
  }

  if (allRequired.length > 0) {
    // Remove duplicates while maintaining array
    const uniqueSet = new Set(allRequired);
    merged.required = Array.from(uniqueSet);
  }

  return merged;
}
