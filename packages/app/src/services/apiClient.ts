/**
 * VS Code-Style API Client
 * Centralized HTTP client with proper error handling, interceptors, and type safety
 */

import type { API_CONFIG } from '@/config/app.config';

// ============================================================================
// Types
// ============================================================================

export interface ApiRequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
  endpoint?: string;
}

class HttpError extends Error implements ApiError {
  status?: number;
  code?: string;
  endpoint?: string;

  constructor(message: string, status?: number, endpoint?: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.endpoint = endpoint;

    // Add error code based on status
    if (status) {
      this.code = this.getErrorCode(status);
    }
  }

  private getErrorCode(status: number): string {
    if (status >= 400 && status < 500) return 'CLIENT_ERROR';
    if (status >= 500 && status < 600) return 'SERVER_ERROR';
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 409) return 'CONFLICT';
    if (status === 429) return 'RATE_LIMITED';
    return 'UNKNOWN_ERROR';
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      endpoint: this.endpoint
    };
  }
}

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_TIMEOUT = 30000;
// @ts-ignore - VITE_API_URL is defined by Vite
const BASE_URL = globalThis.__VITE_API_URL__ || 'http://localhost:3001';

// ============================================================================
// Request Interceptors
// ============================================================================

interface RequestInterceptor {
  (config: RequestInit): RequestInit | Promise<RequestInit>;
}

interface ResponseInterceptor {
  (response: Response, request: RequestInit): Response | Promise<Response>;
}

class InterceptorManager {
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];

  addRequest(interceptor: RequestInterceptor) {
    this.requestInterceptors.push(interceptor);
  }

  addResponse(interceptor: ResponseInterceptor) {
    this.responseInterceptors.push(interceptor);
  }

  async applyRequest(config: RequestInit): Promise<RequestInit> {
    let result = config;
    for (const interceptor of this.requestInterceptors) {
      result = await interceptor(result);
    }
    return result;
  }

  async applyResponse(response: Response, request: RequestInit): Promise<Response> {
    let result = response;
    for (const interceptor of this.responseInterceptors) {
      result = await interceptor(result, request);
    }
    return result;
  }
}

export const interceptorManager = new InterceptorManager();

// ============================================================================
// Core API Functions
// ============================================================================

/**
 * Build URL with query parameters
 */
function buildUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, BASE_URL);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    });
  }
  return url.toString();
}

/**
 * Create fetch with timeout
 */
function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = DEFAULT_TIMEOUT): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * Handle API response
 */
async function handleResponse<T>(response: Response, endpoint: string): Promise<T> {
  if (!response.ok) {
    const errorMessage = `API ${response.status}: ${response.statusText}`;
    throw new HttpError(errorMessage, response.status, endpoint);
  }

  // Check if response has content
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }

  // Return text for non-JSON responses
  return response.text() as unknown as T;
}

/**
 * Make GET request
 */
export async function apiGet<T>(
  path: string,
  params?: Record<string, string>,
  options?: ApiRequestOptions
): Promise<T> {
  const url = buildUrl(path, params);
  const timeout = options?.timeout || DEFAULT_TIMEOUT;

  let config: RequestInit = {
    method: 'GET',
    headers: options?.headers || {}
  };

  // Apply request interceptors
  config = await interceptorManager.applyRequest(config);

  const response = await fetchWithTimeout(url, config, timeout);
  const interceptedResponse = await interceptorManager.applyResponse(response, config);

  return handleResponse<T>(interceptedResponse, path);
}

/**
 * Make POST request
 */
export async function apiPost<T>(
  path: string,
  body?: any,
  options?: ApiRequestOptions
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const timeout = options?.timeout || DEFAULT_TIMEOUT;

  let config: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  };

  // Apply request interceptors
  config = await interceptorManager.applyRequest(config);

  const response = await fetchWithTimeout(url, config, timeout);
  const interceptedResponse = await interceptorManager.applyResponse(response, config);

  return handleResponse<T>(interceptedResponse, path);
}

/**
 * Make PATCH request
 */
