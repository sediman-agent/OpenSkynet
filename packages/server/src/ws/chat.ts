import { callPythonStreaming, callPython } from "../proxy.js"
import type { SedimanWS } from "../types.js"

interface ChatState { startTime: number; aborted: boolean }
const sessions = new Map<string, ChatState>()

export function handleChatMessage(ws: SedimanWS, raw: string): void {
  let msg: { task?: string; type?: string }
  try { msg = JSON.parse(raw) } catch {
    ws.send(JSON.stringify({ type: "error", error: { code: "PARSE_ERROR", message: "Invalid JSON" } }))
    return
  }

  if (msg.type === "stop" || msg.type === "abort") {
    const state = sessions.get(ws.data.sessionId!)
    if (state) state.aborted = true
    callPython("agent.cancel", {}).catch(() => {})
    return
  }

  const task = msg.task
  if (!task?.trim()) {
    ws.send(JSON.stringify({ type: "error", error: { code: "VALIDATION", message: "No task provided" } }))
    return
  }

  const sessionId = crypto.randomUUID()
  ws.data.sessionId = sessionId
  sessions.set(sessionId, { startTime: Date.now(), aborted: false })

  ws.send(JSON.stringify({ type: "status", message: "Planning...", phase: "planning", timestamp: Date.now() / 1000 }))

  const onNotify = (_method: string, params: Record<string, unknown>) => {
    const state = sessions.get(sessionId)
    if (state?.aborted) return
    ws.send(JSON.stringify({
      type: "progress",
      step: params.step ?? 0,
      action: params.action ?? "",
      observation: params.observation ?? "",
      phase: params.phase ?? "executing",
      elapsed: Math.round((Date.now() - (sessions.get(sessionId)?.startTime ?? Date.now())) / 100) / 10,
      timestamp: Date.now() / 1000,
    }))
  }

  callPythonStreaming("agent.run", { task }, onNotify, { timeout: 600_000 })
    .then((r: unknown) => {
      const state = sessions.get(sessionId)
      if (state?.aborted) return
      const res = r as Record<string, unknown>
      ws.send(JSON.stringify({
        type: "result", result: res.result ?? "",
        skill_created: res.skill_created ?? null,
        actions_count: (res.steps as unknown[])?.length ?? 0,
        iterations: res.iterations ?? 0,
        strategy: res.strategy_used ?? "direct",
        elapsed: (Date.now() - (sessions.get(sessionId)?.startTime ?? Date.now())) / 1000,
        timestamp: Date.now() / 1000,
        steps: res.steps ?? [],
      }))
    })
    .catch((err: Error) => {
      if (sessions.get(sessionId)?.aborted) return
      ws.send(JSON.stringify({ type: "error", error: { code: "EXECUTION_ERROR", message: err.message } }))
    })
    .finally(() => sessions.delete(sessionId))
}
