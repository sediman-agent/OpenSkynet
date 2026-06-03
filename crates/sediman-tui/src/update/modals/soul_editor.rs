//! SoulEditor modal key handling.

const DEFAULT_SOUL: &str = "You are OpenSkynet, a self-improving browser automation agent.

You are pragmatic, concise, and efficient. You complete browser tasks with minimal steps.

Communication style:
- Be brief but thorough
- When reporting results, lead with the answer
- If something fails, explain what went wrong and what you tried
- Proactively suggest improvements when you notice patterns";

use crate::app::App;
use crossterm::event::{KeyCode, KeyModifiers};

/// Handle SoulEditor modal key input.
pub async fn handle_soul_editor(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    match key.code {
        KeyCode::Esc | KeyCode::Char('q') => {
            app.active_modal = None;
            true
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.active_modal = None;
            true
        }
        KeyCode::Char('r') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            let _ = app.bridge.reset_soul().await;
            app.soul_editor_input = DEFAULT_SOUL.to_string();
            app.add_system_message("Personality reset to default.".into());
            true
        }
        KeyCode::Enter => {
            let text = app.soul_editor_input.trim().to_string();
            if !text.is_empty() {
                let _ = app.bridge.set_soul(&text).await;
                app.show_toast("Personality updated.".into());
            }
            app.active_modal = None;
            true
        }
        KeyCode::Backspace | KeyCode::Delete => {
            app.soul_editor_input.pop();
            true
        }
        KeyCode::Tab => {
            app.soul_editor_input.push('\t');
            true
        }
        KeyCode::Char(c) => {
            app.soul_editor_input.push(c);
            true
        }
        _ => false,
    }
}