export async function apiPatch<T>(
  path: string,
  body?: any,
  options?: ApiRequestOptions
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const timeout = options?.timeout || DEFAULT_TIMEOUT;

  let config: RequestInit = {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  };

  // Apply request interceptors
  config = await interceptorManager.applyRequest(config);

  const response = await fetchWithTimeout(url, config, timeout);
  const interceptedResponse = await interceptorManager.applyResponse(response, config);

  return handleResponse<T>(interceptedResponse, path);
}

/**
 * Make DELETE request
 */
export async function apiDelete<T>(
  path: string,
  options?: ApiRequestOptions
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const timeout = options?.timeout || DEFAULT_TIMEOUT;

  let config: RequestInit = {
    method: 'DELETE',
    headers: options?.headers || {}
  };

  // Apply request interceptors
  config = await interceptorManager.applyRequest(config);

  const response = await fetchWithTimeout(url, config, timeout);
  const interceptedResponse = await interceptorManager.applyResponse(response, config);

  return handleResponse<T>(interceptedResponse, path);
}

/**
 * Make PUT request
 */
export async function apiPut<T>(
  path: string,
  body?: any,
  options?: ApiRequestOptions
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const timeout = options?.timeout || DEFAULT_TIMEOUT;

  let config: RequestInit = {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  };

  // Apply request interceptors
  config = await interceptorManager.applyRequest(config);

  const response = await fetchWithTimeout(url, config, timeout);
  const interceptedResponse = await interceptorManager.applyResponse(response, config);

  return handleResponse<T>(interceptedResponse, path);
}

// ============================================================================
// Streaming API
// ============================================================================

export interface StreamEvent {
  type: string;
  data: any;
}

export interface StreamOptions {
  onEvent: (event: StreamEvent) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

export function apiStream(
  path: string,
  body: any,
  options: StreamOptions
): () => void {
  const controller = new AbortController();

  // VS Code-style chunk queue and batch processing
  const chunkQueue: StreamEvent[] = [];
  let isFlushScheduled = false;

  /**
   * Flush queued chunks via microtask (VS Code Layer 1 batching)
   */
  const flushChunks = () => {
    if (chunkQueue.length === 0) {
      isFlushScheduled = false;
      return;
    }

    const chunks = chunkQueue.splice(0);

    // Batch process chunks
    for (const chunk of chunks) {
      try {
        options.onEvent(chunk);
      } catch (error) {
        console.error('[apiStream] Event callback error:', error);
      }
    }

    // If more chunks arrived during processing, flush again
    if (chunkQueue.length > 0 && !isFlushScheduled) {
      isFlushScheduled = true;
      queueMicrotask(flushChunks);
    }
  };

  /**
   * Schedule chunk flush via microtask
   */
  const scheduleFlush = (type: string, data: any) => {
    chunkQueue.push({ type, data });

    if (!isFlushScheduled) {
      isFlushScheduled = true;
      queueMicrotask(flushChunks);
    }
  };

  fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        throw new HttpError(`API ${res.status}: ${res.statusText}`, res.status, path);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Process complete SSE events
          const parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            if (!part.trim()) continue;

            const lines = part.split('\n');
            let event = 'message';
            let data = '';

            for (const line of lines) {
              if (line.startsWith('event: ')) {
                event = line.slice(7);
              } else if (line.startsWith('data: ')) {
                data = line.slice(6);
              }
            }

            if (data) {
              try {
                const parsed = JSON.parse(data);
                scheduleFlush(event, parsed);
              } catch {
                scheduleFlush(event, data);
              }
            }
          }
        }
      } catch (err) {
        throw new Error(`Stream reading error: ${err instanceof Error ? err.message : String(err)}`);
      }

      // Final flush before completion
      flushChunks();
      options.onDone?.();
    })
    .catch((err) => {
      if ((err as Error).name === 'AbortError') {
        return; // User cancelled
      }
      options.onError?.(err instanceof Error ? err : new Error(String(err)));
    });

  return () => controller.abort();
}

// ============================================================================
// Utility Functions
// ============================================================================

export function createApiError(message: string, status?: number): ApiError {
  return new HttpError(message, status);
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof HttpError;
}

export { HttpError };
