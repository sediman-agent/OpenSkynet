//! BrowserModePicker modal key handling.

use crate::app::App;
use crossterm::event::{KeyCode, KeyModifiers};

const BROWSER_MODES: &[&str] = &["headless", "headed"];

/// Handle BrowserModePicker modal key input.
pub async fn handle_browser_mode_picker(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
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
            if app.browser_mode_picker_selected > 0 {
                app.browser_mode_picker_selected -= 1;
            }
            true
        }
        KeyCode::Down | KeyCode::Char('j') => {
            if app.browser_mode_picker_selected < BROWSER_MODES.len() - 1 {
                app.browser_mode_picker_selected += 1;
            }
            true
        }
        KeyCode::Enter => {
            if let Some(mode) = BROWSER_MODES.get(app.browser_mode_picker_selected) {
                let old_mode = if app.headless { "headless" } else { "headed" };
                app.headless = *mode == "headless";
                let new_mode = if app.headless { "headless" } else { "headed" };
                if old_mode != new_mode {
                    // Persist
                    let config = crate::config::TuiConfig::load();
                    let mut config = config;
                    config.headless = app.headless;
                    if let Err(e) = config.save() {
                        app.add_error_message(format!("Failed to save: {}", e));
                    }
                    app.add_system_message(format!("Browser mode: {} → {}", old_mode, new_mode));
                }
            }
            app.active_modal = None;
            true
        }
        _ => false,
    }
}
