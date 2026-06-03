//! Clipboard operations handler.

use crate::app::App;
use crossterm::event::{KeyCode, KeyModifiers};

/// Handle clipboard paste (Ctrl+V or Cmd+V).
pub fn handle_paste(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    if key.code == KeyCode::Char('v')
        && !key.modifiers.contains(KeyModifiers::SHIFT)
        && (key.modifiers.contains(KeyModifiers::CONTROL) || key.modifiers.contains(KeyModifiers::SUPER))
    {
        if let Ok(mut clipboard) = arboard::Clipboard::new() {
            if let Ok(text) = clipboard.get_text() {
                let line_count = text.lines().count();
                if line_count > 1 {
                    app.editor.insert_str(&format!("[paste {} lines]", line_count));
                } else {
                    app.editor.insert_str(&text);
                }
            }
        }
        return true;
    }
    false
}

/// Handle clipboard copy (Ctrl+Shift+C).
pub fn handle_copy(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    if key.code == KeyCode::Char('c')
        && key.modifiers.contains(KeyModifiers::CONTROL)
        && key.modifiers.contains(KeyModifiers::SHIFT)
    {
        if let Some(result) = &app.last_result {
            if let Ok(mut clipboard) = arboard::Clipboard::new() {
                let _ = clipboard.set_text(&result.result);
            }
        }
        return true;
    }
    false
}
