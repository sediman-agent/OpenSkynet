/**
 * TUI Types
 * Shared types for the Terminal UI
 */

export type AgentMode = 'Browser' | 'Terminator';

export interface AgentModeEntry {
  mode: string;
  label: string;
  runner: string;
  description: string;
  capabilities: string[];
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
  | 'help'
  | 'modelPicker'
  | 'providerPicker'
  | 'connectPicker'
  | 'apiKeyPrompt'
  | 'skillBrowser'
  | 'memoryMenu'
  | 'memoryEditor'
  | 'scheduleBrowser'
  | 'sessionBrowser'
  | 'themePicker'
  | 'modePicker'
  | 'doctor'
  | 'info'
  | 'soulEditor'
  | 'checkpointBrowser';

export interface ChatMessage {
  type: 'user' | 'agent' | 'system' | 'error';
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
  selectedTab?: 'thinking' | 'steps' | 'response';
  tabExpanded?: boolean;
  state?: 'streaming' | 'completed';
  thinkingExpanded?: boolean;
  stepsExpanded?: boolean;
  retryAttempt?: number | null;
  retryMax?: number | null;
  retryCountdown?: number | null;
  validationConfidence?: number | null;
  validationIssues?: number | null;
  reflectionStatus?: boolean;
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
  tab: 'skills' | 'memory' | 'schedule' | 'status';
  scroll: number;
  skills: string[];
  memory: string[];
  schedule: string[];
}

export interface AgentState {
  running: boolean;
  startTime: number;
  mode: AgentMode;
  modes: AgentModeEntry[];
  currentModeIndex: number;
  spinnerFrame: number;
  streamingPhase: string;
  taskCount: number;
  retryAttempt: number | null;
  retryMax: number | null;
  retryCountdown: number | null;
  validationConfidence: number | null;
  validationIssues: number | null;
  reflectionStatus: boolean;
}

export interface ModalState {
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
  doctorInstallState: 'idle' | 'confirming' | 'running' | null;
  doctorInstallCmd: string;
  doctorInstallOutput: string;
  themePreviewIndex: number;
}
