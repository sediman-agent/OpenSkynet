import type { ThemeTokens } from "./theme.js";
import { getTheme } from "./theme.js";

export type AgentMode = "T-800" | "Terminator";

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface AgentModeEntry {
  mode: string;
  label: string;
  runner: string;
  description: string;
  capabilities: string[];
}

export const DEFAULT_MODES: AgentModeEntry[] = [
  {
    mode: "t800",
    label: "T-800",
    runner: "t800",
    description: "Direct execution agent with all tools",
    capabilities: ["fileops", "terminal", "browser", "web", "skills", "coding", "documents"]
  },
  {
    mode: "terminator",
    label: "Term",
    runner: "terminator",
    description: "Autonomous multi-task orchestrator",
    capabilities: ["fileops", "terminal", "browser", "web", "skills", "coding", "documents", "orchestration"]
  },
];

export const COMMANDS: Array<{ name: string; aliases?: string[]; description: string; category: string }> = [
  { name: "/help", aliases: ["/h"], description: "Show help", category: "General" },
  { name: "/quit", aliases: ["/exit", "/q"], description: "Quit", category: "General" },
  { name: "/clear", aliases: ["/cls"], description: "Clear messages", category: "General" },
  { name: "/reset", description: "Full reset", category: "General" },
  { name: "/status", description: "Show status", category: "General" },
  { name: "/models", aliases: ["/model"], description: "Switch model", category: "Agent" },
  { name: "/provider", aliases: ["/providers"], description: "Switch provider", category: "Agent" },
  { name: "/coder", description: "Switch coder backend", category: "Agent" },
  { name: "/search", description: "Search mode", category: "Agent" },
  { name: "/soul", description: "Edit personality", category: "Agent" },
  { name: "/skills", aliases: ["/skill"], description: "Browse skills", category: "Skills" },
  { name: "/memory", aliases: ["/mem"], description: "Manage memory", category: "Memory" },
  { name: "/remember", description: "Quick add to memory", category: "Memory" },
  { name: "/sessions", description: "Browse sessions", category: "Sessions" },
  { name: "/schedule", aliases: ["/cron"], description: "Manage schedule", category: "Schedule" },
  { name: "/browser", description: "Toggle headless/headed", category: "Browser" },
  { name: "/screenshot", description: "Capture screenshot", category: "Browser" },
  { name: "/connect", description: "Configure integrations", category: "Integrations" },
  { name: "/checkpoint", aliases: ["/branches"], description: "List checkpoints", category: "Checkpoint" },
  { name: "/checkpoint-create", description: "Create checkpoint", category: "Checkpoint" },
  { name: "/checkpoint-revert", aliases: ["/rewind"], description: "Revert to checkpoint", category: "Checkpoint" },
  { name: "/branch", description: "Named checkpoint", category: "Checkpoint" },
  { name: "/delegate", description: "Run sub-agent task", category: "Tasks" },
  { name: "/parallel", description: "Run parallel tasks", category: "Tasks" },
  { name: "/doctor", description: "Run diagnostics", category: "Utilities" },
  { name: "/update", aliases: ["/upgrade"], description: "Check for updates", category: "Utilities" },
  { name: "/compress", description: "Compress old messages", category: "Utilities" },
  { name: "/themes", aliases: ["/theme"], description: "Switch theme", category: "Appearance" },
];

export interface TUIDeps {
  llmProvider: any;
  browserSession: any;
  browserController: any;
  memory: any;
  skillEngine: any;
  agentLoop: any;
  checkpointManager: any;
  cronManager: any;
  hubClient: any;
  gitHubInstaller: any;
  skillSearch: any;
  changelog: any;
  tasksCompleted: number;
  terminalAllowed: boolean;
  headless: boolean;
  sandboxMode: string;
  activeRecording: any;
}

export interface SelectItem {
  id: string;
  label: string;
  detail?: string;
  installed?: boolean;
  connected?: boolean;
  category?: string;
}

