import {
  createCliRenderer,
  RGBA,
  BoxRenderable,
  TextRenderable,
  TextareaRenderable,
  ScrollBoxRenderable,
  type CliRenderer,
  type TextareaRenderable as TextareaRef,
  type ScrollBoxRenderable as ScrollBoxRef,
} from "@opentui/core";
import {
  App,
  DEFAULT_MODES,
  SPINNER_FRAMES,
  type TUIDeps,
  type ModalType,
  type ChatMessage,
  type SelectItem,
} from "./app.js";
import { THEMES, type ThemeTokens, getTheme } from "./theme.js";
import { TUIConfig } from "./config.js";
import { runAgentStream } from "../agent/stream-run.js";

export type { TUIDeps } from "./app.js";

function rgba(hex: string): RGBA {
  return RGBA.fromHex(hex);
}

function formatElapsed(secs: number): string {
  if (secs < 1) return "< 1s";
  if (secs < 60) return `${Math.floor(secs)}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${Math.floor(secs % 60)}s`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x1100 && (
      code <= 0x115f || code === 0x2329 || code === 0x232a ||
      (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe10 && code <= 0xfe19) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x1f300 && code <= 0x1f64f) ||
      (code >= 0x1f900 && code <= 0x1f9ff) ||
      (code >= 0x20000 && code <= 0x2fffd) ||
      (code >= 0x30000 && code <= 0x3fffd)
    )) w += 2;
    else w += 1;
  }
  return w;
}

function truncateStr(s: string, max: number): string {
  let w = 0;
  let result = "";
  for (const ch of s) {
    const cw = displayWidth(ch);
    if (w + cw > max) {
      if (max - w >= 1) result += "…";
      break;
    }
    result += ch;
    w += cw;
  }
  return result;
}

const LOGO_LINES = [
  "   ____                  _____ __                    __ ",
  "  / __ \\____  ___  ____ / ___// /____  ______  ___  / /_",
  " / / / / __ \\ / _ \\/ __ \\\\__ \\/ //_/ / / / __ \\/ _ \\/ __/",
  "/ /_/ / /_/ /  __/ / / /__/ / ,< / /_/ / / / /  __/ /_ ",
  "\\____/ .___/\\___/_/ /_/____/_/|_|\\__, /_/ /_/\\___/\\__/",
  "    /_/                         /____/                 ",
];

const LOGO_COLORS: (keyof ThemeTokens)[] = ["primary", "secondary", "info", "warning", "error", "primary"];

export async function startTUI(deps: TUIDeps): Promise<void> {
  const config = TUIConfig.load();
  const app = new App(config.provider || "openai", config.model || null, config.baseUrl || null, deps.headless);
  app.themeName = config.theme || "opencode";
  app.load();

  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    targetFps: 30,
    screenMode: "alternate-screen",
    autoFocus: true,
    onDestroy: () => {},
  });

  const tui = new TUIController(renderer, app, deps);
  tui.init();
  await tui.run();
}

class TUIController {
  private renderer: CliRenderer;
  private app: App;
  private deps: TUIDeps;
  private destroyed = false;

  private root!: BoxRenderable;
  private titleBar!: BoxRenderable;
  private contentAreaBox!: BoxRenderable;
  private contentArea!: ScrollBoxRenderable;
  private inputArea!: BoxRenderable;
  private metaBar!: BoxRenderable;
  private footer!: BoxRenderable;
  private toastOverlay!: BoxRenderable;
  private modalOverlay!: BoxRenderable;

  private textarea!: TextareaRenderable;
  private titleText!: TextRenderable;
  private metaText!: TextRenderable;
  private toastText!: TextRenderable;

  private contentLines: TextRenderable[] = [];
  private modalLines: TextRenderable[] = [];

  private ticker: ReturnType<typeof setInterval> | null = null;
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;
  private activeModal: ModalType | null = null;
  private modalItems: SelectItem[] = [];
  private modalSelectedIndex = 0;
  private modalInputValue = "";

  constructor(renderer: CliRenderer, app: App, deps: TUIDeps) {
    this.renderer = renderer;
    this.app = app;
    this.deps = deps;
  }

