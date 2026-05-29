import { Hono } from "hono"
import { callPython } from "../proxy.js"
import {
  handleSkillsList, handleSkillsGet, handleSkillsCreate, handleSkillsDelete,
} from "../../../sdk/src/modules/skills.js"
import {
  handleHubBrowse, handleHubSearch, handleHubInfo,
  handleHubInstall, handleHubInstallGithub,
  handleHubCheckUpdate, handleHubUpdateSkill, handleHubGetLockInfo,
} from "../../../sdk/src/modules/hub.js"
import { handleScheduleList, handleScheduleAdd, handleScheduleRemove } from "../../../sdk/src/modules/schedule.js"
import { handleMemoryGet, handleMemoryAdd } from "../../../sdk/src/modules/memory.js"
import { handleSessionsList, handleSessionSave } from "../../../sdk/src/modules/sessions.js"
import type { CreateSkillParams } from "../../../sdk/src/modules/skills.js"

const api = new Hono()

// ── Task Queue ─────────────────────────────────────────────────
const taskStore = new Map<string, Record<string, unknown>>()

api.post("/task", async (c) => {
  const body = await c.req.json<{ task: string }>()
  if (!body.task?.trim()) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "task is required" } }, 400)
  }
  const taskId = crypto.randomUUID()
  const entry: Record<string, unknown> = {
    task_id: taskId, task: body.task, status: "queued",
    created_at: Date.now() / 1000, started_at: null, completed_at: null,
    result: null, error: null,
  }
  taskStore.set(taskId, entry)

  callPython("agent.run", { task: body.task }, { timeout: 600_000 })
    .then((r) => { entry.status = "completed"; entry.completed_at = Date.now() / 1000; entry.result = r })
    .catch((e: Error) => { entry.status = "failed"; entry.completed_at = Date.now() / 1000; entry.error = { code: "EXECUTION_ERROR", message: e.message } })

  return c.json({ task_id: taskId, status: "queued" }, 202)
})

api.get("/task/:taskId", (c) => {
  const entry = taskStore.get(c.req.param("taskId"))
  if (!entry) return c.json({ error: { code: "NOT_FOUND", message: "Task not found" } }, 404)
  return c.json(entry)
})

// ── Skills ─────────────────────────────────────────────────────
api.get("/skills", async (c) => c.json(await handleSkillsList()))
api.get("/skills/:name", async (c) => {
  const r = await handleSkillsGet({ name: c.req.param("name") })
  return r ? c.json(r) : c.json({ error: { code: "NOT_FOUND", message: "Skill not found" } }, 404)
})
api.post("/skills", async (c) => {
  try { return c.json(await handleSkillsCreate(await c.req.json<CreateSkillParams>()), 201) }
  catch (e: unknown) { return c.json({ error: { code: "CREATE_ERROR", message: String(e) } }, 400) }
})
api.post("/skills/:name/run", async (c) => {
  try { return c.json(await callPython("skills.run", { name: c.req.param("name") })) }
  catch (e: unknown) { return c.json({ error: { code: "EXECUTION_ERROR", message: String(e) } }, 500) }
})
api.delete("/skills/:name", async (c) => {
  const r = await handleSkillsDelete({ name: c.req.param("name") })
  return r.deleted ? c.json(r) : c.json({ error: { code: "NOT_FOUND", message: "Skill not found" } }, 404)
})

// ── Recording (proxied) ────────────────────────────────────────
api.post("/skills/record/start", async (c) => {
  try { return c.json(await callPython("record.start", await c.req.json()), 201) }
  catch (e: unknown) { return c.json({ error: { code: "RECORD_START_FAILED", message: String(e) } }, 500) }
})
api.post("/skills/record/:id/stop", async (c) => {
  try { return c.json(await callPython("record.stop", { session_id: c.req.param("id") })) }
  catch (e: unknown) { return c.json({ error: { code: "RECORD_STOP_FAILED", message: String(e) } }, 500) }
})
api.get("/skills/record/active", async (c) => {
  try { return c.json(await callPython("record.active", {})) }
  catch (e: unknown) { return c.json({ error: { code: "QUERY_FAILED", message: String(e) } }, 500) }
})

