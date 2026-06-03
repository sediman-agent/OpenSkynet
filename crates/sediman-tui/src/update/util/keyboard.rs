//! Keyboard utilities for the TUI.

use crossterm::event::{KeyCode, KeyModifiers};

/// Parse a key combination to check if it matches a pattern.
///
/// Examples:
/// - `Ctrl+C` matches Ctrl+C
/// - `Ctrl+K` matches Ctrl+K
/// - `Shift+Enter` matches Shift+Enter
#[allow(dead_code)]
pub fn parse_key_combo(key: KeyCode, modifiers: KeyModifiers) -> String {
    let mut result = String::new();

    if modifiers.contains(KeyModifiers::CONTROL) {
        result.push_str("Ctrl+");
    }
    if modifiers.contains(KeyModifiers::ALT) {
        result.push_str("Alt+");
    }
    if modifiers.contains(KeyModifiers::SHIFT) {
        result.push_str("Shift+");
    }
    if modifiers.contains(KeyModifiers::SUPER) {
        result.push_str("Cmd+");
    }

    match key {
        KeyCode::Char(c) => {
            result.push(c);
        }
        KeyCode::Esc => result.push_str("Esc"),
        KeyCode::Enter => result.push_str("Enter"),
        KeyCode::Tab => result.push_str("Tab"),
        KeyCode::Backspace => result.push_str("Backspace"),
        KeyCode::Delete => result.push_str("Delete"),
        KeyCode::Home => result.push_str("Home"),
        KeyCode::End => result.push_str("End"),
        KeyCode::PageUp => result.push_str("PageUp"),
        KeyCode::PageDown => result.push_str("PageDown"),
        KeyCode::Up => result.push_str("Up"),
        KeyCode::Down => result.push_str("Down"),
        KeyCode::Left => result.push_str("Left"),
        KeyCode::Right => result.push_str("Right"),
        _ => {
            return format!("{:?}", key);
        }
    };

    result
}
