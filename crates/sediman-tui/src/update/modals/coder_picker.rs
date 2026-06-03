//! CoderPicker modal key handling.

use crate::app::App;
use crossterm::event::{KeyCode, KeyModifiers};

const CODER_BACKENDS: &[&str] = &["internal", "claude-code", "codex", "opencode"];

/// Handle CoderPicker modal key input.
pub async fn handle_coder_picker(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    match key.code {
        KeyCode::Esc => {
            app.active_modal = None;
            true
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.active_modal = None;
            true
        }
        KeyCode::Up | KeyCode::Char('k') => {
            if app.coder_picker_selected > 0 {
                app.coder_picker_selected -= 1;
            }
            true
        }
        KeyCode::Down | KeyCode::Char('j') => {
            if app.coder_picker_selected < CODER_BACKENDS.len() - 1 {
                app.coder_picker_selected += 1;
            }
            true
        }
        KeyCode::Enter => {
            if let Some(backend) = CODER_BACKENDS.get(app.coder_picker_selected) {
                let old = app.coder_backend.clone();
                app.coder_backend = backend.to_string();
                if old != app.coder_backend {
                    // Persist
                    let config = crate::config::TuiConfig::load();
                    let mut config = config;
                    config.coder_backend = app.coder_backend.clone();
                    if let Err(e) = config.save() {
                        app.add_error_message(format!("Failed to save: {}", e));
                    }
                    app.add_system_message(format!("Coder backend: {} → {}", old, backend));
                }
            }
            app.active_modal = None;
            true
        }
        _ => false,
    }
}
