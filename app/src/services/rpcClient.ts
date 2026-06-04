import type { RPCRequest, RPCResponse, StreamEvent } from '@/types/rpc';

type StreamHandler = (event: StreamEvent) => void;

class RPCClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageId = 0;
  private pendingRequests = new Map<string | number, {
    resolve: (value: RPCResponse) => void;
    reject: (error: Error) => void;
  }>();
  private streamHandlers = new Map<string, StreamHandler>();
  private onConnectionChange?: (connected: boolean) => void;

  constructor(url: string = 'ws://localhost:8765') {
    this.url = url;
  }

  setOnConnectionChange(callback: (connected: boolean) => void): void {
    this.onConnectionChange = callback;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        console.log('[RPC] Attempting to connect to', this.url);
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          console.log('[RPC] Connected to', this.url);
          this.reconnectAttempts = 0;
          this.onConnectionChange?.(true);
          resolve();
        };

        this.ws.onclose = () => {
          console.log('[RPC] Connection closed');
          this.onConnectionChange?.(false);
          this.handleReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('[RPC] WebSocket error:', error);
          this.onConnectionChange?.(false);
          reject(new Error('Failed to connect to RPC server'));
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        console.error('[RPC] Connection error:', error);
        this.onConnectionChange?.(false);
        reject(error);
      }
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private handleReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

      console.log(`[RPC] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

      setTimeout(() => {
        this.connect().catch((error) => {
          console.error('[RPC] Reconnect failed:', error);
        });
      }, delay);
    } else {
      console.error('[RPC] Max reconnect attempts reached');
    }
  }

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      // Check if it's a stream event
      if (message.type === 'chunk' || message.type === 'done' || message.type === 'error') {
        const streamId = message.streamId;
        const handler = this.streamHandlers.get(streamId);
        if (handler) {
          handler(message as StreamEvent);
        }
        return;
      }

      // Handle RPC response
      if (message.id !== undefined) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          pending.resolve(message);
          this.pendingRequests.delete(message.id);
        }
      }
    } catch (error) {
      console.error('[RPC] Failed to parse message:', error);
    }
  }

  async call<T = unknown>(
    method: string,
    params?: unknown
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to RPC server');
    }

    const id = ++this.messageId;
    const request: RPCRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (response: RPCResponse) => {
          if (response.error) {
            reject(new Error(response.error.message));
          } else {
            resolve(response.result as T);
          }
        },
        reject,
      });

      this.ws!.send(JSON.stringify(request));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('RPC request timeout'));
        }
      }, 30000);
    });
  }

  async stream(
    method: string,
    onChunk: (delta: string, phase?: string) => void,
    params?: unknown,
    onDone?: () => void,
    onError?: (error: string) => void
  ): Promise<void> {
    const streamId = crypto.randomUUID();

    // Register stream handler
    this.streamHandlers.set(streamId, (event: StreamEvent) => {
      switch (event.type) {
        case 'chunk':
          if (event.data.delta) {
            // Pass phase information to callback
            onChunk(event.data.delta, event.data.phase);
          }
          break;
        case 'progress':
          // Handle progress events (retry countdown, reflection status, etc.)
          if (event.data) {
            onChunk(JSON.stringify(event.data), event.data.phase || 'progress');
          }
          break;
        case 'done':
          onDone?.();
          this.streamHandlers.delete(streamId);
          break;
        case 'error':
          onError?.(event.data.error || 'Unknown error');
          this.streamHandlers.delete(streamId);
          break;
      }
    });

    // Send stream request
    await this.call(method, params ? { ...params, streamId } : { streamId });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let rpcClient: RPCClient | null = null;

export function getRPCClient(url?: string): RPCClient {
  if (!rpcClient) {
    rpcClient = new RPCClient(url);
  }
  return rpcClient;
}

export default RPCClient;
