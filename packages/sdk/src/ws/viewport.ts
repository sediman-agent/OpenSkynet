import { WebSocketError } from "../errors.js"
import { BaseStream } from "./base.js"
import type { ViewportFrame } from "../types.js"

export class ViewportStream extends BaseStream<ViewportFrame> {
  protected get wsUrl(): string {
    const apiUrl = this.baseUrl.replace(/^http/, "ws")
    return `${apiUrl}/ws/viewport`
  }

  protected onMessage(event: MessageEvent): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(event.data as string) as Record<string, unknown>
    } catch (err: unknown) {
      this.emit("error", new WebSocketError(`Failed to parse viewport frame: ${err}`))
      return
    }

    if (msg.type === "screenshot") {
      this.enqueue(msg as unknown as ViewportFrame)
      this.emit("screenshot", msg)
    }
  }

  stop(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send("stop")
    }
    this.disconnect()
  }
}
