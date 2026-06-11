import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  dataDir: string;
  skillsDir: string;
  memoryDir: string;
  sessionsDir: string;
  cronDir: string;
  recordingsDir: string;
  agentsDir: string;
  browserProfileDir: string;
  soulFile: string;
  contextFile: string;
  agentStateFile: string;
  historyFile: string;
  screenshotFile: string;
  trajectoriesDir: string;
  memoryLimit: number;
  userLimit: number;
  maxStructuredBytes: number;
  memorySystem: "file" | "hy";
  hyMemoryDb: string;
  maxEntriesPerType: number;
  maxTaskLength: number;
  maxNameLength: number;
  maxCronFields: number;
  safeNameRe: RegExp;
  cronFieldRe: RegExp;
  frontmatterRe: RegExp;
  maxResultChars: number;
  maxResultsPerJob: number;
  maxRecordingSeconds: number;
  compressThreshold: number;
  skillStaleDays: number;
  maxNestedDepth: number;
  defaultHttpTimeout: number;
  defaultWebMaxChars: number;
  corsOrigins: string[];
  stealthEnabled: boolean;
  stealthProxy: string;
  stealthFingerprintSeed: string;
  stealthBinaryPath: string;
  integrationsConfigPath: string;
  openbrowserHost: string;
  openbrowserPort: number;
  agentBrowserBinary: string;
  authFile: string;
  dbPath: string;
  // P0: Batch execution
  enableBatchExecution: boolean;
  maxBatchSize: number;
  batchChangeDetection: "strict" | "loose";
  enableParallelExecution: boolean;
  // P0: Structured validation
  enableStructuredValidation: boolean;
  strictResponseParsing: boolean;
  maxResponseParsingRetries: number;
  // P1: Page extraction LLM
  enablePageExtractionLLM: boolean;
  pageExtractionProvider: string;
  pageExtractionModel: string;
  // P1: Granular timeouts
  toolTimeouts: Record<string, number>;
  defaultToolTimeout: number;
  // P2: Fallback LLM
  fallbackProvider: string;
  fallbackModel: string;
  enableAutomaticFailover: boolean;
  maxConsecutiveFailures: number;
  // P2: Flash mode
  enableFlashMode: boolean;
  flashModeKeywords: string[];
  flashModeSkipThinking: boolean;
  flashModeSkipEvaluation: boolean;
  // P3: Conversation persistence
  autoExportConversations: boolean;
  conversationExportFormats: { json: boolean; markdown: boolean; txt: boolean };
  // P3: Agent history
  autoSaveHistory: boolean;
  maxHistoryEntries: number;
}

let _config: Config | null = null;

export function resetConfig(): void {
  _config = null;
}

function _envBool(key: string, def: string): boolean {
  const val = (process.env[key] ?? def).toLowerCase().trim();
  return val === "true" || val === "1" || val === "yes";
}

