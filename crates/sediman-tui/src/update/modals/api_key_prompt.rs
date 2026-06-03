//! ApiKeyPrompt modal key handling.

use crate::app::App;
use crossterm::event::{KeyCode, KeyModifiers};

/// Handle ApiKeyPrompt modal key input.
pub async fn handle_api_key_prompt(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    match key.code {
        KeyCode::Esc => {
            app.api_key_input.clear();
            app.connect_target = None;
            app.connect_is_integration = false;
            app.connect_pending_model = None;
            app.active_modal = None;
            true
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.api_key_input.clear();
            app.connect_target = None;
            app.connect_is_integration = false;
            app.connect_pending_model = None;
            app.active_modal = None;
            true
        }
        KeyCode::Enter => {
            if !app.api_key_input.is_empty() {
                let target = app.connect_target.clone().unwrap_or_default();
                let key_val = app.api_key_input.clone();

                if app.connect_is_integration {
                    match app.bridge.configure_integration(
                        &target,
                        serde_json::json!({
                            "token": key_val,
                            "enabled": true,
                        }),
                    ).await {
                        Ok(_) => {
                            let cap = {
                                let mut c = target.chars();
                                match c.next() {
                                    None => String::new(),
                                    Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
                                }
                            };
                            app.add_system_message(format!(
                                "{} integration enabled. Bot will start on next task.",
                                cap
                            ));
                        }
                        Err(e) => {
                            app.add_error_message(format!("Failed to configure {}: {}", target, e));
                        }
                    }
                } else {
                    match app.bridge.auth_set(&target, &key_val).await {
                        Ok(()) => {
                            let pending_model = app.connect_pending_model.clone();
                            let base_url = app
                                .available_providers
                                .iter()
                                .find(|p| p.name == target)
                                .and_then(|p| p.default_base_url.clone());
                            let model_id = pending_model.as_deref().unwrap_or("default");
                            if let Err(e) = app.bridge.switch_model(
                                &target,
                                Some(model_id),
                                base_url.as_deref(),
                            ).await {
                                app.add_error_message(format!("Key saved but switch failed: {}", e));
                            } else {
                                app.provider = target.clone();
                                app.model = Some(model_id.to_string());
                                if let Some(url) = base_url {
                                    app.base_url = Some(url);
                                }
                                app.add_system_message(format!("Switched to {}", app.display_model_id()));
                            }
                            if let Ok(providers) = app.bridge.list_providers().await {
                                app.available_providers = providers;
                            }
                            if let Ok(models) = app.bridge.list_models(None).await {
                                app.model_list = models;
                            }
                        }
                        Err(e) => {
                            app.add_error_message(format!("Failed to save key: {}", e));
                        }
                    }
                }
            }
            app.api_key_input.clear();
            app.connect_target = None;
            app.connect_is_integration = false;
            app.connect_pending_model = None;
            app.model_dialog_filter.clear();
            app.active_modal = None;
            true
        }
        KeyCode::Backspace | KeyCode::Delete => {
            app.api_key_input.pop();
            true
        }
        KeyCode::Tab => {
            app.api_key_input.push('\t');
            true
        }
        KeyCode::Char(c) => {
            app.api_key_input.push(c);
            true
        }
        _ => false,
    }
}
