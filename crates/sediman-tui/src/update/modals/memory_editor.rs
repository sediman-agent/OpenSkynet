//! MemoryEditor modal key handling.

use crate::app::App;
use crossterm::event::{KeyCode, KeyModifiers};

/// Handle MemoryEditor modal key input.
pub async fn handle_memory_editor(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    match key.code {
        KeyCode::Esc | KeyCode::Char('q') => {
            app.memory_editor_input.clear();
            app.active_modal = None;
            true
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.memory_editor_input.clear();
            app.active_modal = None;
            true
        }
        KeyCode::Up => {
            if app.memory_editor_index > 0 {
                app.memory_editor_index -= 1;
            }
            true
        }
        KeyCode::Down => {
            if app.memory_editor_index < app.memory_entries.len().saturating_sub(1) {
                app.memory_editor_index += 1;
            }
            true
        }
        KeyCode::Enter => {
            if !app.memory_editor_input.is_empty() {
                let text = app.memory_editor_input.clone();
                let _ = app.bridge.memory_add("memory", &text).await;
                app.memory_entries.push(("memory".to_string(), text));
                app.memory_editor_input.clear();
            }
            true
        }
        KeyCode::Char('d') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            if let Some((target, content)) = app.memory_entries.get(app.memory_editor_index).cloned() {
                let _ = app.bridge.memory_remove(&target, &content).await;
                app.memory_entries.remove(app.memory_editor_index);
                if app.memory_editor_index > 0 {
                    app.memory_editor_index -= 1;
                }
            }
            true
        }
        KeyCode::Backspace => {
            app.memory_editor_input.pop();
            true
        }
        KeyCode::Tab => {
            app.memory_editor_input.push('\t');
            true
        }
        KeyCode::Char(c) => {
            app.memory_editor_input.push(c);
            true
        }
        _ => false,
    }
}
