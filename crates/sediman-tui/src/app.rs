use serde::{Serialize, Deserialize};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::mpsc;
use tracing::warn;

use sediman_tui_bridge::ApiClient;

use sediman_tui_core::{
    renderer::{CellBuffer, AnsiWriter, DiffEngine, Line},
    event::{AppEvent, EventLoop},
    input::{TextEditor, Completer},
    command::CommandRegistry,
    layout::LayoutManager,
    styling::Theme,
};

use crate::commands::register_commands;
use crate::permission::PermissionManager;
use crate::interrupt::InterruptManager;
use crate::update::handle_message;

const SPINNER_FRAMES: &[char] = &['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const AGENT_STEPS_CAP: usize = 500;
const FRAME_INTERVAL_MS: u64 = 33;
const HEALTH_CHECK_INTERVAL_TICKS: u64 = 90;
const STREAMING_MAX_BYTES: usize = 100_000;

/// Modal overlay types — only one can be active at a time.
#[derive(Clone, Debug)]
pub enum AppModal {
    Help {
        scroll: u16,
    },
    ModelPicker,
    ProviderPicker,
    ConnectPicker,
    ApiKeyPrompt,
    #[allow(dead_code)]
    MemoryEditor,
    MemoryMenu {
        selected: usize,
    },
    MemorySystemPicker {
        systems: Vec<String>,
        selected: usize,
    },
    SoulEditor,
    SkillBrowser,
    ScheduleBrowser,
    SessionBrowser,
    ThemePicker,
    CoderPicker,
    SearchModePicker,
    BrowserModePicker,
    Doctor {
        checks: Vec<DoctorCheck>,
        cursor: usize,
        scroll: u16,
        installing: bool,
        install_output: Vec<String>,
    },
    Info {
        title: String,
        lines: Vec<ModalLine>,
        scroll: u16,
    },
    UpdateAvailable {
        version: String,
        release_notes: String,
        current_version: String,
        selected: usize,
        show_notes: bool,
        notes_scroll: u16,
        installing: bool,
        install_progress: String,
    },
    OnboardingWizard {
        step: u8,
    },
}

#[derive(Clone, Debug, PartialEq)]
pub enum DoctorStatus {
    Pass,
    Fail,
    Warn,
}

#[derive(Clone, Debug)]
pub struct DoctorCheck {
    pub category: String,
    #[allow(dead_code)]
    pub name: String,
    pub status: DoctorStatus,
    pub message: String,
    #[allow(dead_code)]
    pub optional: bool,
    pub install_cmd: Option<String>,
}

/// Tab selection for agent message display
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum AgentTab {
    Thinking,
    Steps,
    Response,
}

impl AgentTab {
    pub fn next(self) -> Self {
        match self {
            AgentTab::Thinking => AgentTab::Steps,
            AgentTab::Steps => AgentTab::Response,
            AgentTab::Response => AgentTab::Thinking,
        }
    }

    pub fn prev(self) -> Self {
        match self {
            AgentTab::Thinking => AgentTab::Response,
            AgentTab::Steps => AgentTab::Thinking,
            AgentTab::Response => AgentTab::Steps,
        }
    }

    #[allow(dead_code)]
    pub fn name(self) -> &'static str {
        match self {
            AgentTab::Thinking => "Thinking",
            AgentTab::Steps => "Steps",
            AgentTab::Response => "Response",
        }
    }
}

/// A line in an info modal, with optional styling.
#[derive(Clone, Debug)]
pub struct ModalLine {
    pub text: String,
    pub style: ModalLineStyle,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ModalLineStyle {
    Normal,
    Accent,
    Muted,
    Primary,
    Error,
    Heading,
}

impl ModalLine {
    pub fn new(text: impl Into<String>, style: ModalLineStyle) -> Self {
        Self { text: text.into(), style }
    }
    pub fn normal(text: impl Into<String>) -> Self { Self::new(text, ModalLineStyle::Normal) }
    pub fn accent(text: impl Into<String>) -> Self { Self::new(text, ModalLineStyle::Accent) }
    pub fn muted(text: impl Into<String>) -> Self { Self::new(text, ModalLineStyle::Muted) }
    pub fn primary(text: impl Into<String>) -> Self { Self::new(text, ModalLineStyle::Primary) }
    pub fn error(text: impl Into<String>) -> Self { Self::new(text, ModalLineStyle::Error) }
    pub fn heading(text: impl Into<String>) -> Self { Self::new(text, ModalLineStyle::Heading) }
    pub fn blank() -> Self { Self::new(String::new(), ModalLineStyle::Normal) }
}

#[allow(dead_code)]
pub struct App {
    pub provider: String,
    pub model: Option<String>,
    #[allow(dead_code)]
    pub base_url: Option<String>,
    pub headless: bool,
    pub bridge: ApiClient,
    pub theme: Theme,
    pub theme_name: String,
    pub layout: LayoutManager,
    pub command_registry: CommandRegistry,
    pub editor: TextEditor,
    pub completer: Completer,
    pub permission: PermissionManager,
    pub interrupt: InterruptManager,
    pub event_tx: Option<tokio::sync::mpsc::UnboundedSender<sediman_tui_core::event::AppEvent>>,
    #[allow(clippy::type_complexity)]
    pub backend_restart_fn: Option<Arc<dyn Fn() -> std::pin::Pin<Box<dyn std::future::Future<Output = bool> + Send>> + Send + Sync>>,

    pub running: bool,
    pub task_count: usize,
    #[allow(dead_code)]
    pub session_start: Instant,
    pub session_name: Option<String>,
    pub session_color: Option<String>,
    pub agent_running: bool,
    pub agent_start: Instant,
    pub spinner_text: String,
    pub spinner_frame: usize,
    pub last_result: Option<sediman_tui_bridge::AgentResult>,
    pub show_banner: bool,
    pub show_side_panel: bool,
    pub side_panel_tab: SideTab,
    pub streaming_phase: String,
    pub scroll_paused: bool,
    pub thinking_expanded: bool,
    pub steps_expanded: bool,

    // Progress tracking for retry countdown, validation, etc.
    pub retry_attempt: Option<u32>,
    pub retry_max: Option<u32>,
    pub retry_countdown: Option<f32>,
    pub validation_confidence: Option<f32>,
    pub validation_issues: Option<usize>,
    pub reflection_status: bool,

    pub agent_mode: AgentMode,
    pub agent_modes: Vec<AgentModeEntry>,
    pub current_mode_index: usize,
    pub coder_backend: String, // "internal", "claude-code", "codex", "opencode"
    pub search_mode: String, // "auto", "simple", "advanced"

    pub messages: Vec<ChatMessage>,
    pub scroll_offset: u16,
    pub auto_scroll: bool,
    pub render_version: u64,
    pub last_render_width: u16,
    pub last_render_height: u16,
    pub last_render_scroll: u16,

    pub skills_cache: Vec<String>,
    pub memory_cache: Vec<String>,
    pub schedule_cache: Vec<String>,
    pub is_connected: bool,
    pub reconnecting: bool,
    pub pending_resize: Option<(u16, u16)>,

