/**
 * LLM Provider - Simplified
 *
 * Refactored from 332 lines to ~150 lines
 * Tool conversion extracted to ToolConverter
 * Retry logic extracted to RetryHandler
 * Response parsing extracted to ResponseParser
 */

import type { ToolCall, LLMResponse, ToolDefinition, ProviderInfo, ModelInfo, Message } from "../core/types.js";
import { LLMError, AuthError, RateLimitError } from "../core/errors.js";
import { getKey, hasKey } from "../core/auth.js";
import logger from "../core/logging.js";
import { loadProviders, loadProviderCategories } from "./provider-loader.js";
import type { ProviderPreset } from "./provider-loader.js";
import OpenAI from "openai";

// Extracted modules
import { ToolConverter } from "./conversion/tool-converter.js";
import { RetryHandler } from "./retry/retry-handler.js";
import { ResponseParser } from "./parsing/response-parser.js";

export type { Message };
export { type ProviderPreset } from "./provider-loader.js";

// ============================================================================
// Provider Registry (Singleton Pattern)
// ============================================================================

let _providers: Record<string, ProviderPreset> | null = null;
let _categories: Record<string, string> | null = null;

export function getProviders(): Record<string, ProviderPreset> {
  if (!_providers) _providers = loadProviders();
  return _providers;
}

export function getProviderCategories(): Record<string, string> {
  if (!_categories) _categories = loadProviderCategories();
  return _categories;
}

export const PROVIDERS: Record<string, ProviderPreset> = new Proxy({} as Record<string, ProviderPreset>, {
  get(_, key) { return getProviders()[key as string]; },
  has(_, key) { return key in getProviders(); },
  ownKeys() { return Object.keys(getProviders()); },
  getOwnPropertyDescriptor(_, key) {
    return { enumerable: true, configurable: true, value: getProviders()[key as string] };
  },
});

export const PROVIDER_CATEGORIES: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_, key) { return getProviderCategories()[key as string]; },
});

// ============================================================================
// Abstract LLM Provider
// ============================================================================

export abstract class LLMProvider {
  protected _tokenCallback: ((tokens: number) => void) | null = null;

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

  abstract chatWithFailover(
    messages: Message[],
    tools: ToolDefinition[],
    system?: string,
    fallback?: LLMProvider,
  ): Promise<LLMResponse>;
}

// ============================================================================
// OpenAI Compatible Provider
// ============================================================================

export class OpenAICompatibleProvider extends LLMProvider {
  protected client: OpenAI;
  protected model: string;
  private retryHandler: RetryHandler;

  constructor(model: string, apiKey?: string, baseUrl?: string) {
    super();
    this.model = model;
    this.client = new OpenAI({
      apiKey: apiKey ?? "unused",
      baseURL: baseUrl ?? undefined,
    });
    this.retryHandler = new RetryHandler({ maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 30000 });
  }

