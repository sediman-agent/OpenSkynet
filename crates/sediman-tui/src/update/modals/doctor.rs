//! Doctor modal key handling.

use crate::app::{App, AppModal};
use crossterm::event::{KeyCode, KeyModifiers};

/// Handle Doctor modal key input.
pub async fn handle_doctor(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
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
            if let Some(AppModal::Doctor { ref mut cursor, ref mut scroll, .. }) = app.active_modal {
                if *cursor > 0 {
                    *cursor -= 1;
                    // Keep cursor visible: ensure scroll never exceeds cursor
                    if *scroll > *cursor as u16 {
                        *scroll = *cursor as u16;
                    }
                }
            }
            true
        }
        KeyCode::Down | KeyCode::Char('j') => {
            if let Some(AppModal::Doctor { ref checks, ref mut cursor, ref mut scroll, .. }) = app.active_modal {
                if *cursor < checks.len().saturating_sub(1) {
                    *cursor += 1;
                    // Keep cursor visible: scroll when cursor reaches the bottom edge
                    const EDGE_OFFSET: usize = 8;
                    if *cursor >= EDGE_OFFSET && *cursor < checks.len() {
                        let target_scroll = (*cursor as u16).saturating_sub(EDGE_OFFSET as u16 - 2);
                        if *scroll < target_scroll {
                            *scroll = target_scroll;
                        }
                    }
                }
            }
            true
        }
        KeyCode::Char('r') => {
            let checks = crate::commands::doctor::run_all_checks_sync(app).await;
            app.active_modal = Some(AppModal::Doctor {
                checks,
                cursor: 0,
                scroll: 0,
                installing: false,
                install_output: Vec::new(),
            });
            true
        }
        KeyCode::Enter => {
            if let Some(AppModal::Doctor { ref checks, ref mut cursor, ref mut installing, ref mut install_output, .. }) = app.active_modal {
                if let Some(cmd) = checks.get(*cursor).and_then(|c| c.install_cmd.clone()) {
                    *installing = true;
                    install_output.clear();
                    install_output.push(format!("  Running: {}", cmd));
                    let install_cmd = cmd.clone();
                    match tokio::process::Command::new("sh")
                        .arg("-c")
                        .arg(&install_cmd)
                        .output()
                        .await
                    {
                        Ok(out) => {
                            let stdout = String::from_utf8_lossy(&out.stdout);
                            let stderr = String::from_utf8_lossy(&out.stderr);
                            if !stdout.is_empty() {
                                for line in stdout.lines().take(10) {
                                    install_output.push(format!("  {}", line));
                                }
                            }
                            if !stderr.is_empty() {
                                for line in stderr.lines().take(5) {
                                    install_output.push(format!("  {}", line));
                                }
                            }
                            if out.status.success() {
                                install_output.push("  ✓ Done — re-checking...".into());
                            } else {
                                install_output.push(format!("  ✗ Exit code: {}", out.status.code().unwrap_or(-1)));
                            }
                        }
                        Err(e) => {
                            install_output.push(format!("  ✗ Failed: {}", e));
                        }
                    }
                    let saved_cursor = *cursor;
                    let saved_output = std::mem::take(install_output);
                    let new_checks = crate::commands::doctor::run_all_checks_sync(app).await;
                    app.active_modal = Some(AppModal::Doctor {
                        checks: new_checks,
                        cursor: saved_cursor,
                        scroll: 0,
                        installing: false,
                        install_output: saved_output,
                    });
                }
            }
            true
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests;
