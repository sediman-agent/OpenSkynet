/**
 * Bridge — JSON-RPC 2.0 client over Unix socket.
 * Connects to the Python RPC server (or TS server via the same protocol).
 */
import { connect } from "node:net"
import { existsSync } from "node:fs"

const SOCKET = process.env.SEDIMAN_SOCKET || "/tmp/sediman.sock"

async function rpc(method: string, params: Record<string, unknown> = {}, timeout = 30000): Promise<any> {
  if (!existsSync(SOCKET)) throw new Error(`Socket not found: ${SOCKET}. Start the backend first (python -m sediman.rpc_server)`)
  return new Promise((resolve, reject) => {
    const client = connect(SOCKET)
    const timer = setTimeout(() => { client.destroy(); reject(new Error(`RPC timeout: ${method}`)) }, timeout)
    let done = false

    client.on("connect", () => {
      client.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) + "\n")
    })

    let buf = ""
    client.on("data", (chunk) => {
      buf += chunk.toString()
      const lines = buf.split("\n")
      buf = lines.pop() || ""
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg.id == null) continue
          done = true
          clearTimeout(timer)
          client.end()
          if (msg.error) reject(new Error(msg.error.message || "RPC error"))
          else resolve(msg.result)
          return
        } catch {}
      }
    })

    client.on("error", (err) => { if (!done) { clearTimeout(timer); reject(new Error(`Socket: ${err.message}`)) } })
    client.on("end", () => { if (!done) { clearTimeout(timer); reject(new Error("Connection closed")) } })
  })
}

export interface ServerStatus {
  browser_open: boolean; model: string | null; provider: string | null
  conversation_messages: number; scheduler: { active_jobs: number; total_jobs: number }
}

export interface SkillSummary { name: string; description?: string; category?: string; version?: number }
export interface CronJob { id: string; cron: string; task: string; skill_name?: string; enabled?: boolean }

export class ApiClient {
  async status(): Promise<ServerStatus> { return rpc("system.status") as Promise<ServerStatus> }
  async listSkills(): Promise<SkillSummary[]> { const r = await rpc("skills.list"); return (r as any).skills || [] }
  async getSkill(name: string): Promise<any> { return rpc("skills.get", { name }) }
  async deleteSkill(name: string): Promise<void> { await rpc("skills.delete", { name }) }
  async executeSkill(name: string): Promise<string> { const r = await rpc("skills.run", { name }); return (r as any).result || "" }

  async hubBrowse(category?: string): Promise<any[]> { const r = await rpc("hub.browse", { category: category || "" }); return (r as any).skills || [] }
  async hubInstall(name: string, force?: boolean): Promise<string> { const r = await rpc("hub.install", { name, force: force || false }); return (r as any).message || "" }
  async hubSearch(query: string): Promise<any[]> { const r = await rpc("hub.search", { query }); return (r as any).skills || [] }
  async hubInfo(name: string): Promise<any> { return rpc("hub.info", { name }) }

  async listSchedules(): Promise<CronJob[]> { const r = await rpc("schedule.list"); return (r as any).jobs || [] }
  async addSchedule(cron: string, task: string, skill?: string): Promise<string> {
    const r = await rpc("schedule.add", { cron, task, skill: skill || "" }); return (r as any).job_id || ""
  }
  async removeSchedule(jobId: string): Promise<void> { await rpc("schedule.remove", { job_id: jobId }) }

  async getMemory(): Promise<any> { return rpc("memory.get") }
  async addMemory(target: string, content: string): Promise<void> { await rpc("memory.add", { target, content }) }

  async listSessions(): Promise<any[]> { const r = await rpc("sessions.list"); return (r as any).sessions || [] }
  async getScreenshot(): Promise<string | null> { try { const r = await rpc("system.screenshot"); return (r as any).screenshot || null } catch { return null } }

  async switchModel(provider: string, model?: string): Promise<void> { await rpc("model.switch", { provider, model: model || "" }) }
  async listProviders(): Promise<any[]> { const r = await rpc("model.list_providers"); return (r as any).providers || [] }
  async askBTW(question: string): Promise<string> { const r = await rpc("system.btw", { question }); return (r as any).answer || "" }
  async doctor(): Promise<any> { return rpc("system.doctor") }
  async setTerminal(allowed: boolean): Promise<void> { await rpc("terminal.set", { allowed }) }
  async getTerminalStatus(): Promise<boolean> { const r = await rpc("terminal.status"); return (r as any).allowed || false }
}

/**
 * Run an agent task with streaming step events.
 * The callback receives step events as they arrive, and the promise
 * resolves with the final result.
 */
export function runAgentTask(
  task: string,
  onStep: (phase: string, action: string, url?: string) => void,
  onError: (err: string) => void,
  onDone: (result: string, elapsed: number, skillCreated?: string) => void,
): { cancel: () => void } {
  let cancelled = false
  let client: ReturnType<typeof connect> | null = null

  const doRun = async () => {
    if (!existsSync(SOCKET)) { onError(`Socket not found: ${SOCKET}`); return }
    client = connect(SOCKET)
    let buf = ""

    client.on("connect", () => {
      if (!cancelled) client!.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "agent.run", params: { task } }) + "\n")
    })

    client.on("data", (chunk) => {
      if (cancelled) return
      buf += chunk.toString()
      const lines = buf.split("\n")
      buf = lines.pop() || ""
      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const msg = JSON.parse(line)
          if (msg.id == null && msg.method === "chat.progress" && msg.params) {
            onStep(
              msg.params.phase || "",
              msg.params.action || "",
              msg.params.url || undefined,
            )
          } else if (msg.id === 1) {
            if (msg.error) {
              onError(msg.error.message || "Task failed")
            } else if (msg.result) {
              const r = msg.result
              onDone(r.result || "", r.elapsed_secs || 0, r.skill_created || undefined)
            }
            client!.end()
            return
          }
        } catch {}
      }
    })

    client.on("error", (err) => { if (!cancelled) onError(`Socket: ${err.message}`) })
    client.on("end", () => {})
  }

  doRun()

  return {
    cancel: () => {
      cancelled = true
      if (client) {
        try { client.write(JSON.stringify({ jsonrpc: "2.0", method: "agent.cancel", params: {} }) + "\n") } catch {}
        setTimeout(() => { try { client!.destroy() } catch {} }, 100)
      }
    },
  }
}
