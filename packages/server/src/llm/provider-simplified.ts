/**
 * LLM Provider - Simplified and Modularized
 * Core provider interfaces and OpenAI-compatible implementation
 */

import type { ToolCall, LLMResponse, ToolDefinition, ProviderInfo, ModelInfo } from "../core/types";
import { LLMError, AuthError, RateLimitError } from "../core/errors";
import type { ProviderPreset } from "./provider-loader";
import OpenAI from "openai";

// Re-export from new modules
export {
  getProviders,
  getProvider,
  listProviders,
  createProvider,
  hasProviderKey,
  validateProviderConfig,
  PROVIDERS
} from './provider-factory';

export { type ProviderPreset } from "./provider-loader";

export {
  retryWithBackoff,
  isRetryable,
  calculateRetryDelay
} from './retry-handler';

export {
  buildMessages,
  toOpenAITools,
  toAnthropicTools,
  validateMessage,
  filterValidMessages,
  ensureSystemMessage,
  extractToolCalls
} from './message-builder';

export {
  processOpenAIStream,
  ToolCallAccumulator,
  isStreamComplete
} from './streaming-handler';

export {
  FailoverTracker,
  executeWithFailover,
  analyzeErrorPattern
} from './failover';

export type Message = Record<string, any>;

// ============================================================================
// Abstract LLM Provider
// ============================================================================

export abstract class LLMProvider {
  protected _tokenCallback: ((tokens: number) => void) | null = null;
  protected failureHistory: Error[] = [];
  protected consecutiveFailures: number = 0;
  protected failoverTracker: FailoverTracker = new FailoverTracker();

  setTokenCallback(cb: (tokens: number) => void): void {
    this._tokenCallback = cb;
  }

  abstract chat(
    messages: Message[],
    tools: ToolDefinition[],
    system?: string,
  ): Promise<LLMResponse>;

  abstract chatStream(
    messages: Message[],
    tools: ToolDefinition[],
    system?: string,
  ): AsyncGenerator<string>;

  abstract chatStreamWithTools(
    messages: Message[],
    tools: ToolDefinition[],
    system?: string,
    onToken?: (t: string) => void,
  ): Promise<LLMResponse>;

  /**
   * Chat with smart automatic failover
   * Tracks consecutive failures and triggers failover when threshold is reached
   */
  async chatWithSmartFailover(
    messages: Message[],
    tools: ToolDefinition[],
    system?: string,
    options?: {
      fallbackProvider?: LLMProvider;
      maxConsecutiveFailures?: number;
      clearHistoryOnSuccess?: boolean;
    }
  ): Promise<LLMResponse> {
    try {
      const response = await this.chat(messages, tools, system);

      // Clear failure tracking on success
      if (this.failoverTracker.hasRecentFailures() && options?.clearHistoryOnSuccess !== false) {
        this.failoverTracker.reset();
      }

      return response;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      // Check if we should trigger failover
      if (this.failoverTracker.shouldTriggerFailover(err)) {
        if (!options?.fallbackProvider) {
          throw new Error('Primary provider failed but no fallback available');
        }

        logger.warn({
          primaryFailures: this.failoverTracker.getFailureCount(),
          lastError: err.message
        }, 'triggering_failover');

        // Try fallback provider
        try {
          const fallbackResponse = await options.fallbackProvider.chat(messages, tools, system);

          // Optionally reset on fallback success
          if (options.clearHistoryOnSuccess !== false) {
            this.failoverTracker.reset();
          }

          logger.info('fallback_succeeded');
          return fallbackResponse;
        } catch (fallbackError) {
          const fbErr = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
          throw new Error(
            `Both primary and fallback providers failed. Primary: ${err.message}, Fallback: ${fbErr.message}`
          );
        }
      }

      throw error;
    }
  }

  /**
   * Determine if failover should be triggered based on error patterns
   */
  protected shouldTriggerFailover(consecutiveFailures: number, maxFailures: number, error: Error): boolean {
    // Always trigger if max failures reached
    if (consecutiveFailures >= maxFailures) {
      return true;
    }

    // Trigger early for critical errors
    const criticalPatterns = [
      'rate limit',
      'quota exceeded',
      'temporarily unavailable',
      'service overloaded'
    ];

    const errorMsg = error.message.toLowerCase();
    if (criticalPatterns.some(pattern => errorMsg.includes(pattern))) {
      return true;
    }

    return false;
  }

  /**
   * Get provider info
   */
  getInfo(): ProviderInfo {
    return {
      name: this.constructor.name,
      label: this.constructor.name,
      models: [],
      defaultModel: ''
    };
  }
}

// ============================================================================
// OpenAI-Compatible Provider
// ============================================================================

export class OpenAICompatibleProvider extends LLMProvider {
  protected client: OpenAI;
  protected model: string;
  protected baseUrl?: string;

  constructor(model: string, apiKey?: string, baseUrl?: string) {
    super();
    this.model = model;
    this.baseUrl = baseUrl;
    this.client = new OpenAI({
      apiKey: apiKey ?? "unused",
      baseURL: baseUrl ?? undefined,
    });
  }

