/**
 * Schema utility functions for electron tools
 * Performance-optimized implementation with caching
 */

import { z } from 'zod';

// Cache for converted schemas to avoid repeated computation
const schemaConversionCache = new WeakMap<z.ZodType, Record<string, unknown>>();

/**
 * Convert a Zod schema to JSON Schema format (optimized with caching)
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

  // Check cache first
  let cached = schemaConversionCache.get(schema);
  if (cached) {
    return cached;
  }

  // Convert and cache
  const result = convertZodToJsonSchema(schema);
  schemaConversionCache.set(schema, result);

  return result;
}

/**
 * Convert Zod schema to JSON Schema format (optimized)
 */
function convertZodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const zodObj = schema as z.ZodObject<z.ZodRawShape>;
  const shape = zodObj._def.shape();
  const keys = Object.keys(shape);
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  // Pre-allocate for better performance
  required.length = 0;

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const def = shape[key];
    properties[key] = convertZodTypeToJsonSchema(def);

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
 * Type name handler map for faster lookups
 */
const typeHandlers: ReadonlyMap<string, (def: any) => Record<string, unknown>> = new Map([
  ['ZodString', (def) => {
    const schema: Record<string, unknown> = { type: 'string' };
    if (def.minLength !== undefined) schema.minLength = def.minLength;
    if (def.maxLength !== undefined) schema.maxLength = def.maxLength;
    return schema;
  }],
  ['ZodNumber', (def) => {
    const schema: Record<string, unknown> = { type: 'number' };
    if (def.min !== undefined) schema.minimum = def.min;
    if (def.max !== undefined) schema.maximum = def.max;
    return schema;
  }],
  ['ZodInt', (def) => {
    const schema: Record<string, unknown> = { type: 'number' };
    if (def.min !== undefined) schema.minimum = def.min;
    if (def.max !== undefined) schema.maximum = def.max;
    return schema;
  }],
  ['ZodFloat', (def) => {
    const schema: Record<string, unknown> = { type: 'number' };
    if (def.min !== undefined) schema.minimum = def.min;
    if (def.max !== undefined) schema.maximum = def.max;
    return schema;
  }],
  ['ZodBoolean', () => ({ type: 'boolean' })],
  ['ZodArray', (def) => ({
    type: 'array',
    items: convertZodTypeToJsonSchema(def.element as z.ZodTypeAny),
  })],
  ['ZodObject', (def, zodType) => convertZodToJsonSchema(zodType)],
  ['ZodRecord', (def) => ({
    type: 'object',
    additionalProperties: convertZodTypeToJsonSchema(def.valueType as z.ZodTypeAny),
  })],
  ['ZodLiteral', (def) => ({ const: def.value })],
  ['ZodEnum', (def) => ({
    type: typeof def.values[0] === 'number' ? 'number' : 'string',
    enum: def.values,
  })],
  ['ZodUnion', (def) => ({
    oneOf: def.options.map((opt: z.ZodTypeAny) => convertZodTypeToJsonSchema(opt)),
  })],
  ['ZodDiscriminatedUnion', (def) => ({
    oneOf: def.options.map((opt: z.ZodTypeAny) => convertZodTypeToJsonSchema(opt)),
  })],
  ['ZodOptional', (def) => convertZodTypeToJsonSchema(def.innerType as z.ZodTypeAny)],
  ['ZodNullable', (def) => convertZodTypeToJsonSchema(def.innerType as z.ZodTypeAny)],
  ['ZodDefault', (def) => {
    const schema = convertZodTypeToJsonSchema(def.innerType as z.ZodTypeAny);
    schema.default = def.defaultValue();
    return schema;
  }],
  ['ZodEffects', (def) => convertZodTypeToJsonSchema(def.innerType as z.ZodTypeAny)],
  ['ZodAny', () => ({})],
  ['ZodUnknown', () => ({})],
]);

/**
 * Convert a single Zod type to JSON Schema format (optimized with handler map)
 */
function convertZodTypeToJsonSchema(zodType: z.ZodTypeAny): Record<string, unknown> {
  // Handle undefined types (fallback)
  if (!zodType || typeof zodType !== 'object') {
    return {};
  }

  const def = zodType._def;
  const typeName = def.typeName;

  // Fast path using handler map
  const handler = typeHandlers.get(typeName);
  if (handler) {
    return handler(def, zodType);
  }

  // Fallback for unknown types
  return {};
}

/**
 * Create a oneOf schema for action-based tools (optimized)
 */
export function createOneOfSchema(
  actions: ReadonlyArray<{
    description: string;
    properties: Record<string, unknown>;
    required?: string[];
  }>
): Record<string, unknown> {
  // Pre-allocate array for better performance
  const oneOf = new Array(actions.length);

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    oneOf[i] = {
      description: action.description,
      properties: action.properties,
      required: action.required ? action.required : [],
    };
  }

  return {
    type: 'object',
    oneOf,
  };
}

/**
 * Merge multiple JSON Schema objects into one (optimized)
 */
export function mergeJsonSchemas(...schemas: Readonly<Record<string, unknown>[]>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const requiredSet = new Set<string>();

  for (let i = 0; i < schemas.length; i++) {
    const schema = schemas[i];
    if (schema.properties) {
      const props = schema.properties as Record<string, unknown>;
      const keys = Object.keys(props);
      for (let j = 0; j < keys.length; j++) {
        properties[keys[j]] = props[keys[j]];
      }
    }
    if (schema.required) {
      const req = schema.required as string[];
      for (let k = 0; k < req.length; k++) {
        requiredSet.add(req[k]);
      }
    }
  }

  const result: Record<string, unknown> = {
    type: 'object',
    properties,
  };

  if (requiredSet.size > 0) {
    result.required = Array.from(requiredSet);
  }

  return result;
}
