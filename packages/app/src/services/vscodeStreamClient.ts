/**
 * VS Code-Style API Client with Streaming Optimizations
 * Implements microtask batching and proper stream handling
 */

import type { ChatStreamOptions } from './chatService';

// ============================================================================
// VS Code Streaming Constants
// ============================================================================
const STREAMING_CONFIG = {
  CHUNK_SIZE: 1024,              // Preferred chunk size
  BATCH_DELAY: 0,                 // Microtask scheduling
  MAX_BUFFER_SIZE: 1024 * 1024,  // 1MB max buffer
} as const;

// ============================================================================
// Types
// ============================================================================
interface StreamProcessor {
  buffer: string[];
  lastFlush: number;
  isProcessing: boolean;
  abortController: AbortController;
}

interface ParsedChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'error' | 'done' | 'progress';
  content?: string;
  data?: any;
}

// ============================================================================
// VS Code-Style Stream Processor
// ============================================================================
class VSCodeStreamProcessor {
  private processor: StreamProcessor = {
    buffer: [],
    lastFlush: 0,
    isProcessing: false,
    abortController: new AbortController(),
  };

  private callbacks: ChatStreamOptions;
  private startTime: number = 0;
  private chunkCount: number = 0;

  constructor(callbacks: ChatStreamOptions) {
    this.callbacks = callbacks;
  }

  /**
   * Process a raw SSE chunk (VS Code Layer 1-2)
   */
  processChunk(line: string): void {
    if (this.processor.abortController.signal.aborted) return;

    // Skip empty lines or comments
    if (!line.trim() || line.startsWith(':')) return;

    // Parse SSE format: "data: {...}\n\n"
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      this.parseData(data);
    }
  }

  /**
   * Parse SSE data and route to appropriate callback
   */
  private parseData(data: string): void {
    if (data === '[DONE]') {
      this.flush();
      this.callbacks.onDone?.();
      return;
    }

    try {
      const parsed = JSON.parse(data);
      const chunk = this.mapToChunk(parsed);

      if (!chunk) return;

      // Add to buffer (VS Code microtask batching)
      this.processor.buffer.push(JSON.stringify(chunk));
      this.chunkCount++;

      // Schedule flush via microtask
      this.scheduleFlush();

    } catch (e) {
      console.error('[VSCodeStreamProcessor] Failed to parse chunk:', data, e);
    }
  }

  /**
   * Map backend response to chunk format
   */
  private mapToChunk(data: any): ParsedChunk | null {
    // Handle different response formats
    if (data.type === 'chunk' || data.delta) {
      return {
        type: 'text',
        content: data.delta || data.content || '',
      };
    }

    if (data.type === 'progress') {
      this.callbacks.onProgress?.(data);
      return null;
    }

    if (data.type === 'error') {
      this.callbacks.onError?.(data.error || 'Unknown error');
      return {
        type: 'error',
        data: data.error,
      };
    }

    if (data.type === 'tool_call') {
      return {
        type: 'tool_call',
        data: data,
      };
    }

    if (data.type === 'tool_result') {
      return {
        type: 'tool_result',
        data: data,
      };
    }

    // Raw text content
    if (typeof data === 'string') {
      return {
        type: 'text',
        content: data,
      };
    }

    return null;
  }

  /**
   * Schedule flush via microtask (VS Code batching)
   */
  private scheduleFlush(): void {
    const now = Date.now();

    // Flush if buffer is getting too large
    const bufferSize = this.processor.buffer.reduce((sum, s) => sum + s.length, 0);
    if (bufferSize >= STREAMING_CONFIG.MAX_BUFFER_SIZE) {
      this.flush();
      return;
    }

    // Schedule microtask flush if not already scheduled
    if (!this.processor.isProcessing) {
      this.processor.isProcessing = true;
      queueMicrotask(() => {
        this.flush();
      });
    }
  }

  /**
   * Flush buffered chunks to callbacks (public for final flush)
   */
  public flush(): void {
    if (this.processor.buffer.length === 0) {
      this.processor.isProcessing = false;
      return;
    }

    const chunks = this.processor.buffer.splice(0);

    // Combine text chunks for efficiency
    let textBuffer = '';
    for (const chunk of chunks) {
      try {
        const parsed = JSON.parse(chunk) as ParsedChunk;
        if (parsed.type === 'text' && parsed.content) {
          textBuffer += parsed.content;
        } else if (parsed.type === 'tool_call') {
          // Flush any buffered text first
          if (textBuffer) {
            this.callbacks.onChunk?.(textBuffer, 'responding');
            textBuffer = '';
          }
          // Handle tool call - map to correct progress structure
          this.callbacks.onProgress?.({
            phase: 'executing',
            action: parsed.data?.action || 'tool',
            detail: parsed.data?.detail,
          });
        } else if (parsed.type === 'error') {
          if (textBuffer) {
            this.callbacks.onChunk?.(textBuffer, 'responding');
            textBuffer = '';
          }
          this.callbacks.onError?.(parsed.data || 'Unknown error');
        }
      } catch (e) {
        console.error('[VSCodeStreamProcessor] Chunk parse error:', chunk, e);
      }
    }

    // Flush remaining text
    if (textBuffer) {
      this.callbacks.onChunk?.(textBuffer, 'responding');
    }

    this.processor.lastFlush = Date.now();
    this.processor.isProcessing = false;
  }

  /**
   * Abort the stream
   */
  abort(): void {
    this.processor.abortController.abort();
    this.flush();
  }

  /**
   * Get stream statistics
   */
  getStats() {
    return {
      duration: Date.now() - this.startTime,
      chunks: this.chunkCount,
      bufferSize: this.processor.buffer.length,
    };
  }
}

// ============================================================================
// VS Code-Style Streaming API
// ============================================================================
export async function streamVSCodeChat(
  url: string,
  body: any,
  callbacks: ChatStreamOptions
): Promise<void> {
  const processor = new VSCodeStreamProcessor(callbacks);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Flush remaining buffer
        buffer.split('\n').forEach(line => {
          if (line.trim()) processor.processChunk(line);
        });
        processor.flush();
        callbacks.onDone?.();
        break;
      }

      // Decode and buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines (SSE format)
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        processor.processChunk(line);
      }
    }

  } catch (error) {
    callbacks.onError?.(error instanceof Error ? error.message : String(error));
    processor.abort();
  }
}