  init(): void {
    const t = this.theme();
    const W = this.renderer.width;
    const H = this.renderer.height;

    this.renderer.setBackgroundColor(rgba(t.background));

    this.root = new BoxRenderable(this.renderer, {
      width: W, height: H,
      flexDirection: "column",
      backgroundColor: rgba(t.background),
    });

    this.titleBar = new BoxRenderable(this.renderer, {
      height: 1,
      flexDirection: "row",
      backgroundColor: rgba(t.background),
      paddingLeft: 2,
    });

    this.contentAreaBox = new BoxRenderable(this.renderer, {
      flexGrow: 1,
      minHeight: 3,
      flexDirection: "column",
      paddingTop: 1,
      paddingBottom: 1,
      paddingLeft: 2,
      paddingRight: 2,
    });
    this.contentArea = new ScrollBoxRenderable(this.renderer, {
      flexGrow: 1,
      minHeight: 3,
      stickyScroll: true,
      stickyStart: "bottom",
      flexDirection: "column",
      scrollY: true,
      scrollX: false,
      viewportCulling: false,
    });

    this.inputArea = new BoxRenderable(this.renderer, {
      height: 1,
      paddingLeft: 2,
      paddingRight: 2,
    });

    this.metaBar = new BoxRenderable(this.renderer, {
      height: 1,
      paddingLeft: 2,
      paddingRight: 2,
    });

    this.footer = new BoxRenderable(this.renderer, {
      height: 1,
      flexDirection: "row",
      backgroundColor: rgba(t.background),
      paddingLeft: 2,
    });

    this.toastOverlay = new BoxRenderable(this.renderer, {
      height: 1,
      position: "absolute",
      bottom: 3,
      left: 2,
      zIndex: 50,
      backgroundColor: rgba(t.backgroundPanel),
      visible: false,
    });

    this.modalOverlay = new BoxRenderable(this.renderer, {
      position: "absolute",
      top: 2,
      left: Math.floor((W - 70) / 2),
      width: 70,
      zIndex: 200,
      flexDirection: "column",
      backgroundColor: rgba(t.backgroundPanel),
      border: true,
      borderColor: rgba(t.border),
      visible: false,
    });

    this.titleText = new TextRenderable(this.renderer, { content: "", height: 1 });
    this.titleBar.add(this.titleText);

    this.metaText = new TextRenderable(this.renderer, { content: "", height: 1 });
    this.metaBar.add(this.metaText);

    this.toastText = new TextRenderable(this.renderer, { content: "" });
    this.toastOverlay.add(this.toastText);

    this.textarea = new TextareaRenderable(this.renderer, {
      height: 1,
      minHeight: 1,
      maxHeight: 5,
      textColor: rgba(t.text),
      backgroundColor: rgba(t.backgroundElement),
      focusedBackgroundColor: rgba(t.backgroundElement),
      focusedTextColor: rgba(t.text),
      placeholder: 'Ask anything... "Fix a TODO in the codebase"',
      placeholderColor: rgba(t.textMuted),
      onSubmit: () => this.handleSubmit(),
    });

    this.inputArea.add(this.textarea);

    this.root.add(this.titleBar);
    this.root.add(this.contentAreaBox);
    this.root.add(this.contentArea);
    this.root.add(this.inputArea);
    this.root.add(this.metaBar);
    this.root.add(this.footer);
    this.root.add(this.toastOverlay);
    this.root.add(this.modalOverlay);

    this.renderer.root.add(this.root);

    this.textarea.focus();

    this.setupKeyboard();
    this.renderStatic();
    this.renderTitleBar();
    this.renderMetaBar();
    this.renderContent();
    this.renderFooter();
    this.startTicker();

    setTimeout(() => { this.textarea.focus(); }, 100);

    this.renderer.on("resize", () => {
      this.root.width = this.renderer.width;
      this.root.height = this.renderer.height;
      this.renderer.requestRender();
    });
  }