    // Modal system — only one active at a time
    pub active_modal: Option<AppModal>,
    // Unified model dialog state (OpenCode-style: ←/→ provider, ↑/↓ model)
    pub model_dialog_provider_idx: usize,
    pub model_dialog_model_idx: usize,
    pub model_dialog_scroll: usize,
    pub model_dialog_filter: String,
    pub provider_picker_idx: usize,
    pub provider_picker_scroll: usize,
    pub available_providers: Vec<sediman_tui_bridge::ProviderInfo>,
    pub onboarding_provider: String,
    pub connect_target: Option<String>,
    pub connect_pending_model: Option<String>,
    pub api_key_input: String,
    pub connect_is_integration: bool,
    pub connect_integration_list: Vec<sediman_tui_bridge::IntegrationInfo>,
    pub connect_picker_idx: usize,
    pub connect_picker_scroll: usize,
    pub model_list: Vec<sediman_tui_bridge::ModelInfo>,
    // Memory editor state
    pub memory_entries: Vec<(String, String)>, // (target, content)
    pub memory_editor_input: String,
    pub memory_editor_index: usize,
    // Soul editor state
    pub soul_editor_input: String,
    // Skill browser state
    pub skill_browser_skills: Vec<sediman_tui_bridge::HubSkill>,
    pub skill_browser_selected: usize,
    pub skill_browser_filter: String,
    pub skill_browser_installed: Vec<String>,
    pub skill_browser_scroll: u16,
    pub skill_browser_filter_active: bool,
    // Schedule browser state
    pub schedule_jobs: Vec<sediman_tui_bridge::CronJob>,
    pub schedule_selected: usize,
    pub schedule_scroll: u16,
    pub schedule_input: String,
    // Theme picker state
    pub theme_picker_selected: usize,
    pub theme_picker_names: Vec<String>,
    pub theme_picker_saved_theme: Theme,
    pub theme_picker_saved_name: String,
    // Coder picker state
    pub coder_picker_selected: usize,
    // Search mode picker state
    pub search_mode_picker_selected: usize,
    // Browser mode picker state
    pub browser_mode_picker_selected: usize,
    // Session browser state
    pub session_list: Vec<sediman_tui_bridge::SessionInfo>,
    pub session_selected: usize,
    pub session_scroll: u16,
    pub session_filter: String,
    pub toast_text: String,
    pub toast_expiry: Option<Instant>,
    pub side_panel_scroll: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[allow(dead_code)]
pub enum ChatMessage {
    User {
        text: String,
        task_num: usize,
    },
        Agent {
        state: MessageState,
        steps: Vec<String>,
        thinking_text: String,
        result: Option<String>,
        success: bool,
        elapsed_secs: u64,
        skill_created: Option<String>,
        scheduled_job: Option<String>,
        selected_tab: AgentTab,
        tab_expanded: bool,
        #[serde(skip)]
        cached_response_md: Option<Vec<Line>>,
    },
    System {
        text: String,
    },
    Error {
        text: String,
    },
}

#[derive(Clone, Copy, PartialEq, Debug, Serialize, Deserialize)]
pub enum MessageState {
    Streaming,
    Completed,
}

#[derive(Clone, Copy, PartialEq)]
pub enum SideTab {
    Skills,
    Memory,
    Schedule,
    Status,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AgentModeEntry {
    pub mode: String,
    pub label: String,
    pub runner: String,
    pub description: String,
    pub capabilities: Vec<String>,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum AgentMode {
    Manager,
    Browser,
    Coder,
    Terminator,
}

#[allow(dead_code)]
impl AgentMode {
    pub fn cycle(self) -> Self {
        match self {
            AgentMode::Manager => AgentMode::Browser,
            AgentMode::Browser => AgentMode::Coder,
            AgentMode::Coder => AgentMode::Terminator,
            AgentMode::Terminator => AgentMode::Manager,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            AgentMode::Manager => "Mgr",
            AgentMode::Browser => "Brow",
            AgentMode::Coder => "Code",
            AgentMode::Terminator => "Term",
        }
    }
}

pub fn default_agent_modes() -> Vec<AgentModeEntry> {
    vec![
        AgentModeEntry {
            mode: "manager".into(),
            label: "Mgr".into(),
            runner: "default".into(),
            description: "General-purpose agent".into(),
            capabilities: vec![],
        },
        AgentModeEntry {
            mode: "browser".into(),
            label: "Brow".into(),
            runner: "browser".into(),
            description: "Web browsing agent".into(),
            capabilities: vec!["browser".into()],
        },
        AgentModeEntry {
            mode: "coder".into(),
            label: "Code".into(),
            runner: "coding".into(),
            description: "Coding agent".into(),
            capabilities: vec!["fileops".into(), "terminal".into()],
        },
        AgentModeEntry {
            mode: "terminator".into(),
            label: "Term".into(),
            runner: "orchestrator".into(),
            description: "Autonomous multi-task agent".into(),
            capabilities: vec!["fileops".into(), "terminal".into(), "browser".into()],
        },
    ]
}

impl App {
    pub fn new(provider: String, model: Option<String>, base_url: Option<String>, headless: bool, bridge: ApiClient) -> Self {
        let mut layout = LayoutManager::new();
        layout.show_banner = true;

        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);

        let mut completer = Completer::new();
        let mut command_names: Vec<String> = registry.all().iter().map(|c| c.name.to_string()).collect();
        for cmd in registry.all() {
            for alias in cmd.aliases {
                command_names.push(alias.to_string());
            }
        }
        command_names.sort();
        command_names.dedup();
        completer.set_candidates(command_names);

        Self {
            provider,
            model,
            base_url,
            headless,
            bridge,
            theme: Theme::default(),
            theme_name: "default".into(),
            layout,
            command_registry: registry,
            editor: TextEditor::new(),
            completer,
            permission: PermissionManager::new(),
            interrupt: InterruptManager::new(),
            event_tx: None,
            backend_restart_fn: None,

            running: true,
            task_count: 0,
            session_start: Instant::now(),
            session_name: None,
            session_color: None,
            agent_running: false,
            agent_start: Instant::now(),
            spinner_text: String::new(),
            spinner_frame: 0,
            last_result: None,
            show_banner: true,
            show_side_panel: false,
            side_panel_tab: SideTab::Status,
            streaming_phase: String::new(),
            scroll_paused: false,
            thinking_expanded: true,
            steps_expanded: false,

            agent_mode: AgentMode::Manager,
            agent_modes: default_agent_modes(),
            current_mode_index: 0,
            coder_backend: "internal".into(),
            search_mode: "auto".into(),

            messages: Vec::new(),
            scroll_offset: 0,
            auto_scroll: true,
            render_version: 0,
            last_render_width: 0,
            last_render_height: 0,
            last_render_scroll: 0,

            skills_cache: Vec::new(),
            memory_cache: Vec::new(),
            schedule_cache: Vec::new(),
            is_connected: true,
            reconnecting: false,
            pending_resize: None,

            active_modal: None,
            model_dialog_provider_idx: 0,
            model_dialog_model_idx: 0,
            model_dialog_scroll: 0,
            model_dialog_filter: String::new(),
            provider_picker_idx: 0,
            provider_picker_scroll: 0,
            available_providers: Vec::new(),
            onboarding_provider: String::new(),
            connect_target: None,
            connect_pending_model: None,
            api_key_input: String::new(),
            connect_is_integration: false,
            connect_integration_list: Vec::new(),
            connect_picker_idx: 0,
            connect_picker_scroll: 0,
            model_list: Vec::new(),
            memory_entries: Vec::new(),
            memory_editor_input: String::new(),
            memory_editor_index: 0,
            soul_editor_input: String::new(),
            skill_browser_skills: Vec::new(),
            skill_browser_selected: 0,
            skill_browser_filter: String::new(),
            skill_browser_installed: Vec::new(),
            skill_browser_scroll: 0,
            skill_browser_filter_active: false,
            schedule_jobs: Vec::new(),
            schedule_selected: 0,
            schedule_scroll: 0,
            schedule_input: String::new(),
            theme_picker_selected: 0,
            theme_picker_names: Vec::new(),
            theme_picker_saved_theme: Theme::default(),
            theme_picker_saved_name: String::new(),
            coder_picker_selected: 0,
            search_mode_picker_selected: 0,
            browser_mode_picker_selected: 0,
            session_list: Vec::new(),
            session_selected: 0,
            session_scroll: 0,
            session_filter: String::new(),
            toast_text: String::new(),
            toast_expiry: None,
            side_panel_scroll: 0,

            // Progress tracking fields
            retry_attempt: None,
            retry_max: None,
            retry_countdown: None,
            validation_confidence: None,
            validation_issues: None,
            reflection_status: false,
        }
    }

    pub fn advance_spinner(&mut self) {
        self.spinner_frame = (self.spinner_frame + 1) % SPINNER_FRAMES.len();
    }

    pub fn spinner_char(&self) -> char {
        SPINNER_FRAMES[self.spinner_frame]
    }

    pub fn show_toast(&mut self, text: String) {
        self.toast_text = text;
        self.toast_expiry = Some(Instant::now() + Duration::from_secs(3));
    }

    pub fn mark_dirty(&mut self) {
        self.render_version = self.render_version.wrapping_add(1);
    }

    pub fn cycle_agent_mode(&mut self) {
        if self.agent_modes.is_empty() {
            return;
        }
        self.current_mode_index = (self.current_mode_index + 1) % self.agent_modes.len();
        self.sync_agent_mode();
    }

    pub fn sync_agent_mode(&mut self) {
        if let Some(entry) = self.agent_modes.get(self.current_mode_index) {
            self.agent_mode = match entry.mode.as_str() {
                "browser" => AgentMode::Browser,
                "coder" => AgentMode::Coder,
                "terminator" => AgentMode::Terminator,
                _ => AgentMode::Manager,
            };
        }
    }

    pub fn current_mode_label(&self) -> &str {
        self.agent_modes
            .get(self.current_mode_index)
            .map(|e| e.label.as_str())
            .unwrap_or("Mgr")
    }

    pub fn current_mode_name(&self) -> &str {
        self.agent_modes
            .get(self.current_mode_index)
            .map(|e| e.mode.as_str())
            .unwrap_or("manager")
    }

    #[allow(dead_code)]
    pub fn set_agent_modes(&mut self, modes: Vec<AgentModeEntry>) {
        let old_mode = self.current_mode_name().to_string();
        self.agent_modes = if modes.is_empty() {
            default_agent_modes()
        } else {
            modes
        };
        let new_idx = self.agent_modes.iter().position(|e| e.mode == old_mode).unwrap_or(0);
        self.current_mode_index = new_idx;
        self.sync_agent_mode();
    }

    pub fn invalidate_markdown_cache(&mut self) {
        for msg in &mut self.messages {
            if let ChatMessage::Agent { cached_response_md, .. } = msg {
                *cached_response_md = None;
            }
        }
    }

    pub fn add_system_message(&mut self, text: String) {
        self.messages.push(ChatMessage::System { text });
        self.auto_scroll = true;
        self.mark_dirty();
    }

    pub fn add_user_message(&mut self, text: String, task_num: usize) {
        self.messages.push(ChatMessage::User { text, task_num });
        self.auto_scroll = true;
        self.mark_dirty();
    }

    pub fn add_error_message(&mut self, text: String) {
        self.messages.push(ChatMessage::Error { text });
        self.auto_scroll = true;
        self.mark_dirty();
    }

    pub fn start_agent_message(&mut self, _task: &str) {
        self.streaming_phase.clear();
        self.scroll_paused = false;
        self.thinking_expanded = true;
        self.steps_expanded = false;

        // Collapse all previous Agent messages so old step data
        // doesn't appear in the scroll view for the new task.
        for msg in self.messages.iter_mut() {
            if let ChatMessage::Agent { tab_expanded, .. } = msg {
                *tab_expanded = false;
            }
        }

        self.messages.push(ChatMessage::Agent {
            state: MessageState::Streaming,
            steps: Vec::new(),
            thinking_text: String::new(),
            result: None,
            success: false,
            elapsed_secs: 0,
            skill_created: None,
            scheduled_job: None,
            selected_tab: AgentTab::Steps,
            tab_expanded: false,
            cached_response_md: None,
        });
        self.auto_scroll = true;
        self.mark_dirty();
    }

    pub fn append_step(&mut self, step: String) {
        if let Some(ChatMessage::Agent { steps, selected_tab, tab_expanded, .. }) = self.messages.last_mut() {
            let is_first_step = steps.is_empty();
            steps.push(step);
            if steps.len() > AGENT_STEPS_CAP {
                let excess = steps.len() - AGENT_STEPS_CAP;
                steps.drain(0..excess);
            }
            if is_first_step {
                *selected_tab = AgentTab::Steps;
                *tab_expanded = true;
            }
        }
        self.auto_scroll = true;
        self.mark_dirty();
    }

    pub fn complete_agent_message(
        &mut self,
        success: bool,
        result_text: String,
        elapsed_secs: u64,
        skill_created: Option<String>,
        scheduled_job: Option<String>,
    ) {
        let md_lines = if !result_text.is_empty() {
            Some(sediman_tui_core::markdown::render_markdown_with_theme(&result_text, &self.theme))
        } else {
            None
        };
        if let Some(ChatMessage::Agent { result, success: s, elapsed_secs: e, skill_created: sc, scheduled_job: sj, selected_tab, tab_expanded, cached_response_md, state, .. }) = self.messages.last_mut() {
            *result = Some(result_text);
            *s = success;
            *e = elapsed_secs;
            *sc = skill_created;
            *sj = scheduled_job;
            *selected_tab = AgentTab::Response;
            *tab_expanded = true;
            *cached_response_md = md_lines;
            *state = MessageState::Completed;
        }
        self.agent_running = false;
        self.streaming_phase.clear();
        self.auto_scroll = true;
        self.mark_dirty();
        self.save_session();
    }

    fn strip_think_tags(text: &str) -> String {
        if !text.contains('<') {
            return text.to_string();
        }
        text.replace("<think>", "")
            .replace("</think>", "")
            .replace("</think", "")
            .replace("<think", "")
    }

    fn truncate_streaming(s: &mut String, token: &str) {
        let mut effective_token = token;
        if token.len() > STREAMING_MAX_BYTES {
            effective_token = &token[..token.len().min(STREAMING_MAX_BYTES)];
        }
        if s.len() + effective_token.len() > STREAMING_MAX_BYTES {
            let keep = STREAMING_MAX_BYTES.saturating_sub(effective_token.len());
            if keep > 0 {
                let drain_len = s.len().saturating_sub(keep);
                s.drain(0..drain_len);
            } else {
                s.clear();
            }
        }
        s.push_str(effective_token);
    }

    pub fn append_streaming_token(&mut self, token: &str, phase: &str) {
        if !phase.is_empty() {
            self.streaming_phase = phase.to_string();
        }

        let phase_lower = phase.to_lowercase();
        let is_thinking = phase_lower == "thinking" || phase_lower == "planning";

        let cleaned = Self::strip_think_tags(token);

        if let Some(ChatMessage::Agent { thinking_text, result, .. }) = self.messages.last_mut() {
            if is_thinking {
                Self::truncate_streaming(thinking_text, &cleaned);
            } else {
                let buf = result.get_or_insert_with(String::new);
                Self::truncate_streaming(buf, &cleaned);
            }
        }

        self.auto_scroll = true;
        self.mark_dirty();
    }

    /// Update progress data (retry countdown, validation status, etc.)
    pub fn update_progress(&mut self, progress: &sediman_tui_core::event::ProgressData) {
        match progress.progress_type.as_str() {
            "retry" => {
                self.retry_attempt = progress.current_attempt;
                self.retry_max = progress.max_attempts;
                self.retry_countdown = progress.countdown_seconds;
                self.streaming_phase = "retrying".to_string();
            }
            "validation" => {
                self.validation_confidence = progress.confidence;
                self.validation_issues = progress.issues_count;
                // Clear retry status when validation starts
                self.retry_attempt = None;
                self.retry_max = None;
                self.retry_countdown = None;
            }
            "reflection" => {
                self.reflection_status = true;
                self.streaming_phase = "reflecting".to_string();
            }
            _ => {}
        }

        self.auto_scroll = true;
        self.mark_dirty();
    }

    /// Switch thinking section expanded
    pub fn toggle_thinking_expanded(&mut self) {
        self.thinking_expanded = !self.thinking_expanded;
        self.mark_dirty();
    }

    /// Toggle steps section expanded state
    pub fn toggle_steps_expanded(&mut self) {
        self.steps_expanded = !self.steps_expanded;
        self.mark_dirty();
    }

    /// Switch to the next tab in the most recent Agent message
    pub fn switch_next_tab(&mut self) -> bool {
        for msg in self.messages.iter_mut().rev() {
            if let ChatMessage::Agent { selected_tab, .. } = msg {
                *selected_tab = selected_tab.next();
                self.mark_dirty();
                return true;
            }
        }
        false
    }

    /// Switch to the previous tab in the most recent Agent message
    pub fn switch_prev_tab(&mut self) -> bool {
        for msg in self.messages.iter_mut().rev() {
            if let ChatMessage::Agent { selected_tab, .. } = msg {
                *selected_tab = selected_tab.prev();
                self.mark_dirty();
                return true;
            }
        }
        false
    }

    /// Toggle expansion of the current tab in the most recent Agent message
    pub fn toggle_tab_expansion(&mut self) -> bool {
        for msg in self.messages.iter_mut().rev() {
            if let ChatMessage::Agent { tab_expanded, .. } = msg {
                *tab_expanded = !(*tab_expanded);
                self.mark_dirty();
                return true;
            }
        }
        false
    }

    /// Toggle the collapsible thinking section of the most recent Agent message
    #[allow(dead_code)]
    pub fn toggle_latest_thinking(&mut self) -> bool {
        for msg in self.messages.iter_mut().rev() {
            if let ChatMessage::Agent { thinking_text, selected_tab, tab_expanded, .. } = msg {
                if !thinking_text.is_empty() {
                    *selected_tab = AgentTab::Thinking;
                    *tab_expanded = !(*tab_expanded);
                    self.mark_dirty();
                    return true;
                }
            }
        }
        false
    }

    /// Toggle the collapsible steps section of the most recent Agent message
    #[allow(dead_code)]
    pub fn toggle_latest_steps(&mut self) -> bool {
        for msg in self.messages.iter_mut().rev() {
            if let ChatMessage::Agent { steps, selected_tab, tab_expanded, .. } = msg {
                if !steps.is_empty() {
                    *selected_tab = AgentTab::Steps;
                    *tab_expanded = !(*tab_expanded);
                    self.mark_dirty();
                    return true;
                }
            }
        }
        false
    }

    /// Toggle the collapsible steps section of a specific message index
    #[allow(dead_code)]
    pub fn toggle_steps_at(&mut self, index: usize) -> bool {
        if let Some(ChatMessage::Agent { steps, selected_tab, tab_expanded, .. }) = self.messages.get_mut(index) {
            if !steps.is_empty() {
                *selected_tab = AgentTab::Steps;
                *tab_expanded = !(*tab_expanded);
                self.mark_dirty();
                return true;
            }
        }
        false
    }

    pub fn bridge_url(&self) -> &str {
        self.bridge.socket_path_str()
    }

    pub fn save_session(&self) {
        let session_path = crate::config::session_path();
        if let Some(parent) = session_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&self.messages) {
            let _ = std::fs::write(&session_path, json);
        }
    }

