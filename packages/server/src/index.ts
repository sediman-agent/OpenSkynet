#!/usr/bin/env bun
/**
 * Sediman TypeScript HTTP + WebSocket Server
 *
 * Replaces the Python FastAPI server. Handles all CRUD operations
 * in pure TypeScript (skills, schedule, memory, sessions, hub).
 * Proxies agent/browser operations to the Python RPC backend.
 */
import { Hono } from "hono"
import { cors } from "hono/cors"
import type { ServerWebSocket } from "bun"
import { api } from "./routes/index.js"
import { handleChatMessage } from "./ws/chat.js"
import { handleViewportConnect } from "./ws/viewport.js"
import { handleRecordConnect } from "./ws/record.js"
import type { WsData } from "./types.js"

const PORT = Number(process.env.SEDIMAN_PORT) || 3000
const HOST = process.env.SEDIMAN_HOST || "0.0.0.0"

const app = new Hono()

app.use("/*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
}))

app.route("/api", api)
app.get("/health", (c) => c.json({ status: "ok", server: "sediman-ts" }))

Bun.serve<WsData>({
  port: PORT,
  hostname: HOST,

  fetch(req, server) {
    const url = new URL(req.url)

    if (url.pathname === "/ws/chat") {
      const upgraded = server.upgrade(req, { data: { type: "chat" } })
      if (upgraded) return
      return new Response("WebSocket upgrade failed", { status: 426 })
    }

    if (url.pathname === "/ws/viewport") {
      const upgraded = server.upgrade(req, { data: { type: "viewport" } })
      if (upgraded) return
      return new Response("WebSocket upgrade failed", { status: 426 })
    }

    const recordMatch = url.pathname.match(/^\/ws\/record\/(.+)$/)
    if (recordMatch) {
      const upgraded = server.upgrade(req, { data: { type: "record", sessionId: recordMatch[1] } })
      if (upgraded) return
      return new Response("WebSocket upgrade failed", { status: 426 })
    }

    return app.fetch(req)
  },

  websocket: {
    open(ws: ServerWebSocket<WsData>) {
      switch (ws.data.type) {
        case "viewport": handleViewportConnect(ws); break
        case "record": handleRecordConnect(ws, ws.data.sessionId!); break
      }
    },

    message(ws: ServerWebSocket<WsData>, raw: Buffer | string) {
      if (ws.data.type === "chat") {
        handleChatMessage(ws, String(raw))
      } else if (String(raw) === "stop" && ws.data.cleanup) {
        ws.data.cleanup()
      }
    },

    close(ws: ServerWebSocket<WsData>) {
      if (ws.data.cleanup) ws.data.cleanup()
    },
  },
})

console.error(`Sediman TS server running on http://${HOST}:${PORT}`)
console.error(`Python proxy: ${process.env.SEDIMAN_PYTHON_SOCKET || "/tmp/sediman-python.sock"}`)
