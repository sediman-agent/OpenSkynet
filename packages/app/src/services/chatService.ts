import { apiPost, apiStream } from './apiClient';

export interface ChatStreamOptions {
  onChunk: (delta: string, phase?: string) => void;
  onProgress?: (progress: { phase: string; message: string; detail?: string }) => void;
  onDone?: (result?: any) => void;
  onError?: (error: string) => void;
  onIntervention?: (message: string, id: number) => void;
  onBrowserOpenRequired?: (reason: string, task: string) => void;
  onRetry?: (attempt: number, maxRetries: number) => void;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

interface RunTaskParams {
  task: string;
  model?: string;
  provider?: string;
  mode?: string;
  conversation?: ConversationMessage[];
}

/**
 * Proper error classification for retry logic
 */
enum RetryStrategy {
  /** Should retry with exponential backoff */
  RETRY = 'retry',
  /** Should not retry - client error */
  NO_RETRY = 'no_retry',
  /** Unknown - retry with caution */
  UNKNOWN = 'unknown'
}

/**
 * Classify error and determine retry strategy
 * Uses proper error type checking instead of fragile string matching
 */
function classifyError(error: unknown): { strategy: RetryStrategy; reason: string } {
  // Network errors that should be retried
  if (error instanceof Error) {
    const errorMessage = error.message.toLowerCase();
    const errorName = error.name;

    // Network/timeout errors - retry
    if (
      errorName === 'TypeError' &&
      (errorMessage.includes('fetch') || errorMessage.includes('network'))
    ) {
      return { strategy: RetryStrategy.RETRY, reason: 'Network error' };
    }

    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('err_incomplete') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('etimedout') ||
      errorMessage.includes('socket hang up') ||
      errorMessage.includes('connection reset') ||
      errorMessage.includes('connection refused')
    ) {
      return { strategy: RetryStrategy.RETRY, reason: 'Network/timeout error' };
    }

    // HTTP 5xx errors - retry (server-side issues)
    const httpMatch = errorMessage.match(/http\s*status\s*(\d{3})/i);
    if (httpMatch) {
      const statusCode = parseInt(httpMatch[1], 10);
      if (statusCode >= 500 && statusCode < 600) {
        return { strategy: RetryStrategy.RETRY, reason: `Server error ${statusCode}` };
      }
      if (statusCode >= 400 && statusCode < 500) {
        return { strategy: RetryStrategy.NO_RETRY, reason: `Client error ${statusCode}` };
      }
    }

    // Rate limiting - retry with backoff
    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return { strategy: RetryStrategy.RETRY, reason: 'Rate limited' };
    }
  }

  // Default to unknown - retry with caution
  return { strategy: RetryStrategy.UNKNOWN, reason: 'Unknown error type' };
}

/**
 * Calculate exponential backoff delay with jitter
 * @param attempt - Current attempt number (1-based)
 * @param baseDelay - Base delay in milliseconds
 * @param maxDelay - Maximum delay in milliseconds
 * @returns Delay in milliseconds
 */
function calculateBackoff(attempt: number, baseDelay = 1000, maxDelay = 10000): number {
  // Exponential backoff: baseDelay * 2^(attempt-1)
  const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);

  // Add jitter (±25% randomness to avoid thundering herd)
  const jitter = 0.25;
  const randomFactor = 1 - jitter + Math.random() * (2 * jitter);

  // Cap at maxDelay
  return Math.min(exponentialDelay * randomFactor, maxDelay);
}

interface RetryConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryUnknownErrors?: boolean;
}

const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  retryUnknownErrors: true
};

class ChatService {
  private retryConfig: RetryConfig = {};

  /**
   * Configure retry behavior
   */
  configureRetry(config: RetryConfig): void {
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  async runTask(
    task: string,
    options: ChatStreamOptions,
    params?: {
      model?: string;
      provider?: string;
      mode?: string;
      conversation?: ConversationMessage[];
    }
  ): Promise<void> {
    const config = { ...DEFAULT_RETRY_CONFIG, ...this.retryConfig };
    let attempt = 0;

    const attemptRequest = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        let isDone = false;

        const requestBody: RunTaskParams = {
          task,
          mode: params?.mode || 'manager',
          // Include conversation history if provided
          ...(params?.conversation && params.conversation.length > 0 && {
            conversation: params.conversation
          })
        };

        // Only add model and provider if they're set
        if (params?.model) requestBody.model = params.model;
        if (params?.provider) requestBody.provider = params.provider;

        apiStream(
          '/api/agent/run',
          requestBody,
          {
            onEvent: (event) => {
              switch (event.type) {
                case 'chunk':
                  options.onChunk(event.data.delta, event.data.phase);
                  break;
                case 'progress':
                  options.onProgress?.(event.data);
                  break;
                case 'done':
                  if (!isDone) {
                    isDone = true;
                    options.onDone?.(event.data);
                    resolve();
                  }
                  break;
                case 'error':
                  options.onError?.(event.data.error || 'Unknown error');
                  break;
                case 'intervention':
                  options.onIntervention?.(event.data.message, event.data.id);
                  break;
                case 'browser_open_required':
                  options.onBrowserOpenRequired?.(event.data.reason, event.data.task);
                  break;
              }
            },
            onDone: () => {
              if (!isDone) {
                isDone = true;
                options.onDone?.();
                resolve();
              }
            },
            onError: async (err) => {
              if (!isDone) {
                // Classify error properly
                const classification = classifyError(err);

                // Determine if we should retry
                const shouldRetry =
                  (classification.strategy === RetryStrategy.RETRY) ||
                  (classification.strategy === RetryStrategy.UNKNOWN && config.retryUnknownErrors);

                if (shouldRetry && attempt < config.maxRetries) {
                  attempt++;
                  const delay = calculateBackoff(attempt, config.baseDelay, config.maxDelay);

                  console.warn(
                    `[ChatService] Request failed (${classification.reason}), ` +
                    `retrying in ${Math.round(delay)}ms (attempt ${attempt}/${config.maxRetries})`,
                    err instanceof Error ? err.message : String(err)
                  );
                  options.onRetry?.(attempt, config.maxRetries);

                  await new Promise(r => setTimeout(r, delay));
                  await attemptRequest().then(resolve).catch(reject);
                } else {
                  isDone = true;

                  // Provide clear error message
                  const errorMessage = classification.strategy === RetryStrategy.NO_RETRY
                    ? `Non-retryable error (${classification.reason}): ${err instanceof Error ? err.message : String(err)}`
                    : `Failed after ${config.maxRetries} retries (${classification.reason}): ${err instanceof Error ? err.message : String(err)}`;

                  options.onError?.(errorMessage);
                  reject(err);
                }
              }
            }
          }
        );
      });
    };

    return attemptRequest();
  }

  async stopCurrentTask(): Promise<void> {
    await apiPost('/api/agent/cancel');
  }

  async getAgentStatus(): Promise<{
    state: 'idle' | 'running' | 'error';
    currentTask?: string;
  }> {
    try {
      const status = await apiPost<any>('/api/agent/status');
      return {
        state: status.running ? 'running' : 'idle',
        currentTask: status.current_task ?? undefined,
      };
    } catch (err) {
      console.warn('[ChatService] Failed to get agent status:', err);
      return { state: 'error' };
    }
  }
}

let chatService: ChatService | null = null;

export function getChatService(): ChatService {
  if (!chatService) {
    chatService = new ChatService();
  }
  return chatService;
}