    pub fn load_session(&mut self) -> bool {
        let session_path = crate::config::session_path();
        if session_path.exists() {
            match std::fs::read_to_string(&session_path) {
                Ok(contents) => match serde_json::from_str::<Vec<ChatMessage>>(&contents) {
                    Ok(messages) => {
                        self.messages = messages;
                        self.show_banner = false;
                        self.scroll_offset = 0;
                        self.auto_scroll = true;
                        self.mark_dirty();
                        return true;
                    }
                    Err(e) => {
                        warn!("Session file corrupted: {}", e);
                        self.show_toast("Session file corrupted — starting fresh".to_string());
                    }
                },
                Err(e) => {
                    warn!("Cannot read session file: {}", e);
                    self.show_toast("Cannot read session file — starting fresh".to_string());
                }
            }
        }
        false
    }

    pub fn display_model_id(&self) -> String {
        format!("{}/{}", self.provider, self.model.as_deref().unwrap_or("default"))
    }

    /// Get models for the active provider tab, sorted reverse alphabetical (OpenCode: latest first).
    #[allow(dead_code)]
    pub fn filtered_models_for_provider(&self, provider_name: &str) -> Vec<&sediman_tui_bridge::ModelInfo> {
        let mut models: Vec<&sediman_tui_bridge::ModelInfo> = self.model_list
            .iter()
            .filter(|m| m.provider == provider_name)
            .collect();
        models.sort_by(|a, b| b.name.cmp(&a.name));
        models
    }

