/**
 * Schema Parser - Simplified
 *
 * Refactored from 469 lines to ~100 lines
 * Parsing strategies extracted to dedicated modules
 */

import { JsonParser } from './parsers/json-parser.js';
import { MarkdownParser } from './parsers/markdown-parser.js';
import { XmlParser } from './parsers/xml-parser.js';
import { TextParser } from './parsers/text-parser.js';
import { createLogger } from '../../core/logging.js';

const logger = createLogger('SchemaParser');

export interface ParseOptions {
  format?: 'json' | 'xml' | 'markdown' | 'text' | 'auto';
  schema?: any;
  fallback?: boolean;
}

export interface ParseResult {
  success: boolean;
  data?: any;
  format?: string;
  error?: string;
}

/**
 * Schema Parser coordinates different parsing strategies
 * This replaces the monolithic parser.ts with strategy pattern
 */
export class SchemaParser {
  private jsonParser: JsonParser;
  private markdownParser: MarkdownParser;
  private xmlParser: XmlParser;
  private textParser: TextParser;

  constructor() {
    this.jsonParser = new JsonParser();
    this.markdownParser = new MarkdownParser();
    this.xmlParser = new XmlParser();
    this.textParser = new TextParser();
  }

  /**
   * Parse text with specified or auto-detected format
   */
  parse(text: string, options: ParseOptions = {}): ParseResult {
    const { format = 'auto', schema, fallback = true } = options;

    logger.debug(`[SchemaParser] Parsing with format: ${format}`);

    // Try specific format first
    if (format !== 'auto') {
      return this.parseWithFormat(text, format, schema);
    }

    // Auto-detect format
    const detectedFormat = this.detectFormat(text);

    if (detectedFormat) {
      const result = this.parseWithFormat(text, detectedFormat, schema);
      if (result.success || !fallback) {
        return { ...result, format: detectedFormat };
      }
    }

    // Fallback to text parser
    logger.debug('[SchemaParser] Falling back to text parser');
    const textResult = this.textParser.parsePlainText(text);

    return {
      ...textResult,
      format: 'text'
    };
  }

  /**
   * Parse with specific format
   */
  private parseWithFormat(text: string, format: string, schema?: any): ParseResult {
    switch (format) {
      case 'json':
        return this.jsonParser.parse(text, schema);

      case 'markdown':
      case 'table':
        return this.markdownParser.parse(text);

      case 'xml':
        return this.xmlParser.parse(text);

      case 'text':
        return this.textParser.parsePlainText(text);

      default:
        return {
          success: false,
          error: `Unknown format: ${format}`
        };
    }
  }

  /**
   * Detect format from text
   */
  private detectFormat(text: string): string | null {
    // Check for JSON
    if (this.jsonParser.extractJson(text)) {
      return 'json';
    }

    // Check for XML
    if (this.xmlParser.extractXml(text)) {
      return 'xml';
    }

    // Check for Markdown table
    if (this.markdownParser.findTable(text)) {
      return 'markdown';
    }

    // Check for key-value pairs
    const kvPattern = /^([^:]+):\s*(.+)$/m;
    if (kvPattern.test(text)) {
      return 'text';
    }

    return null;
  }

  /**
   * Validate parsed data against schema
   */
  validate(data: any, schema: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!schema) {
      return { valid: true, errors: [] };
    }

    // Type validation
    if (schema.type) {
      const expectedType = schema.type;
      const actualType = Array.isArray(data) ? 'array' : typeof data;

      if (expectedType !== actualType && expectedType !== 'any') {
        errors.push(`Expected ${expectedType}, got ${actualType}`);
      }
    }

    // Property validation for objects
    if (schema.properties && typeof data === 'object' && data !== null) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const value = data[key];

        // Check required
        if (schema.required?.includes(key) && value === undefined) {
          errors.push(`Missing required property: ${key}`);
        }

        // Type check
        if (value !== undefined && propSchema.type) {
          const propType = propSchema.type;
          const actualType = Array.isArray(value) ? 'array' : typeof value;

          if (propType !== actualType && propType !== 'any') {
            errors.push(`Property "${key}": expected ${propType}, got ${actualType}`);
          }
        }
      }
    }

    // Array validation
    if (schema.items && Array.isArray(data)) {
      for (let i = 0; i < data.length; i++) {
        const itemValidation = this.validate(data[i], schema.items);
        if (!itemValidation.valid) {
          errors.push(`Array item ${i}: ${itemValidation.errors.join(', ')}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Parse and validate in one step
   */
  parseAndValidate(text: string, schema: any, options?: ParseOptions): ParseResult {
    const parseResult = this.parse(text, options);

    if (!parseResult.success) {
      return parseResult;
    }

    const validation = this.validate(parseResult.data, schema);

    if (!validation.valid) {
      return {
        success: false,
        error: `Validation failed: ${validation.errors.join(', ')}`
      };
    }

    return parseResult;
  }

  /**
   * Convert parsed data to JSON string
   */
  toJson(data: any): string {
    return JSON.stringify(data, null, 2);
  }

  /**
   * Format data as Markdown table
   */
  toMarkdownTable(data: any[]): string {
    if (!Array.isArray(data) || data.length === 0) {
      return '';
    }

    const headers = Object.keys(data[0]);
    const rows = data.map(obj => headers.map(h => String(obj[h] ?? '')));

    // Build Markdown table
    let markdown = '| ' + headers.join(' | ') + ' |\n';
    markdown += '| ' + headers.map(() => '---').join(' | ') + ' |\n';

    for (const row of rows) {
      markdown += '| ' + row.join(' | ') + ' |\n';
    }

    return markdown;
  }

  /**
   * Format data as XML
   */
  toXml(data: any, rootElement: string = 'root'): string {
    const toXmlString = (obj: any, indent: string = ''): string => {
      if (obj === null || obj === undefined) {
        return '';
      }

      if (typeof obj !== 'object') {
        return String(obj);
      }

      const entries = Object.entries(obj);
      if (entries.length === 0) {
        return '';
      }

      let xml = '';
      for (const [key, value] of entries) {
        xml += `${indent}<${key}>`;
        xml += toXmlString(value, indent + '  ');
        xml += `${indent}</${key}>\n`;
      }

      return xml;
    };

    return `<?xml version="1.0"?>\n<${rootElement}>\n${toXmlString(data)}${RootElement}>`;
  }
}
