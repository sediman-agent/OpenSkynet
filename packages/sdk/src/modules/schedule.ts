import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "fs"
import { join } from "path"
import { randomUUID } from "crypto"
import { CRON_DIR } from "../config.js"

const JOB_ID_RE = /^[a-f0-9]{1,12}$/
const CRON_FIELD_RE = /^[\d*/,-]+$/

function validateJobId(id: string): boolean {
  return JOB_ID_RE.test(id)
}

function validateCron(cron: string): boolean {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return false
  return parts.every(p => CRON_FIELD_RE.test(p))
}

function jobPath(jobId: string): string {
  if (!validateJobId(jobId)) throw new Error(`Invalid job ID: ${jobId}`)
  return join(CRON_DIR, `${jobId}.json`)
}

export async function handleScheduleList(): Promise<{ jobs: Record<string, unknown>[] }> {
  if (!existsSync(CRON_DIR)) return { jobs: [] }
  const jobs: Record<string, unknown>[] = []
  for (const f of readdirSync(CRON_DIR).sort()) {
    if (!f.endsWith(".json")) continue
    try {
      const data = JSON.parse(readFileSync(join(CRON_DIR, f), "utf-8"))
      jobs.push({ id: f.replace(".json", ""), ...data })
    } catch { /* skip corrupt */ }
  }
  return { jobs }
}

export async function handleScheduleAdd(params: { cron: string; task: string; skill?: string }): Promise<{ job_id: string }> {
  if (!validateCron(params.cron)) throw new Error(`Invalid cron expression: ${params.cron}`)
  const jobId = randomUUID().replace(/-/g, "").slice(0, 12)
  mkdirSync(CRON_DIR, { recursive: true })
  const job = { cron: params.cron, task: params.task, skill_name: params.skill || null, enabled: true, created_at: new Date().toISOString() }
  writeFileSync(jobPath(jobId), JSON.stringify(job, null, 2), "utf-8")
  return { job_id: jobId }
}

export async function handleScheduleRemove(params: { job_id: string }): Promise<{ removed: string }> {
  const p = jobPath(params.job_id)
  if (existsSync(p)) unlinkSync(p)
  return { removed: params.job_id }
}
