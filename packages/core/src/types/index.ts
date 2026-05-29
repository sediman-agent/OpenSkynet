export enum AgentPhase {
  Planning = "planning",
  Executing = "executing",
  Observing = "observing",
  Reflecting = "reflecting",
  Delegating = "delegating",
  Done = "done",
  Failed = "failed",
}

export enum Strategy {
  Direct = "direct",
  UseSkill = "use_skill",
  Delegate = "delegate",
  Decompose = "decompose",
  Conversational = "conversational",
  Schedule = "schedule",
}

export interface StepEvent {
  phase?: string;
  action: string;
  observation?: string;
  url?: string;
  screenshot?: string;
}

export interface AgentResult {
  task: string;
  result: string;
  steps: StepEvent[];
  success: boolean;
  skillCreated?: string;
  scheduledJobId?: string;
  scheduleCron?: string;
  strategyUsed?: Strategy;
  elapsedSecs: number;
}

export interface Observation {
  source: string;
  content: string;
  success: boolean;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface Reflection {
  taskComplete: boolean;
  confidence: number;
  reasoning: string;
  issues?: string[];
  nextAction?: string;
  shouldRetry: boolean;
  shouldReplan: boolean;
}

export interface PlanStep {
  id: string;
  description: string;
  strategy: Strategy;
  status: "pending" | "running" | "done" | "failed";
  result?: string;
  retries: number;
  fallbackAttempted: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LLMResponse {
  text: string;
  toolCalls: ToolCall[];
  done: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  data?: Record<string, unknown>;
}

export type ToolHandler = (
  params: Record<string, unknown>,
) => Promise<ToolResult> | ToolResult;

export interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export interface ManagerPlan {
  browserTask: string;
  strategy: Strategy;
  schedule?: { cron: string; task: string };
  subtasks?: string[];
  skillToUse?: string;
  response?: string;
}

export interface SkillData {
  name: string;
  description: string;
  category?: string;
  version: number;
  steps: SkillStep[];
  variables?: SkillVariable[];
  whenToUse?: string;
  pitfalls?: string[];
  verification?: string;
}

export interface SkillStep {
  description: string;
  actionType?: string;
  url?: string;
  selector?: string;
  text?: string;
}

export interface SkillVariable {
  name: string;
  description: string;
  default?: string;
}

export interface SkillSummary {
  name: string;
  description: string;
  category?: string;
  version: number;
}

export interface CronJob {
  id: string;
  task: string;
  cronExpr: string;
  skillName?: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
}

export interface SessionInfo {
  id: string;
  task: string;
  createdAt: string;
  result?: string;
}

export interface MemoryUsage {
  chars: number;
  limit: number;
  entries: number;
  formatted: string;
}

export type OnStepCallback = (action: string, detail: string) => void;

export interface LLMProviderConfig {
  provider: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface BrowserSessionConfig {
  headless: boolean;
  stealth: boolean;
  proxy?: string;
  fingerprintSeed?: number;
  userDataDir?: string;
  onScreenshot?: (data: string) => void;
}
