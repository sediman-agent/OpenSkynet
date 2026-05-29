export interface ServerStatus {
  browser_open: boolean
  model: string | null
  provider: string | null
  conversation_messages: number
  current_task: CurrentTask | null
  scheduler: SchedulerInfo
  last_result: LastResult | null
  queue_size: number
}

export interface CurrentTask {
  task_id: string
  task: string
  status: string
}

export interface SchedulerInfo {
  active_jobs: number
  total_jobs: number
}

export interface LastResult {
  task_id: string
  task: string
  result: string | null
}

export interface StepEvent {
  phase: string
  action: string
  detail?: string
  url?: string
  screenshot?: string
}

export interface AgentResult {
  task: string
  result: string
  success: boolean
  steps: StepEvent[]
  skill_created?: string
  scheduled_job_id?: string
  elapsed_secs: number
}

export interface TaskSubmitResponse {
  task_id: string
  status: "queued"
}

export interface TaskStep {
  step: string
  action: string
  observation: string
}

export interface TaskResultDetail {
  result: string
  skill_created: string | null
  actions_count: number
  iterations: number
  strategy: string
  steps: TaskStep[]
}

export interface ApiErrorDetail {
  code: string
  message: string
  suggestion?: string
}

export interface TaskStatusResponse {
  task_id: string
  task: string
  status: "queued" | "running" | "completed" | "failed"
  created_at: number
  started_at?: number
  completed_at?: number
  duration?: number
  result?: TaskResultDetail
  error?: ApiErrorDetail
}

export interface SkillSummary {
  name: string
  description: string
  category?: string
  version: number
}

export interface SkillStep {
  description: string
  action_type?: string
  url?: string
  selector?: string
  text?: string
}

export interface SkillVariable {
  name: string
  description: string
  default?: string
}

export interface SkillDetail {
  name: string
  description: string
  category?: string
  version: number
  steps: SkillStep[]
  variables: SkillVariable[]
  when_to_use: string[]
  pitfalls: string[]
  verification: string[]
}

export interface SkillListResponse {
  skills: SkillSummary[]
}

export interface SkillRunResponse {
  result: AgentResult
}

export interface SkillDeleteResponse {
  deleted: string
}

export interface HubSkill {
  name: string
  description: string
  category: string
  author: string
  version: number
  trust: string
  variables?: string[]
}

export interface HubListResponse {
  skills: HubSkill[]
}

export interface HubInstallOptions {
  force?: boolean
}

export interface HubInstallResponse {
  installed: string
  message: string
}

export interface RecordStartOptions {
  description?: string
  fps?: number
  max_duration?: number
}

export interface RecordStartResponse {
  session_id: string
  name: string
  status: "recording"
  fps: number
  max_duration: number
}

export interface RecordFrame {
  type: "frame"
  timestamp: number
  url: string
  cursor_x: number
  cursor_y: number
  action: string
  action_detail: string | null
  screenshot: string | null
  frame_number: number
}

export interface RecordStopSkillResponse {
  status: "skill_created"
  frames: number
  duration: number
  actions: number
  skill: Record<string, unknown> | null
  message: string
}

export interface RecordStopAnalyzedResponse {
  status: "analyzed"
  frames: number
  duration: number
  actions: number
  skill: null
  message: string
}

export type RecordStopResponse = RecordStopSkillResponse | RecordStopAnalyzedResponse

export interface ActiveRecording {
  session_id: string
  name: string
  started_at: number
  frame_count: number
  duration_seconds: number
  action_count: number
}

export interface ActiveRecordingsResponse {
  recordings: ActiveRecording[]
}

export interface CronJob {
  id: string
  task: string
  cron_expr: string
  skill_name?: string
  enabled: boolean
  last_run?: string
  next_run?: string
}

export interface ScheduleListResponse {
  jobs: CronJob[]
}

export interface ScheduleAddRequest {
  cron: string
  task: string
  skill?: string
}

export interface ScheduleAddResponse {
  job_id: string
  cron: string
  task: string
}

export interface ScheduleRemoveResponse {
  removed: string
}

export interface MemoryUsageInfo {
  chars: number
  limit: number
  pct: number
}

export interface MemoryEntry {
  id?: number
  type?: string
  content: string
  created_at?: string
}

export interface MemoryResponse {
  entries: MemoryEntry[]
  usage: {
    memory: MemoryUsageInfo
    user: MemoryUsageInfo
  }
}

export interface SessionInfo {
  id: number
  task: string
  created_at: string
  result?: string
}

export interface SessionsResponse {
  sessions: SessionInfo[]
}

export interface ScreenshotResponse {
  screenshot: string
}

export interface ChatHistoryMessage {
  type: "history"
  messages: unknown[]
}

export interface ChatStatusMessage {
  type: "status"
  message: string
  phase: string
  timestamp: number
}

export interface ChatProgressMessage {
  type: "progress"
  step: string
  action: string
  observation: string
  phase: string
  elapsed: number
  timestamp: number
}

export interface ChatResultMessage {
  type: "result"
  result: string
  skill_created: string | null
  actions_count: number
  iterations: number
  strategy: string
  elapsed: number
  timestamp: number
  steps: TaskStep[]
}

export interface ChatErrorMessage {
  type: "error"
  error: ApiErrorDetail
}

export type ChatMessage =
  | ChatHistoryMessage
  | ChatStatusMessage
  | ChatProgressMessage
  | ChatResultMessage
  | ChatErrorMessage

export interface ViewportFrame {
  type: "screenshot"
  data: string
  timestamp: number
}

export interface SedimanClientConfig {
  baseUrl: string
  apiKey?: string
  timeout?: number
  headers?: Record<string, string>
}