    /// Initialize the model dialog state for the current provider/model.
    pub fn open_model_dialog(&mut self) {
        self.model_dialog_filter.clear();
        let models = self.filtered_models_flat();
        self.model_dialog_model_idx = models
            .iter()
            .position(|m| {
                let full = format!("{}/{}", m.provider, m.id);
                full == self.display_model_id() || m.id == self.model.as_deref().unwrap_or("")
            })
            .unwrap_or(0);
        self.model_dialog_scroll = if self.model_dialog_model_idx > 6 {
            self.model_dialog_model_idx - 3
        } else {
            0
        };
        self.active_modal = Some(AppModal::ModelPicker);
    }

    pub fn filtered_models_flat(&self) -> Vec<&sediman_tui_bridge::ModelInfo> {
        let query = self.model_dialog_filter.to_lowercase();
        let mut models: Vec<&sediman_tui_bridge::ModelInfo> = self
            .model_list
            .iter()
            .filter(|m| {
                if query.is_empty() {
                    return true;
                }
                let searchable = format!("{} {} {}", m.provider, m.id, m.name).to_lowercase();
                searchable.contains(&query)
            })
            .collect();
        models.sort_by(|a, b| {
            // Prioritize providers with saved API keys
            let a_has_key = self.available_providers
                .iter()
                .find(|p| p.name == a.provider)
                .map(|p| p.has_key)
                .unwrap_or(false);
            let b_has_key = self.available_providers
                .iter()
                .find(|p| p.name == b.provider)
                .map(|p| p.has_key)
                .unwrap_or(false);

            // Providers with saved API keys come first
            match (b_has_key, a_has_key) {
                (true, false) => return std::cmp::Ordering::Less,
                (false, true) => return std::cmp::Ordering::Greater,
                _ => {}
            }

            // Otherwise, sort by category, provider, and model name (original logic)
            let cat_a = self.available_providers.iter().find(|p| p.name == a.provider).map(|p| p.category.as_str()).unwrap_or("");
            let cat_b = self.available_providers.iter().find(|p| p.name == b.provider).map(|p| p.category.as_str()).unwrap_or("");
            cat_a.cmp(cat_b).then_with(|| a.provider.cmp(&b.provider)).then_with(|| b.name.cmp(&a.name))
        });
        models
    }

    const MODEL_DIALOG_VISIBLE: usize = 12;

