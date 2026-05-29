import { WebSocketError } from "../errors.js"
import { BaseStream } from "./base.js"
import type { ChatMessage } from "../types.js"

export class ChatStream extends BaseStream<ChatMessage> {
  protected get wsUrl(): string {
    const apiUrl = this.baseUrl.replace(/^http/, "ws")
    return `${apiUrl}/ws/chat`
  }

  protected onMessage(event: MessageEvent): void {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(event.data as string) as Record<string, unknown>
    } catch (err: unknown) {
      this.emit("error", new WebSocketError(`Failed to parse message: ${err}`))
      return
    }

    this.enqueue(msg as unknown as ChatMessage)
    this.emit("message", msg)

    switch (msg.type) {
      case "status": this.emit("status", msg); break
      case "progress": this.emit("progress", msg); break
      case "result": this.emit("result", msg); break
      case "error": this.emit("error", msg); break
    }
  }

  async sendTask(task: string): Promise<void> {
    await this.waitForConnect()
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new WebSocketError("WebSocket not connected")
    }
    this.ws.send(JSON.stringify({ task }))
  }
}
