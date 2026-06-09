const API_BASE = 'http://localhost:3001'

export async function apiGet<T>(path: string, params?: Record<string,string>): Promise<T> {
  const url = new URL(path, API_BASE)
  if (params) for (const [k,v] of Object.entries(params)) url.searchParams.set(k,v)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function apiPost<T>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function apiPatch<T>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`)
  return res.json()
}

/**
 * VS Code-Style Optimized Streaming
 * Implements microtask batching and efficient chunk processing
 */
export function apiStream(
  path: string,
  body: any,
  onEvent: (type: string, data: any) => void,
  onDone?: () => void,
  onError?: (err: Error) => void,
): () => void {
  let controller = new AbortController()

  // VS Code-style chunk queue and batch processing
  const chunkQueue: { type: string; data: any }[] = []
  let isFlushScheduled = false
  let isProcessing = false

  /**
   * Flush queued chunks via microtask (VS Code Layer 1 batching)
   */
  const flushChunks = () => {
    if (chunkQueue.length === 0) {
      isFlushScheduled = false
      isProcessing = false
      return
    }

    const chunks = chunkQueue.splice(0)

    // Batch process chunks
    for (const chunk of chunks) {
      try {
        onEvent(chunk.type, chunk.data)
      } catch (e) {
        console.error('[apiStream] Event callback error:', e)
      }
    }

    isFlushScheduled = false
    isProcessing = false

    // If more chunks arrived during processing, flush again
    if (chunkQueue.length > 0 && !isFlushScheduled) {
      isFlushScheduled = true
      queueMicrotask(flushChunks)
    }
  }

  /**
   * Schedule chunk flush via microtask
   */
  const scheduleFlush = (type: string, data: any) => {
    chunkQueue.push({ type, data })

    if (!isFlushScheduled) {
      isFlushScheduled = true
      queueMicrotask(flushChunks)
    }
  }

  fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      throw new Error(`API ${res.status}: ${res.statusText}`)
    }

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE events
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''

        for (const part of parts) {
          if (!part.trim()) continue

          const lines = part.split('\n')
          let event = 'message'
          let data = ''

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              event = line.slice(7)
            } else if (line.startsWith('data: ')) {
              data = line.slice(6)
            }
          }

          if (data) {
            try {
              const parsed = JSON.parse(data)
              // Queue for batch processing instead of immediate callback
              scheduleFlush(event, parsed)
            } catch {
              scheduleFlush(event, data)
            }
          }
        }
      }
    } catch (err) {
      throw new Error(`Stream reading error: ${err instanceof Error ? err.message : String(err)}`)
    }

    // Final flush before completion
    flushChunks()
    onDone?.()
  }).catch((err) => {
    if (err.name === 'AbortError') return
    onError?.(err instanceof Error ? err : new Error(String(err)))
  })

  return () => controller.abort()
}
