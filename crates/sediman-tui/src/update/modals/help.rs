//! Help and Info modal key handling.

use crate::app::{App, AppModal};
use crossterm::event::{KeyCode, KeyModifiers};

/// Handle Help modal key input.
pub async fn handle_help_modal(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    match key.code {
        KeyCode::Char('q') | KeyCode::Esc => {
            app.active_modal = None;
            true
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.active_modal = None;
            true
        }
        KeyCode::Down | KeyCode::Char('j') => {
            if let Some(AppModal::Help { scroll }) = &mut app.active_modal {
                *scroll = scroll.saturating_add(1);
            }
            true
        }
        KeyCode::Up | KeyCode::Char('k') => {
            if let Some(AppModal::Help { scroll }) = &mut app.active_modal {
                *scroll = scroll.saturating_sub(1);
            }
            true
        }
        KeyCode::PageDown => {
            if let Some(AppModal::Help { scroll }) = &mut app.active_modal {
                *scroll = scroll.saturating_add(10);
            }
            true
        }
        KeyCode::PageUp => {
            if let Some(AppModal::Help { scroll }) = &mut app.active_modal {
                *scroll = scroll.saturating_sub(10);
            }
            true
        }
        KeyCode::Enter => {
            app.active_modal = None;
            true
        }
        _ => false,
    }
}

/// Handle Info modal key input.
pub async fn handle_info_modal(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    match key.code {
        KeyCode::Char('q') | KeyCode::Esc => {
            app.active_modal = None;
            true
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.active_modal = None;
            true
        }
        KeyCode::Down | KeyCode::Char('j') => {
            if let Some(AppModal::Info { scroll, .. }) = &mut app.active_modal {
                *scroll = scroll.saturating_add(1);
            }
            true
        }
        KeyCode::Up | KeyCode::Char('k') => {
            if let Some(AppModal::Info { scroll, .. }) = &mut app.active_modal {
                *scroll = scroll.saturating_sub(1);
            }
            true
        }
        KeyCode::PageDown => {
            if let Some(AppModal::Info { scroll, .. }) = &mut app.active_modal {
                *scroll = scroll.saturating_add(10);
            }
            true
        }
        KeyCode::PageUp => {
            if let Some(AppModal::Info { scroll, .. }) = &mut app.active_modal {
                *scroll = scroll.saturating_sub(10);
            }
            true
        }
        KeyCode::Enter => {
            app.active_modal = None;
            true
        }
        _ => false,
    }
}
