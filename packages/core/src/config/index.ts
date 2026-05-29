import { resolve } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";

function getDataDir(): string {
  const env = process.env.SEDIMAN_DATA_DIR;
  if (env) return env;
  return resolve(homedir(), ".sediman");
}

export const DATA_DIR = getDataDir();

export const PATHS = {
  data: DATA_DIR,
  skills: resolve(DATA_DIR, "skills"),
  memory: resolve(DATA_DIR, "memories"),
  sessions: resolve(DATA_DIR, "sessions"),
  cron: resolve(DATA_DIR, "cron"),
  recordings: resolve(DATA_DIR, "recordings"),
  agents: resolve(DATA_DIR, "agents"),
  browserProfile: resolve(DATA_DIR, "browser-profile"),
  browserProfileCron: resolve(DATA_DIR, "browser-profile-cron"),
  soul: resolve(DATA_DIR, "SOUL.md"),
  context: resolve(DATA_DIR, "CONTEXT.md"),
  agentState: resolve(DATA_DIR, "agent_state.json"),
  history: resolve(DATA_DIR, "history"),
  screenshot: resolve(DATA_DIR, "last_screenshot.png"),
  trajectories: resolve(DATA_DIR, "trajectories"),
  db: resolve(DATA_DIR, "state.db"),
} as const;

export const LIMITS = {
  memory: intEnv("SEDIMAN_MEMORY_LIMIT", 2200),
  user: intEnv("SEDIMAN_USER_LIMIT", 1375),
  maxStructuredBytes: intEnv("SEDIMAN_MAX_STRUCTURED_BYTES", 50_000),
  maxEntriesPerType: intEnv("SEDIMAN_MAX_ENTRIES_PER_TYPE", 50),
  maxTaskLength: 10_000,
  maxNameLength: 64,
  maxResultChars: intEnv("SEDIMAN_MAX_RESULT_CHARS", 2000),
  maxResultsPerJob: intEnv("SEDIMAN_MAX_RESULTS_PER_JOB", 100),
  maxRecordingSeconds: intEnv("SEDIMAN_MAX_RECORDING_SECONDS", 300),
  compressThreshold: intEnv("SEDIMAN_COMPRESS_THRESHOLD", 20),
  skillStaleDays: intEnv("SEDIMAN_SKILL_STALE_DAYS", 30),
  maxNestedDepth: intEnv("SEDIMAN_MAX_NESTED_DEPTH", 2),
} as const;

export const NETWORK = {
  httpTimeout: floatEnv("SEDIMAN_HTTP_TIMEOUT", 15.0),
  webMaxChars: intEnv("SEDIMAN_WEB_MAX_CHARS", 5000),
} as const;

export const SERVER = {
  corsOrigins: (
    process.env.SEDIMAN_CORS_ORIGINS ??
    "http://localhost:3000,http://localhost:5173"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  openbrowserHost: process.env.SEDIMAN_OPENBROWSER_HOST ?? "127.0.0.1",
  openbrowserPort: intEnv("SEDIMAN_OPENBROWSER_PORT", 7788),
  openbrowserJs: boolEnv("SEDIMAN_OPENBROWSER_JS", true),
  rpcSocket: process.env.SEDIMAN_RPC_SOCKET ?? "/tmp/sediman.sock",
  pythonSocket:
    process.env.SEDIMAN_PYTHON_SOCKET ?? "/tmp/sediman-python.sock",
} as const;

export const STEALTH = {
  enabled: boolEnv("SEDIMAN_STEALTH", true),
  proxy: process.env.SEDIMAN_STEALTH_PROXY ?? "",
  fingerprintSeed: process.env.SEDIMAN_STEALTH_FINGERPRINT_SEED ?? "",
  binaryPath: process.env.SEDIMAN_STEALTH_BINARY_PATH ?? "",
} as const;

export function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function intEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

function floatEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : n;
}

function boolEnv(key: string, fallback: boolean): boolean {
  const v = process.env[key]?.toLowerCase();
  if (!v) return fallback;
  return v === "true" || v === "1" || v === "yes";
}
