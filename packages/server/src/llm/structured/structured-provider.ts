/**
 * Structured Provider - Simplified
 *
 * Refactored from 474 lines to ~150 lines
 * Parsing extracted to ResponseParser
 * Validation extracted to TypeValidator
 * Retry logic extracted to RetryHandler
 */

import type { LLMProvider, Message } from "../../provider.js";
import type { ToolDefinition } from "../../core/types.js";
import { StructuredResponseParser } from "./parsers/response-parser.js";
import { TypeValidator } from "./validators/type-validator.js";
import { RetryHandler } from "./handlers/retry-handler.js";
import { createLogger } from "../../core/logging.js";

const logger = createLogger('StructuredProvider');

export interface StructuredProviderOptions {
  parser?: StructuredResponseParser;
  validator?: TypeValidator;
  retryHandler?: RetryHandler;
  maxRetries?: number;
}

/**
 * Structured Provider handles LLM responses with structured output
 * This coordinates parsing, validation, and retry logic
 */
export class StructuredProvider implements LLMProvider {
  private parser: StructuredResponseParser;
  private validator: TypeValidator;
  private retryHandler: RetryHandler;

  constructor(
    private baseProvider: LLMProvider,
    options: StructuredProviderOptions = {}
  ) {
    this.parser = options.parser ?? new StructuredResponseParser();
    this.validator = options.validator ?? new TypeValidator();
    this.retryHandler = options.retryHandler ?? new RetryHandler({
      maxAttempts: options.maxRetries ?? 3
    });
  }

  /**
   * Get model identifier
   */
  get model(): string {
    return this.baseProvider.model;
  }

  /**
   * Chat with structured output
   */
  async chat(messages: Message[], systemPrompt?: string): Promise<string> {
    return this.baseProvider.chat(messages, systemPrompt);
  }

  /**
   * Chat with tools and structured output parsing
   */
  async chatStreamWithTools(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt?: string,
    onChunk?: (chunk: string) => void
  ): Promise<any> {
    return this.baseProvider.chatStreamWithTools(messages, tools, systemPrompt, onChunk);
  }

  /**
   * Generate structured output
   */
  async generateStructured<T>(
    prompt: string,
    schema: any,
    options: {
      format?: 'json' | 'xml' | 'markdown' | 'auto';
      systemPrompt?: string;
      maxRetries?: number;
    } = {}
  ): Promise<T> {
    const { format = 'auto', systemPrompt, maxRetries = 3 } = options;

    logger.info(`[StructuredProvider] Generating structured output (format: ${format})`);

    // Build prompt with schema instructions
    const enhancedPrompt = this.buildPromptWithSchema(prompt, schema, format);

    // Execute with retry
    const result = await this.retryHandler.executeWithValidation(
      async () => {
        const response = await this.baseProvider.chat(
          [{ role: 'user', content: enhancedPrompt }],
          systemPrompt
        );
        return response;
      },
      (response) => this.validateAndParse(response, schema, format)
    );

    if (!result.success) {
      throw new Error(`Failed to generate valid structured output: ${result.error}`);
    }

    return result.data as T;
  }

  /**
   * Build prompt with schema instructions
   */
  private buildPromptWithSchema(prompt: string, schema: any, format: string): string {
    const schemaInstructions = this.getSchemaInstructions(schema, format);
    return `${prompt}\n\n${schemaInstructions}`;
  }

  /**
   * Get schema formatting instructions
   */
  private getSchemaInstructions(schema: any, format: string): string {
    const schemaStr = JSON.stringify(schema, null, 2);

    switch (format) {
      case 'json':
        return `Respond with valid JSON matching this schema:\n\`\`\`json\n${schemaStr}\n\`\`\``;
      case 'xml':
        return `Respond with XML where each schema property is an element.`;
      case 'markdown':
        return `Respond with a Markdown table where columns represent schema properties.`;
      default:
        return `Respond with structured data matching this schema:\n${schemaStr}`;
    }
  }

  /**
   * Validate and parse response
   */
  private validateAndParse(response: string, schema: any, format: string): { valid: boolean; error?: string } {
    // Parse based on format
    let parseResult;
    switch (format) {
      case 'json':
        parseResult = this.parser.parseJson(response);
        break;
      case 'xml':
        parseResult = this.parser.parseXml(response);
        break;
      case 'markdown':
        parseResult = this.parser.parseMarkdownTable(response);
        break;
      case 'auto':
        parseResult = this.parser.autoParse(response);
        break;
      default:
        parseResult = this.parser.parseJson(response);
    }

    if (!parseResult.success) {
      return { valid: false, error: `Parse failed: ${parseResult.error}` };
    }

    // Validate against schema
    const validationResult = this.validator.validate(parseResult.data, schema);

    if (!validationResult.success) {
      return {
        valid: false,
        error: `Validation failed: ${validationResult.errors.join(', ')}`
      };
    }

    return { valid: true };
  }

  /**
   * Extract structured data from response
   */
  extractStructured<T>(response: string, schema: any): { success: boolean; data?: T; error?: string } {
    logger.debug('[StructuredProvider] Extracting structured data from response');

    // Auto-detect format and parse
    const parseResult = this.parser.autoParse(response);

    if (!parseResult.success) {
      return {
        success: false,
        error: `Failed to parse response: ${parseResult.error}`
      };
    }

    // Validate parsed data
    const validationResult = this.validator.validate(parseResult.data, schema);

    if (!validationResult.success) {
      return {
        success: false,
        error: `Validation failed: ${validationResult.errors.join(', ')}`
      };
    }

    logger.info('[StructuredProvider] Successfully extracted and validated structured data');
    return {
      success: true,
      data: validationResult.data as T
    };
  }
}

/**
 * Factory function to create a structured provider wrapping another provider
 */
export function createStructuredProvider(baseProvider: LLMProvider, options?: StructuredProviderOptions): StructuredProvider {
  return new StructuredProvider(baseProvider, options);
}