export type ModalType =
  | "help"
  | "modelPicker"
  | "providerPicker"
  | "connectPicker"
  | "apiKeyPrompt"
  | "skillBrowser"
  | "memoryMenu"
  | "memoryEditor"
  | "memorySystemPicker"
  | "scheduleBrowser"
  | "sessionBrowser"
  | "themePicker"
  | "coderPicker"
  | "searchModePicker"
  | "browserModePicker"
  | "doctor"
  | "info"
  | "soulEditor"
  | "checkpointBrowser";

export interface ChatMessage {
  type: "user" | "agent" | "system" | "error";
  text?: string;
  task?: string;
  taskNum?: number;
  result?: string;
  thinkingText?: string;
  steps?: string[];
  success?: boolean;
  elapsedSecs?: number;
  skillCreated?: string;
  scheduledJob?: string;
  selectedTab?: "thinking" | "steps" | "response";
  tabExpanded?: boolean;
  state?: "streaming" | "completed";
}

export interface ScrollState {
  offset: number;
  autoScroll: boolean;
  paused: boolean;
  thinkingExpanded: boolean;
  stepsExpanded: boolean;
}

export interface CompletionState {
  items: string[];
  filtered: string[];
  selected: number;
  visible: boolean;
}

export interface SidePanelState {
  open: boolean;
  tab: "skills" | "memory" | "schedule" | "status";
  scroll: number;
  skills: string[];
  memory: string[];
  schedule: string[];
}

export class App {
  provider: string = "";
  model: string | null = null;
  baseUrl: string | null = null;
  headless: boolean = true;
  version: string = "0.3.14";

  agent = {
    running: false,
    startTime: 0,
    mode: "Manager" as AgentMode,
    modes: [...DEFAULT_MODES],
    currentModeIndex: 0,
    spinnerFrame: 0,
    streamingPhase: "",
    taskCount: 0,
    coderBackend: "internal",
    searchMode: "auto",
    retryAttempt: null as number | null,
    retryMax: null as number | null,
    retryCountdown: null as number | null,
    validationConfidence: null as number | null,
    validationIssues: null as number | null,
    reflectionStatus: false,
  };

  scroll: ScrollState = {
    offset: 0,
    autoScroll: true,
    paused: false,
    thinkingExpanded: true,
    stepsExpanded: false,
  };

  sidePanel: SidePanelState = {
    open: false,
    tab: "skills",
    scroll: 0,
    skills: [],
    memory: [],
    schedule: [],
  };

  completion: CompletionState = {
    items: [],
    filtered: [],
    selected: 0,
    visible: false,
  };

  modal: {
    active: ModalType | null;
    selectedIndex: number;
    scrollOffset: number;
    filter: string;
    filterMode: boolean;
    items: SelectItem[];
    inputValue: string;
    infoTitle: string;
    infoLines: string[];
    pendingAction: string | null;
    doctorResults: any[];
    doctorInstallState: "idle" | "confirming" | "running" | null;
    doctorInstallCmd: string;
    doctorInstallOutput: string;
    themePreviewIndex: number;
  } = {
    active: null,
    selectedIndex: 0,
    scrollOffset: 0,
    filter: "",
    filterMode: false,
    items: [],
    inputValue: "",
    infoTitle: "",
    infoLines: [],
    pendingAction: null,
    doctorResults: [],
    doctorInstallState: null,
    doctorInstallCmd: "",
    doctorInstallOutput: "",
    themePreviewIndex: -1,
  };

  messages: ChatMessage[] = [];
  inputHistory: string[] = [];
  historyIndex: number = -1;
  toastText: string = "";
  toastExpiry: number = 0;
  showBanner: boolean = true;

  themeName: string = "opencode";
  config: any = {};

  commandNames: string[] = [];

  private _rerender: (() => void) | null = null;

