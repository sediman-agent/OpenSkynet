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
            if app.active_modal.is_some() && handle_modal_key(app, key, event_tx).await {
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
                        app.add_system_message("Agent is busy. Please wait.".into());
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
            } else if matches!(app.active_modal, Some(AppModal::UpdateAvailable { .. })) {
                // Ignore paste in update modal
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
            // Only append steps if agent is currently running
            // This prevents steps from previous task appearing in new task
            if app.agent_running {
                app.append_step(action);
            }
        }
        AppEvent::AgentResult(success, result_text, elapsed_secs, skill_created, scheduled_job) => {
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
            // Only append streaming tokens if agent is currently running
            // This prevents streaming text from previous task appearing in new task
            if app.agent_running {
                app.append_streaming_token(&token, &phase);
            }
        }
        AppEvent::Progress(progress_data) => {
            // Handle progress events (retry countdown, validation status, etc.)
            if app.agent_running {
                app.update_progress(&progress_data);
            }
        }
        AppEvent::UpdateSuccess => {
            app.show_toast("Update installed! Restarting...".to_string());
            app.running = false;
        }
        AppEvent::UpdateFailed(err) => {
            app.show_toast(format!("Update failed: {}", err));
            app.active_modal = None;
        }
        AppEvent::UpdateAvailable { version, release_notes, current_version } => {
            app.active_modal = Some(crate::app::AppModal::UpdateAvailable {
                version,
                release_notes,
                current_version,
                selected: 0,
                show_notes: false,
                notes_scroll: 0,
                installing: false,
                install_progress: String::new(),
            });
            app.mark_dirty();
        }
    }
}