    pub fn clamp_model_scroll(&mut self) {
        let models = self.filtered_models_flat();
        let idx = self.model_dialog_model_idx;
        let mut display_pos = 0usize;
        let mut last_provider: Option<&str> = None;
        let mut target_pos = 0usize;
        for (i, m) in models.iter().enumerate() {
            if last_provider != Some(m.provider.as_str()) {
                last_provider = Some(m.provider.as_str());
                display_pos += 1;
            }
            if i == idx {
                target_pos = display_pos;
                break;
            }
            display_pos += 1;
        }
        if target_pos < self.model_dialog_scroll {
            self.model_dialog_scroll = target_pos;
        } else if target_pos >= self.model_dialog_scroll + Self::MODEL_DIALOG_VISIBLE {
            self.model_dialog_scroll = target_pos - (Self::MODEL_DIALOG_VISIBLE - 1);
        }
    }

    /// Open the memory system picker modal.
    pub fn open_memory_system_picker(&mut self) {
        self.active_modal = Some(AppModal::MemorySystemPicker {
            systems: vec!["file (default)".to_string(), "hy (system 2)".to_string()],
            selected: 0,
        });
    }

    /// Open the memory menu with multiple options.
    pub fn open_memory_menu(&mut self) {
        self.active_modal = Some(AppModal::MemoryMenu {
            selected: 0,
        });
    }

    /// Show memory statistics in an info modal.
    pub fn show_memory_stats(&mut self, stats: serde_json::Value) {
        let title = "Memory System Status".to_string();
        let mut lines = vec![
            ModalLine::normal(""),
        ];

        // Parse and display stats
        if let Some(system) = stats.get("system").and_then(|s| s.as_str()) {
            lines.push(ModalLine::accent(format!("  System: {}", system)));
        }

        if let Some(stats_obj) = stats.get("stats").and_then(|s| s.as_object()) {
            if let Some(total) = stats_obj.get("total_records").and_then(|v| v.as_i64()) {
                lines.push(ModalLine::normal(format!("  Total Records: {}", total)));
            }

            if let Some(by_layer) = stats_obj.get("by_layer").and_then(|v| v.as_object()) {
                lines.push(ModalLine::normal(""));
                lines.push(ModalLine::heading("  By Layer:"));
                for (layer, count) in by_layer {
                    if let Some(count) = count.as_i64() {
                        lines.push(ModalLine::muted(format!("    {}: {}", layer, count)));
                    }
                }
            }
        }

        lines.push(ModalLine::normal(""));
        lines.push(ModalLine::muted("  Press ESC to close"));

        self.active_modal = Some(AppModal::Info {
            title,
            lines,
            scroll: 0,
        });
    }
}

pub async fn run(
    mut app: App,
) -> Result<(), Box<dyn std::error::Error>> {
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<AppEvent>();
    app.event_tx = Some(event_tx.clone());

    let event_loop = EventLoop::new(30.0, event_tx.clone());
    let _handle = tokio::spawn(event_loop.run());

    // Set up Ctrl+C handler for graceful shutdown
    let shutdown_tx = event_tx.clone();
    let interrupt_flag = app.interrupt.flag().clone();
    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.ok();
        // Send shutdown event and set interrupt flag
        let _ = shutdown_tx.send(AppEvent::Shutdown);
        interrupt_flag.store(true, std::sync::atomic::Ordering::SeqCst);
    });

    let mut stdout = std::io::stdout();
    let (mut width, mut height) = crossterm::terminal::size()?;
    let mut front = CellBuffer::new(width, height);
    let mut back = CellBuffer::new(width, height);
    let mut ansi = AnsiWriter::new();

    AnsiWriter::clear_all(&mut stdout);
    AnsiWriter::hide_cursor(&mut stdout);

    let mut tick_counter = 0u64;
    let mut pending_resize: Option<(u16, u16)> = None;

