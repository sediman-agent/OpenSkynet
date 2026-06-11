/**
 * Response Handler
 * Handles structured responses from LLM providers
 */

import type { LLMProvider } from '../../llm/provider';
import type { StructuredProvider } from '../../llm/structured/index';
import type { AgentResponse, AgentResponseSchema } from '../../schemas';
import { coerceAgentResponse } from '../../schemas';
import { createLogger } from '../../../core/logging';

const logger = createLogger('response-handler');

/**
 * Response handler options
 */
export interface ResponseHandlerOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Response Handler
 * This is extracted from agent/execution/enhanced-loop.ts
 */
export class ResponseHandler {
  constructor(
    private llmProvider: LLMProvider,
    private structuredLLMProvider?: StructuredProvider
  ) {}

  /**
   * Get structured response from LLM
   */
  async getStructuredResponse(
    conversation: any[],
    schema: any,
    systemPrompt: string,
    options: ResponseHandlerOptions = {}
  ): Promise<AgentResponse> {
    const opts = {
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 4096
    };

    if (this.structuredLLMProvider) {
      return await this.getStructuredOutput(conversation, schema, systemPrompt, opts);
    } else {
      return await this.parseRegularResponse(conversation, systemPrompt);
    }
  }

  /**
   * Get response from structured output provider
   */
  private async getStructuredOutput(
    conversation: any[],
    schema: any,
    systemPrompt: string,
    options: ResponseHandlerOptions
  ): Promise<AgentResponse> {
    const result = await this.structuredLLMProvider!.chatStructured(
      conversation,
      schema,
      systemPrompt,
      options
    );

    logger.info({ usage: result.usage }, '[ResponseHandler] Structured LLM response received');
    return result.data;
  }

  /**
   * Parse response from regular LLM
   */
  private async parseRegularResponse(conversation: any[], systemPrompt: string): Promise<AgentResponse> {
    // Get tools
    const tools = this.llmProvider.getTools ? this.llmProvider.getTools() : [];

    // Call LLM
    const response = await this.llmProvider.chat(conversation, tools, systemPrompt);

    // Try to parse as JSON first
    if (response.text) {
      try {
        const parsed = JSON.parse(response.text);
        // Would validate against schema here if available
        if (this.isValidAgentResponse(parsed)) {
          return parsed;
        }
      } catch {
        // Fall through to coercion
      }
    }

    // Fallback to coercion
    return this.coerceResponse(response);
  }

  /**
   * Validate agent response structure
   */
  private isValidAgentResponse(data: any): boolean {
    return (
      typeof data === 'object' &&
      data !== null &&
      ('thought' in data || 'actions' in data || 'done' in data)
    );
  }

  /**
   * Coerce response to valid structure
   */
  private coerceResponse(response: any): AgentResponse {
    return coerceAgentResponse({
      thought: {
        thinking: response.text?.slice(0, 500) || 'No reasoning',
        evaluation: 'uncertain',
        memory: '',
        nextGoal: 'Continue'
      },
      actions: response.tool_calls?.map((tc: any) => ({
        name: tc.name,
        arguments: tc.arguments
      })) || [],
      done: !!response.done,
      summary: response.text
    });
  }

  /**
   * Set structured LLM provider
   */
  setStructuredProvider(provider: StructuredProvider): void {
    this.structuredLLMProvider = provider;
    logger.info('[ResponseHandler] Structured LLM provider set');
  }

  /**
   * Check if structured provider is available
   */
  hasStructuredProvider(): boolean {
    return !!this.structuredLLMProvider;
  }

  /**
   * Extract thought from response
   */
  extractThought(response: AgentResponse): string | undefined {
    return response.thought?.thinking;
  }

  /**
   * Extract evaluation from response
   */
  extractEvaluation(response: AgentResponse): string | undefined {
    return response.thought?.evaluation;
  }

  /**
   * Extract memory from response
   */
  extractMemory(response: AgentResponse): string | undefined {
    return response.thought?.memory;
  }

  /**
   * Check if response indicates completion
   */
  isComplete(response: AgentResponse): boolean {
    return !!response.done;
  }

  /**
   * Check if response indicates success
   */
  isSuccess(response: AgentResponse): boolean {
    const eval = response.thought?.evaluation?.toLowerCase() || '';
    return eval.includes('success');
  }

  /**
   * Get final result from response
   */
  getFinalResult(response: AgentResponse): string {
    return response.summary || response.thought?.memory || 'Task completed';
  }
}
