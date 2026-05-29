import { callPython } from "../proxy.js"
import type { SedimanWS } from "../types.js"

export function handleRecordConnect(ws: SedimanWS, sessionId: string): void {
  let closed = false
  let lastFrameCount = 0

  ws.send(JSON.stringify({ type: "connected", session_id: sessionId }))

  const interval = setInterval(async () => {
    if (closed) return
    try {
      const r = await callPython("record.session", { session_id: sessionId }, { timeout: 5_000 }) as Record<string, unknown>
      const frames = (r?.frames as Record<string, unknown>[]) ?? []
      for (const f of frames.slice(lastFrameCount)) {
        if (closed) return
        ws.send(JSON.stringify({
          type: "frame", timestamp: f.timestamp ?? Date.now() / 1000,
          url: f.url ?? "", cursor_x: f.cursor_x ?? 0, cursor_y: f.cursor_y ?? 0,
          action: f.action ?? "", action_detail: f.action_detail ?? null,
          screenshot: f.screenshot ?? null, frame_number: f.frame_number ?? 0,
        }))
        lastFrameCount = (f.frame_number as number) + 1
      }
    } catch { /* session not ready */ }
  }, 300)

  ws.data.cleanup = () => { closed = true; clearInterval(interval) }
}
