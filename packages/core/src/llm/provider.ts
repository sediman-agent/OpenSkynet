import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import type { LLMProviderConfig, LLMResponse, ToolCall } from "../types/index.js";
import { LLMError } from "../errors/index.js";

export interface LLMProvider {
  chat(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
    system?: string,
  ): Promise<LLMResponse>;
  chatStream(
    messages: ChatCompletionMessageParam[],
    system?: string,
  ): AsyncGenerator<string>;
  getOpenAI(): OpenAI;
}

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;
  private provider: string;

  constructor(config: { apiKey: string; model: string; baseURL?: string; provider: string }) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });
    this.model = config.model;
    this.provider = config.provider;
  }

  async chat(
    messages: ChatCompletionMessageParam[],
    tools?: ChatCompletionTool[],
    system?: string,
  ): Promise<LLMResponse> {
    const allMessages: ChatCompletionMessageParam[] = [];
    if (system) {
      allMessages.push({ role: "system", content: system });
    }
    allMessages.push(...messages);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: allMessages,
        tools: tools?.length ? tools : undefined,
      });

      const choice = response.choices[0];
      if (!choice?.message) {
        return { text: "", toolCalls: [], done: true };
      }

      const toolCalls: ToolCall[] = (choice.message.tool_calls ?? [])
        .filter((tc): tc is Extract<typeof tc, { function: unknown }> => "function" in tc)
        .map((tc) => ({
          id: tc.id,
          name: (tc as { function: { name: string; arguments: string } }).function.name,
          arguments: (tc as { function: { name: string; arguments: string } }).function.arguments,
        }));

      return {
        text: choice.message.content ?? "",
        toolCalls,
        done: choice.finish_reason === "stop",
      };
    } catch (err) {
      throw new LLMError(
        `LLM chat failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async *chatStream(
    messages: ChatCompletionMessageParam[],
    system?: string,
  ): AsyncGenerator<string> {
    const allMessages: ChatCompletionMessageParam[] = [];
    if (system) {
      allMessages.push({ role: "system", content: system });
    }
    allMessages.push(...messages);

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: allMessages,
        stream: true,
      });

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } catch (err) {
      throw new LLMError(
        `LLM stream failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  getOpenAI(): OpenAI {
    return this.client;
  }

  getModel(): string {
    return this.model;
  }

  getProvider(): string {
    return this.provider;
  }
}

interface ProviderPreset {
  baseURL?: string;
  model: string;
  apiKey: string;
}

function getProviderPreset(
  provider: string,
  model?: string,
): ProviderPreset {
  switch (provider) {
    case "openai":
      return {
        apiKey: process.env.OPENAI_API_KEY ?? "",
        model: model ?? "gpt-4o",
      };
    case "ollama":
      return {
        baseURL: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434/v1",
        apiKey: "not-needed",
        model: model ?? "qwen3",
      };
    default:
      return {
        apiKey: process.env.OPENAI_API_KEY ?? "",
        model: model ?? "gpt-4o",
      };
  }
}

export function createProvider(config: LLMProviderConfig): LLMProvider {
  const preset = getProviderPreset(config.provider, config.model);

  return new OpenAIProvider({
    apiKey: config.apiKey ?? preset.apiKey,
    model: config.model ?? preset.model,
    baseURL: config.baseUrl ?? preset.baseURL,
    provider: config.provider,
  });
}
