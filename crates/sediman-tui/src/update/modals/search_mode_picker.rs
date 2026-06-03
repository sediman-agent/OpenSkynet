//! SearchModePicker modal key handling.

use crate::app::App;
use crossterm::event::{KeyCode, KeyModifiers};

pub const SEARCH_MODES: &[&str] = &["auto", "simple", "advanced"];

/// Handle SearchModePicker modal key input.
pub async fn handle_search_mode_picker(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
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
            if app.search_mode_picker_selected > 0 {
                app.search_mode_picker_selected -= 1;
            }
            true
        }
        KeyCode::Down | KeyCode::Char('j') => {
            if app.search_mode_picker_selected < SEARCH_MODES.len() - 1 {
                app.search_mode_picker_selected += 1;
            }
            true
        }
        KeyCode::Enter => {
            if let Some(mode) = SEARCH_MODES.get(app.search_mode_picker_selected) {
                let old = app.search_mode.clone();
                app.search_mode = mode.to_string();
                if old != app.search_mode {
                    // Persist
                    let config = crate::config::TuiConfig::load();
                    let mut config = config;
                    config.search_mode = app.search_mode.clone();
                    if let Err(e) = config.save() {
                        app.add_error_message(format!("Failed to save: {}", e));
                    }
                    app.add_system_message(format!("Search mode: {} → {}", old, mode));
                }
            }
            app.active_modal = None;
            true
        }
        _ => false,
    }
}
