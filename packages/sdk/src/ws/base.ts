import { WebSocketError } from "../errors.js"

type Listener = (...args: unknown[]) => void

export abstract class BaseStream<T> implements AsyncIterableIterator<T> {
  protected baseUrl: string
  protected ws: WebSocket | null = null
  protected closed = false
  protected queue: T[] = []
  protected resolveQueue: (() => void) | null = null
  protected listeners = new Map<string, Set<Listener>>()
  private connectPromise: Promise<void> | null = null

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  protected abstract get wsUrl(): string

  protected ensureConnected(): void {
    if (this.ws) return
    this.doConnect()
  }

  protected async waitForConnect(): Promise<void> {
    this.ensureConnected()
    await this.connectPromise
  }

  private doConnect(): void {
    if (this.ws) return
    const url = this.wsUrl

    this.connectPromise = new Promise<void>((resolve, reject) => {
      let settled = false
      this.ws = new WebSocket(url)

      this.ws.onopen = () => { settled = true; resolve() }
      this.ws.onmessage = (event: MessageEvent) => this.onMessage(event)
      this.ws.onerror = () => {
        if (!settled) { settled = true; reject(new WebSocketError(`WebSocket connection error: ${url}`)) }
        this.emit("error", new WebSocketError(`WebSocket connection error: ${url}`))
      }
      this.ws.onclose = () => {
        if (!settled) { settled = true; reject(new WebSocketError(`Connection closed before open: ${url}`)) }
        this.closed = true
        this.emit("close")
        this.resolveQueue?.()
        this.resolveQueue = null
      }
    })
  }

  protected abstract onMessage(event: MessageEvent): void

  protected enqueue(item: T): void {
    this.queue.push(item)
    this.resolveQueue?.()
    this.resolveQueue = null
  }

  disconnect(): void {
    this.closed = true
    this.ws?.close()
    this.ws = null
    this.resolveQueue?.()
    this.resolveQueue = null
  }

  on(event: string, cb: Listener): this {
    const set = this.listeners.get(event) ?? new Set()
    set.add(cb)
    this.listeners.set(event, set)
    return this
  }

  off(event: string, cb: Listener): this {
    const set = this.listeners.get(event)
    if (set) {
      set.delete(cb)
      if (set.size === 0) this.listeners.delete(event)
    }
    return this
  }

  protected emit(event: string, ...args: unknown[]): void {
    const set = this.listeners.get(event)
    if (set) {
      for (const cb of set) {
        try { cb(...args) }
        catch { /* ignore handler errors */ }
      }
    }
  }

  async next(): Promise<IteratorResult<T>> {
    this.ensureConnected()
    while (!this.closed) {
      if (this.queue.length > 0) {
        return { value: this.queue.shift()!, done: false }
      }
      await new Promise<void>((resolve) => { this.resolveQueue = resolve })
    }
    return { value: undefined as unknown as T, done: true }
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this
  }

  async return?(): Promise<IteratorResult<T>> {
    this.disconnect()
    return { value: undefined as unknown as T, done: true }
  }
}

declare global {
  interface WebSocket {
    onopen: (() => void) | null
    onmessage: ((event: MessageEvent) => void) | null
    onerror: ((event: Event) => void) | null
    onclose: (() => void) | null
  }
}
