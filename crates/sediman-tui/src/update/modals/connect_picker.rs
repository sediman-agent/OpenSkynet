//! ConnectPicker modal key handling.

use crate::app::{App, AppModal};
use crossterm::event::{KeyCode, KeyModifiers};

/// Handle ConnectPicker modal key input.
pub async fn handle_connect_picker(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    match key.code {
        KeyCode::Esc | KeyCode::Char('q') => {
            app.active_modal = None;
            true
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.active_modal = None;
            true
        }
        KeyCode::Up => {
            if app.connect_picker_idx > 0 {
                app.connect_picker_idx -= 1;
            } else {
                app.connect_picker_idx = app.connect_integration_list.len().saturating_sub(1);
            }
            if app.connect_picker_idx < app.connect_picker_scroll {
                app.connect_picker_scroll = app.connect_picker_idx;
            }
            true
        }
        KeyCode::Down => {
            let max = app.connect_integration_list.len().saturating_sub(1);
            if app.connect_picker_idx < max {
                app.connect_picker_idx += 1;
            } else {
                app.connect_picker_idx = 0;
                app.connect_picker_scroll = 0;
            }
            let visible = 10;
            if app.connect_picker_idx >= app.connect_picker_scroll + visible {
                app.connect_picker_scroll = app.connect_picker_idx - (visible - 1);
            }
            true
        }
        KeyCode::Enter => {
            if let Some(integ) = app.connect_integration_list.get(app.connect_picker_idx).cloned() {
                let name = integ.name.clone();
                app.connect_target = Some(name);
                app.connect_is_integration = true;
                app.connect_pending_model = None;
                app.api_key_input.clear();
                app.active_modal = Some(AppModal::ApiKeyPrompt);
            }
            true
        }
        KeyCode::Char('d') => {
            if let Some(integ) = app.connect_integration_list.get(app.connect_picker_idx).cloned() {
                let name = integ.name.clone();
                match app
                    .bridge
                    .configure_integration(&name, serde_json::json!({"enabled": false}))
                    .await
                {
                    Ok(_) => {
                        let cap = {
                            let mut c = name.chars();
                            match c.next() {
                                None => String::new(),
                                Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                            }
                        };
                        app.add_system_message(format!("{} integration disabled.", cap));
                    }
                    Err(e) => {
                        app.add_error_message(format!("Failed to disable {}: {}", name, e));
                    }
                }
                if let Ok(integrations) = app.bridge.list_integrations().await {
                    app.connect_integration_list = integrations;
                }
            }
            true
        }
        _ => false,
    }
}
