import { SedimanError, ConnectionError, TimeoutError, createApiError } from "./errors.js"
import { ChatStream } from "./ws/chat.js"
import { RecordingStream } from "./ws/record.js"
import { ViewportStream } from "./ws/viewport.js"
import type {
  SedimanClientConfig,
  ServerStatus,
  TaskSubmitResponse,
  TaskStatusResponse,
  SkillSummary,
  SkillDetail,
  SkillRunResponse,
  SkillDeleteResponse,
  HubSkill,
  HubInstallOptions,
  HubInstallResponse,
  RecordStartOptions,
  RecordStartResponse,
  RecordStopResponse,
  ActiveRecordingsResponse,
  CronJob,
  ScheduleAddRequest,
  ScheduleAddResponse,
  ScheduleRemoveResponse,
  MemoryResponse,
  SessionInfo,
  ScreenshotResponse,
  ChatMessage,
} from "./types.js"

export class SedimanClient {
  private baseUrl: string
  private apiKey?: string
  private timeout: number
  private headers: Record<string, string>
  private controller: AbortController | null = null

  constructor(config: SedimanClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "")
    this.apiKey = config.apiKey
    this.timeout = config.timeout ?? 30_000
    this.headers = { ...config.headers }
    if (this.apiKey) {
      this.headers["Authorization"] = `Bearer ${this.apiKey}`
    }
  }

  private async request<T>(
    method: string, path: string, body?: unknown, signal?: AbortSignal,
  ): Promise<T> {
    this.controller = new AbortController()
    const timeoutId = setTimeout(() => this.controller?.abort(), this.timeout)
    const url = `${this.baseUrl}${path}`

    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...this.headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: signal ?? this.controller.signal,
      })

      if (!response.ok) {
        let detail: { code?: string; message?: string; suggestion?: string }
        try { detail = await response.json() as typeof detail }
        catch { detail = { code: "UNKNOWN", message: response.statusText } }
        throw createApiError(response.status, {
          code: detail.code ?? "UNKNOWN",
          message: detail.message ?? response.statusText,
          suggestion: detail.suggestion,
        })
      }

      return (await response.json()) as T
    } catch (err: unknown) {
      if (err instanceof SedimanError) throw err
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new TimeoutError()
      }
      throw new ConnectionError(`Request to ${method} ${path} failed`, err)
    } finally {
      clearTimeout(timeoutId)
      this.controller = null
    }
  }

  private get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>("GET", path, undefined, signal)
  }

  private post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>("POST", path, body, signal)
  }

  private delete<T>(path: string, signal?: AbortSignal): Promise<T> {
    return this.request<T>("DELETE", path, undefined, signal)
  }

  abort(): void {
    this.controller?.abort()
  }

  async getStatus(signal?: AbortSignal): Promise<ServerStatus> {
    return this.get("/api/status", signal)
  }

  async submitTask(task: string, signal?: AbortSignal): Promise<TaskSubmitResponse> {
    return this.post("/api/task", { task }, signal)
  }

  async getTaskStatus(taskId: string, signal?: AbortSignal): Promise<TaskStatusResponse> {
    return this.get(`/api/task/${taskId}`, signal)
  }

  async waitForTask(taskId: string, pollIntervalMs = 1000, signal?: AbortSignal): Promise<TaskStatusResponse> {
    while (true) {
      const result = await this.getTaskStatus(taskId, signal)
      if (result.status === "completed" || result.status === "failed") return result
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
    }
  }

  async listSkills(signal?: AbortSignal): Promise<SkillSummary[]> {
    const res = await this.get<{ skills: SkillSummary[] }>("/api/skills", signal)
    return res.skills
  }

  async getSkill(name: string, signal?: AbortSignal): Promise<SkillDetail> {
    return this.get(`/api/skills/${encodeURIComponent(name)}`, signal)
  }

  async runSkill(name: string, signal?: AbortSignal): Promise<SkillRunResponse> {
    return this.post(`/api/skills/${encodeURIComponent(name)}/run`, { name }, signal)
  }

  async deleteSkill(name: string, signal?: AbortSignal): Promise<SkillDeleteResponse> {
    return this.delete(`/api/skills/${encodeURIComponent(name)}`, signal)
  }

  async hubBrowse(options?: { category?: string }, signal?: AbortSignal): Promise<HubSkill[]> {
    const params = options?.category
      ? `?category=${encodeURIComponent(options.category)}`
      : ""
    const res = await this.get<{ skills: HubSkill[] }>(`/api/hub/browse${params}`, signal)
    return res.skills
  }

  async hubSearch(query: string, signal?: AbortSignal): Promise<HubSkill[]> {
    const res = await this.get<{ skills: HubSkill[] }>(`/api/hub/search?q=${encodeURIComponent(query)}`, signal)
    return res.skills
  }

  async hubInfo(name: string, signal?: AbortSignal): Promise<HubSkill> {
    return this.get(`/api/hub/${encodeURIComponent(name)}`, signal)
  }

  async hubInstall(name: string, options?: HubInstallOptions, signal?: AbortSignal): Promise<HubInstallResponse> {
    return this.post("/api/hub/install", { name, force: options?.force ?? false }, signal)
  }

  async startRecording(name: string, options?: RecordStartOptions, signal?: AbortSignal): Promise<RecordStartResponse> {
    return this.post("/api/skills/record/start", {
      name,
      description: options?.description,
      fps: options?.fps ?? 3,
      max_duration: options?.max_duration ?? 300,
    }, signal)
  }

  async stopRecording(sessionId: string, signal?: AbortSignal): Promise<RecordStopResponse> {
    return this.post(`/api/skills/record/${encodeURIComponent(sessionId)}/stop`, undefined, signal)
  }

  async getActiveRecordings(signal?: AbortSignal): Promise<ActiveRecordingsResponse> {
    return this.get("/api/skills/record/active", signal)
  }

  async listSchedules(signal?: AbortSignal): Promise<CronJob[]> {
    const res = await this.get<{ jobs: CronJob[] }>("/api/schedule", signal)
    return res.jobs
  }

  async addSchedule(req: ScheduleAddRequest, signal?: AbortSignal): Promise<ScheduleAddResponse> {
    return this.post("/api/schedule", req, signal)
  }

  async removeSchedule(jobId: string, signal?: AbortSignal): Promise<ScheduleRemoveResponse> {
    return this.delete(`/api/schedule/${encodeURIComponent(jobId)}`, signal)
  }

  async getMemory(signal?: AbortSignal): Promise<MemoryResponse> {
    return this.get("/api/memory", signal)
  }

  async listSessions(signal?: AbortSignal): Promise<SessionInfo[]> {
    const res = await this.get<{ sessions: SessionInfo[] }>("/api/sessions", signal)
    return res.sessions
  }

  async getScreenshot(signal?: AbortSignal): Promise<ScreenshotResponse> {
    return this.get("/api/screenshot", signal)
  }

  async getBrowserScreenshot(signal?: AbortSignal): Promise<string> {
    const res = await this.getScreenshot(signal)
    return res.screenshot
  }

  connectChat(): ChatStream {
    return new ChatStream(this.baseUrl)
  }

  async *chatStream(task: string): AsyncGenerator<ChatMessage> {
    const chat = this.connectChat()
    try {
      const done = new Promise<void>((resolve, reject) => {
        chat.on("error", (err: unknown) => reject(err))
        chat.on("close", () => resolve())
      })
      await chat.sendTask(task)
      for await (const msg of chat) {
        yield msg
      }
      await done
    } finally {
      chat.disconnect()
    }
  }

  connectRecording(sessionId: string): RecordingStream {
    return new RecordingStream(this.baseUrl, sessionId)
  }

  connectViewport(): ViewportStream {
    return new ViewportStream(this.baseUrl)
  }
}

export type { ChatMessage } from "./types.js"
