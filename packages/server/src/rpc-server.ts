#!/usr/bin/env bun
/**
 * Sediman JSON-RPC 2.0 Unix Socket Server
 *
 * Handles all TUI bridge requests. CRUD operations use TS SDK modules directly.
 * Agent/browser operations proxy to the Python sidecar via callPython().
 */
import { createServer, type Socket } from "node:net";
import { unlinkSync, existsSync } from "node:fs";
import { handlers } from "./rpc-handlers.js";
import type { NotifyFn } from "./rpc-handlers.js";

const SOCKET = process.env.SEDIMAN_SOCKET || "/tmp/sediman.sock";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface ClientState {
  socket: Socket;
  buffer: string;
  activeRunId: string | null;
  runDone: boolean;
}

function sendMsg(socket: Socket, msg: Record<string, unknown>): void {
  try { socket.write(JSON.stringify(msg) + "\n"); } catch { /* ignore */ }
}

function sendResponse(
  socket: Socket,
  id: number | string | null,
  result?: unknown,
  error?: { code: number; message: string },
): void {
  const msg: Record<string, unknown> = { jsonrpc: "2.0", id };
  if (error) msg.error = error;
  else msg.result = result;
  sendMsg(socket, msg);
}

function handleLine(state: ClientState, line: string): void {
  if (state.runDone) return;

  let req: JsonRpcRequest;
  try { req = JSON.parse(line); } catch { return; }

  if (req.method === "agent.cancel") {
    if (state.activeRunId) {
      // Cancel the current Python run
      handlers["agent.cancel"]({}).catch(() => {});
    }
    state.socket.end();
    return;
  }

  const handler = handlers[req.method];
  if (!handler) {
    sendResponse(state.socket, req.id, undefined, {
      code: -32601,
      message: `Method not found: ${req.method}`,
    });
    if (!state.activeRunId) state.socket.end();
    return;
  }

  const notify: NotifyFn = (method, params) => {
    sendMsg(state.socket, { jsonrpc: "2.0", method, params });
  };

  handler(req.params || {}, notify)
    .then((result) => {
      state.runDone = true;
      sendResponse(state.socket, req.id, result);
      state.socket.end();
    })
    .catch((err: Error) => {
      state.runDone = true;
      sendResponse(state.socket, req.id, undefined, {
        code: -32000,
        message: err.message,
      });
      state.socket.end();
    });

  if (req.method === "agent.run") {
    state.activeRunId = crypto.randomUUID?.() ?? "run";
  }
}

function handleConnection(socket: Socket): void {
  const state: ClientState = { socket, buffer: "", activeRunId: null, runDone: false };

  socket.on("data", (chunk: Buffer) => {
    state.buffer += chunk.toString();
    const lines = state.buffer.split("\n");
    state.buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      handleLine(state, line);
    }
  });

  socket.on("error", () => { /* ignore client-side errors */ });
}

// Clean up stale socket file
if (existsSync(SOCKET)) {
  unlinkSync(SOCKET);
}

const server = createServer(handleConnection);
server.listen(SOCKET);
console.error(`sediman-rpc: listening on ${SOCKET}`);
console.error(`sediman-rpc: python proxy at ${process.env.SEDIMAN_PYTHON_SOCKET || "/tmp/sediman-python.sock"}`);