/// Handle modal key input.
async fn handle_modal_key(app: &mut App, key: crossterm::event::KeyEvent, event_tx: &mpsc::UnboundedSender<AppEvent>) -> bool {
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
        Some(AppModal::UpdateAvailable { .. }) => handle_update_available_modal(app, key, event_tx).await,
        Some(AppModal::OnboardingWizard { .. }) => handle_onboarding(app, key).await,
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

/// Handle key input for the update available modal.
#[allow(clippy::zombie_processes)]
async fn handle_update_available_modal(app: &mut App, key: crossterm::event::KeyEvent, event_tx: &mpsc::UnboundedSender<AppEvent>) -> bool {
    use crossterm::event::KeyCode;

    let modal = app.active_modal.clone();
    if let Some(AppModal::UpdateAvailable {
        version,
        release_notes,
        current_version,
        selected,
        show_notes,
        notes_scroll,
        installing,
        ..
    }) = modal
    {
        if installing {
            // Don't allow interaction during installation
            return true;
        }

        match key.code {
            KeyCode::Esc => {
                app.active_modal = None;
                true
            }
            KeyCode::Enter => {
                match selected {
                    0 => {
                        // Update Now - start installation
                        app.active_modal = Some(AppModal::UpdateAvailable {
                            version: version.clone(),
                            release_notes: String::new(),
                            current_version: String::new(),
                            selected,
                            show_notes,
                            notes_scroll,
                            installing: true,
                            install_progress: "Downloading update...".to_string(),
                        });

                        let tx = event_tx.clone();
                        let version_clone = version.clone();

                        tokio::spawn(async move {
                            match crate::updater::install_update(&version_clone).await {
                                Ok(()) => {
                                    let _ = tx.send(AppEvent::UpdateSuccess);
                                }
                                Err(e) => {
                                    let _ = tx.send(AppEvent::UpdateFailed(e.to_string()));
                                }
                            }
                        });
                    }
                    1 => {
                        // Skip - close modal
                        app.active_modal = None;
                    }
                     2 => {
                        // View Release Notes - toggle notes display
                        app.active_modal = Some(AppModal::UpdateAvailable {
                            version,
                            release_notes: release_notes.clone(),
                            current_version: current_version.clone(),
                            selected,
                            show_notes: !show_notes,
                            notes_scroll,
                            installing,
                            install_progress: String::new(),
                        });
                    }
                    _ => {}
                }
                true
            }
            KeyCode::Left | KeyCode::Right | KeyCode::Tab => {
                // Move selection between options
                let new_selected = if key.code == KeyCode::Left || key.code == KeyCode::Tab {
                    if selected == 0 { 2 } else { selected - 1 }
                } else if selected == 2 { 0 } else { selected + 1 };
                if let Some(AppModal::UpdateAvailable { version, .. }) = &app.active_modal {
                    app.active_modal = Some(AppModal::UpdateAvailable {
                        version: version.clone(),
                        release_notes: release_notes.clone(),
                        current_version: current_version.clone(),
                        selected: new_selected,
                        show_notes,
                        notes_scroll,
                        installing,
                        install_progress: String::new(),
                    });
                }
                true
            }
            KeyCode::Up | KeyCode::Down if show_notes => {
                // Scroll release notes
                let new_scroll = if key.code == KeyCode::Up {
                    notes_scroll.saturating_sub(1)
                } else {
                    notes_scroll + 1
                };
                if let Some(AppModal::UpdateAvailable { version, .. }) = &app.active_modal {
                    app.active_modal = Some(AppModal::UpdateAvailable {
                        version: version.clone(),
                        release_notes: release_notes.clone(),
                        current_version: current_version.clone(),
                        selected,
                        show_notes,
                        notes_scroll: new_scroll,
                        installing,
                        install_progress: String::new(),
                    });
                }
                true
            }
            _ => false,
        }
    } else {
        false
    }
}

#[cfg(test)]
mod dispatcher_tests {
    use super::*;
    use crate::app::{App, ChatMessage};
    use sediman_tui_bridge::ApiClient;
    use sediman_tui_core::event::AppEvent;
    use crossterm::event::{KeyCode, KeyModifiers, KeyEvent};

    fn make_app() -> App {
        App::new("test".into(), Some("gpt-4".into()), None, true, ApiClient::new("/tmp/test.sock"))
    }

    fn make_event_tx() -> mpsc::UnboundedSender<AppEvent> {
        let (tx, _rx) = mpsc::unbounded_channel();
        tx
    }

    #[tokio::test]
    async fn test_agent_step_appends_to_running_agent() {
        let mut app = make_app();
        app.agent_running = true;
        app.start_agent_message("task");
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::AgentStep("executing".into(), "run cmd".into()), &tx).await;
        let steps = match app.messages.last().unwrap() {
            ChatMessage::Agent { steps, .. } => steps,
            _ => panic!("Expected Agent"),
        };
        assert_eq!(steps.len(), 1);
        assert!(steps[0].contains("run cmd"));
    }

    #[tokio::test]
    async fn test_agent_step_ignored_when_agent_not_running() {
        let mut app = make_app();
        app.agent_running = false;
        app.start_agent_message("task");
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::AgentStep("executing".into(), "run cmd".into()), &tx).await;
        let steps = match app.messages.last().unwrap() {
            ChatMessage::Agent { steps, .. } => steps,
            _ => panic!("Expected Agent"),
        };
        assert_eq!(steps.len(), 0);
    }

    #[tokio::test]
    async fn test_agent_result_completes_message() {
        let mut app = make_app();
        app.agent_running = true;
        app.start_agent_message("task");
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::AgentResult(true, "done".into(), 5, None, None), &tx).await;
        assert!(!app.agent_running);
        let msg = app.messages.last().unwrap();
        match msg {
            ChatMessage::Agent { result, success, .. } => {
                assert_eq!(result.as_deref(), Some("done"));
                assert!(*success);
            }
            _ => panic!("Expected Agent"),
        }
    }

    #[tokio::test]
    async fn test_agent_error_stops_agent() {
        let mut app = make_app();
        app.agent_running = true;
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::AgentError("fail".into()), &tx).await;
        assert!(!app.agent_running);
        let msg = app.messages.last().unwrap();
        match msg {
            ChatMessage::Error { text } => assert!(text.contains("fail")),
            _ => panic!("Expected Error message"),
        }
    }

    #[tokio::test]
    async fn test_agent_done_stops_agent() {
        let mut app = make_app();
        app.agent_running = true;
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::AgentDone, &tx).await;
        assert!(!app.agent_running);
    }

    #[tokio::test]
    async fn test_streaming_token_appended_to_running_agent() {
        let mut app = make_app();
        app.agent_running = true;
        app.start_agent_message("task");
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::StreamingToken("hello".into(), "responding".into()), &tx).await;
        let result = match app.messages.last().unwrap() {
            ChatMessage::Agent { result, .. } => result,
            _ => panic!("Expected Agent"),
        };
        assert!(result.as_ref().unwrap().is_empty() == false);
    }

    #[tokio::test]
    async fn test_streaming_token_ignored_when_agent_stopped() {
        let mut app = make_app();
        app.agent_running = false;
        app.start_agent_message("task");
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::StreamingToken("hello".into(), "responding".into()), &tx).await;
        let result = match app.messages.last().unwrap() {
            ChatMessage::Agent { result, .. } => result,
            _ => panic!("Expected Agent"),
        };
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_command_output_adds_system_message() {
        let mut app = make_app();
        let tx = make_event_tx();
        let before = app.messages.len();
        handle_message(&mut app, AppEvent::CommandOutput("info".into()), &tx).await;
        assert_eq!(app.messages.len(), before + 1);
    }

    #[tokio::test]
    async fn test_shutdown_sets_running_false() {
        let mut app = make_app();
        app.running = true;
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::Shutdown, &tx).await;
        assert!(!app.running);
    }

    #[tokio::test]
    async fn test_update_success_sets_running_false() {
        let mut app = make_app();
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::UpdateSuccess, &tx).await;
        assert!(!app.running);
    }

    #[tokio::test]
    async fn test_update_failed_closes_modal() {
        let mut app = make_app();
        app.active_modal = Some(crate::app::AppModal::Help { scroll: 0 });
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::UpdateFailed("error".into()), &tx).await;
        assert!(app.active_modal.is_none());
    }

    #[tokio::test]
    async fn test_update_available_opens_modal() {
        let mut app = make_app();
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::UpdateAvailable {
            version: "1.0".into(),
            release_notes: "notes".into(),
            current_version: "0.9".into(),
        }, &tx).await;
        assert!(app.active_modal.is_some());
    }

    #[tokio::test]
    async fn test_tick_advances_spinner_when_running() {
        let mut app = make_app();
        app.agent_running = true;
        let before = app.spinner_char();
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::Tick, &tx).await;
        assert_ne!(app.spinner_char(), before);
    }

    #[tokio::test]
    async fn test_resize_queues_pending() {
        let mut app = make_app();
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::Resize(100, 40), &tx).await;
        assert_eq!(app.pending_resize, Some((100, 40)));
    }

    #[tokio::test]
    async fn test_paste_into_editor() {
        let mut app = make_app();
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::Paste("pasted text".into()), &tx).await;
        let text = app.editor.lines().join(" ");
        assert!(text.contains("pasted text"));
    }

    #[tokio::test]
    async fn test_paste_multiline_shows_bracket() {
        let mut app = make_app();
        let tx = make_event_tx();
        handle_message(&mut app, AppEvent::Paste("line1\nline2\nline3".into()), &tx).await;
        let text = app.editor.lines().join(" ");
        assert!(text.contains("paste 3 lines") || text.contains("line1"), "Should handle multiline paste");
    }

    #[tokio::test]
    async fn test_enter_submits_slash_command() {
        let mut app = make_app();
        app.editor.insert_str("/help");
        let tx = make_event_tx();
        let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        handle_message(&mut app, AppEvent::Key(key), &tx).await;
        let text = app.editor.lines().join(" ");
        assert!(text.is_empty(), "Editor should be cleared after /command");
    }

    #[tokio::test]
    async fn test_enter_busy_agent_shows_wait() {
        let mut app = make_app();
        app.agent_running = true;
        app.editor.insert_str("do something");
        let tx = make_event_tx();
        let key = KeyEvent::new(KeyCode::Enter, KeyModifiers::NONE);
        let before = app.messages.len();
        handle_message(&mut app, AppEvent::Key(key), &tx).await;
        assert!(app.messages.len() > before);
        let last = app.messages.last().unwrap();
        match last {
            ChatMessage::System { text } => assert!(text.contains("Please wait")),
            _ => panic!("Expected System message"),
        }
    }
}
