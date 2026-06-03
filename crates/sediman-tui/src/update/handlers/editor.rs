//! Non-modal key handling for the TUI (editor, navigation, search).

use crate::app::App;
use crossterm::event::{KeyCode, KeyModifiers};

/// Scroll up by a specified amount.
fn scroll_up(app: &mut App, amount: u16) {
    app.scroll_offset = app.scroll_offset.saturating_sub(amount);
    app.auto_scroll = false;
}

/// Scroll down by a specified amount.
fn scroll_down(app: &mut App, amount: u16) {
    app.scroll_offset = app.scroll_offset.saturating_add(amount);
    app.auto_scroll = false;
}

/// Handle non-modal keyboard input (editor, search, navigation).
pub fn handle_editor_key(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    // Esc: cancel search or clear input
    if key.code == KeyCode::Esc {
        if app.agent_running {
            app.interrupt.trigger();
            app.agent_running = false;
            app.append_step("-- Interrupted --".to_string());
        } else {
            app.editor.delete_line_by_head();
        }
        return true;
    }

    // Ctrl+C: clear input or cancel agent
    if key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL) {
        if app.agent_running {
            app.interrupt.trigger();
            app.agent_running = false;
            app.append_step("-- Cancelled --".to_string());
        } else {
            app.editor.delete_line_by_head();
        }
        return true;
    }

    // Ctrl+/ toggles help (same as OpenCode's ctrl+?)
    if key.code == KeyCode::Char('/') && key.modifiers.contains(KeyModifiers::CONTROL) {
        if matches!(app.active_modal, Some(crate::app::AppModal::Help { .. })) {
            app.active_modal = None;
        } else {
            app.active_modal = Some(crate::app::AppModal::Help { scroll: 0 });
        }
        return true;
    }

    // Ctrl+P: alias for help toggle
    if key.code == KeyCode::Char('p') && key.modifiers.contains(KeyModifiers::CONTROL) {
        if matches!(app.active_modal, Some(crate::app::AppModal::Help { .. })) {
            app.active_modal = None;
        } else {
            app.active_modal = Some(crate::app::AppModal::Help { scroll: 0 });
        }
        return true;
    }

    // Ctrl+R: reverse history search
    if key.code == KeyCode::Char('r') && key.modifiers.contains(KeyModifiers::CONTROL) {
        if app.editor.is_searching() {
            let query = app.editor.search_query().to_string();
            if !query.is_empty() {
                let query_lower = query.to_lowercase();
                let current_pos = app.editor.history_pos().unwrap_or(app.editor.history().len());
                if let Some((i, _entry)) = app.editor.history().iter().enumerate().rev()
                    .filter(|(i, _)| *i < current_pos)
                    .find(|(_, entry)| entry.to_lowercase().contains(&query_lower))
                {
                    app.editor.load_history_entry(i);
                }
            }
        } else {
            app.editor.start_history_search();
        }
        return true;
    }

    // Ctrl+L: clear input
    if key.code == KeyCode::Char('l') && key.modifiers.contains(KeyModifiers::CONTROL) {
        app.editor.delete_line_by_head();
        return true;
    }

    // Space bar when input is empty: toggle latest collapsible section
    if key.code == KeyCode::Char(' ') {
        let is_empty = app.editor.lines().iter().all(|l| l.trim().is_empty());
        if is_empty && !app.editor.is_searching() {
            if app.toggle_latest_steps() {
                app.auto_scroll = true;
            }
            return true;
        }
    }

    // Enter: submit (if not shift/ctrl modified and no completion selected)
    if key.code == KeyCode::Enter {
        let has_modifier = key.modifiers.contains(KeyModifiers::SHIFT)
            || key.modifiers.contains(KeyModifiers::CONTROL);
        if has_modifier {
            app.editor.input(key);
            return true;
        } else if let Some(cmd) = app.completer.selected_text() {
            app.editor.delete_line_by_head();
            app.editor.insert_str(cmd);
            app.completer.complete("");
            return true;
        }
        // Return false to allow submit logic to handle regular Enter
        return false;
    }

    // Tab: completion or agent mode switch
    if key.code == KeyCode::Tab {
        let prefix = app.editor.lines().join(" ").trim().to_string();
        if prefix.starts_with('/') {
            if let Some(selected) = app.completer.selected_text() {
                app.editor.delete_line_by_head();
                app.editor.insert_str(selected);
                app.completer.complete("");
            } else {
                app.completer.complete(&prefix);
                app.completer.next();
            }
        } else {
            app.agent_mode = app.agent_mode.cycle();
        }
        return true;
    }

    // Up: history up or completion up
    if key.code == KeyCode::Up {
        if key.modifiers.contains(KeyModifiers::SHIFT) {
            scroll_up(app, 3);
        } else {
            let input = app.editor.lines().join(" ").trim().to_string();
            if input.starts_with('/') && !app.completer.filtered().is_empty() {
                app.completer.up();
            } else {
                app.editor.history_up();
            }
        }
        return true;
    }

    // Down: history down or completion down
    if key.code == KeyCode::Down {
        if key.modifiers.contains(KeyModifiers::SHIFT) {
            scroll_down(app, 3);
        } else {
            let input = app.editor.lines().join(" ").trim().to_string();
            if input.starts_with('/') && !app.completer.filtered().is_empty() {
                app.completer.down();
            } else {
                app.editor.history_down();
            }
        }
        return true;
    }

    // PageUp/PageDown: scroll faster
    if key.code == KeyCode::PageUp {
        scroll_up(app, 20);
        return true;
    }
    if key.code == KeyCode::PageDown {
        scroll_down(app, 20);
        return true;
    }

    // Default: forward to editor
    if app.editor.is_searching() {
        match key.code {
            KeyCode::Char(c) => {
                if key.modifiers.contains(KeyModifiers::CONTROL) {
                    app.editor.cancel_history_search();
                } else {
                    app.editor.history_search_char(c);
                }
            }
            KeyCode::Backspace => {
                app.editor.history_search_backspace();
            }
            KeyCode::Enter | KeyCode::Esc => {
                app.editor.accept_history_search();
            }
            _ => {}
        }
        return true;
    }

    app.editor.input(key);

    // Update completions based on current input
    let current = app.editor.lines().join(" ").trim().to_string();
    if current.starts_with('/') {
        app.completer.complete(&current);
    } else {
        app.completer.complete("");
    }

    true
}
