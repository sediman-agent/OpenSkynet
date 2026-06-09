/**
 * Type Validator for Structured Responses
 * Validates parsed data against expected schemas
 */

import { createLogger } from '../../../core/logging.js';

const logger = createLogger('TypeValidator');

export interface ValidationResult {
  success: boolean;
  errors: string[];
  data?: any;
}

/**
 * Type Validator validates structured data against schemas
 * This is extracted from structured-provider.ts
 */
export class TypeValidator {
  /**
   * Validate data against a schema
   */
  validate(data: any, schema: any): ValidationResult {
    const errors: string[] = [];

    // Handle different schema types
    const schemaType = this.detectSchemaType(schema);

    switch (schemaType) {
      case 'object':
        this.validateObject(data, schema, errors);
        break;
      case 'array':
        this.validateArray(data, schema, errors);
        break;
      case 'string':
        this.validateString(data, errors);
        break;
      case 'number':
        this.validateNumber(data, errors);
        break;
      case 'boolean':
        this.validateBoolean(data, errors);
        break;
      default:
        // Unknown schema type, skip validation
        logger.debug('[TypeValidator] Unknown schema type, skipping validation');
    }

    return {
      success: errors.length === 0,
      errors,
      data: errors.length === 0 ? data : undefined
    };
  }

  /**
   * Detect schema type
   */
  private detectSchemaType(schema: any): string {
    if (!schema || typeof schema !== 'object') {
      return 'unknown';
    }

    if (schema.type) {
      return schema.type;
    }

    if (schema.properties) {
      return 'object';
    }

    if (schema.items) {
      return 'array';
    }

    if (schema.enum) {
      return 'enum';
    }

    return 'unknown';
  }

  /**
   * Validate object against schema
   */
  private validateObject(data: any, schema: any, errors: string[]): void {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      errors.push(`Expected object, got ${typeof data}`);
      return;
    }

    if (schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const value = data[key];

        // Check required properties
        if (schema.required && schema.required.includes(key) && value === undefined) {
          errors.push(`Missing required property: ${key}`);
          continue;
        }

        // Validate property if present
        if (value !== undefined) {
          const propResult = this.validate(value, propSchema);
          if (!propResult.success) {
            errors.push(`Property "${key}": ${propResult.errors.join(', ')}`);
          }
        }
      }
    }

    // Validate additionalProperties
    if (schema.additionalProperties === false) {
      const allowedKeys = schema.properties ? Object.keys(schema.properties) : [];
      const actualKeys = Object.keys(data);
      const extraKeys = actualKeys.filter(k => !allowedKeys.includes(k));
      if (extraKeys.length > 0) {
        errors.push(`Unexpected properties: ${extraKeys.join(', ')}`);
      }
    }
  }

  /**
   * Validate array against schema
   */
  private validateArray(data: any, schema: any, errors: string[]): void {
    if (!Array.isArray(data)) {
      errors.push(`Expected array, got ${typeof data}`);
      return;
    }

    if (schema.items) {
      for (let i = 0; i < data.length; i++) {
        const result = this.validate(data[i], schema.items);
        if (!result.success) {
          errors.push(`Array item ${i}: ${result.errors.join(', ')}`);
        }
      }
    }

    if (schema.minItems !== undefined && data.length < schema.minItems) {
      errors.push(`Array too short: ${data.length} < ${schema.minItems}`);
    }

    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push(`Array too long: ${data.length} > ${schema.maxItems}`);
    }
  }

  /**
   * Validate string
   */
  private validateString(data: any, errors: string[]): void {
    if (typeof data !== 'string') {
      errors.push(`Expected string, got ${typeof data}`);
      return;
    }

    if (data.length === 0) {
      errors.push('String is empty');
    }
  }

  /**
   * Validate number
   */
  private validateNumber(data: any, errors: string[]): void {
    if (typeof data !== 'number' || isNaN(data)) {
      errors.push(`Expected number, got ${typeof data}`);
      return;
    }
  }

  /**
   * Validate boolean
   */
  private validateBoolean(data: any, errors: string[]): void {
    if (typeof data !== 'boolean') {
      errors.push(`Expected boolean, got ${typeof data}`);
      return;
    }
  }

  /**
   * Validate enum values
   */
  private validateEnum(data: any, schema: any, errors: string[]): void {
    if (schema.enum && !schema.enum.includes(data)) {
      errors.push(`Invalid enum value: ${data}. Expected one of: ${schema.enum.join(', ')}`);
    }
  }

  /**
   * Quick type check without detailed validation
   */
  quickCheck(data: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof data === 'string';
      case 'number':
        return typeof data === 'number' && !isNaN(data);
      case 'boolean':
        return typeof data === 'boolean';
      case 'object':
        return typeof data === 'object' && data !== null && !Array.isArray(data);
      case 'array':
        return Array.isArray(data);
      default:
        return true;
    }
  }
}
