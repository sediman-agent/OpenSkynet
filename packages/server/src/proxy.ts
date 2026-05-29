/**
 * Python backend proxy — Unix socket JSON-RPC 2.0 client.
 */
import { connect as netConnect } from "node:net"
import { existsSync } from "node:fs"

export const PYTHON_SOCKET = process.env.SEDIMAN_PYTHON_SOCKET || "/tmp/sediman-python.sock"

export type NotifyFn = (method: string, params: Record<string, unknown>) => void

export interface ProxyOptions {
  timeout?: number
  signal?: AbortSignal
}

function checkSocket(): boolean {
  if (!existsSync(PYTHON_SOCKET)) return false
  return true
}

export function callPython(method: string, params: Record<string, unknown> = {}, opts: ProxyOptions = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!checkSocket()) {
      reject(new Error(`Python socket not found: ${PYTHON_SOCKET}`))
      return
    }
    const timeout = opts.timeout ?? 300_000
    const client = netConnect(PYTHON_SOCKET)

    const timer = setTimeout(() => {
      client!.destroy()
      reject(new Error(`Python RPC timeout: ${method} (${timeout}ms)`))
    }, timeout)

    const onAbort = () => { clearTimeout(timer); client!.destroy(); reject(new Error(`Python RPC aborted: ${method}`)) }
    if (opts.signal) opts.signal.addEventListener("abort", onAbort, { once: true })

    client.on("connect", () => {
      client!.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) + "\n")
    })

    let buf = ""
    let done = false
    client.on("data", (chunk: Buffer) => {
      if (done) return
      buf += chunk.toString()
      for (const line of buf.split("\n").slice(0, -1)) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg.id === undefined || msg.id === null) continue
          done = true
          clearTimeout(timer)
          if (opts.signal) opts.signal.removeEventListener("abort", onAbort)
          client!.end()
          msg.error ? reject(new Error(msg.error.message || "Python error")) : resolve(msg.result)
          return
        } catch { /* skip malformed */ }
      }
      buf = buf.split("\n").pop() || ""
    })
    client.on("error", (err: Error) => { if (!done) { done = true; clearTimeout(timer); if (opts.signal) opts.signal.removeEventListener("abort", onAbort); reject(new Error(`Python socket: ${err.message}`)) } })
    client.on("end", () => { if (!done) { done = true; clearTimeout(timer); if (opts.signal) opts.signal.removeEventListener("abort", onAbort); reject(new Error("Python connection closed")) } })
  })
}

export function callPythonStreaming(method: string, params: Record<string, unknown>, onNotify: NotifyFn, opts: ProxyOptions = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!checkSocket()) {
      reject(new Error(`Python socket not found: ${PYTHON_SOCKET}`))
      return
    }
    const timeout = opts.timeout ?? 300_000
    const client = netConnect(PYTHON_SOCKET)

    const timer = setTimeout(() => { client!.destroy(); reject(new Error(`Python timeout: ${method}`)) }, timeout)

    const onAbort = () => { clearTimeout(timer); client!.destroy(); reject(new Error(`Python RPC aborted: ${method}`)) }
    if (opts.signal) opts.signal.addEventListener("abort", onAbort, { once: true })

    client.on("connect", () => {
      client!.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) + "\n")
    })
    let buf = ""
    let done = false
    client.on("data", (chunk: Buffer) => {
      if (done) return
      buf += chunk.toString()
      for (const line of buf.split("\n").slice(0, -1)) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg.id === undefined || msg.id === null) {
            if (msg.method && msg.params) try { onNotify(String(msg.method), msg.params as Record<string, unknown>) } catch {}
            continue
          }
          done = true
          clearTimeout(timer)
          if (opts.signal) opts.signal.removeEventListener("abort", onAbort)
          client!.end()
          msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
          return
        } catch { /* skip */ }
      }
      buf = buf.split("\n").pop() || ""
    })
    client.on("error", (err: Error) => { if (!done) { done = true; clearTimeout(timer); if (opts.signal) opts.signal.removeEventListener("abort", onAbort); reject(new Error(`Python socket: ${err.message}`)) } })
    client.on("end", () => { if (!done) { done = true; clearTimeout(timer); if (opts.signal) opts.signal.removeEventListener("abort", onAbort); reject(new Error("Python connection closed")) } })
  })
}
