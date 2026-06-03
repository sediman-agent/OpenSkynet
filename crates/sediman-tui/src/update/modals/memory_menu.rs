//! Memory menu modal handler.

use crate::app::{App, AppModal};
use crossterm::event::{KeyCode, KeyModifiers};

/// Memory menu options.
const MENU_OPTIONS: &[&str] = &[
    "View Memory Stats",
    "Switch Memory System",
    "Show Current System",
];

/// Handle MemoryMenu modal key input.
pub async fn handle_memory_menu(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    if let Some(AppModal::MemoryMenu { selected }) = &mut app.active_modal {
        match key.code {
            KeyCode::Esc | KeyCode::Char('q') => {
                app.active_modal = None;
                true
            }
            KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                app.active_modal = None;
                true
            }
            KeyCode::Up | KeyCode::Char('k') => {
                if *selected > 0 {
                    *selected -= 1;
                }
                true
            }
            KeyCode::Down | KeyCode::Char('j') => {
                if *selected < MENU_OPTIONS.len() - 1 {
                    *selected += 1;
                }
                true
            }
            KeyCode::Enter => {
                match *selected {
                    0 => {
                        // View Memory Entries (fetch and display stats/entries)
                        app.active_modal = None;
                        match app.bridge.memory_get_stats().await {
                            Ok(stats) => {
                                app.show_memory_stats(stats);
                            }
                            Err(e) => {
                                app.add_error_message(format!("Failed to get memory stats: {}", e));
                            }
                        }
                    }
                    1 => {
                        // Switch Memory System
                        app.active_modal = None;
                        app.open_memory_system_picker();
                    }
                    2 => {
                        // View Memory System Status
                        app.active_modal = None;
                        match app.bridge.memory_get_system().await {
                            Ok(system) => {
                                app.add_system_message(format!("Current memory system: {}", system));
                            }
                            Err(e) => {
                                app.add_error_message(format!("Failed to get memory system: {}", e));
                            }
                        }
                    }
                    _ => {
                        app.active_modal = None;
                    }
                }
                true
            }
            _ => false,
        }
    } else {
        false
    }
}
