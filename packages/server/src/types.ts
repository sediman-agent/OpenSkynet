import type { ServerWebSocket } from "bun"

export interface WsData {
  type: "chat" | "viewport" | "record"
  sessionId?: string
  cleanup?: () => void
}

export type SedimanWS = ServerWebSocket<WsData>
