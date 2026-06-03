//! SessionBrowser modal key handling.

use crate::app::App;
use crossterm::event::{KeyCode, KeyModifiers};

/// Handle SessionBrowser modal key input.
pub async fn handle_session_browser(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    let query = app.session_filter.to_lowercase();
    let filtered_count = app.session_list
        .iter()
        .filter(|s| {
            if query.is_empty() { return true; }
            let searchable = format!("{} {}", s.task, s.id).to_lowercase();
            searchable.contains(&query)
        })
        .count();

    match key.code {
        KeyCode::Esc => {
            app.session_filter.clear();
            app.active_modal = None;
            true
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.session_filter.clear();
            app.active_modal = None;
            true
        }
        KeyCode::Down | KeyCode::Char('j') => {
            if app.session_selected < filtered_count.saturating_sub(1) {
                app.session_selected += 1;
            }
            true
        }
        KeyCode::Up | KeyCode::Char('k') => {
            if app.session_selected > 0 {
                app.session_selected -= 1;
            }
            true
        }
        KeyCode::Enter => {
            // View session detail
            let filtered: Vec<&sediman_tui_bridge::SessionInfo> = app.session_list
                .iter()
                .filter(|s| {
                    if query.is_empty() { return true; }
                    let searchable = format!("{} {}", s.task, s.id).to_lowercase();
                    searchable.contains(&query)
                })
                .collect();
            if let Some(session) = filtered.get(app.session_selected) {
                let sid = session.id.clone();
                let task_preview = session.task.clone();
                match app.bridge.get_session_detail(&sid).await {
                    Ok(detail) => {
                        let mut lines = vec![
                            crate::app::ModalLine::heading(format!("  Session #{}", sid)),
                            crate::app::ModalLine::muted(format!("  Task: {}", task_preview)),
                            crate::app::ModalLine::muted(format!("  Created: {}", session.created_at)),
                            crate::app::ModalLine::blank(),
                        ];
                        if let Some(steps) = detail.get("steps").and_then(|s| s.as_array()) {
                            lines.push(crate::app::ModalLine::accent(format!("  Steps ({})", steps.len())));
                            for step in steps.iter().take(20) {
                                let action = step.get("action").and_then(|a| a.as_str()).unwrap_or("");
                                if !action.is_empty() {
                                    lines.push(crate::app::ModalLine::normal(format!("    {}", action)));
                                }
                            }
                        }
                        if let Some(result) = session.result.as_deref() {
                            if !result.is_empty() {
                                lines.push(crate::app::ModalLine::blank());
                                lines.push(crate::app::ModalLine::accent("  Result"));
                                let truncated: String = result.chars().take(300).collect();
                                lines.push(crate::app::ModalLine::normal(format!("    {}...", truncated)));
                            }
                        }
                        app.active_modal = Some(crate::app::AppModal::Info {
                            title: format!("Session #{}", sid),
                            lines,
                            scroll: 0,
                        });
                    }
                    Err(e) => {
                        app.add_error_message(format!("Failed to load session: {}", e));
                    }
                }
            }
            true
        }
        KeyCode::Char('d') => {
            if app.session_filter.is_empty() {
                let filtered: Vec<&sediman_tui_bridge::SessionInfo> = app.session_list
                    .iter()
                    .filter(|s| {
                        if query.is_empty() { return true; }
                        let searchable = format!("{} {}", s.task, s.id).to_lowercase();
                        searchable.contains(&query)
                    })
                    .collect();
                if let Some(session) = filtered.get(app.session_selected) {
                    let sid = session.id.clone();
                    match app.bridge.delete_session(&sid).await {
                        Ok(()) => {
                            app.add_system_message(format!("Deleted session #{}", sid));
                            if app.session_selected > 0 {
                                app.session_selected -= 1;
                            }
                            // Refresh list
                            if let Ok(sessions) = app.bridge.get_sessions().await {
                                app.session_list = sessions;
                            }
                        }
                        Err(e) => app.add_error_message(format!("Failed to delete: {}", e)),
                    }
                }
            } else {
                app.session_filter.push('d');
            }
            true
        }
        KeyCode::Backspace | KeyCode::Delete => {
            if app.session_filter.is_empty() {
                // Delete selected session
                let filtered: Vec<&sediman_tui_bridge::SessionInfo> = app.session_list
                    .iter()
                    .filter(|s| {
                        if query.is_empty() { return true; }
                        let searchable = format!("{} {}", s.task, s.id).to_lowercase();
                        searchable.contains(&query)
                    })
                    .collect();
                if let Some(session) = filtered.get(app.session_selected) {
                    let sid = session.id.clone();
                    match app.bridge.delete_session(&sid).await {
                        Ok(()) => {
                            app.add_system_message(format!("Deleted session #{}", sid));
                            if app.session_selected > 0 {
                                app.session_selected -= 1;
                            }
                            if let Ok(sessions) = app.bridge.get_sessions().await {
                                app.session_list = sessions;
                            }
                        }
                        Err(e) => app.add_error_message(format!("Failed to delete: {}", e)),
                    }
                }
            } else {
                app.session_filter.pop();
                app.session_selected = 0;
            }
            true
        }
        KeyCode::Tab => {
            app.session_filter.push('\t');
            app.session_selected = 0;
            true
        }
        KeyCode::Char(c) => {
            app.session_filter.push(c);
            app.session_selected = 0;
            true
        }
        _ => false,
    }
}