  /**
   * Check if this is a MiniMax provider
   */
  protected isMiniMax(): boolean {
    return this.model.startsWith('MiniMax-') ||
           this.baseUrl?.includes('minimax') ||
           this.baseUrl?.includes('minimaxi');
  }

  /**
   * Build OpenAI-compatible messages
   */
  protected buildOpenAIMessages(
    messages: Message[],
    system?: string
  ): OpenAI.Chat.CompletionMessageParam[] {
    const out: OpenAI.Chat.CompletionMessageParam[] = [];

    if (system) {
      out.push({ role: "system", content: system });
    }

    for (const m of messages) {
      out.push(m as OpenAI.Chat.CompletionMessageParam);
    }

    return out;
  }

  async chat(
    messages: Message[],
    tools: ToolDefinition[],
    system?: string,
  ): Promise<LLMResponse> {
    const openaiMsgs = this.buildOpenAIMessages(messages, system);
    const openaiTools = toOpenAITools(tools);

    const response = await retryWithBackoff(async () => {
      return await this.client.chat.completions.create({
        model: this.model,
        messages: openaiMsgs,
        tools: openaiTools,
      });
    }, {
      maxRetries: 3,
      baseDelay: 1000,
      customDelay: (attempt, error) => {
        // Use longer delays for MiniMax unknown errors
        if (this.isMiniMax() && error?.message?.includes('unknown error (1000)')) {
          return 10000 + (attempt * 5000);
        }
        return undefined; // Use default exponential backoff
      }
    });

    return this.parseResponse(response);
  }

  async *chatStream(
    messages: Message[],
    tools: ToolDefinition[],
    system?: string,
  ): AsyncGenerator<string> {
    const openaiMsgs = this.buildOpenAIMessages(messages, system);
    const openaiTools = toOpenAITools(tools);

    const stream = await retryWithBackoff(async () => {
      return await this.client.chat.completions.create({
        model: this.model,
        messages: openaiMsgs,
        tools: openaiTools,
        stream: true,
      });
    });

    yield* processOpenAIStream(stream);
  }

  async chatStreamWithTools(
    messages: Message[],
    tools: ToolDefinition[],
    system?: string,
    onToken?: (t: string) => void,
  ): Promise<LLMResponse> {
    const openaiMsgs = this.buildOpenAIMessages(messages, system);
    const openaiTools = toOpenAITools(tools);

    const accumulator = new ToolCallAccumulator();
    let fullContent = '';

    const stream = await retryWithBackoff(async () => {
      return await this.client.chat.completions.create({
        model: this.model,
        messages: openaiMsgs,
        tools: openaiTools,
        stream: true,
      });
    });

    for await (const chunk of stream) {
      if (chunk.choices && chunk.choices[0]) {
        const choice = chunk.choices[0];

        // Handle content
        if (choice.delta?.content) {
          const content = choice.delta.content;
          fullContent += content;
          if (onToken) onToken(content);
        }

        // Handle tool calls
        if (choice.delta?.tool_calls) {
          for (const tc of choice.delta.tool_calls) {
            accumulator.processDelta(tc);
          }
        }

        // Check if complete
        if (choice.finish_reason) {
          break;
        }
      }
    }

    return {
      text: fullContent,
      toolCalls: accumulator.getToolCalls(),
      usage: null // TODO: Extract from response
    };
  }

  /**
   * Parse OpenAI response to LLMResponse format
   */
  protected parseResponse(response: any): LLMResponse {
    if (!response.choices || response.choices.length === 0) {
      throw new LLMError('No response choices returned');
    }

    const choice = response.choices[0];
    const content = choice.message?.content || '';

    // Extract tool calls
    const toolCalls: ToolCall[] = [];
    if (choice.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments
        });
      }
    }

    return {
      text: content,
      toolCalls,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      }
    };
  }

  /**
   * Get provider info
   */
  getInfo(): ProviderInfo {
    return {
      name: 'OpenAI-Compatible',
      label: 'OpenAI-Compatible Provider',
      models: [this.model],
      defaultModel: this.model
    };
  }
}

// ============================================================================
// Legacy Exports (for compatibility)
// ============================================================================

export { OpenAICompatibleProvider as Provider };

// ============================================================================
// Utilities
// ============================================================================

import { hasKey } from "../core/auth";
import { loadProviders } from "./provider-loader";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

let _providers: Record<string, ProviderPreset> | null = null;

export function getProvidersLegacy(): Record<string, ProviderPreset> {
  if (!_providers) _providers = loadProviders();
  return _providers;
}

export const PROVIDERS_LEGACY = new Proxy({} as Record<string, ProviderPreset>, {
  get(_, key) { return getProvidersLegacy()[key as string]; },
  has(_, key) { return key in getProvidersLegacy(); },
  ownKeys() { return Object.keys(getProvidersLegacy()); },
  getOwnPropertyDescriptor(_, key) { return { enumerable: true, configurable: true, value: getProvidersLegacy()[key as string] }; },
});

export async function listProvidersWithAuth(): Promise<ProviderInfo[]> {
  const providers = listProviders();
  for (const p of providers) {
    if (p.needs_api_key) {
      p.has_key = await hasKey(p.name);
    }
  }
  return providers;
}

// Import logger
import logger from "../core/logging";
