use std::time::{Duration, Instant};

use tokio::sync::mpsc;

use sediman_tui_bridge::ApiClient;

use sediman_tui_core::{
    renderer::{CellBuffer, AnsiWriter, DiffEngine},
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

const STEP_LOG_CAP: usize = 200;
const AGENT_STEPS_CAP: usize = 500;
const FRAME_INTERVAL_MS: u64 = 33;
const HEALTH_CHECK_INTERVAL_TICKS: u64 = 90;

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
    pub step_log: Vec<String>,
    pub last_result: Option<sediman_tui_bridge::AgentResult>,
    pub show_banner: bool,
    pub show_side_panel: bool,
    pub side_panel_tab: SideTab,
    pub streaming_text: String,
    pub streaming_phase: String,

    pub agent_mode: AgentMode,
    pub coder_backend: String, // "internal", "claude-code", "codex", "opencode"
    pub search_mode: String, // "auto", "simple", "advanced"

    pub messages: Vec<ChatMessage>,
    pub scroll_offset: u16,
    pub auto_scroll: bool,

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
    pub skill_browser_visible_rows: u16,
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

#[derive(Clone, Debug)]
#[allow(dead_code)]
pub enum ChatMessage {
    User {
        text: String,
        task_num: usize,
        #[allow(dead_code)]
        timestamp: Instant,
    },
    Agent {
        steps: Vec<String>,
        result: Option<String>,
        success: bool,
        elapsed_secs: u64,
        skill_created: Option<String>,
        scheduled_job: Option<String>,
        #[allow(dead_code)]
        timestamp: Instant,
        // Collapsible section state
        steps_expanded: bool,
    },
    System {
        text: String,
        #[allow(dead_code)]
        timestamp: Instant,
    },
    Error {
        text: String,
        #[allow(dead_code)]
        timestamp: Instant,
    },
}

#[derive(Clone, Copy, PartialEq)]
pub enum SideTab {
    Skills,
    Memory,
    Schedule,
    Status,
}

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum AgentMode {
    Manager,
    Browser,
    Coder,
    Terminator,
}

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

            running: true,
            task_count: 0,
            session_start: Instant::now(),
            session_name: None,
            session_color: None,
            agent_running: false,
            agent_start: Instant::now(),
            spinner_text: String::new(),
            spinner_frame: 0,
            step_log: Vec::new(),
            last_result: None,
            show_banner: true,
            show_side_panel: false,
            side_panel_tab: SideTab::Status,
            streaming_text: String::new(),
            streaming_phase: String::new(),

            agent_mode: AgentMode::Manager,
            coder_backend: "internal".into(),
            search_mode: "auto".into(),

            messages: Vec::new(),
            scroll_offset: 0,
            auto_scroll: true,

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
            skill_browser_visible_rows: 15,
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

    pub fn add_system_message(&mut self, text: String) {
        self.messages.push(ChatMessage::System { text, timestamp: Instant::now() });
        self.auto_scroll = true;
    }

    pub fn add_user_message(&mut self, text: String, task_num: usize) {
        self.messages.push(ChatMessage::User { text, task_num, timestamp: Instant::now() });
        self.auto_scroll = true;
    }

    pub fn add_error_message(&mut self, text: String) {
        self.messages.push(ChatMessage::Error { text, timestamp: Instant::now() });
        self.auto_scroll = true;
    }

    pub fn start_agent_message(&mut self, task: &str) {
        self.step_log.clear();
        self.step_log.push(format!("Task: {}", task));
        self.streaming_text.clear();
        self.streaming_phase.clear();
        self.messages.push(ChatMessage::Agent {
            steps: Vec::new(),  // Always start with empty steps
            result: None,
            success: false,
            elapsed_secs: 0,
            skill_created: None,
            scheduled_job: None,
            timestamp: Instant::now(),
            steps_expanded: false,  // Start collapsed for cleaner view
        });
        self.auto_scroll = true;
    }

    pub fn append_step(&mut self, step: String) {
        self.step_log.push(step.clone());
        if self.step_log.len() > STEP_LOG_CAP {
            let excess = self.step_log.len() - STEP_LOG_CAP;
            self.step_log.drain(0..excess);
        }
        if let Some(ChatMessage::Agent { steps, .. }) = self.messages.last_mut() {
            steps.push(step);
            if steps.len() > AGENT_STEPS_CAP {
                let excess = steps.len() - AGENT_STEPS_CAP;
                steps.drain(0..excess);
            }
        }
        self.auto_scroll = true;
    }

    pub fn complete_agent_message(
        &mut self,
        success: bool,
        result_text: String,
        elapsed_secs: u64,
        skill_created: Option<String>,
        scheduled_job: Option<String>,
    ) {
        if let Some(ChatMessage::Agent { result, success: s, elapsed_secs: e, skill_created: sc, scheduled_job: sj, .. }) = self.messages.last_mut() {
            *result = Some(result_text);
            *s = success;
            *e = elapsed_secs;
            *sc = skill_created;
            *sj = scheduled_job;
        }
        self.agent_running = false;
        self.streaming_text.clear();
        self.streaming_phase.clear();
        self.auto_scroll = true;
    }

    pub fn append_streaming_token(&mut self, token: &str, phase: &str) {
        self.streaming_text.push_str(token);
        if !phase.is_empty() {
            self.streaming_phase = phase.to_string();
        }
        self.auto_scroll = true;
    }

    /// Toggle the collapsible steps section of the most recent Agent message
    pub fn toggle_latest_steps(&mut self) -> bool {
        for msg in self.messages.iter_mut().rev() {
            if let ChatMessage::Agent { steps, steps_expanded, .. } = msg {
                if !steps.is_empty() {
                    *steps_expanded = !(*steps_expanded);
                    return true;
                }
            }
        }
        false
    }

    /// Toggle the collapsible steps section of a specific message index
    #[allow(dead_code)]
    pub fn toggle_steps_at(&mut self, index: usize) -> bool {
        if let Some(ChatMessage::Agent { steps, steps_expanded, .. }) = self.messages.get_mut(index) {
            if !steps.is_empty() {
                *steps_expanded = !(*steps_expanded);
                return true;
            }
        }
        false
    }

    pub fn bridge_url(&self) -> &str {
        self.bridge.socket_path_str()
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

        tokio::select! {
            Some(event) = event_rx.recv() => {
                handle_message(&mut app, event, &event_tx).await;
                while let Ok(next) = event_rx.try_recv() {
                    handle_message(&mut app, next, &event_tx).await;
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(FRAME_INTERVAL_MS)) => {
                tick_counter += 1;
                if app.agent_running && tick_counter.is_multiple_of(3) {
                    app.advance_spinner();
                }
                if tick_counter.is_multiple_of(HEALTH_CHECK_INTERVAL_TICKS) {
                    let was_connected = app.is_connected;
                    app.is_connected = app.bridge.is_connected().await;
                    if was_connected && !app.is_connected {
                        app.reconnecting = true;
                        app.add_system_message("Backend connection lost — reconnecting...".into());
                    } else if !was_connected && app.is_connected {
                        app.reconnecting = false;
                        app.add_system_message("Backend reconnected.".into());
                    }
                }
            }
        }
    }

    // Restore terminal state before saving config
    AnsiWriter::show_cursor(&mut stdout);

    // Save config on exit
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
    };
    if let Err(e) = config.save() {
        eprintln!("Warning: {}", e);
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
        app.step_log.push("old step".into());
        app.start_agent_message("new task");
        assert!(app.step_log.starts_with(&["Task: new task".to_string()]));
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
    fn test_append_step_truncates_at_200_keeps_newest() {
        let mut app = test_app();
        app.start_agent_message("task");
        for i in 0..210 { app.append_step(format!("step {}", i)); }
        assert_eq!(app.step_log.len(), 200);
        assert!(app.step_log.first().unwrap().contains("step 10"));
        assert!(app.step_log.last().unwrap().contains("step 209"));
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
        app.step_log.push("old step".into());
        app.step_log.push("another old".into());
        app.start_agent_message("test task");
        assert_eq!(app.step_log.len(), 1);
        assert!(app.step_log[0].contains("Task: test task"));
        assert!(!app.step_log.iter().any(|s| s == "old step"));
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
        let msg = ChatMessage::System { text: "info".into(), timestamp: Instant::now() };
        match msg {
            ChatMessage::System { text, .. } => assert_eq!(text, "info"),
            _ => panic!("Expected System variant"),
        }
    }

    #[test]
    fn test_chat_message_error_variant() {
        let msg = ChatMessage::Error { text: "fail".into(), timestamp: Instant::now() };
        match msg {
            ChatMessage::Error { text, .. } => assert_eq!(text, "fail"),
            _ => panic!("Expected Error variant"),
        }
    }
}