    loop {
        // Check if we should exit (from Ctrl+C or other reasons)
        if !app.running {
            break;
        }

        if let Some((w, h)) = pending_resize.take() {
            width = w;
            height = h;
            front.resize(width, height);
            back.resize(width, height);
        }
        let (w, h) = crossterm::terminal::size().unwrap_or((width, height));
        if w != width || h != height {
            width = w;
            height = h;
            front.resize(width, height);
            back.resize(width, height);
        }

        back.clear();
        crate::view::render_into(&mut back, &mut app);

        let mut changes = DiffEngine::diff_and_clear(&mut front, &mut back);
        DiffEngine::optimize(&mut changes);
        ansi.write(&mut stdout, &changes)?;

        std::mem::swap(&mut front, &mut back);

        let mut events_processed = 0u32;
        const MAX_EVENTS_PER_FRAME: u32 = 50;

        tokio::select! {
            Some(event) = event_rx.recv() => {
                handle_message(&mut app, event, &event_tx).await;
                events_processed += 1;
                while events_processed < MAX_EVENTS_PER_FRAME {
                    match event_rx.try_recv() {
                        Ok(next) => {
                            handle_message(&mut app, next, &event_tx).await;
                            events_processed += 1;
                        }
                        Err(_) => break,
                    }
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(FRAME_INTERVAL_MS)) => {
                tick_counter += 1;

                if let Some(expiry) = app.toast_expiry {
                    if Instant::now() >= expiry {
                        app.toast_text.clear();
                        app.toast_expiry = None;
                    }
                }

                if app.agent_running && tick_counter.is_multiple_of(3) {
                    app.advance_spinner();
                }
                if tick_counter.is_multiple_of(HEALTH_CHECK_INTERVAL_TICKS) {
                    let was_connected = app.is_connected;
                    app.is_connected = app.bridge.is_connected().await;
                    if was_connected && !app.is_connected {
                        app.reconnecting = true;
                        app.add_system_message("Backend connection lost — restarting...".into());
                        if let Some(ref restart_fn) = app.backend_restart_fn {
                            let restart = restart_fn.clone();
                            let tx = event_tx.clone();
                            tokio::spawn(async move {
                                if restart().await {
                                    let _ = tx.send(AppEvent::CommandOutput("Backend restarted.".into()));
                                } else {
                                    let _ = tx.send(AppEvent::CommandOutput("Backend restart failed.".into()));
                                }
                            });
                        }
                    } else if !was_connected && app.is_connected {
                        let was_reconnecting = app.reconnecting;
                        app.reconnecting = false;
                        // Populate providers on first successful backend connection
                        if app.available_providers.is_empty() {
                            if let Ok(providers) = app.bridge.list_providers().await {
                                app.available_providers = providers;
                                app.mark_dirty();
                            }
                        }
                        if was_reconnecting {
                            app.add_system_message("Backend reconnected.".into());
                        } else {
                            app.add_system_message("Backend connected.".into());
                        }
                    }
                }
            }
        }
    }

    // Restore terminal state before saving config
    AnsiWriter::show_cursor(&mut stdout);

    // Save config on exit
    let existing = crate::config::TuiConfig::load();
    let config = crate::config::TuiConfig {
        theme: app.theme_name.clone(),
        permission_mode: app.permission.current_label().to_string(),
        side_panel_open: app.show_side_panel,
        side_panel_tab: match app.side_panel_tab {
            SideTab::Skills => "Skills".into(),
            SideTab::Memory => "Memory".into(),
            SideTab::Schedule => "Schedule".into(),
            SideTab::Status => "Status".into(),
        },
        headless: app.headless,
        coder_backend: app.coder_backend.clone(),
        search_mode: app.search_mode.clone(),
        update_frequency: crate::config::default_update_frequency(),
        last_update_check: None,
        provider: app.provider.clone(),
        model: app.model.clone(),
        base_url: app.base_url.clone(),
        onboarding_complete: existing.onboarding_complete,
    };
    if let Err(e) = config.save() {
        warn!("{}", e);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_app() -> App {
        App::new("test".into(), Some("gpt-4".into()), None, true, ApiClient::new("/tmp/test.sock"))
    }

    #[test]
    fn test_new_app_defaults() {
        let app = test_app();
        assert_eq!(app.provider, "test");
        assert_eq!(app.model.as_deref(), Some("gpt-4"));
        assert!(app.headless);
        assert!(app.running);
        assert_eq!(app.task_count, 0);
        assert!(app.messages.is_empty());
    }

    #[test]
    fn test_spinner_cycles() {
        let mut app = test_app();
        assert_eq!(app.spinner_char(), '\u{280B}');
        for _ in 0..5 { app.advance_spinner(); }
        assert_ne!(app.spinner_char(), '\u{280B}');
    }

    #[test]
    fn test_spinner_wraps_around() {
        let mut app = test_app();
        let first = app.spinner_char();
        for _ in 0..SPINNER_FRAMES.len() { app.advance_spinner(); }
        assert_eq!(app.spinner_char(), first);
    }

    #[test]
    fn test_add_system_message() {
        let mut app = test_app();
        app.add_system_message("hello".into());
        assert_eq!(app.messages.len(), 1);
        assert!(app.auto_scroll);
    }

    #[test]
    fn test_add_user_message() {
        let mut app = test_app();
        app.add_user_message("do thing".into(), 3);
        assert_eq!(app.messages.len(), 1);
    }

    #[test]
    fn test_add_error_message() {
        let mut app = test_app();
        app.add_error_message("boom".into());
        assert_eq!(app.messages.len(), 1);
    }

    #[test]
    fn test_start_agent_message_clears_step_log() {
        let mut app = test_app();
        app.start_agent_message("old task");
        app.append_step("old step".into());
        app.start_agent_message("new task");
        let steps = match app.messages.last().unwrap() {
            ChatMessage::Agent { steps, .. } => steps,
            _ => panic!("Expected Agent"),
        };
        assert!(steps.is_empty());
    }

    #[test]
    fn test_append_step() {
        let mut app = test_app();
        app.start_agent_message("task");
        app.append_step("planning read code".into());
        app.append_step("executing write file".into());
        let msg = &app.messages[0];
        assert!(matches!(msg, ChatMessage::Agent { .. }), "Expected Agent message, got {:?}", msg);
        if let ChatMessage::Agent { steps, .. } = msg {
            assert_eq!(steps.len(), 2);
        }
    }

    #[test]
    fn test_append_step_truncates_at_cap_keeps_newest() {
        let mut app = test_app();
        app.start_agent_message("task");
        for i in 0..600 { app.append_step(format!("step {}", i)); }
        let steps = match app.messages.last().unwrap() {
            ChatMessage::Agent { steps, .. } => steps,
            _ => panic!("Expected Agent"),
        };
        assert_eq!(steps.len(), AGENT_STEPS_CAP as usize);
        assert!(steps.first().unwrap().contains("step 100"));
        assert!(steps.last().unwrap().contains("step 599"));
    }

    #[test]
    fn test_complete_agent_message() {
        let mut app = test_app();
        app.agent_running = true;
        app.start_agent_message("task");
        app.append_step("planning foo".into());
        app.complete_agent_message(true, "all done".into(), 42, None, None);
        assert!(!app.agent_running);
    }

    #[test]
    fn test_bridge_url_returns_socket_path() {
        let app = test_app();
        assert_eq!(app.bridge_url(), "/tmp/test.sock");
    }

    #[test]
    fn test_modal_line_constructors() {
        let line = ModalLine::accent("test");
        assert_eq!(line.text, "test");
        assert_eq!(line.style, ModalLineStyle::Accent);

        let line = ModalLine::muted("m");
        assert_eq!(line.style, ModalLineStyle::Muted);

        let line = ModalLine::primary("p");
        assert_eq!(line.style, ModalLineStyle::Primary);

        let line = ModalLine::error("e");
        assert_eq!(line.style, ModalLineStyle::Error);

        let line = ModalLine::heading("h");
        assert_eq!(line.style, ModalLineStyle::Heading);

        let line = ModalLine::blank();
        assert!(line.text.is_empty());
        assert_eq!(line.style, ModalLineStyle::Normal);
    }

    #[test]
    fn test_modal_line_new_custom() {
        let line = ModalLine::new("custom", ModalLineStyle::Primary);
        assert_eq!(line.text, "custom");
        assert_eq!(line.style, ModalLineStyle::Primary);
    }

    #[test]
    fn test_complete_agent_message_no_messages() {
        let mut app = test_app();
        app.complete_agent_message(true, "result".into(), 5, None, None);
        assert!(app.messages.is_empty());
    }

    #[test]
    fn test_complete_agent_message_non_agent_last() {
        let mut app = test_app();
        app.add_user_message("hello".into(), 1);
        app.complete_agent_message(true, "result".into(), 5, None, None);
        assert_eq!(app.messages.len(), 1);
    }

    #[test]
    fn test_start_agent_clears_old_steps() {
        let mut app = test_app();
        app.start_agent_message("old task");
        app.append_step("old step".into());
        app.append_step("another old".into());
        app.start_agent_message("test task");
        let steps = match app.messages.last().unwrap() {
            ChatMessage::Agent { steps, .. } => steps,
            _ => panic!("Expected Agent"),
        };
        assert_eq!(steps.len(), 0);
    }

    #[test]
    fn test_skill_browser_state_defaults() {
        let app = test_app();
        assert!(app.skill_browser_skills.is_empty());
        assert_eq!(app.skill_browser_selected, 0);
        assert!(app.skill_browser_filter.is_empty());
        assert!(app.skill_browser_installed.is_empty());
        assert_eq!(app.skill_browser_scroll, 0);
    }

    #[test]
    fn test_modal_skill_browser_variant() {
        let modal = AppModal::SkillBrowser;
        assert!(matches!(modal, AppModal::SkillBrowser));
    }

    #[test]
    fn test_chat_message_system_variant() {
        let msg = ChatMessage::System { text: "info".into() };
        match msg {
            ChatMessage::System { text, .. } => assert_eq!(text, "info"),
            _ => panic!("Expected System variant"),
        }
    }

    #[test]
    fn test_chat_message_error_variant() {
        let msg = ChatMessage::Error { text: "fail".into() };
        match msg {
            ChatMessage::Error { text, .. } => assert_eq!(text, "fail"),
            _ => panic!("Expected Error variant"),
        }
    }
}

// ============================================================================
// Additional Comprehensive Tests
// ============================================================================

#[cfg(test)]
mod comprehensive_app_tests {
    use super::*;

    #[test]
    fn test_side_tab_variants() {
        let tabs = vec![
            SideTab::Status,
            SideTab::Skills,
            SideTab::Memory,
            SideTab::Schedule,
        ];
        assert_eq!(tabs.len(), 4);
    }

    #[test]
    fn test_agent_mode_variants() {
        let modes = vec![
            AgentMode::Manager,
            AgentMode::Coder,
        ];
        assert_eq!(modes.len(), 2);
    }

    #[test]
    fn test_modal_variants_exist() {
        // Verify all modal types can be created
        let modals = vec![
            AppModal::Help { scroll: 0 },
            AppModal::ModelPicker,
            AppModal::ProviderPicker,
            AppModal::ConnectPicker,
            AppModal::ApiKeyPrompt,
            AppModal::SoulEditor,
            AppModal::SkillBrowser,
            AppModal::ScheduleBrowser,
            AppModal::SessionBrowser,
            AppModal::ThemePicker,
            AppModal::CoderPicker,
            AppModal::SearchModePicker,
            AppModal::BrowserModePicker,
        ];
        assert_eq!(modals.len(), 13);
    }

    #[test]
    fn test_doctor_status_variants() {
        let statuses = vec![
            DoctorStatus::Pass,
            DoctorStatus::Fail,
            DoctorStatus::Warn,
        ];
        assert_eq!(statuses.len(), 3);
    }

    #[test]
    fn test_doctor_check_creation() {
        let check = DoctorCheck {
            category: "test".to_string(),
            name: "check1".to_string(),
            status: DoctorStatus::Pass,
            message: "OK".to_string(),
            optional: false,
            install_cmd: None,
        };
        assert_eq!(check.category, "test");
        assert!(matches!(check.status, DoctorStatus::Pass));
    }

    #[test]
    fn test_modal_line_creation() {
        let line = ModalLine::new("test", ModalLineStyle::Normal);
        assert_eq!(line.text, "test");
        assert!(matches!(line.style, ModalLineStyle::Normal));
    }

    #[test]
    fn test_modal_line_constructors() {
        assert_eq!(ModalLine::normal("n").text, "n");
        assert_eq!(ModalLine::accent("a").text, "a");
        assert_eq!(ModalLine::muted("m").text, "m");
        assert_eq!(ModalLine::primary("p").text, "p");
        assert_eq!(ModalLine::error("e").text, "e");
        assert_eq!(ModalLine::heading("h").text, "h");
        assert_eq!(ModalLine::blank().text, "");
    }

    #[test]
    fn test_modal_line_style_variants() {
        let styles = vec![
            ModalLineStyle::Normal,
            ModalLineStyle::Accent,
            ModalLineStyle::Muted,
            ModalLineStyle::Primary,
            ModalLineStyle::Error,
            ModalLineStyle::Heading,
        ];
        assert_eq!(styles.len(), 6);
    }

    #[test]
    fn test_step_log_capacity_limit() {
        assert_eq!(AGENT_STEPS_CAP, 500);
    }

    #[test]
    fn test_spinner_frames_non_empty() {
        assert!(!SPINNER_FRAMES.is_empty());
        assert!(SPINNER_FRAMES.len() == 10);
    }

    #[test]
    fn test_frame_interval_constant() {
        assert_eq!(FRAME_INTERVAL_MS, 33);
    }

    #[test]
    fn test_health_check_interval() {
        assert_eq!(HEALTH_CHECK_INTERVAL_TICKS, 90);
    }
}

#[cfg(test)]
mod new_feature_tests {
    use super::*;

    fn make_app() -> App {
        App::new("test".into(), Some("gpt-4".into()), None, true, ApiClient::new("/tmp/test.sock"))
    }

    // ── strip_think_tags ────────────────────────────────────────

    #[test]
    fn test_strip_think_tags_clean_text() {
        assert_eq!(App::strip_think_tags("hello world"), "hello world");
    }

    #[test]
    fn test_strip_think_tags_with_tags() {
        assert_eq!(App::strip_think_tags("<think>hidden</think>visible"), "hiddenvisible");
    }

    #[test]
    fn test_strip_think_tags_no_angle_brackets() {
        let result = App::strip_think_tags("plain text without brackets");
        assert_eq!(result, "plain text without brackets");
    }

    #[test]
    fn test_strip_think_tags_only_opening() {
        assert_eq!(App::strip_think_tags("<think>partial"), "partial");
    }

    #[test]
    fn test_strip_think_tags_partial_closing() {
        assert_eq!(App::strip_think_tags("content</think"), "content");
    }

    // ── streaming caps ──────────────────────────────────────────

    #[test]
    fn test_streaming_thinking_capped() {
        let mut app = make_app();
        app.start_agent_message("task");
        for _ in 0..200 {
            app.append_streaming_token("x".repeat(600).as_str(), "thinking");
        }
        let thinking = match app.messages.last().unwrap() {
            ChatMessage::Agent { thinking_text, .. } => thinking_text,
            _ => panic!("Expected Agent"),
        };
        assert!(thinking.len() <= STREAMING_MAX_BYTES + 1000);
    }

    #[test]
    fn test_streaming_response_capped() {
        let mut app = make_app();
        app.start_agent_message("task");
        for _ in 0..200 {
            app.append_streaming_token("y".repeat(600).as_str(), "responding");
        }
        let result = match app.messages.last().unwrap() {
            ChatMessage::Agent { result, .. } => result,
            _ => panic!("Expected Agent"),
        };
        assert!(result.as_ref().unwrap().len() <= STREAMING_MAX_BYTES + 1000);
    }

    #[test]
    fn test_streaming_small_token_not_capped() {
        let mut app = make_app();
        app.start_agent_message("task");
        app.append_streaming_token("hello", "responding");
        let result = match app.messages.last().unwrap() {
            ChatMessage::Agent { result, .. } => result,
            _ => panic!("Expected Agent"),
        };
        assert_eq!(result.as_deref(), Some("hello"));
    }

    // ── markdown cache ──────────────────────────────────────────

    #[test]
    fn test_markdown_cache_populated_on_completion() {
        let mut app = make_app();
        app.start_agent_message("task");
        app.complete_agent_message(true, "# Hello\n\nworld".into(), 5, None, None);
        let msg = app.messages.last().unwrap();
        match msg {
            ChatMessage::Agent { cached_response_md, result, .. } => {
                assert!(result.as_ref().unwrap().contains("world"));
                assert!(cached_response_md.is_some());
                assert!(!cached_response_md.as_ref().unwrap().is_empty());
            }
            _ => panic!("Expected Agent message"),
        }
    }

    #[test]
    fn test_markdown_cache_none_for_empty_result() {
        let mut app = make_app();
        app.start_agent_message("task");
        app.complete_agent_message(true, "".into(), 5, None, None);
        let msg = app.messages.last().unwrap();
        match msg {
            ChatMessage::Agent { cached_response_md, .. } => {
                assert!(cached_response_md.is_none());
            }
            _ => panic!("Expected Agent message"),
        }
    }

    #[test]
    fn test_markdown_cache_none_on_start() {
        let mut app = make_app();
        app.start_agent_message("task");
        let msg = app.messages.last().unwrap();
        match msg {
            ChatMessage::Agent { cached_response_md, .. } => {
                assert!(cached_response_md.is_none());
            }
            _ => panic!("Expected Agent message"),
        }
    }

    // ── render_version invalidation ─────────────────────────────

    #[test]
    fn test_render_version_increments_on_message() {
        let mut app = make_app();
        let v1 = app.render_version;
        app.add_system_message("hello".into());
        assert_ne!(app.render_version, v1);
    }

    #[test]
    fn test_render_version_increments_on_step() {
        let mut app = make_app();
        app.start_agent_message("task");
        let v1 = app.render_version;
        app.append_step("step 1".into());
        assert_ne!(app.render_version, v1);
    }

    #[test]
    fn test_render_version_increments_on_streaming_token() {
        let mut app = make_app();
        app.start_agent_message("task");
        let v1 = app.render_version;
        app.append_streaming_token("token", "responding");
        assert_ne!(app.render_version, v1);
    }

    #[test]
    fn test_render_version_increments_on_completion() {
        let mut app = make_app();
        app.start_agent_message("task");
        let v1 = app.render_version;
        app.complete_agent_message(true, "done".into(), 5, None, None);
        assert_ne!(app.render_version, v1);
    }

    // ── streaming phases ────────────────────────────────────────

    #[test]
    fn test_streaming_thinking_phase_routes_correctly() {
        let mut app = make_app();
        app.start_agent_message("task");
        app.append_streaming_token("think", "thinking");
        let (thinking_text, result) = match app.messages.last().unwrap() {
            ChatMessage::Agent { thinking_text, result, .. } => (thinking_text, result),
            _ => panic!("Expected Agent"),
        };
        assert!(!thinking_text.is_empty());
        assert!(result.is_none());
    }

    #[test]
    fn test_streaming_responding_phase_routes_correctly() {
        let mut app = make_app();
        app.start_agent_message("task");
        app.append_streaming_token("respond", "responding");
        let (thinking_text, result) = match app.messages.last().unwrap() {
            ChatMessage::Agent { thinking_text, result, .. } => (thinking_text, result),
            _ => panic!("Expected Agent"),
        };
        assert!(!result.as_ref().unwrap().is_empty());
        assert!(thinking_text.is_empty());
    }

    #[test]
    fn test_streaming_executing_phase_routes_correctly() {
        let mut app = make_app();
        app.start_agent_message("task");
        app.append_streaming_token("exec", "executing");
        let (thinking_text, result) = match app.messages.last().unwrap() {
            ChatMessage::Agent { thinking_text, result, .. } => (thinking_text, result),
            _ => panic!("Expected Agent"),
        };
        assert!(!result.as_ref().unwrap().is_empty());
        assert!(thinking_text.is_empty());
    }

    #[test]
    fn test_streaming_phase_set_on_token() {
        let mut app = make_app();
        app.start_agent_message("task");
        app.append_streaming_token("x", "planning");
        assert_eq!(app.streaming_phase, "planning");
        app.append_streaming_token("y", "responding");
        assert_eq!(app.streaming_phase, "responding");
    }

    // ── section toggles ─────────────────────────────────────────

    #[test]
    fn test_toggle_thinking_expanded() {
        let mut app = make_app();
        assert!(app.thinking_expanded);
        app.toggle_thinking_expanded();
        assert!(!app.thinking_expanded);
        app.toggle_thinking_expanded();
        assert!(app.thinking_expanded);
    }

    #[test]
    fn test_toggle_steps_expanded() {
        let mut app = make_app();
        assert!(!app.steps_expanded);
        app.toggle_steps_expanded();
        assert!(app.steps_expanded);
        app.toggle_steps_expanded();
        assert!(!app.steps_expanded);
    }

    // ── scroll state ─────────────────────────────────────────────

    #[test]
    fn test_scroll_paused_defaults_false() {
        let app = make_app();
        assert!(!app.scroll_paused);
    }

    #[test]
    fn test_auto_scroll_set_on_new_message() {
        let mut app = make_app();
        app.auto_scroll = false;
        app.add_user_message("hi".into(), 1);
        assert!(app.auto_scroll);
    }

    #[test]
    fn test_start_agent_resets_streaming_state() {
        let mut app = make_app();
        app.start_agent_message("old task");
        app.append_streaming_token("old think", "thinking");
        app.append_streaming_token("old response", "responding");
        app.streaming_phase = "thinking".into();
        app.thinking_expanded = false;
        app.steps_expanded = true;
        app.scroll_paused = true;
        app.start_agent_message("new task");
        let (thinking_text, result) = match app.messages.last().unwrap() {
            ChatMessage::Agent { thinking_text, result, .. } => (thinking_text, result),
            _ => panic!("Expected Agent"),
        };
        assert!(thinking_text.is_empty());
        assert!(result.is_none());
        assert!(app.streaming_phase.is_empty());
        assert!(app.thinking_expanded);
        assert!(!app.steps_expanded);
        assert!(!app.scroll_paused);
    }

    // ── session persistence ─────────────────────────────────────

    #[test]
    fn test_session_roundtrip() {
        let mut app = make_app();
        app.add_user_message("hello".into(), 1);
        app.add_system_message("system".into());
        app.start_agent_message("task");
        app.append_step("step 1".into());
        app.append_step("step 2".into());
        app.complete_agent_message(true, "response".into(), 5, None, None);

        let json = serde_json::to_string(&app.messages).unwrap();
        let restored: Vec<ChatMessage> = serde_json::from_str(&json).unwrap();
        assert_eq!(restored.len(), 3, "Should have User, System, Agent messages");
        match &restored[0] {
            ChatMessage::User { text, task_num } => {
                assert_eq!(text, "hello");
                assert_eq!(*task_num, 1);
            }
            _ => panic!("Expected User"),
        }
        match &restored[1] {
            ChatMessage::System { text } => assert_eq!(text, "system"),
            _ => panic!("Expected System"),
        }
        match &restored[2] {
            ChatMessage::Agent { result, success, .. } => {
                assert!(result.as_ref().unwrap().contains("response"));
                assert!(*success);
            }
            _ => panic!("Expected Agent"),
        }
    }

    #[test]
    fn test_chat_message_serialize_deserialize_user() {
        let msg = ChatMessage::User { text: "hi".into(), task_num: 42 };
        let json = serde_json::to_string(&msg).unwrap();
        let restored: ChatMessage = serde_json::from_str(&json).unwrap();
        match restored {
            ChatMessage::User { text, task_num } => {
                assert_eq!(text, "hi");
                assert_eq!(task_num, 42);
            }
            _ => panic!("Wrong variant"),
        }
    }

    #[test]
    fn test_chat_message_serialize_deserialize_agent() {
        let msg = ChatMessage::Agent {
            state: MessageState::Completed,
            steps: vec!["s1".into(), "s2".into()],
            thinking_text: "think".into(),
            result: Some("done".into()),
            success: true,
            elapsed_secs: 42,
            skill_created: Some("skill".into()),
            scheduled_job: Some("job".into()),
            selected_tab: AgentTab::Response,
            tab_expanded: true,
            cached_response_md: None,
        };
        let json = serde_json::to_string(&msg).unwrap();
        let restored: ChatMessage = serde_json::from_str(&json).unwrap();
        match restored {
            ChatMessage::Agent { steps, result, success, elapsed_secs, .. } => {
                assert_eq!(steps.len(), 2);
                assert_eq!(result.unwrap(), "done");
                assert!(success);
                assert_eq!(elapsed_secs, 42);
            }
            _ => panic!("Wrong variant"),
        }
    }

    #[test]
    fn test_toast_auto_dismiss() {
        let mut app = make_app();
        app.show_toast("test toast".to_string());

        assert!(app.toast_expiry.is_some());
        assert!(!app.toast_text.is_empty());

        // Manually expire the toast
        app.toast_expiry = Some(std::time::Instant::now() - std::time::Duration::from_secs(1));

        // Simulate what happens in the tick loop
        if let Some(expiry) = app.toast_expiry {
            if std::time::Instant::now() >= expiry {
                app.toast_text.clear();
                app.toast_expiry = None;
            }
        }

        assert!(app.toast_text.is_empty());
        assert!(app.toast_expiry.is_none());
    }

    #[test]
    fn test_load_session_handles_corruption_gracefully() {
        // Verify that serde rejects invalid JSON (the error path exists)
        let result = serde_json::from_str::<Vec<ChatMessage>>("not valid json");
        assert!(result.is_err(), "serde must reject corrupted data");

        // Verify toast mechanism works
        let mut app = make_app();
        app.show_toast("Session file corrupted — starting fresh".to_string());
        assert!(!app.toast_text.is_empty());
        assert!(app.toast_text.contains("corrupted"));
    }
}

#[cfg(test)]
#[test]
fn test_parse_python_version() {
    use crate::commands::doctor::parse_python_version;
    assert_eq!(parse_python_version("Python 3.12.4"), Some((3, 12)));
    assert_eq!(parse_python_version("Python 3.11.0"), Some((3, 11)));
    assert_eq!(parse_python_version("Python 3.13.1"), Some((3, 13)));
    assert_eq!(parse_python_version("Python 3.10.12"), Some((3, 10)));
    assert_eq!(parse_python_version("Python 3.9.5"), Some((3, 9)));
    assert_eq!(parse_python_version("Python 3.14.0a1"), Some((3, 14)));

    assert_eq!(parse_python_version(""), None);
    assert_eq!(parse_python_version("Python "), None);
    assert_eq!(parse_python_version("python 3.12.4"), None);
    assert_eq!(parse_python_version("Python "), None);
    assert_eq!(parse_python_version("garbage"), None);
}