  constructor(provider: string, model: string | null, baseUrl: string | null, headless: boolean) {
    this.provider = provider;
    this.model = model;
    this.baseUrl = baseUrl;
    this.headless = headless;
    this.commandNames = COMMANDS.flatMap(c => [c.name, ...(c.aliases ?? [])]);
    this.completion.items = this.commandNames.slice().sort();
  }

  setRerender(fn: () => void): void {
    this._rerender = fn;
  }

  rerender(): void {
    this._rerender?.();
  }

  get theme(): ThemeTokens {
    return getTheme(this.themeName);
  }

  get spinnerChar(): string {
    return SPINNER_FRAMES[this.agent.spinnerFrame % SPINNER_FRAMES.length];
  }

  advanceSpinner(): void {
    this.agent.spinnerFrame = (this.agent.spinnerFrame + 1) % SPINNER_FRAMES.length;
  }

  showToast(text: string): void {
    this.toastText = text;
    this.toastExpiry = Date.now() + 4000;
  }

  cycleAgentMode(): void {
    this.agent.currentModeIndex = (this.agent.currentModeIndex + 1) % this.agent.modes.length;
    const entry = this.agent.modes[this.agent.currentModeIndex];
    this.agent.mode = (entry.mode === "t800" ? "T-800" : entry.mode === "terminator" ? "Terminator" : "T-800") as AgentMode;
  }

  currentModeLabel(): string {
    return this.agent.modes[this.agent.currentModeIndex]?.label ?? "Mgr";
  }

  currentModeName(): string {
    return this.agent.modes[this.agent.currentModeIndex]?.mode ?? "manager";
  }

  addSystemMessage(text: string): void {
    this.messages.push({ type: "system", text });
    this.scroll.autoScroll = true;
  }

  addUserMessage(text: string, taskNum: number): void {
    this.messages.push({ type: "user", text, taskNum });
    this.scroll.autoScroll = true;
  }

  addErrorMessage(text: string): void {
    this.messages.push({ type: "error", text });
    this.scroll.autoScroll = true;
  }

  startAgentMessage(task: string): void {
    this.agent.streamingPhase = "";
    this.scroll.paused = false;
    this.scroll.thinkingExpanded = true;
    this.scroll.stepsExpanded = false;
    for (const msg of this.messages) {
      if (msg.type === "agent") msg.tabExpanded = false;
    }
    this.messages.push({
      type: "agent",
      state: "streaming",
      task,
      steps: [],
      thinkingText: "",
      success: false,
      selectedTab: "steps",
      tabExpanded: false,
    });
    this.scroll.autoScroll = true;
  }

