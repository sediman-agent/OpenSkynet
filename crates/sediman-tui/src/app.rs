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

pub struct App {
    pub provider: String,
    pub model: Option<String>,
    pub headless: bool,
    pub bridge: ApiClient,
    pub theme: Theme,
    pub layout: LayoutManager,
    pub command_registry: CommandRegistry,
    pub editor: TextEditor,
    pub completer: Completer,
    pub permission: PermissionManager,
    pub interrupt: InterruptManager,

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
    pub show_help: bool,
    pub show_banner: bool,
    pub show_side_panel: bool,
    pub side_panel_tab: SideTab,
    pub output_text: String,

    pub messages: Vec<ChatMessage>,
    pub scroll_offset: u16,
    pub auto_scroll: bool,

    // Sidebar cached data
    pub skills_cache: Vec<String>,
    pub memory_cache: Vec<String>,
    pub schedule_cache: Vec<String>,
    #[allow(dead_code)]
    pub is_connected: bool,
}

#[derive(Clone, Debug)]
pub enum ChatMessage {
    User {
        text: String,
        task_num: usize,
    },
    Agent {
        steps: Vec<String>,
        result: Option<String>,
        success: bool,
        elapsed_secs: u64,
        skill_created: Option<String>,
        scheduled_job: Option<String>,
    },
    System {
        text: String,
    },
    Error {
        text: String,
    },
}

#[derive(Clone, Copy, PartialEq)]
pub enum SideTab {
    Skills,
    Memory,
    Schedule,
    Status,
}

impl App {
    pub fn new(provider: String, model: Option<String>, headless: bool, bridge: ApiClient) -> Self {
        let mut layout = LayoutManager::new();
        layout.show_banner = true;

        let mut registry = CommandRegistry::new();
        register_commands(&mut registry);

        let mut completer = Completer::new();
        let command_names: Vec<String> = registry.all().iter().map(|c| c.name.to_string()).collect();
        completer.set_candidates(command_names);

        Self {
            provider,
            model,
            headless,
            bridge,
            theme: Theme::default(),
            layout,
            command_registry: registry,
            editor: TextEditor::new(),
            completer,
            permission: PermissionManager::new(),
            interrupt: InterruptManager::new(),

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
            show_help: false,
            show_banner: true,
            show_side_panel: false,
            side_panel_tab: SideTab::Status,
            output_text: String::new(),

            messages: Vec::new(),
            scroll_offset: 0,
            auto_scroll: true,

            skills_cache: Vec::new(),
            memory_cache: Vec::new(),
            schedule_cache: Vec::new(),
            is_connected: true,
        }
    }

    pub fn advance_spinner(&mut self) {
        self.spinner_frame = (self.spinner_frame + 1) % SPINNER_FRAMES.len();
    }

    pub fn spinner_char(&self) -> char {
        SPINNER_FRAMES[self.spinner_frame]
    }

    pub fn add_system_message(&mut self, text: String) {
        self.messages.push(ChatMessage::System { text });
        self.auto_scroll = true;
    }

    pub fn add_user_message(&mut self, text: String, task_num: usize) {
        self.messages.push(ChatMessage::User { text, task_num });
        self.auto_scroll = true;
    }

    pub fn add_error_message(&mut self, text: String) {
        self.messages.push(ChatMessage::Error { text });
        self.auto_scroll = true;
    }

    pub fn start_agent_message(&mut self, task: &str) {
        self.step_log.clear();
        self.step_log.push(format!("Task: {}", task));
        self.messages.push(ChatMessage::Agent {
            steps: Vec::new(),
            result: None,
            success: false,
            elapsed_secs: 0,
            skill_created: None,
            scheduled_job: None,
        });
        self.auto_scroll = true;
    }

    pub fn append_step(&mut self, step: String) {
        self.step_log.push(step.clone());
        if self.step_log.len() > 200 {
            self.step_log.truncate(200);
        }
        if let Some(ChatMessage::Agent { steps, .. }) = self.messages.last_mut() {
            steps.push(step);
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
        self.auto_scroll = true;
    }

    pub fn bridge_url(&self) -> &str {
        self.bridge.socket_path_str()
    }

    pub fn context_bar_text(&self) -> String {
        let total_chars: usize = self.step_log.iter().map(|s| s.len()).sum();
        let est_tokens = total_chars / 4;
        let pct = (est_tokens as f64 / 128_000.0).min(1.0);
        let filled = (10.0 * pct).round() as usize;
        let bar: String = "▓".repeat(filled) + &"░".repeat(10 - filled);
        format!("[{}] {}K", bar, est_tokens / 1000)
    }
}

pub async fn run(
    mut app: App,
) -> Result<(), Box<dyn std::error::Error>> {
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<AppEvent>();

    let event_loop = EventLoop::new(30.0, event_tx.clone());
    let _handle = tokio::spawn(event_loop.run());

    let mut stdout = std::io::stdout();
    let (mut width, mut height) = crossterm::terminal::size()?;
    let mut front = CellBuffer::new(width, height);
    let mut back = CellBuffer::new(width, height);
    let mut ansi = AnsiWriter::new();

    AnsiWriter::clear_all(&mut stdout);
    AnsiWriter::hide_cursor(&mut stdout);

    let mut tick_counter = 0u64;

    loop {
        let (w, h) = crossterm::terminal::size()?;
        if w != width || h != height {
            width = w;
            height = h;
            front.resize(width, height);
            back.resize(width, height);
        }

        back.clear();
        crate::view::render_into(&mut back, &mut app);

        let mut changes = DiffEngine::diff(&front, &back);
        DiffEngine::optimize(&mut changes);
        ansi.write(&mut stdout, &changes)?;

        std::mem::swap(&mut front, &mut back);

        tokio::select! {
            Some(event) = event_rx.recv() => {
                handle_message(&mut app, event, &event_tx).await;
            }
            _ = tokio::time::sleep(Duration::from_millis(33)) => {
                tick_counter += 1;
                if app.agent_running && tick_counter % 3 == 0 {
                    app.advance_spinner();
                }
            }
        }

        if !app.running {
            break;
        }
    }

    AnsiWriter::show_cursor(&mut stdout);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_app() -> App {
        App::new("test".into(), Some("gpt-4".into()), true, ApiClient::new("/tmp/test.sock"))
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
        match &app.messages[0] {
            ChatMessage::Agent { steps, .. } => assert_eq!(steps.len(), 2),
            _ => panic!("Expected Agent message"),
        }
    }

    #[test]
    fn test_append_step_truncates_at_200() {
        let mut app = test_app();
        app.start_agent_message("task");
        for i in 0..210 { app.append_step(format!("step {}", i)); }
        assert_eq!(app.step_log.len(), 200);
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
    fn test_context_bar_zero_tokens() {
        let app = test_app();
        let text = app.context_bar_text();
        assert!(text.contains("0K"));
    }

    #[test]
    fn test_context_bar_with_content() {
        let mut app = test_app();
        for _ in 0..100 { app.step_log.push("a fairly long step description line".into()); }
        let text = app.context_bar_text();
        assert!(text.contains("K"));
    }
}
