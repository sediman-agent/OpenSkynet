import { connect } from "node:net"
import { PYTHON_SOCKET } from "./config.js"

export type NotifyFn = (method: string, params: Record<string, unknown>) => Promise<void>
export type HandlerFn = (params: Record<string, unknown>, notify: NotifyFn) => Promise<unknown>

const handlers = new Map<string, HandlerFn>()

export function register(method: string, handler: HandlerFn): void {
  handlers.set(method, handler)
}

export function registerAll(methods: Record<string, HandlerFn>): void {
  for (const [name, fn] of Object.entries(methods)) {
    handlers.set(name, fn)
  }
}

export function isRegistered(method: string): boolean {
  return handlers.has(method)
}

function parseJson(line: string): Record<string, unknown> | null {
  try { return JSON.parse(line) }
  catch { return null }
}

function sendJson(writer: (data: string) => void, obj: Record<string, unknown>): void {
  writer(JSON.stringify(obj) + "\n")
}

export async function dispatch(
  method: string,
  params: Record<string, unknown>,
  id: string | number | null,
  notify: NotifyFn,
  writer: (data: string) => void,
): Promise<void> {
  const handler = handlers.get(method)
  if (handler) {
    try {
      const result = await handler(params, notify)
      const resp: Record<string, unknown> = { jsonrpc: "2.0", result }
      if (id !== null && id !== undefined) resp.id = id
      sendJson(writer, resp)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      const resp: Record<string, unknown> = {
        jsonrpc: "2.0",
        error: { code: -32603, message, data: { type: (err as Error)?.name || "Error" } },
      }
      if (id !== null && id !== undefined) resp.id = id
      sendJson(writer, resp)
    }
    return
  }

  try {
    await proxyToPython(method, params, id, writer, notify)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const resp: Record<string, unknown> = {
      jsonrpc: "2.0",
      error: { code: -32000, message: `Python proxy failed: ${message}` },
    }
    if (id !== null && id !== undefined) resp.id = id
    sendJson(writer, resp)
  }
}

async function proxyToPython(
  method: string,
  params: Record<string, unknown>,
  id: string | number | null,
  writer: (data: string) => void,
  notify: NotifyFn,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = connect(PYTHON_SOCKET, () => {
      const request: Record<string, unknown> = { jsonrpc: "2.0", id: 1, method, params }
      client.write(JSON.stringify(request) + "\n")
    })

    let buf = ""
    client.on("data", (chunk: Buffer) => {
      buf += chunk.toString()
      const lines = buf.split("\n")
      buf = lines.pop() || ""
      for (const line of lines) {
        if (!line.trim()) continue
        const msg = parseJson(line)
        if (!msg) continue

        if (msg.id === undefined || msg.id === null) {
          if (msg.method && msg.params) {
            notify(String(msg.method), msg.params as Record<string, unknown>).catch(() => {})
          }
          continue
        }

        if (msg.error) {
          client.end()
          reject(new Error((msg.error as { message: string }).message || "Python error"))
          return
        }

        const resp: Record<string, unknown> = { jsonrpc: "2.0", result: msg.result }
        if (id !== null && id !== undefined) resp.id = id
        sendJson(writer, resp)
        client.end()
        resolve()
      }
    })

    client.on("error", (err: Error) => {
      reject(new Error(`Python socket error: ${err.message}`))
    })

    client.on("end", () => {
      if (buf.trim()) {
        const msg = parseJson(buf.trim())
        if (msg && msg.result !== undefined) {
          const resp: Record<string, unknown> = { jsonrpc: "2.0", result: msg.result }
          if (id !== null && id !== undefined) resp.id = id
          sendJson(writer, resp)
          resolve()
          return
        }
      }
      resolve()
    })
  })
}
