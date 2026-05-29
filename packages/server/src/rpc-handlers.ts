import { callPython, callPythonStreaming } from "./proxy.js";
import {
  handleSkillsList,
  handleSkillsGet,
  handleSkillsDelete,
} from "../../sdk/src/modules/skills.js";
import {
  handleHubBrowse,
  handleHubSearch,
  handleHubInfo,
  handleHubInstall,
} from "../../sdk/src/modules/hub.js";
import {
  handleScheduleList,
  handleScheduleAdd,
  handleScheduleRemove,
} from "../../sdk/src/modules/schedule.js";
import {
  handleMemoryGet,
  handleMemoryAdd,
} from "../../sdk/src/modules/memory.js";
import {
  handleSessionsList,
} from "../../sdk/src/modules/sessions.js";

export type NotifyFn = (method: string, params: Record<string, unknown>) => void;

export type RpcHandler = (
  params: Record<string, unknown>,
  notify?: NotifyFn,
) => Promise<unknown>;

// ── In-memory state (replaces Python shared globals) ─────────────
let currentProvider = process.env.SEDIMAN_PROVIDER || "openai";
let currentModel = process.env.SEDIMAN_MODEL || "";
let currentBaseUrl = process.env.SEDIMAN_BASE_URL || "";
let terminalAllowed = false;

const PROVIDERS: Array<{ name: string; default_model: string; default_base_url: string | null }> = [
  { name: "openai", default_model: "gpt-4o", default_base_url: null },
  { name: "ollama", default_model: "qwen3", default_base_url: "http://localhost:11434/v1" },
];

export function resetState(): void {
  currentProvider = process.env.SEDIMAN_PROVIDER || "openai";
  currentModel = process.env.SEDIMAN_MODEL || "";
  currentBaseUrl = process.env.SEDIMAN_BASE_URL || "";
  terminalAllowed = false;
}

export const handlers: Record<string, RpcHandler> = {

  // ── System (native TS) ──────────────────────────────────────────
  "system.status": async () => ({
    browser_open: false,
    model: currentModel || process.env.SEDIMAN_MODEL || null,
    provider: currentProvider || process.env.SEDIMAN_PROVIDER || "openai",
    conversation_messages: 0,
    current_task: null,
    scheduler: { active_jobs: 0, total_jobs: 0 },
    last_result: null,
    queue_size: 0,
  }),

  "system.screenshot": async () => callPython("system.screenshot", {}),

  "system.btw": async (params) => {
    const question = String(params.question || "");
    if (!question) return { answer: "" };
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY not set");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a helpful assistant. Answer concisely." },
          { role: "user", content: question },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI error: ${res.status}`);

    const data = await res.json() as { choices: Array<{ message: { content: string | null } }> };
    return { answer: data.choices?.[0]?.message?.content || "" };
  },

  "system.doctor": async () => {
    const checks: Record<string, boolean> = {};
    const bins = ["google-chrome", "chromium", "python3", "bun"];
    for (const bin of bins) {
      const { spawnSync } = await import("node:child_process");
      const result = spawnSync("which", [bin]);
      checks[bin] = result.status === 0;
    }
    checks.browser_running = false;
    checks.llm_configured = !!process.env.OPENAI_API_KEY;
    return { checks };
  },

  // ── Agent (proxied to Python) ──────────────────────────────────
  "agent.run": async (params, notify) => {
    const task = String(params.task || "");
    if (!task.trim()) throw new Error("task is required");

    return callPythonStreaming(
      "agent.run",
      { task },
      (method, p) => {
        try { notify?.(method, p); } catch { /* client gone */ }
      },
      { timeout: 600_000 },
    );
  },

  "agent.cancel": async () => callPython("agent.cancel", {}),

  // ── Skills ────────────────────────────────────────────────────
  "skills.list": async () => handleSkillsList(),
  "skills.get": async (params) => handleSkillsGet({ name: String(params.name || "") }),
  "skills.run": async (params) => callPython("skills.run", params),
  "skills.delete": async (params) => handleSkillsDelete({ name: String(params.name || "") }),

  // ── Hub ───────────────────────────────────────────────────────
  "hub.browse": async (params) => handleHubBrowse({ category: params.category ? String(params.category) : undefined }),
  "hub.search": async (params) => handleHubSearch({ query: String(params.query || "") }),
  "hub.info": async (params) => handleHubInfo({ name: String(params.name || "") }),
  "hub.install": async (params) => handleHubInstall({ name: String(params.name || ""), force: Boolean(params.force) }),

  // ── Schedule ──────────────────────────────────────────────────
  "schedule.list": async () => handleScheduleList(),
  "schedule.add": async (params) => handleScheduleAdd({
    cron: String(params.cron || ""),
    task: String(params.task || ""),
    skill: params.skill ? String(params.skill) : undefined,
  }),
  "schedule.remove": async (params) => handleScheduleRemove({ job_id: String(params.job_id || "") }),

  // ── Memory ────────────────────────────────────────────────────
  "memory.get": async () => handleMemoryGet(),
  "memory.add": async (params) => handleMemoryAdd({
    target: String(params.target || "memory"),
    content: String(params.content || ""),
  }),

  // ── Sessions ──────────────────────────────────────────────────
  "sessions.list": async () => handleSessionsList(),

  // ── Model (native TS) ───────────────────────────────────────────
  "model.switch": async (params) => {
    const provider = String(params.provider || "").trim();
    if (!provider) throw new Error("provider is required");
    currentProvider = provider;
    if (params.model) currentModel = String(params.model).trim();
    if (params.base_url) currentBaseUrl = String(params.base_url).trim();
    return { provider: currentProvider, model: currentModel || null };
  },

  "model.list_providers": async () => ({ providers: PROVIDERS }),

  // ── Terminal (native TS) ────────────────────────────────────────
  "terminal.set": async (params) => {
    terminalAllowed = Boolean(params.allowed);
    process.env.SEDIMAN_TERMINAL_ALLOWED = terminalAllowed ? "1" : "0";
    return { allowed: terminalAllowed };
  },

  "terminal.status": async () => {
    const env = process.env.SEDIMAN_TERMINAL_ALLOWED;
    return { allowed: env ? env === "1" || env === "true" : terminalAllowed };
  },

  // ── Recording (proxied to Python) ───────────────────────────────
  "record.start": async (params) => callPython("record.start", params),
  "record.stop": async (params) => callPython("record.stop", params),
  "record.active": async () => callPython("record.active", {}),
};
