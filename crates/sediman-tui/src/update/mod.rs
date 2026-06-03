//! Update event handler for the TUI.

mod handlers;
mod modals;
mod util;

use tokio::sync::mpsc;

use sediman_tui_core::event::AppEvent;

use crate::app::{App, AppModal};

use handlers::{handle_copy, handle_editor_key, handle_paste, handle_slash};

pub use handlers::handle_task;
use modals::*;
use util::{scroll_down, scroll_up};

fn send_desktop_notification(title: &str, body: &str) {
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("osascript")
            .arg("-e")
            .arg(format!("display notification \"{}\" with title \"{}\"", body.replace('"', "\\\""), title.replace('"', "\\\"")))
            .spawn();
    }
    #[cfg(target_os = "linux")]
    {
        let _ = std::process::Command::new("notify-send")
            .arg(title)
            .arg(body)
            .spawn();
    }
}

/// Handle events from the TUI event loop.
pub async fn handle_message(app: &mut App, event: AppEvent, event_tx: &mpsc::UnboundedSender<AppEvent>) {
    match event {
        AppEvent::Key(key) => {
            use crossterm::event::{KeyCode, KeyModifiers};

            // Clipboard operations
            if handle_paste(app, key) || handle_copy(app, key) {
                return;
            }

            // Modal key handling
            if app.active_modal.is_some() && handle_modal_key(app, key).await {
                return;
            }

            // Non-modal key handling
            if handle_editor_key(app, key) {
                return;
            }

            // Submit input
            if key.code == KeyCode::Enter && !key.modifiers.contains(KeyModifiers::SHIFT)
                && !key.modifiers.contains(KeyModifiers::CONTROL)
            {
                let input = app.editor.submit();
                if !input.is_empty() {
                    if input.starts_with('/') {
                        handle_slash(app, &input).await;
                    } else if let Some(cmd) = input.strip_prefix('!') {
                        handle_shell(app, cmd).await;
                    } else if app.agent_running {
                        app.add_system_message("Agent is busy. Queued.".into());
                    } else {
                        handle_task(app, &input, event_tx).await;
                    }
                }
            }
        }
        AppEvent::Mouse(mouse) => {
            use crossterm::event::MouseEventKind;
            match mouse.kind {
                MouseEventKind::ScrollUp => scroll_up(app, 3),
                MouseEventKind::ScrollDown => scroll_down(app, 3),
                _ => {}
            }
        }
        AppEvent::Tick => {
            if app.agent_running {
                app.advance_spinner();
            }
        }
        AppEvent::Resize(w, h) => {
            app.pending_resize = Some((w, h));
        }
        AppEvent::Paste(text) => {
            if matches!(app.active_modal, Some(AppModal::ApiKeyPrompt)) {
                let single_line = text.lines().next().unwrap_or("");
                app.api_key_input.push_str(single_line);
            } else if matches!(app.active_modal, Some(AppModal::ModelPicker)) {
                let single_line = text.lines().next().unwrap_or("");
                app.model_dialog_filter.push_str(single_line);
                app.model_dialog_model_idx = 0;
                app.model_dialog_scroll = 0;
            } else {
                let line_count = text.lines().count();
                if line_count > 1 {
                    app.editor.insert_str(&format!("[paste {} lines]", line_count));
                } else {
                    app.editor.insert_str(&text);
                }
            }
        }
        AppEvent::Shutdown => {
            app.running = false;
        }
        AppEvent::AgentStep(_phase, action) => {
            app.append_step(action);
        }
        AppEvent::AgentResult(success, result_text, elapsed_secs) => {
            let skill_created = None;
            let scheduled_job = None;
            app.complete_agent_message(success, result_text, elapsed_secs, skill_created, scheduled_job);
            if elapsed_secs >= 30 {
                let status = if success { "Completed" } else { "Failed" };
                send_desktop_notification("OpenSkynet", &format!("Task {} in {}s", status, elapsed_secs));
            }
        }
        AppEvent::AgentError(err) => {
            app.agent_running = false;
            app.add_error_message(format!("Error: {}", err));
        }
        AppEvent::AgentDone => {
            app.agent_running = false;
        }
        AppEvent::CommandOutput(text) => {
            app.add_system_message(text);
        }
        AppEvent::StreamingToken(token, phase) => {
            app.append_streaming_token(&token, &phase);
        }
    }
}

/// Handle modal key input.
async fn handle_modal_key(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    match &app.active_modal {
        Some(AppModal::ModelPicker) => handle_model_picker(app, key).await,
        Some(AppModal::ProviderPicker) => handle_provider_picker(app, key).await,
        Some(AppModal::ConnectPicker) => handle_connect_picker(app, key).await,
        Some(AppModal::ApiKeyPrompt) => handle_api_key_prompt(app, key).await,
        Some(AppModal::MemoryEditor) => handle_memory_editor(app, key).await,
        Some(AppModal::MemoryMenu { .. }) => handle_memory_menu(app, key).await,
        Some(AppModal::MemorySystemPicker { .. }) => handle_memory_system_picker(app, key).await,
        Some(AppModal::SoulEditor) => handle_soul_editor(app, key).await,
        Some(AppModal::SkillBrowser) => handle_skill_browser(app, key).await,
        Some(AppModal::ScheduleBrowser) => handle_schedule_browser(app, key).await,
        Some(AppModal::SessionBrowser) => handle_session_browser(app, key).await,
        Some(AppModal::ThemePicker) => handle_theme_picker(app, key).await,
        Some(AppModal::CoderPicker) => handle_coder_picker(app, key).await,
        Some(AppModal::SearchModePicker) => handle_search_mode_picker(app, key).await,
        Some(AppModal::BrowserModePicker) => handle_browser_mode_picker(app, key).await,
        Some(AppModal::Doctor { .. }) => handle_doctor(app, key).await,
        Some(AppModal::Help { .. }) => handle_help_modal(app, key).await,
        Some(AppModal::Info { .. }) => handle_info_modal(app, key).await,
        None => false,
    }
}

async fn handle_shell(app: &mut App, cmd: &str) {
    if !app.permission.is_allowed(cmd) {
        app.add_system_message("Shell command denied by permission mode".into());
        return;
    }

    app.add_system_message(format!("$ {}", cmd));
    crate::shell::run_shell_command(app, cmd).await;
}
