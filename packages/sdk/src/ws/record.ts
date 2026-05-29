import { WebSocketError } from "../errors.js"
import { BaseStream } from "./base.js"
import type { RecordFrame } from "../types.js"

export class RecordingStream extends BaseStream<RecordFrame> {
  private sessionId: string

  constructor(baseUrl: string, sessionId: string) {
    super(baseUrl)
    this.sessionId = sessionId
  }

  protected get wsUrl(): string {
    const apiUrl = this.baseUrl.replace(/^http/, "ws")
    return `${apiUrl}/ws/record/${encodeURIComponent(this.sessionId)}`
  }

  protected onMessage(event: MessageEvent): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(event.data as string) as Record<string, unknown>
    } catch (err: unknown) {
      this.emit("error", new WebSocketError(`Failed to parse frame: ${err}`))
      return
    }

    if (msg.type === "frame") {
      this.enqueue(msg as unknown as RecordFrame)
      this.emit("frame", msg)
    } else if (msg.type === "error") {
      const errData = msg.error as { message?: string } | undefined
      this.emit("error", new WebSocketError(errData?.message ?? "Recording error"))
    }
  }

  stop(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send("stop")
    }
    this.disconnect()
  }
}