// ── Hub ────────────────────────────────────────────────────────
api.get("/hub/browse", async (c) => c.json(await handleHubBrowse({ category: c.req.query("category") || undefined })))
api.get("/hub/search", async (c) => {
  const q = c.req.query("q")
  if (!q) return c.json({ error: { code: "VALIDATION_ERROR", message: "query param 'q' required" } }, 400)
  return c.json(await handleHubSearch({ query: q }))
})
api.get("/hub/:name", async (c) => {
  const r = await handleHubInfo({ name: c.req.param("name") })
  return r ? c.json(r) : c.json({ error: { code: "NOT_FOUND", message: "Hub skill not found" } }, 404)
})
api.post("/hub/install", async (c) => {
  try { return c.json(await handleHubInstall(await c.req.json())) }
  catch (e: unknown) { return c.json({ error: { code: "INSTALL_ERROR", message: String(e) } }, 500) }
})
api.post("/hub/install-github", async (c) => {
  try { return c.json(await handleHubInstallGithub(await c.req.json())) }
  catch (e: unknown) { return c.json({ error: { code: "INSTALL_ERROR", message: String(e) } }, 500) }
})
api.get("/hub/check-update/:name", async (c) => c.json(await handleHubCheckUpdate({ name: c.req.param("name") })))
api.post("/hub/update/:name", async (c) => c.json(await handleHubUpdateSkill({ name: c.req.param("name") })))
api.get("/hub/lock/:name", async (c) => {
  const r = await handleHubGetLockInfo({ name: c.req.param("name") })
  return r ? c.json(r) : c.json({ error: { code: "NOT_FOUND", message: "No lock info" } }, 404)
})

// ── Schedule ───────────────────────────────────────────────────
api.get("/schedule", async (c) => c.json(await handleScheduleList()))
api.post("/schedule", async (c) => {
  try { return c.json(await handleScheduleAdd(await c.req.json()), 201) }
  catch (e: unknown) { return c.json({ error: { code: "VALIDATION_ERROR", message: String(e) } }, 400) }
})
api.get("/schedule/:jobId", async (c) => {
  const jobs = (await handleScheduleList()).jobs as Record<string, unknown>[]
  const job = jobs.find(j => j.id === c.req.param("jobId"))
  return job ? c.json(job) : c.json({ error: { code: "NOT_FOUND", message: "Job not found" } }, 404)
})
api.delete("/schedule/:jobId", async (c) => c.json(await handleScheduleRemove({ job_id: c.req.param("jobId") })))

// ── Memory ─────────────────────────────────────────────────────
api.get("/memory", async (c) => c.json(await handleMemoryGet()))
api.post("/memory", async (c) => {
  try { return c.json(await handleMemoryAdd(await c.req.json()), 201) }
  catch (e: unknown) { return c.json({ error: { code: "MEMORY_ERROR", message: String(e) } }, 400) }
})

// ── Sessions ───────────────────────────────────────────────────
api.get("/sessions", async (c) => c.json(await handleSessionsList({})))
api.post("/sessions", async (c) => {
  try { return c.json(await handleSessionSave(await c.req.json()), 201) }
  catch (e: unknown) { return c.json({ error: { code: "SESSION_ERROR", message: String(e) } }, 400) }
})

// ── Screenshot (proxied) ──────────────────────────────────────
api.get("/screenshot", async (c) => {
  try { return c.json(await callPython("system.screenshot", {})) }
  catch (e: unknown) { return c.json({ error: { code: "NO_BROWSER", message: String(e) } }, 503) }
})

// ── Status (blended) ──────────────────────────────────────────
api.get("/status", async (c) => {
  let py: Record<string, unknown> = {}
  try { py = await callPython("system.status", {}) as Record<string, unknown> } catch {
    // Python backend not available — partial status
  }

  let currentTask: Record<string, unknown> | null = null
  let lastResult: Record<string, unknown> | null = null
  for (const entry of taskStore.values()) {
    if (entry.status === "queued" || entry.status === "running") {
      currentTask = { task_id: entry.task_id, task: entry.task, status: entry.status }
    }
  }
  const all = Array.from(taskStore.values()).reverse()
  for (const entry of all) {
    if (entry.status === "completed" && entry.result) {
      const r = entry.result as Record<string, unknown>
      lastResult = { task_id: entry.task_id, task: entry.task, result: String(r.result || "").slice(0, 200) }
      break
    }
  }

  return c.json({
    server: "sediman-ts", version: "0.1.0",
    python_available: Object.keys(py).length > 0,
    browser_open: py.browser_open || false,
    model: py.model || process.env.SEDIMAN_MODEL || null,
    provider: py.provider || process.env.SEDIMAN_PROVIDER || "openai",
    conversation_messages: py.conversation_messages || 0,
    current_task: currentTask,
    scheduler: py.scheduler || { active_jobs: 0, total_jobs: 0 },
    last_result: lastResult,
    queue_size: taskStore.size,
  })
})

export { api }
