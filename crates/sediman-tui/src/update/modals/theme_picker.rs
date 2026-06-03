//! ThemePicker modal key handling.

use crate::app::App;
use crossterm::event::{KeyCode, KeyModifiers};

/// Handle ThemePicker modal key input.
pub async fn handle_theme_picker(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    let count = app.theme_picker_names.len();
    match key.code {
        KeyCode::Esc | KeyCode::Char('q') => {
            app.theme = app.theme_picker_saved_theme.clone();
            app.theme_name = app.theme_picker_saved_name.clone();
            app.active_modal = None;
            true
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.theme = app.theme_picker_saved_theme.clone();
            app.theme_name = app.theme_picker_saved_name.clone();
            app.active_modal = None;
            true
        }
        KeyCode::Down | KeyCode::Char('j') => {
            if app.theme_picker_selected < count.saturating_sub(1) {
                app.theme_picker_selected += 1;
            }
            if let Some(name) = app.theme_picker_names.get(app.theme_picker_selected) {
                if let Some(theme) = sediman_tui_core::styling::load_theme(name) {
                    app.theme = theme;
                    app.theme_name = name.clone();
                }
            }
            true
        }
        KeyCode::Up | KeyCode::Char('k') => {
            if app.theme_picker_selected > 0 {
                app.theme_picker_selected -= 1;
            }
            if let Some(name) = app.theme_picker_names.get(app.theme_picker_selected) {
                if let Some(theme) = sediman_tui_core::styling::load_theme(name) {
                    app.theme = theme;
                    app.theme_name = name.clone();
                }
            }
            true
        }
        KeyCode::Enter => {
            crate::commands::theming::save_config_now(&*app);
            app.add_system_message(format!("Theme: {}", app.theme_name));
            app.active_modal = None;
            true
        }
        _ => false,
    }
}
