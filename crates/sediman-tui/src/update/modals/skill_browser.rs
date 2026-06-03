//! SkillBrowser modal key handling.

use crate::app::App;
use crossterm::event::{KeyCode, KeyModifiers};

/// Handle SkillBrowser modal key input.
pub async fn handle_skill_browser(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    let query = app.skill_browser_filter.to_lowercase();
    let filtered: Vec<(usize, &sediman_tui_bridge::HubSkill)> = app
        .skill_browser_skills
        .iter()
        .enumerate()
        .filter(|(_, s)| {
            if query.is_empty() { return true; }
            let searchable = format!("{} {} {} {}", s.name, s.description, s.category, s.author).to_lowercase();
            searchable.contains(&query)
        })
        .collect();
    let filtered_count = filtered.len();

    // Filter mode: typing goes to filter, Esc/Ctrl-C exits filter then modal
    if app.skill_browser_filter_active {
        return handle_skill_browser_filter_mode(app, key, filtered_count).await;
    }

    // Normal mode: j/k/d/i are actions
    match key.code {
        KeyCode::Esc => {
            app.skill_browser_filter.clear();
            app.skill_browser_filter_active = false;
            app.active_modal = None;
            true
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.skill_browser_filter.clear();
            app.skill_browser_filter_active = false;
            app.active_modal = None;
            true
        }
        KeyCode::Char('/') => {
            app.skill_browser_filter_active = true;
            true
        }
        KeyCode::Down | KeyCode::Char('j') | KeyCode::Tab => {
            if app.skill_browser_selected < filtered_count.saturating_sub(1) {
                app.skill_browser_selected += 1;
                let vr = app.skill_browser_visible_rows.saturating_sub(1);
                let max_scroll = (app.skill_browser_selected as u16).saturating_sub(vr);
                if app.skill_browser_scroll < max_scroll {
                    app.skill_browser_scroll = max_scroll;
                }
            }
            true
        }
        KeyCode::Up | KeyCode::Char('k') => {
            if app.skill_browser_selected > 0 {
                app.skill_browser_selected -= 1;
                if app.skill_browser_selected < app.skill_browser_scroll as usize {
                    app.skill_browser_scroll = app.skill_browser_selected as u16;
                }
            }
            true
        }
        KeyCode::PageDown => {
            let jump = 5.min(filtered_count.saturating_sub(1));
            app.skill_browser_selected = (app.skill_browser_selected + jump).min(filtered_count.saturating_sub(1));
            let vr = app.skill_browser_visible_rows.saturating_sub(1);
            let max_scroll = (app.skill_browser_selected as u16).saturating_sub(vr);
            if app.skill_browser_scroll < max_scroll {
                app.skill_browser_scroll = max_scroll;
            }
            true
        }
        KeyCode::PageUp => {
            let jump = 5.min(app.skill_browser_selected);
            app.skill_browser_selected -= jump;
            if app.skill_browser_selected < app.skill_browser_scroll as usize {
                app.skill_browser_scroll = app.skill_browser_selected as u16;
            }
            true
        }
        KeyCode::Enter => {
            if let Some((_, skill)) = filtered.get(app.skill_browser_selected) {
                let name = skill.name.clone();
                if skill.installed {
                    app.skill_browser_filter.clear();
                    app.skill_browser_filter_active = false;
                    app.active_modal = None;
                    crate::commands::skills::handle_run_skill(app, &name).await;
                } else {
                    app.add_system_message(format!("Installing {}...", name));
                    match app.bridge.hub_install(&name, false).await {
                        Ok(()) => {
                            app.add_system_message(format!("Installed {}", name));
                            if !app.skill_browser_installed.contains(&name) {
                                app.skill_browser_installed.push(name.clone());
                            }
                            for s in &mut app.skill_browser_skills {
                                if s.name == name {
                                    s.installed = true;
                                    break;
                                }
                            }
                        }
                        Err(e) => {
                            app.add_error_message(format!("Install failed: {}", e));
                        }
                    }
                }
            }
            true
        }
        KeyCode::Char('i') => {
            if let Some((_, skill)) = filtered.get(app.skill_browser_selected) {
                let name = skill.name.clone();
                app.skill_browser_filter.clear();
                app.skill_browser_filter_active = false;
                app.active_modal = None;
                crate::commands::skills::handle_skill_detail(app, &name).await;
            }
            true
        }
        KeyCode::Char('d') => {
            if let Some((_, skill)) = filtered.get(app.skill_browser_selected) {
                let name = skill.name.clone();
                if app.skill_browser_installed.contains(&name) {
                    app.add_system_message(format!("Uninstalling {}...", name));
                    match app.bridge.delete_skill(&name).await {
                        Ok(()) => {
                            app.skill_browser_installed.retain(|n| n != &name);
                            app.add_system_message(format!("Uninstalled {}", name));
                            for s in &mut app.skill_browser_skills {
                                if s.name == name {
                                    s.installed = false;
                                    break;
                                }
                            }
                        }
                        Err(e) => {
                            app.add_error_message(format!("Uninstall failed: {}", e));
                        }
                    }
                }
            }
            true
        }
        _ => false,
    }
}

/// Handle SkillBrowser filter mode key input.
async fn handle_skill_browser_filter_mode(app: &mut App, key: crossterm::event::KeyEvent, filtered_count: usize) -> bool {
    match key.code {
        KeyCode::Esc => {
            if app.skill_browser_filter.is_empty() {
                app.skill_browser_filter_active = false;
            } else {
                app.skill_browser_filter.clear();
                app.skill_browser_selected = 0;
                app.skill_browser_scroll = 0;
            }
            true
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.skill_browser_filter.clear();
            app.skill_browser_filter_active = false;
            app.skill_browser_selected = 0;
            app.skill_browser_scroll = 0;
            true
        }
        KeyCode::Enter => {
            app.skill_browser_filter_active = false;
            true
        }
        KeyCode::Backspace => {
            app.skill_browser_filter.pop();
            app.skill_browser_selected = 0;
            app.skill_browser_scroll = 0;
            true
        }
        KeyCode::Delete => {
            app.skill_browser_filter.clear();
            app.skill_browser_selected = 0;
            app.skill_browser_scroll = 0;
            true
        }
        KeyCode::Down => {
            if app.skill_browser_selected < filtered_count.saturating_sub(1) {
                app.skill_browser_selected += 1;
                let vr = app.skill_browser_visible_rows.saturating_sub(1);
                let max_scroll = (app.skill_browser_selected as u16).saturating_sub(vr);
                if app.skill_browser_scroll < max_scroll {
                    app.skill_browser_scroll = max_scroll;
                }
            }
            true
        }
        KeyCode::Up => {
            if app.skill_browser_selected > 0 {
                app.skill_browser_selected -= 1;
                if app.skill_browser_selected < app.skill_browser_scroll as usize {
                    app.skill_browser_scroll = app.skill_browser_selected as u16;
                }
            }
            true
        }
        KeyCode::Tab => {
            app.skill_browser_filter.push('\t');
            app.skill_browser_selected = 0;
            app.skill_browser_scroll = 0;
            true
        }
        KeyCode::Char(c) => {
            app.skill_browser_filter.push(c);
            app.skill_browser_selected = 0;
            app.skill_browser_scroll = 0;
            true
        }
        _ => false,
    }
}
