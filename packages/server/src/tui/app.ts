/**
 * TUI App - Simplified
 *
 * Refactored from 493 lines to ~150 lines
 * Types extracted to tui/types.ts
 * Constants extracted to tui/constants.ts
 * Message management extracted to tui/message-manager.ts
 * Agent state management extracted to tui/agent-state-manager.ts
 * Modal management extracted to tui/modal-manager.ts
 */

import type { ThemeTokens } from './theme.js';
import { getTheme } from './theme.js';

// Re-export types
export * from './types-new.js';

// Extracted modules
import { MessageManager } from './message-manager-new.js';
import { AgentStateManager } from './agent-state-manager-new.js';
import { ModalManager } from './modal-manager-new.js';
import { COMMANDS, getAllCommandNames } from './constants-new.js';

/**
 * TUI Dependencies
 */
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

/**
 * TUI Application
 * Main app class coordinating all TUI state
 */
export class App {
  // Provider and model state
  provider: string = '';
  model: string | null = null;
  baseUrl: string | null = null;
  headless: boolean = true;
  version: string = '0.3.14';

  // Managers
  private messageManager: MessageManager;
  private agentStateManager: AgentStateManager;
  private modalManager: ModalManager;

  // UI State
  scroll = {
    offset: 0,
    autoScroll: true,
    paused: false,
    thinkingExpanded: true,
    stepsExpanded: false,
  };

  sidePanel = {
    open: false,
    tab: 'skills' as const,
    scroll: 0,
    skills: [] as string[],
    memory: [] as string[],
    schedule: [] as string[],
  };

  completion = {
    items: [] as string[],
    filtered: [] as string[],
    selected: 0,
    visible: false,
  };

  // Additional state
  inputHistory: string[] = [];
  historyIndex: number = -1;
  toastText: string = '';
  toastExpiry: number = 0;
  showBanner: boolean = true;

  themeName: string = 'opencode';
  config: any = {};

  private _rerender: (() => void) | null = null;

  constructor(provider: string, model: string | null, baseUrl: string | null, headless: boolean) {
    this.provider = provider;
    this.model = model;
    this.baseUrl = baseUrl;
    this.headless = headless;

    // Initialize managers
    this.messageManager = new MessageManager();
    this.agentStateManager = new AgentStateManager();
    this.modalManager = new ModalManager();

    // Initialize command completion
    this.completion.items = getAllCommandNames().slice().sort();
  }

  setRerender(fn: () => void): void {
    this._rerender = fn;
  }

  rerender(): void {
    this._rerener?.();
  }

  get theme(): ThemeTokens {
    return getTheme(this.themeName);
  }

  get spinnerChar(): string {
    return this.agentStateManager.getSpinnerChar();
  }

  get messages() {
    return this.messageManager.getMessages();
  }

  get agent() {
    return this.agentStateManager.getState();
  }

  get modal() {
    return this.modalManager.getState();
  }

  // ============================================================================
  // Message Delegates
  // ============================================================================

  addSystemMessage(text: string): void {
    this.messageManager.addSystemMessage(text);
    this.scroll.autoScroll = true;
  }

  addUserMessage(text: string, taskNum: number): void {
    this.messageManager.addUserMessage(text, taskNum);
    this.scroll.autoScroll = true;
  }

  addErrorMessage(text: string): void {
    this.messageManager.addErrorMessage(text);
    this.scroll.autoScroll = true;
  }

  startAgentMessage(task: string): void {
    this.agentStateManager.start();
    this.scroll.paused = false;
    this.scroll.thinkingExpanded = true;
    this.scroll.stepsExpanded = false;
    this.messageManager.startAgentMessage(task);
    this.scroll.autoScroll = true;
  }

  appendStep(action: string): void {
    this.agentStateManager.advanceSpinner();
    this.messageManager.appendStep(action);
    this.scroll.autoScroll = true;
  }

  appendStreamingToken(token: string, phase: string): void {
    this.agentStateManager.setStreamingPhase(phase);
    this.agentStateManager.advanceSpinner();
    this.messageManager.appendStreamingToken(token, phase);
    this.scroll.autoScroll = true;
  }

  completeAgent(success: boolean, resultText: string, elapsedSecs: number, skillCreated?: string, scheduledJob?: string): void {
    this.agentStateManager.stop();
    this.agentStateManager.incrementTaskCount();
    this.messageManager.completeAgent(success, resultText, elapsedSecs, { skillCreated, scheduledJob });
    this.scroll.autoScroll = true;
    this.save();
  }

  updateProgress(data: { kind?: string; currentAttempt?: number; maxAttempts?: number; countdownSeconds?: number; confidence?: number; issuesCount?: number }): void {
    this.agentStateManager.updateProgress(data);
    this.scroll.autoScroll = true;
  }

  toggleSteps(): void {
    this.scroll.stepsExpanded = !this.scroll.stepsExpanded;
  }

  switchTab(direction: 1 | -1): void {
    this.messageManager.switchTab(direction);
  }

  toggleTabExpansion(): void {
    this.messageManager.toggleTabExpansion();
  }

  // ============================================================================
  // Agent State Delegates
  // ============================================================================

  cycleAgentMode(): void {
    this.agentStateManager.cycleMode();
  }

  currentModeLabel(): string {
    return this.agentStateManager.getModeLabel();
  }

  currentModeName(): string {
    return this.agentStateManager.getModeName();
  }

  advanceSpinner(): void {
    this.agentStateManager.advanceSpinner();
  }

  // ============================================================================
  // Modal Delegates
  // ============================================================================

  openModal(type: any): void {
    this.modalManager.openModal(type);
  }

  closeModal(): void {
    this.modalManager.closeModal(this.themeName);
  }

  // ============================================================================
  // UI Actions
  // ============================================================================

  showToast(text: string): void {
    this.toastText = text;
    this.toastExpiry = Date.now() + 4000;
  }

  cycleTheme(): void {
    const { THEMES: themes } = require('./theme.js');
    const names = (themes as Array<{ name: string }>).map((t: { name: string }) => t.name);
    const idx = names.indexOf(this.themeName);
    this.themeName = names[(idx + 1) % names.length];
  }

  updateCompletion(input: string): void {
    if (!input.startsWith('/')) {
      this.completion.visible = false;
      return;
    }
    const prefix = input.toLowerCase();
    this.completion.filtered = this.completion.items.filter(c => c.startsWith(prefix));
    this.completion.selected = 0;
    this.completion.visible = this.completion.filtered.length > 0 && !this.completion.filtered.includes(prefix);
  }

  acceptCompletion(): string {
    if (!this.completion.visible || this.completion.filtered.length === 0) return '';
    return this.completion.filtered[this.completion.selected] + ' ';
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  save(): void {
    const { saveSession } = require('./session.js');
    saveSession(this.messages);
  }

  load(): void {
    const { loadSession } = require('./session.js');
    const msgs = loadSession();
    if (msgs && msgs.length > 0) {
      this.messageManager.setMessages(msgs);
      this.showBanner = false;
      this.scroll.offset = 0;
      this.scroll.autoScroll = true;
    }
  }
}

// Re-export constants
export { COMMANDS, DEFAULT_MODES, SPINNER_FRAMES } from './constants-new.js';

// Re-export managers
export { MessageManager, AgentStateManager, ModalManager };