  appendStep(action: string): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.type === "agent") {
      if (!last.steps) last.steps = [];
      const isFirst = last.steps.length === 0;
      last.steps.push(action);
      if (last.steps.length > 500) last.steps.splice(0, last.steps.length - 500);
      if (isFirst && last.state === "streaming") {
        last.selectedTab = "steps";
        last.tabExpanded = true;
      }
    }
    this.scroll.autoScroll = true;
  }

  appendStreamingToken(token: string, phase: string): void {
    if (phase) this.agent.streamingPhase = phase;
    const isThinking = phase.toLowerCase().includes("think") || phase.toLowerCase().includes("plan");
    const cleaned = this.stripThinkTags(token);
    const last = this.messages[this.messages.length - 1];
    if (last?.type === "agent") {
      if (isThinking) {
        last.thinkingText = (last.thinkingText ?? "") + cleaned;
      } else {
        last.result = (last.result ?? "") + cleaned;
        if (last.result.length > 100000) {
          const keep = Math.max(0, 100000 - cleaned.length);
          last.result = last.result.slice(last.result.length - keep);
        }
      }
    }
    this.scroll.autoScroll = true;
  }

  completeAgent(success: boolean, resultText: string, elapsedSecs: number, skillCreated?: string, scheduledJob?: string): void {
    const last = this.messages[this.messages.length - 1];
    if (last?.type === "agent") {
      last.state = "completed";
      last.success = success;
      last.result = resultText;
      last.elapsedSecs = elapsedSecs;
      last.skillCreated = skillCreated;
      last.scheduledJob = scheduledJob;
      last.selectedTab = "response";
      last.tabExpanded = true;
    }
    this.agent.running = false;
    this.agent.streamingPhase = "";
    this.scroll.autoScroll = true;
    this.save();
  }

  updateProgress(data: { kind?: string; currentAttempt?: number; maxAttempts?: number; countdownSeconds?: number; confidence?: number; issuesCount?: number }): void {
    if (data.kind === "retry") {
      this.agent.retryAttempt = data.currentAttempt ?? null;
      this.agent.retryMax = data.maxAttempts ?? null;
      this.agent.retryCountdown = data.countdownSeconds ?? null;
      this.agent.streamingPhase = "retrying";
    } else if (data.kind === "validation") {
      this.agent.validationConfidence = data.confidence ?? null;
      this.agent.validationIssues = data.issuesCount ?? null;
    } else if (data.kind === "reflection") {
      this.agent.reflectionStatus = true;
      this.agent.streamingPhase = "reflecting";
    }
    this.scroll.autoScroll = true;
  }

  toggleSteps(): void {
    this.scroll.stepsExpanded = !this.scroll.stepsExpanded;
  }

  switchTab(direction: 1 | -1): void {
    const tabs: Array<"thinking" | "steps" | "response"> = ["thinking", "steps", "response"];
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].type === "agent") {
        const msg = this.messages[i];
        const cur = tabs.indexOf(msg.selectedTab ?? "response");
        msg.selectedTab = tabs[(cur + direction + 3) % 3];
        return;
      }
    }
  }

  toggleTabExpansion(): void {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      if (this.messages[i].type === "agent") {
        this.messages[i].tabExpanded = !this.messages[i].tabExpanded;
        return;
      }
    }
  }

  cycleTheme(): void {
    const names = getThemeNames();
    const idx = names.indexOf(this.themeName);
    this.themeName = names[(idx + 1) % names.length];
  }

  openModal(type: ModalType): void {
    this.modal.active = type;
    this.modal.selectedIndex = 0;
    this.modal.scrollOffset = 0;
    this.modal.filter = "";
    this.modal.filterMode = false;
  }

  closeModal(): void {
    if (this.modal.active === "themePicker" && this.modal.themePreviewIndex >= 0) {
      this.themeName = getThemeNames()[this.modal.themePreviewIndex] ?? "opencode";
    }
    this.modal.active = null;
    this.modal.filterMode = false;
    this.modal.inputValue = "";
    this.modal.themePreviewIndex = -1;
  }

  updateCompletion(input: string): void {
    if (!input.startsWith("/")) {
      this.completion.visible = false;
      return;
    }
    const prefix = input.toLowerCase();
    this.completion.filtered = this.completion.items.filter(c => c.startsWith(prefix));
    this.completion.selected = 0;
    this.completion.visible = this.completion.filtered.length > 0 && !this.completion.filtered.includes(prefix);
  }

  acceptCompletion(): string {
    if (!this.completion.visible || this.completion.filtered.length === 0) return "";
    return this.completion.filtered[this.completion.selected] + " ";
  }

  private stripThinkTags(text: string): string {
    return text.includes("<")
      ? text.replace(/<think[^>]*>/gi, "").replace(/<\/think>?/gi, "").replace(/<think/gi, "")
      : text;
  }

  save(): void {
    const { saveSession } = require("./session.js");
    saveSession(this.messages);
  }

  load(): void {
    const { loadSession } = require("./session.js");
    const msgs = loadSession();
    if (msgs && msgs.length > 0) {
      this.messages = msgs;
      this.showBanner = false;
      this.scroll.offset = 0;
      this.scroll.autoScroll = true;
    }
  }
}

function getThemeNames(): string[] {
  const { THEMES: themes } = require("./theme.js");
  return (themes as Array<{ name: string }>).map(t => t.name);
}
