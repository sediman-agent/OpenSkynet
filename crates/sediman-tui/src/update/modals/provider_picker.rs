//! ProviderPicker modal key handling.

use crate::app::{App, AppModal};
use crossterm::event::{KeyCode, KeyModifiers};

/// Handle ProviderPicker modal key input.
pub async fn handle_provider_picker(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
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
            if app.provider_picker_idx > 0 {
                app.provider_picker_idx -= 1;
            } else {
                app.provider_picker_idx = app.available_providers.len().saturating_sub(1);
            }
            if app.provider_picker_idx < app.provider_picker_scroll {
                app.provider_picker_scroll = app.provider_picker_idx;
            }
            true
        }
        KeyCode::Down => {
            if app.provider_picker_idx < app.available_providers.len().saturating_sub(1) {
                app.provider_picker_idx += 1;
            } else {
                app.provider_picker_idx = 0;
                app.provider_picker_scroll = 0;
            }
            let visible = 10;
            if app.provider_picker_idx >= app.provider_picker_scroll + visible {
                app.provider_picker_scroll = app.provider_picker_idx - (visible - 1);
            }
            true
        }
        KeyCode::Enter => {
            if let Some(p) = app.available_providers.get(app.provider_picker_idx).cloned() {
                let name = p.name.clone();
                let default_model = p.default_model.clone();
                let default_url = p.default_base_url.clone();
                let needs_key = p.needs_api_key && !p.has_key;

                if needs_key {
                    app.connect_target = Some(name);
                    app.connect_pending_model = Some(default_model);
                    app.api_key_input.clear();
                    app.active_modal = Some(AppModal::ApiKeyPrompt);
                    return true;
                }

                if let Err(e) = app.bridge.switch_model(
                    &name,
                    Some(&default_model),
                    default_url.as_deref(),
                ).await {
                    app.add_error_message(format!("Failed to switch: {}", e));
                    app.active_modal = None;
                    return true;
                }
                app.provider = name.clone();
                app.model = Some(default_model);
                if let Some(url) = default_url {
                    app.base_url = Some(url);
                }
                app.add_system_message(format!("Switched to {}", app.display_model_id()));
            }
            app.active_modal = None;
            if let Ok(providers) = app.bridge.list_providers().await {
                app.available_providers = providers;
            }
            if let Ok(models) = app.bridge.list_models(None).await {
                app.model_list = models;
            }
            true
        }
        _ => false,
    }
}
