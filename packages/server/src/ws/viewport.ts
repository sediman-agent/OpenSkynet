import { callPython } from "../proxy.js"
import type { SedimanWS } from "../types.js"

export function handleViewportConnect(ws: SedimanWS): void {
  let closed = false
  let lastScreenshot: string | null = null

  ws.send(JSON.stringify({ type: "connected", message: "Viewport stream active" }))

  const interval = setInterval(async () => {
    if (closed) return
    try {
      const r = await callPython("system.screenshot", {}, { timeout: 5_000 }) as { screenshot?: string }
      if (r?.screenshot && r.screenshot !== lastScreenshot) {
        ws.send(JSON.stringify({ type: "screenshot", data: r.screenshot, timestamp: Date.now() / 1000 }))
        lastScreenshot = r.screenshot
      }
    } catch { /* no browser yet */ }
  }, 500)

  ws.data.cleanup = () => { closed = true; clearInterval(interval) }
}