export function getConfig(): Config {
  if (_config) return _config;

  const dataDir =
    process.env.SEDIMAN_DATA_DIR || join(homedir(), ".terminator");

  const config: Config = {
    dataDir,
    skillsDir: join(dataDir, "skills"),
    memoryDir: join(dataDir, "memories"),
    sessionsDir: join(dataDir, "sessions"),
    cronDir: join(dataDir, "cron"),
    recordingsDir: join(dataDir, "recordings"),
    agentsDir: join(dataDir, "agents"),
    browserProfileDir: join(dataDir, "browser-profile-cron"),
    soulFile: join(dataDir, "SOUL.md"),
    contextFile: join(dataDir, "CONTEXT.md"),
    agentStateFile: join(dataDir, "agent_state.json"),
    historyFile: join(dataDir, "history"),
    screenshotFile: join(dataDir, "last_screenshot.png"),
    trajectoriesDir: join(dataDir, "trajectories"),

    memoryLimit: parseInt(process.env.SEDIMAN_MEMORY_LIMIT ?? "2200", 10),
    userLimit: parseInt(process.env.SEDIMAN_USER_LIMIT ?? "1375", 10),
    maxStructuredBytes: parseInt(
      process.env.SEDIMAN_MAX_STRUCTURED_BYTES ?? "50000",
      10,
    ),

    memorySystem:
      (process.env.SEDIMAN_MEMORY_SYSTEM as "file" | "hy") ?? "file",
    hyMemoryDb: join(dataDir, "hy_memory.db"),
    maxEntriesPerType: parseInt(
      process.env.SEDIMAN_MAX_ENTRIES_PER_TYPE ?? "50",
      10,
    ),

    maxTaskLength: 10000,
    maxNameLength: 64,
    maxCronFields: 5,
    safeNameRe: /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
    cronFieldRe: /^\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)/,
    frontmatterRe: /^---\s*\n(.*?)\n---\s*\n/s,

    maxResultChars: parseInt(
      process.env.SEDIMAN_MAX_RESULT_CHARS ?? "2000",
      10,
    ),
    maxResultsPerJob: parseInt(
      process.env.SEDIMAN_MAX_RESULTS_PER_JOB ?? "100",
      10,
    ),
    maxRecordingSeconds: parseInt(
      process.env.SEDIMAN_MAX_RECORDING_SECONDS ?? "300",
      10,
    ),

    compressThreshold: parseInt(
      process.env.SEDIMAN_COMPRESS_THRESHOLD ?? "20",
      10,
    ),
    skillStaleDays: parseInt(
      process.env.SEDIMAN_SKILL_STALE_DAYS ?? "30",
      10,
    ),
    maxNestedDepth: parseInt(
      process.env.SEDIMAN_MAX_NESTED_DEPTH ?? "2",
      10,
    ),

    defaultHttpTimeout: parseFloat(
      process.env.SEDIMAN_HTTP_TIMEOUT ?? "15.0",
    ),
    defaultWebMaxChars: parseInt(
      process.env.SEDIMAN_WEB_MAX_CHARS ?? "5000",
      10,
    ),

    corsOrigins: (process.env.SEDIMAN_CORS_ORIGINS ??
      "http://localhost:3000,http://localhost:5173")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean),

    stealthEnabled: _envBool("SEDIMAN_STEALTH", "true"),
    stealthProxy: process.env.SEDIMAN_STEALTH_PROXY ?? "",
    stealthFingerprintSeed:
      process.env.SEDIMAN_STEALTH_FINGERPRINT_SEED ?? "",
    stealthBinaryPath: process.env.SEDIMAN_STEALTH_BINARY_PATH ?? "",

    integrationsConfigPath: join(dataDir, "integrations.json"),

    openbrowserHost: process.env.SEDIMAN_OPENBROWSER_HOST ?? "127.0.0.1",
    openbrowserPort: parseInt(
      process.env.SEDIMAN_OPENBROWSER_PORT ?? "7788",
      10,
    ),
    agentBrowserBinary: process.env.SEDIMAN_AGENTBROWSER_BINARY ?? "",

    authFile: join(dataDir, "auth.json"),
    dbPath: join(dataDir, "state.db"),

    // P0: Batch execution
    enableBatchExecution: _envBool("SEDIMAN_BATCH_EXECUTION", "true"),
    maxBatchSize: parseInt(process.env.SEDIMAN_MAX_BATCH_SIZE ?? "5", 10),
    batchChangeDetection: (process.env.SEDIMAN_BATCH_CHANGE_DETECTION as "strict" | "loose") ?? "loose",
    enableParallelExecution: _envBool("SEDIMAN_PARALLEL_EXECUTION", "true"),

    // P0: Structured validation
    enableStructuredValidation: _envBool("SEDIMAN_STRUCTURED_VALIDATION", "true"),
    strictResponseParsing: _envBool("SEDIMAN_STRICT_RESPONSE_PARSING", "false"),
    maxResponseParsingRetries: parseInt(process.env.SEDIMAN_MAX_PARSING_RETRIES ?? "3", 10),

    // P1: Page extraction LLM
    enablePageExtractionLLM: _envBool("SEDIMAN_PAGE_EXTRACTION_LLM", "false"),
    pageExtractionProvider: process.env.SEDIMAN_PAGE_EXTRACTION_PROVIDER ?? "openai",
    pageExtractionModel: process.env.SEDIMAN_PAGE_EXTRACTION_MODEL ?? "gpt-4o-mini",

    // P1: Granular timeouts
    toolTimeouts: {
      browser_navigate: parseInt(process.env.TIMEOUT_BROWSER_NAVIGATE ?? "45000", 10),
      browser_click: parseInt(process.env.TIMEOUT_BROWSER_CLICK ?? "5000", 10),
      browser_type: parseInt(process.env.TIMEOUT_BROWSER_TYPE ?? "10000", 10),
      browser_scroll: parseInt(process.env.TIMEOUT_BROWSER_SCROLL ?? "5000", 10),
      browser_wait: parseInt(process.env.TIMEOUT_BROWSER_WAIT ?? "30000", 10),
      browser_snapshot: parseInt(process.env.TIMEOUT_BROWSER_SNAPSHOT ?? "10000", 10),
      browser_screenshot: parseInt(process.env.TIMEOUT_BROWSER_SCREENSHOT ?? "15000", 10),
      browser_hover: parseInt(process.env.TIMEOUT_BROWSER_HOVER ?? "5000", 10),
      browser_press_key: parseInt(process.env.TIMEOUT_BROWSER_PRESS_KEY ?? "5000", 10),
      browser_select_option: parseInt(process.env.TIMEOUT_BROWSER_SELECT_OPTION ?? "5000", 10),
      browser_go_back: parseInt(process.env.TIMEOUT_BROWSER_GO_BACK ?? "10000", 10),
      browser_go_forward: parseInt(process.env.TIMEOUT_BROWSER_GO_FORWARD ?? "10000", 10),
      browser_refresh: parseInt(process.env.TIMEOUT_BROWSER_REFRESH ?? "30000", 10),
      browser_switch_tab: parseInt(process.env.TIMEOUT_BROWSER_SWITCH_TAB ?? "5000", 10),
      browser_list_tabs: parseInt(process.env.TIMEOUT_BROWSER_LIST_TABS ?? "5000", 10),
      browser_extract_text: parseInt(process.env.TIMEOUT_BROWSER_EXTRACT_TEXT ?? "10000", 10),
      browser_end: parseInt(process.env.TIMEOUT_BROWSER_END ?? "5000", 10),
      request_human_help: parseInt(process.env.TIMEOUT_REQUEST_HUMAN_HELP ?? "120000", 10),
    },
    defaultToolTimeout: parseInt(process.env.TIMEOUT_DEFAULT ?? "30000", 10),

    // P2: Fallback LLM
    fallbackProvider: process.env.SEDIMAN_FALLBACK_PROVIDER ?? "openai",
    fallbackModel: process.env.SEDIMAN_FALLBACK_MODEL ?? "gpt-4o",
    enableAutomaticFailover: _envBool("SEDIMAN_AUTO_FAILOVER", "false"),
    maxConsecutiveFailures: parseInt(process.env.SEDIMAN_MAX_CONSECUTIVE_FAILURES ?? "3", 10),

    // P2: Flash mode
    enableFlashMode: _envBool("SEDIMAN_FLASH_MODE", "true"),
    flashModeKeywords: (process.env.SEDIMAN_FLASH_MODE_KEYWORDS ?? "navigate to,go to,open,click,screenshot,scroll,type,fill form").split(",").map(k => k.trim()).filter(Boolean),
    flashModeSkipThinking: _envBool("SEDIMAN_FLASH_SKIP_THINKING", "false"),
    flashModeSkipEvaluation: _envBool("SEDIMAN_FLASH_SKIP_EVALUATION", "false"),

    // P3: Conversation persistence
    autoExportConversations: _envBool("SEDIMAN_AUTO_EXPORT_CONVERSATIONS", "false"),
    conversationExportFormats: {
      json: _envBool("SEDIMAN_EXPORT_JSON", "true"),
      markdown: _envBool("SEDIMAN_EXPORT_MARKDOWN", "true"),
      txt: _envBool("SEDIMAN_EXPORT_TXT", "false"),
    },

    // P3: Agent history
    autoSaveHistory: _envBool("SEDIMAN_AUTO_SAVE_HISTORY", "false"),
    maxHistoryEntries: parseInt(process.env.SEDIMAN_MAX_HISTORY_ENTRIES ?? "100", 10),
  };

  Object.freeze(config);
  _config = config;
  return config;
}