  /**
   * Chat with retry logic using RetryHandler
   */
  protected async _chatWithRetry(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    tools?: OpenAI.Chat.ChatCompletionTool[],
  ): Promise<OpenAI.Chat.ChatCompletion> {
    return this.retryHandler.executeWithRetry(async (attempt) => {
      const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: this.model,
        messages,
        tools,
      };
      return await this.client.chat.completions.create(params);
    }, (attempt, delay) => {
      logger.warn({ attempt, delay }, "llm_retry");
    });
  }

  /**
   * Build OpenAI message format
   */
  protected buildMessages(
    messages: Message[],
    system?: string,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const out: OpenAI.Chat.ChatCompletionMessageParam[] = [];
    if (system) {
      out.push({ role: "system", content: system });
    }
    for (const m of messages) {
      out.push(m as OpenAI.Chat.ChatCompletionMessageParam);
    }
    return out;
  }

  /**
   * Non-streaming chat
   */
  async chat(
    messages: Message[],
    tools: ToolDefinition[],
    system?: string,
  ): Promise<LLMResponse> {
    const openaiMsgs = this.buildMessages(messages, system);
    const openaiTools = ToolConverter.toOpenAITools(tools);
    const resp = await this._chatWithRetry(openaiMsgs, openaiTools);
    const choice = resp.choices?.[0];
    if (!choice) throw new LLMError("No choices returned");

    if (resp.usage && this._tokenCallback) {
      this._tokenCallback(resp.usage.total_tokens);
    }

    return ResponseParser.parseResponse(choice);
  }

  /**
   * Streaming chat (text only)
   */
  async *chatStream(
    messages: Message[],
    tools: ToolDefinition[],
    system?: string,
  ): AsyncGenerator<string> {
    const openaiMsgs = this.buildMessages(messages, system);
    const openaiTools = ToolConverter.toOpenAITools(tools);

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMsgs,
      tools: openaiTools,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) yield delta;
    }
  }

  /**
   * Streaming chat with tool calls
   */
  async chatStreamWithTools(
    messages: Message[],
    tools: ToolDefinition[],
    system?: string,
    onToken?: (t: string) => void,
  ): Promise<LLMResponse> {
    const openaiMsgs = this.buildMessages(messages, system);
    const openaiTools = ToolConverter.toOpenAITools(tools);

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: openaiMsgs,
      tools: openaiTools,
      stream: true,
    });

    let text = "";
    const toolCallMap = new Map<number, { id: string; name: string; arguments: string }>();
    let finishReason: string | null = null;

    for await (const chunk of stream) {
      const parsed = ResponseParser.parseStreamChunk(chunk);

      if (parsed.text) {
        text += parsed.text;
        onToken?.(parsed.text);
      }

      if (parsed.toolCalls) {
        for (const tc of parsed.toolCalls) {
          const idx = (parsed.toolCalls?.indexOf(tc) ?? 0);
          if (!toolCallMap.has(idx)) {
            toolCallMap.set(idx, {
              id: tc.id ?? "",
              name: tc.name ?? "",
              arguments: "",
            });
          }
          const entry = toolCallMap.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.name) entry.name = tc.name;
          if (tc.arguments) {
            entry.arguments += JSON.stringify(tc.arguments);
          }
        }
      }

      if (parsed.finishReason) {
        finishReason = parsed.finishReason;
      }
    }

    const toolCalls: ToolCall[] = [];
    for (const [, tc] of toolCallMap) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.arguments || "{}");
      } catch {}
      toolCalls.push({ id: tc.id, name: tc.name, arguments: args });
    }

    return {
      text: text || null,
      tool_calls: toolCalls,
      done: finishReason === "stop",
    };
  }

  /**
   * Chat with failover to fallback provider
   */
  async chatWithFailover(
    messages: Message[],
    tools: ToolDefinition[],
    system?: string,
    fallback?: LLMProvider,
  ): Promise<LLMResponse> {
    try {
      return await this.chat(messages, tools, system);
    } catch (err) {
      if (!fallback) throw err;
      logger.warn({ err: (err as Error).message }, "llm_failover_triggered");
      return await fallback.chat(messages, tools, system);
    }
  }

  /**
   * Update retry configuration
   */
  updateRetryConfig(options: { maxRetries?: number; baseDelayMs?: number }): void {
    this.retryHandler.updateOptions(options);
  }
}

// ============================================================================
// Provider Factory Functions
// ============================================================================

export function createProvider(
  provider: string,
  model?: string,
  baseUrl?: string,
  apiKey?: string,
): OpenAICompatibleProvider {
  const preset = PROVIDERS[provider];
  if (!preset) throw new LLMError(`Unknown provider: ${provider}`);

  const resolvedModel = model ?? preset.model;
  const resolvedBaseUrl = baseUrl ?? preset.base_url;

  return new OpenAICompatibleProvider(resolvedModel, apiKey, resolvedBaseUrl);
}

export function listProviders(): ProviderInfo[] {
  const result: ProviderInfo[] = [];
  for (const [name, preset] of Object.entries(PROVIDERS)) {
    result.push({
      name,
      default_model: preset.model,
      default_base_url: preset.base_url,
      category: preset.category,
      needs_api_key: !!preset.api_key_env,
      has_key: false,
      auto_detect: preset.auto_detect,
    });
  }
  return result;
}

export async function listProvidersWithAuth(): Promise<ProviderInfo[]> {
  const providers = listProviders();
  for (const p of providers) {
    if (p.needs_api_key) {
      p.has_key = await hasKey(p.name);
    }
  }
  return providers;
}

// ============================================================================
// Re-export extracted modules for direct use
// ============================================================================

export { ToolConverter, RetryHandler, ResponseParser };