  async run(): Promise<void> {
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (this.destroyed) { clearInterval(check); resolve(); }
      }, 200);
    });
  }

  private theme(): ThemeTokens {
    return getTheme(this.app.themeName);
  }

  private setupKeyboard(): void {
    this.renderer.keyInput.on("keypress", (key: any) => {
      if (this.activeModal) {
        this.handleModalKey(key);
        return;
      }

      if (key.ctrl && key.name === "/") { this.openModal("help"); return; }
      if (key.ctrl && key.name === "t") {
        this.app.cycleTheme();
        this.applyTheme();
        this.showToast(`Theme: ${this.app.themeName}`);
        return;
      }
      if (key.ctrl && key.name === "s") { this.app.toggleSteps(); this.renderContent(); return; }
      if (key.name === "escape" && this.app.agent.running) {
        this.app.agent.running = false;
        this.app.agent.streamingPhase = "";
        this.renderTitleBar();
        this.renderMetaBar();
        this.showToast("Agent cancelled");
        return;
      }
      if (key.name === "tab" && !key.shift) {
        key.preventDefault?.();
        this.app.cycleAgentMode();
        this.renderMetaBar();
        this.showToast(`Mode: ${this.app.agent.mode}`);
        return;
      }
    });
  }

  private startTicker(): void {
    this.ticker = setInterval(() => {
      if (this.app.agent.running) {
        this.app.advanceSpinner();
        this.renderTitleBar();
        this.renderMetaBar();
        this.renderContent();
      }
      if (this.app.toastExpiry && Date.now() > this.app.toastExpiry) {
        this.app.toastText = "";
        this.app.toastExpiry = 0;
        this.toastOverlay.visible = false;
        this.renderer.requestRender();
      }
    }, 200);
  }

  private applyTheme(): void {
    const t = this.theme();
    this.renderer.setBackgroundColor(rgba(t.background));
    this.root.backgroundColor = rgba(t.background);
    this.titleBar.backgroundColor = rgba(t.background);
    this.footer.backgroundColor = rgba(t.background);
    this.renderStatic();
    this.renderTitleBar();
    this.renderMetaBar();
    this.renderContent();
    this.renderFooter();
    this.renderer.requestRender();
  }

  private renderStatic(): void {
    const t = this.theme();
    this.textarea.backgroundColor = rgba(t.backgroundElement);
    this.textarea.focusedBackgroundColor = rgba(t.backgroundElement);
    this.textarea.focusedTextColor = rgba(t.text);
    this.textarea.textColor = rgba(t.text);
    this.textarea.placeholderColor = rgba(t.textMuted);
    this.toastOverlay.backgroundColor = rgba(t.backgroundPanel);
    this.modalOverlay.backgroundColor = rgba(t.backgroundPanel);
    this.modalOverlay.borderColor = rgba(t.border);
  }

  private renderTitleBar(): void {
    const t = this.theme();
    const W = this.renderer.width;
    const running = this.app.agent.running;
    const spinner = running ? ` ${this.app.spinnerChar}` : "";
    const elapsed = running && this.app.agent.startTime
      ? formatElapsed((Date.now() - this.app.agent.startTime) / 1000)
      : "idle";
    const elapsedColor = running ? t.success : t.textMuted;
    const left = ` ◆ OpenSkynet${spinner} v${this.app.version}`;
    const right = `${this.app.provider} · ${this.app.model ?? "auto"} · ${elapsed}`;
    const padLen = Math.max(1, W - displayWidth(left) - displayWidth(right) - 4);
    const content = `${left}${" ".repeat(padLen)}${right}`;
    this.titleText.content = content;
    this.titleText.fg = rgba(t.primary);
    this.renderer.requestRender();
  }

  private renderMetaBar(): void {
    const t = this.theme();
    const mode = this.app.currentModeLabel();
    const modeColor = this.modeColor();
    const hint = this.app.agent.running ? `${this.app.spinnerChar} Processing...` : "";
    const text = ` ${mode} · ${this.app.model ?? "auto"} · ${this.app.provider}${hint ? "  " + hint : ""}`;
    this.metaText.content = truncateStr(text, this.renderer.width - 4);
    this.metaText.fg = rgba(modeColor);
    this.renderer.requestRender();
  }

  private renderFooter(): void {
    const t = this.theme();
    this.footer.remove("footer-text");
    const cwd = process.cwd();
    const cwdShort = cwd.length > 35 ? "..." + cwd.slice(cwd.length - 32) : cwd;
    const W = this.renderer.width;
    const left = ` ${cwdShort}`;
    const right = "/help";
    const padLen = Math.max(1, W - displayWidth(left) - displayWidth(right) - 2);
    const ft = new TextRenderable(this.renderer, {
      id: "footer-text",
      content: `${left}${" ".repeat(padLen)}${right}`,
      height: 1,
      fg: rgba(t.textMuted),
    });
    this.footer.add(ft);
    this.renderer.requestRender();
  }

  private renderContent(): void {
    for (const child of this.contentAreaBox.getChildren().slice()) {
      this.contentAreaBox.remove(child.id);
      child.destroy();
    }
    for (const child of this.contentArea.getChildren().slice()) {
      this.contentArea.remove(child.id);
      child.destroy();
    }
    this.contentAreaBox.visible = false;
    this.contentArea.visible = false;
    this.contentLines = [];

    if (this.app.showBanner && this.app.messages.length === 0) {
      this.renderBanner();
    } else {
      this.renderMessages();
    }
    this.renderer.requestRender();
  }

  private addContentLineTo(target: BoxRenderable, text: string, color: string): void {
    const line = new TextRenderable(this.renderer, {
      content: text || " ",
      height: 1,
      fg: rgba(color),
    });
    target.add(line);
    this.contentLines.push(line);
  }

  private renderBanner(): void {
    const t = this.theme();
    this.contentAreaBox.visible = true;
    this.addContentLineTo(this.contentAreaBox, " ", t.textMuted);
    for (let i = 0; i < LOGO_LINES.length; i++) {
      const colorKey = LOGO_COLORS[i] ?? "primary";
      this.addContentLineTo(this.contentAreaBox, LOGO_LINES[i] || " ", t[colorKey]);
    }
    this.addContentLineTo(this.contentAreaBox, " ", t.textMuted);
    this.addContentLineTo(this.contentAreaBox, "Your Terminator.", t.info);
    this.addContentLineTo(this.contentAreaBox, `v${this.app.version}`, t.textMuted);
    this.addContentLineTo(this.contentAreaBox, " ", t.textMuted);
    this.addContentLineTo(this.contentAreaBox, `● Browser: ${this.app.headless ? "headless" : "headed + vision"}`, t.text);
    this.addContentLineTo(this.contentAreaBox, `◎ Path: ${process.cwd().slice(-50)}`, t.text);
    this.addContentLineTo(this.contentAreaBox, " ", t.textMuted);
    this.addContentLineTo(this.contentAreaBox, "Type a task or /help to begin.", t.textMuted);
    this.addContentLineTo(this.contentAreaBox, " ", t.textMuted);
    this.renderer.requestRender();
  }

  private renderMessages(): void {
    const t = this.theme();
    const W = this.renderer.width;
    const maxW = W - 4;
    this.contentArea.visible = true;

    for (const msg of this.app.messages) {
      switch (msg.type) {
        case "user":
          this.addContentLineTo(this.contentArea, `❯ ${truncateStr(msg.text ?? "", maxW)}`, t.secondary);
          break;
        case "system":
          this.addContentLineTo(this.contentArea, `  ${truncateStr(msg.text ?? "", maxW)}`, t.textMuted);
          break;
        case "error":
          this.addContentLineTo(this.contentArea, `✗ ${truncateStr(msg.text ?? "", maxW)}`, t.error);
          break;
        case "agent":
          if (msg.state === "streaming") {
            this.renderAgentStreaming(this.contentArea, msg, t, maxW);
          } else if (msg.state === "completed") {
            this.renderAgentCompleted(this.contentArea, msg, t, maxW);
          }
          break;
      }
    }

    if (this.app.agent.running) {
      const lastMsg = this.app.messages[this.app.messages.length - 1];
      if (lastMsg?.type === "agent" && lastMsg.state === "streaming") {
        const elapsed = this.app.agent.startTime ? (Date.now() - this.app.agent.startTime) / 1000 : 0;
        const stepCount = lastMsg.steps?.length ?? 0;
        this.addContentLineTo(this.contentArea,
          `${this.app.spinnerChar} Working… ${formatElapsed(elapsed)} · ${stepCount} steps`,
          t.primary,
        );
      }
    }
  }

  private renderAgentStreaming(target: BoxRenderable, msg: ChatMessage, t: ThemeTokens, maxW: number): void {
    if (msg.thinkingText && msg.thinkingText.length > 0) {
      this.addContentLineTo(target, "◆ Thinking", t.warning);
      for (const line of msg.thinkingText.split("\n").slice(-5).filter((l: string) => l.trim())) {
        this.addContentLineTo(target, `  ${truncateStr(line.trim(), maxW)}`, t.textMuted);
      }
    }
    if (msg.steps?.length) {
      this.addContentLineTo(target, `▸ ${msg.steps.length} steps`, t.info);
      for (const step of msg.steps.slice(-8)) {
        this.addContentLineTo(target, `  ${truncateStr(step, maxW)}`, t.text);
      }
    }
    if (msg.result && msg.result.length > 0) {
      this.addContentLineTo(target, "▶ Response", t.info);
      for (const line of msg.result.split("\n").slice(-15)) {
        this.addContentLineTo(target, `  ${truncateStr(line, maxW)}`, t.text);
      }
    }
  }

  private renderAgentCompleted(target: BoxRenderable, msg: ChatMessage, t: ThemeTokens, maxW: number): void {
    const icon = msg.success ? "✓" : "✗";
    const iconColor = msg.success ? t.success : t.error;
    const elapsed = msg.elapsedSecs ?? 0;
    this.addContentLineTo(target, `${icon} Done · ${formatElapsed(elapsed)}`, iconColor);

    if (msg.tabExpanded !== false) {
      if (msg.result) {
        for (const line of msg.result.split("\n").slice(0, 30)) {
          this.addContentLineTo(target, `  ${truncateStr(line, maxW)}`, t.text);
        }
      }
      if (msg.steps?.length) {
        for (const step of msg.steps.slice(-5)) {
          this.addContentLineTo(target, `  ${truncateStr(step, maxW)}`, t.text);
        }
      }
      if (msg.thinkingText) {
        for (const line of msg.thinkingText.split("\n").slice(0, 20).filter((l: string) => l.trim())) {
          this.addContentLineTo(target, `  ${truncateStr(line.trim(), maxW)}`, t.textMuted);
        }
      }
    }

    if (msg.skillCreated) {
      this.addContentLineTo(target, `  ✦ Skill created: ${msg.skillCreated}`, t.info);
    }
    if (msg.scheduledJob) {
      this.addContentLineTo(target, `  ⏰ Scheduled: ${msg.scheduledJob}`, t.secondary);
    }
  }

  private modeColor(): string {
    const t = this.theme();
    const mode = this.app.agent.mode;
    if (mode === "Manager") return t.primary;
    if (mode === "Browser") return t.success;
    if (mode === "Coder") return t.warning;
    if (mode === "Terminator") return t.error;
    return t.primary;
  }

  private showToast(text: string): void {
    this.app.showToast(text);
    const t = this.theme();
    this.toastText.content = ` ${text} `;
    this.toastText.fg = rgba(t.secondary);
    this.toastOverlay.visible = true;
    this.renderer.requestRender();

    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.toastOverlay.visible = false;
      this.renderer.requestRender();
    }, 2500);
  }

  private async handleSubmit(): Promise<void> {
    const text = this.textarea.editBuffer.getText().trim();
    if (!text) return;
    this.textarea.editBuffer.setText("");

    if (text.startsWith("/")) {
      await this.handleSlashCommand(text);
      return;
    }
    if (text.startsWith("!")) {
      this.handleShellCommand(text);
      return;
    }
    await this.submitTask(text);
  }

  private async submitTask(text: string): Promise<void> {
    if (this.app.agent.running) { this.showToast("Agent is already running"); return; }

    this.app.inputHistory.push(text);
    this.app.addUserMessage(text, ++this.app.agent.taskCount);
    this.app.agent.running = true;
    this.app.agent.startTime = Date.now();
    this.app.agent.retryAttempt = null;
    this.app.agent.retryCountdown = null;
    this.app.agent.validationConfidence = null;
    this.app.agent.validationIssues = null;
    this.app.agent.reflectionStatus = false;
    this.app.startAgentMessage(text);
    this.app.showBanner = false;
    this.renderTitleBar();
    this.renderMetaBar();
    this.renderContent();

    const modeName = this.app.currentModeName();
    try {
      for await (const event of runAgentStream(this.deps, text, { mode: modeName })) {
        switch (event.type) {
          case "thinking": this.app.appendStreamingToken(event.token, "thinking"); break;
          case "streaming": this.app.appendStreamingToken(event.token, event.phase); break;
          case "step": this.app.appendStep(event.action); break;
          case "progress":
            this.app.updateProgress({
              kind: event.kind, currentAttempt: event.data?.attempt,
              maxAttempts: event.data?.max, countdownSeconds: event.data?.countdown,
              confidence: event.data?.confidence, issuesCount: event.data?.issues,
            });
            break;
          case "result": this.app.completeAgent(event.success, event.result ?? "", event.elapsedSecs); break;
          case "error": this.app.addErrorMessage(event.message); this.app.agent.running = false; this.app.agent.streamingPhase = ""; break;
        }
        this.renderContent();
        this.renderTitleBar();
        this.renderMetaBar();
      }
    } catch (err) {
      this.app.addErrorMessage(err instanceof Error ? err.message : String(err));
      this.app.agent.running = false;
      this.app.agent.streamingPhase = "";
    }
    this.renderTitleBar();
    this.renderMetaBar();
    this.renderContent();
  }

  private handleShellCommand(text: string): void {
    const cmd = text.slice(1).trim();
    if (!cmd) return;
    try {
      const result = require("child_process").execSync(cmd, { timeout: 30000, encoding: "utf-8" }).trim();
      this.app.addSystemMessage(`$ ${cmd}\n${result || "(no output)"}`);
    } catch (err: any) {
      this.app.addErrorMessage(`$ ${cmd}\n${err.stderr || err.message}`);
    }
    this.renderContent();
  }

  private async handleSlashCommand(text: string): Promise<void> {
    const parts = text.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    switch (cmd) {
      case "/help": case "/h": this.openModal("help"); break;
      case "/quit": case "/exit": case "/q": this.app.save(); this.destroy(); break;
      case "/clear": case "/cls": this.app.messages = []; this.app.showBanner = true; this.renderContent(); break;
      case "/reset":
        this.app.messages = []; this.app.showBanner = true; this.app.agent.running = false;
        this.app.agent.streamingPhase = ""; this.app.agent.taskCount = 0;
        this.renderContent(); this.renderTitleBar(); this.renderMetaBar(); break;
      case "/compress":
        if (this.app.messages.length > 10) {
          this.app.messages = this.app.messages.slice(-10);
          this.app.addSystemMessage("Compressed to last 10 messages");
        }
        this.renderContent(); break;
      case "/status": {
        const lines = ["## System Status", `  Uptime: ${formatElapsed(process.uptime())}`, `  Browser: ${this.app.headless ? "headless" : "headed"}`, `  Tasks: ${this.app.agent.taskCount}`, `  Provider: ${this.app.provider}/${this.app.model ?? "auto"}`, `  Mode: ${this.app.agent.mode}`, `  Theme: ${this.app.themeName}`];
        this.app.modal.infoTitle = "Status"; this.app.modal.infoLines = lines;
        this.openModal("info"); break;
      }
      case "/models": case "/model": {
        this.openModal("modelPicker");
        await this.loadModels();
        break;
      }
      case "/provider": case "/providers": this.openModal("providerPicker"); await this.loadProviders(); break;
      case "/connect": this.openModal("connectPicker"); await this.loadIntegrations(); break;
      case "/skills": case "/skill": {
        if (args[0] === "run" && args[1]) {
          try { await this.deps.skillEngine.run?.(args[1]); this.showToast(`Skill ${args[1]} executed`); }
          catch (e: any) { this.app.addErrorMessage(`Skill error: ${e.message}`); }
          this.renderContent(); return;
        }
        this.openModal("skillBrowser"); await this.loadSkills(); break;
      }
      case "/memory": case "/mem":
        this.openModal("memoryMenu");
        this.modalItems = [{ id: "stats", label: "View Memory Stats" }, { id: "switch", label: "Switch Memory System" }, { id: "edit", label: "Edit Memory" }];
        this.renderModal(); break;
      case "/remember":
        if (!args.length) { this.showToast("Usage: /remember <text>"); return; }
        try { await this.deps.memory.add?.(args.join(" ")); this.showToast("Remembered!"); }
        catch (e: any) { this.app.addErrorMessage(`Memory error: ${e.message}`); }
        this.renderContent(); break;
      case "/sessions": this.openModal("sessionBrowser"); await this.loadSessions(); break;
      case "/schedule": case "/cron": this.openModal("scheduleBrowser"); await this.loadSchedule(); break;
      case "/themes": case "/theme":
        if (args.length > 0) {
          const found = THEMES.find(th => th.name === args[0].toLowerCase());
          if (found) { this.app.themeName = found.name; this.applyTheme(); this.showToast(`Theme: ${found.name}`); return; }
        }
        this.openModal("themePicker"); break;
      case "/coder":
        if (args.length > 0) { this.app.agent.coderBackend = args[0]; this.showToast(`Coder: ${args[0]}`); return; }
        this.openModal("coderPicker");
        this.modalItems = ["internal", "claude-code", "codex", "opencode"].map(v => ({ id: v, label: v }));
        this.renderModal(); break;
      case "/search":
        if (args.length > 0) { this.app.agent.searchMode = args[0]; this.showToast(`Search: ${args[0]}`); return; }
        this.openModal("searchModePicker");
        this.modalItems = ["auto", "simple", "advanced"].map(v => ({ id: v, label: v }));
        this.renderModal(); break;
      case "/browser":
        if (args.length > 0) { this.app.headless = args[0] === "headless"; this.showToast(`Browser: ${this.app.headless ? "headless" : "headed"}`); return; }
        this.openModal("browserModePicker");
        this.modalItems = [{ id: "headless", label: "headless" }, { id: "headed", label: "headed" }];
        this.renderModal(); break;
      case "/doctor": await this.runDoctor(); break;
      case "/soul":
        if (args.length > 0) {
          if (args[0] === "reset") { try { await this.deps.llmProvider?.resetSoul?.(); this.showToast("Soul reset"); } catch {} return; }
          try { await this.deps.llmProvider?.setSoul?.(args.join(" ")); this.showToast("Soul updated"); } catch {}
          return;
        }
        this.openModal("soulEditor");
        try { this.modalInputValue = await this.deps.llmProvider?.getSoul?.() ?? ""; } catch { this.modalInputValue = ""; }
        this.renderModal(); break;
      case "/checkpoint": case "/branches": this.openModal("checkpointBrowser"); await this.loadCheckpoints(); break;
      case "/checkpoint-create": case "/branch": {
        const name = args[0] ?? "manual";
        try { await this.deps.checkpointManager?.create?.(name, args[1] ?? process.cwd()); this.showToast(`Checkpoint "${name}" created`); }
        catch (e: any) { this.app.addErrorMessage(`Checkpoint error: ${e.message}`); }
        this.renderContent(); break;
      }
      case "/delegate":
        if (!args.length) { this.showToast("Usage: /delegate <task>"); return; }
        this.submitTask(args.join(" ")); break;
      case "/parallel": {
        const tasks = text.split("|").map(tp => tp.replace(/^\/parallel\s*/, "").trim()).filter(Boolean);
        for (const task of tasks.slice(0, 5)) this.submitTask(task);
        break;
      }
      default: this.showToast(`Unknown: ${cmd} · try /help`);
    }
  }

  private openModal(type: ModalType): void {
    this.activeModal = type;
    this.modalSelectedIndex = 0;
    this.modalInputValue = "";
    this.textarea.blur();
    this.modalOverlay.visible = true;
    this.renderModal();
    this.renderer.requestRender();
  }

  private closeModal(): void {
    this.activeModal = null;
    this.modalItems = [];
    this.modalSelectedIndex = 0;
    this.modalInputValue = "";
    this.modalOverlay.visible = false;
    this.clearModalLines();
    this.renderer.requestRender();
    setTimeout(() => this.textarea.focus(), 0);
  }

  private renderModal(): void {
    this.clearModalLines();
    const t = this.theme();
    const W = 66;
    const type = this.activeModal;
    if (!type) return;

    const titles: Record<string, string> = {
      modelPicker: "Select Model", providerPicker: "Select Provider", connectPicker: "Select Integration",
      skillBrowser: "Skills", sessionBrowser: "Sessions",
      memoryMenu: "Memory", memorySystemPicker: "Memory System",
      scheduleBrowser: "Schedule", coderPicker: "Coder Backend",
      searchModePicker: "Search Mode", browserModePicker: "Browser Mode",
      checkpointBrowser: "Checkpoints", apiKeyPrompt: "API Key", soulEditor: "Soul",
      help: "Help", info: "Info", doctor: "Diagnostics", themePicker: "Themes",
    };

    this.addModalLine(titles[type] ?? "Select", t.primary);

    switch (type) {
      case "help": this.renderHelpModal(t, W); break;
      case "info": case "doctor": this.renderInfoModal(t, W); break;
      case "apiKeyPrompt": this.renderApiKeyModal(t, W); break;
      case "soulEditor": this.renderSoulModal(t, W); break;
      case "themePicker": this.renderThemeModal(t, W); break;
      default: this.renderPickerModal(t, W); break;
    }

    this.renderer.requestRender();
  }

  private renderHelpModal(t: ThemeTokens, W: number): void {
    const cats = [
      { name: "General", cmds: [["/help", "Show help"], ["/exit", "Quit"], ["/status", "Status"], ["/clear", "Clear"], ["/reset", "Reset"]] },
      { name: "Agent", cmds: [["/models", "Select model"], ["/provider", "Provider"], ["/soul", "Personality"]] },
      { name: "Tools", cmds: [["/skills", "Skills"], ["/memory", "Memory"], ["/connect", "Integrations"]] },
      { name: "Other", cmds: [["/themes", "Themes"], ["/browser", "Browser"], ["/doctor", "Diagnostics"]] },
    ];
    for (const cat of cats) {
      this.addModalLine(`  ${cat.name}`, t.info);
      for (const [cmd, desc] of cat.cmds) {
        this.addModalLine(`    ${cmd.padEnd(20)} ${desc}`, t.textMuted);
      }
    }
    this.addModalLine("Esc/q to close", t.textMuted);
  }

  private renderInfoModal(t: ThemeTokens, _W: number): void {
    for (const line of this.app.modal.infoLines.slice(0, 20)) {
      let color = t.text;
      if (line.startsWith("##") || line.startsWith("─")) color = t.secondary;
      else if (line.startsWith("✓") || line.startsWith("✔")) color = t.success;
      else if (line.startsWith("✗") || line.startsWith("✘")) color = t.error;
      else if (line.startsWith("⚠")) color = t.warning;
      this.addModalLine(truncateStr(line, 66), color);
    }
    this.addModalLine("Esc/q to close · ↑↓ scroll", t.textMuted);
  }

  private renderApiKeyModal(t: ThemeTokens, _W: number): void {
    const target = this.app.modal.pendingAction ?? "";
    this.addModalLine(`Enter API key for ${target}:`, t.text);
    this.addModalLine(`> ${this.modalInputValue ? "•".repeat(16) : "sk-..."}`, this.modalInputValue ? t.text : t.textMuted);
    this.addModalLine("Enter confirm · Esc cancel", t.textMuted);
  }

  private renderSoulModal(t: ThemeTokens, _W: number): void {
    if (this.modalInputValue) {
      for (const line of this.modalInputValue.split("\n").slice(0, 5)) {
        this.addModalLine(`  ${truncateStr(line, 60)}`, t.text);
      }
    } else {
      this.addModalLine("  Default personality active", t.textMuted);
    }
    this.addModalLine("Enter save · Esc cancel", t.textMuted);
  }

  private renderThemeModal(t: ThemeTokens, _W: number): void {
    for (let i = 0; i < THEMES.length; i++) {
      const th = THEMES[i];
      const isSel = i === this.modalSelectedIndex;
      const isCurrent = th.name === this.app.themeName;
      const prefix = isCurrent ? "◆ " : "  ";
      const color = isSel ? t.primary : isCurrent ? t.primary : t.textMuted;
      const bg = isSel ? t.backgroundElement : t.background;
      this.addModalLine(`${prefix}${th.name}  ████████`, color);
    }
    this.addModalLine("↑↓ preview · Enter save · Esc restore", t.textMuted);
  }

  private renderPickerModal(t: ThemeTokens, _W: number): void {
    const items = this.modalItems.slice(0, 12);
    for (let i = 0; i < items.length; i++) {
      const isSel = i === this.modalSelectedIndex;
      const prefix = isSel ? "▸ " : "  ";
      const color = isSel ? t.primary : t.text;
      this.addModalLine(`${prefix}${truncateStr(items[i].label, 60)}`, color);
    }
    if (items.length > 0) {
      this.addModalLine("↑↓ navigate · Enter select · Esc close", t.textMuted);
    }
  }

  private addModalLine(text: string, color: string): void {
    const line = new TextRenderable(this.renderer, {
      content: text || " ",
      height: 1,
      fg: rgba(color),
    });
    this.modalOverlay.add(line);
    this.modalLines.push(line);
  }

  private clearModalLines(): void {
    for (const line of this.modalLines) {
      this.modalOverlay.remove(line.id);
      line.destroy();
    }
    this.modalLines = [];
  }

  private handleModalKey(key: any): void {
    if (key.name === "escape") { this.closeModal(); return; }
    if (!this.activeModal) return;

    if (this.activeModal === "apiKeyPrompt" || this.activeModal === "soulEditor") {
      if (key.name === "return") {
        const val = this.modalInputValue;
        if (this.activeModal === "apiKeyPrompt" && val.trim()) {
          try { this.deps.llmProvider?.setApiKey?.(this.app.modal.pendingAction ?? "", val.trim()); this.closeModal(); } catch {}
        }
        if (this.activeModal === "soulEditor") {
          try { this.deps.llmProvider?.setSoul?.(val); this.closeModal(); } catch {}
        }
        return;
      }
      if (key.name === "backspace") {
        this.modalInputValue = this.modalInputValue.slice(0, -1);
        this.renderModal(); return;
      }
      if (key.sequence && key.sequence.length === 1 && !key.ctrl) {
        this.modalInputValue += key.sequence;
        this.renderModal(); return;
      }
      return;
    }

    if (this.activeModal === "help" || this.activeModal === "info" || this.activeModal === "doctor") {
      if (key.sequence === "q") { this.closeModal(); return; }
      return;
    }

    if (key.name === "up") {
      this.modalSelectedIndex = Math.max(0, this.modalSelectedIndex - 1);
      this.renderModal(); return;
    }
    if (key.name === "down") {
      const maxIdx = this.activeModal === "themePicker" ? THEMES.length - 1 : this.modalItems.length - 1;
      this.modalSelectedIndex = Math.min(maxIdx, this.modalSelectedIndex + 1);
      this.renderModal(); return;
    }
    if (key.name === "return") {
      this.onModalSelect(this.modalSelectedIndex);
      return;
    }
  }

  private onModalSelect(index: number): void {
    const item = this.modalItems[index];
    const type = this.activeModal;

    switch (type) {
      case "modelPicker":
        if (item) {
          if (item.category) { this.app.provider = item.category; }
          this.app.model = item.label;
          try { this.deps.llmProvider.switch?.(item.category ?? this.app.provider, item.label); } catch {}
          this.showToast(`Switched to ${item.category ?? this.app.provider}/${item.label}`);
          this.renderTitleBar(); this.renderMetaBar();
        }
        this.closeModal(); break;
      case "providerPicker":
        if (item) {
          if (!item.installed) {
            this.activeModal = "apiKeyPrompt";
            this.modalInputValue = "";
            this.app.modal.pendingAction = item.id;
            this.renderModal();
          } else {
            this.app.provider = item.id;
            this.showToast(`Provider: ${item.label}`);
            this.renderTitleBar(); this.renderMetaBar();
            this.closeModal();
          }
        }
        break;
      case "connectPicker":
        if (item) {
          if (!item.connected) {
            this.activeModal = "apiKeyPrompt";
            this.modalInputValue = "";
            this.app.modal.pendingAction = item.id;
            this.renderModal();
          } else {
            try { this.deps.llmProvider?.disconnect?.(item.id); this.showToast(`Disconnected ${item.label}`); } catch {}
            this.closeModal();
          }
        }
        break;
      case "skillBrowser":
        if (item) {
          if (item.installed) { try { this.deps.skillEngine.run?.(item.id); this.showToast(`Skill ${item.id} executed`); } catch {} }
          else { try { this.deps.hubClient.install?.(item.id); this.showToast(`Installed ${item.id}`); } catch {} }
        }
        this.closeModal(); break;
      case "memoryMenu":
        if (item?.id === "edit") {
          this.activeModal = "memoryEditor";
          this.renderModal();
        } else if (item?.id === "switch") {
          this.activeModal = "memorySystemPicker";
          this.modalItems = ["file", "sqlite", "vector"].map(s => ({ id: s, label: s }));
          this.renderModal();
        }
        break;
      case "memorySystemPicker":
        if (item) { try { this.deps.memory?.switchSystem?.(item.id); this.showToast(`Memory: ${item.id}`); } catch {} }
        this.closeModal(); break;
      case "coderPicker":
        if (item) { this.app.agent.coderBackend = item.id; this.showToast(`Coder: ${item.id}`); }
        this.closeModal(); break;
      case "searchModePicker":
        if (item) { this.app.agent.searchMode = item.id; this.showToast(`Search: ${item.id}`); }
        this.closeModal(); break;
      case "browserModePicker":
        if (item) { this.app.headless = item.id === "headless"; this.showToast(`Browser: ${this.app.headless ? "headless" : "headed"}`); }
        this.closeModal(); break;
      case "checkpointBrowser":
        if (item) {
          try { this.deps.checkpointManager.revert?.(item.id, process.cwd()); this.showToast(`Reverted to ${item.label}`); }
          catch (e: any) { this.app.addErrorMessage(`Revert failed: ${e.message}`); this.renderContent(); }
        }
        this.closeModal(); break;
      case "themePicker": {
        const th = THEMES[index];
        if (th) {
          this.app.themeName = th.name;
          this.applyTheme();
          this.showToast(`Theme: ${th.name}`);
        }
        this.closeModal(); break;
      }
      default: this.closeModal();
    }
  }

  private async loadModels(): Promise<void> {
    try {
      const providers = await this.deps.llmProvider.listProviders?.() ?? [];
      const items: SelectItem[] = [];
      for (const p of providers) {
        try {
          const models = await this.deps.llmProvider.listModels?.(p.id ?? p.name) ?? [];
          for (const mdl of models) items.push({ id: `${p.id ?? p.name}/${mdl.id ?? mdl.name}`, label: mdl.id ?? mdl.name, category: p.name ?? p.id });
        } catch { items.push({ id: `${p.id ?? p.name}`, label: "(error)", category: p.name ?? p.id }); }
      }
      this.modalItems = items.length ? items : [{ id: "openai/gpt-4", label: "gpt-4", category: "openai" }, { id: "anthropic/claude-3.5-sonnet", label: "claude-3.5-sonnet", category: "anthropic" }];
    } catch { this.modalItems = [{ id: "error", label: "Failed to load models" }]; }
    this.renderModal();
  }

  private async loadProviders(): Promise<void> {
    try {
      const providers = await this.deps.llmProvider.listProviders?.() ?? [];
      this.modalItems = providers.map((p: any) => ({ id: p.id ?? p.name, label: p.name ?? p.id, installed: !!p.hasKey }));
    } catch { this.modalItems = [{ id: "openai", label: "OpenAI", installed: false }, { id: "anthropic", label: "Anthropic", installed: false }]; }
    this.renderModal();
  }

  private async loadSkills(): Promise<void> {
    try {
      const local = await this.deps.skillEngine.list?.() ?? [];
      const hub = await this.deps.hubClient.browse?.() ?? [];
      const installedNames = new Set(local.map((s: any) => s.name));
      this.modalItems = [
        ...local.map((s: any) => ({ id: s.name, label: s.name, installed: true })),
        ...hub.filter((s: any) => !installedNames.has(s.name)).map((s: any) => ({ id: s.name, label: s.name, installed: false })),
      ];
    } catch { this.modalItems = []; }
    this.renderModal();
  }

  private async loadSchedule(): Promise<void> {
    try {
      const jobs = await this.deps.cronManager.list?.() ?? [];
      this.modalItems = jobs.map((j: any) => ({ id: j.id ?? String(j), label: j.task ?? j.name ?? String(j) }));
    } catch { this.modalItems = []; }
    this.renderModal();
  }

  private async loadSessions(): Promise<void> {
    try {
      const sessions = await this.deps.memory?.getSessionHistory?.() ?? [];
      this.modalItems = sessions.map((s: any) => ({ id: s.id ?? String(s), label: s.task ?? s.text ?? String(s) }));
    } catch { this.modalItems = []; }
    this.renderModal();
  }

  private async loadCheckpoints(): Promise<void> {
    try {
      const checkpoints = await this.deps.checkpointManager.list?.() ?? [];
      this.modalItems = checkpoints.map((c: any) => ({ id: c.id ?? String(c), label: c.name ?? c.id ?? String(c) }));
    } catch { this.modalItems = []; }
    this.renderModal();
  }

  private async loadIntegrations(): Promise<void> {
    const defaults = [{ name: "Discord" }, { name: "Telegram" }, { name: "Slack" }, { name: "WhatsApp" }, { name: "Lark" }, { name: "WeChat" }];
    try {
      const integrations = await this.deps.llmProvider?.listIntegrations?.() ?? defaults;
      this.modalItems = integrations.map((ig: any) => ({ id: ig.name?.toLowerCase() ?? String(ig), label: ig.name ?? String(ig), connected: ig.configured ?? ig.connected ?? false }));
    } catch { this.modalItems = defaults.map(d => ({ id: d.name.toLowerCase(), label: d.name, connected: false })); }
    this.renderModal();
  }

  private async runDoctor(): Promise<void> {
    const lines: string[] = ["Running diagnostics...", ""];
    const checks = [
      { cat: "Browser", name: "Playwright", check: async () => { try { await import("playwright"); return "✓ Installed"; } catch { return "✗ Not installed"; } } },
      { cat: "AI & LLM", name: "OpenAI SDK", check: async () => { try { await import("openai"); return "✓ Installed"; } catch { return "✗ Not installed"; } } },
      { cat: "Memory", name: "File Memory", check: async () => { try { const stats = await this.deps.memory?.getStats?.(); return `✓ ${stats?.total ?? 0} entries`; } catch { return "✗ Not initialized"; } } },
      { cat: "Skills", name: "Skill Engine", check: async () => { try { const skills = await this.deps.skillEngine?.list?.(); return `✓ ${skills?.length ?? 0} skills`; } catch { return "✗ Not available"; } } },
    ];
    let currentCat = "";
    for (const chk of checks) {
      if (chk.cat !== currentCat) { currentCat = chk.cat; lines.push(`## ${currentCat}`); }
      lines.push(`  ${chk.name}: ${await chk.check()}`);
    }
    lines.push("", "✓ All checks complete");
    this.app.modal.infoTitle = "Diagnostics";
    this.app.modal.infoLines = lines;
    this.openModal("doctor");
  }

  private destroy(): void {
    this.destroyed = true;
    if (this.ticker) clearInterval(this.ticker);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.renderer.destroy();
  }
}
