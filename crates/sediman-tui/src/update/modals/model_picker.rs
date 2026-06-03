//! ModelPicker modal key handling.

use crate::app::{App, AppModal};
use crossterm::event::{KeyCode, KeyModifiers};

/// Handle ModelPicker modal key input.
pub async fn handle_model_picker(app: &mut App, key: crossterm::event::KeyEvent) -> bool {
    match key.code {
        KeyCode::Esc => {
            app.model_dialog_filter.clear();
            app.active_modal = None;
            true
        }
        KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => {
            app.model_dialog_filter.clear();
            app.active_modal = None;
            true
        }
        KeyCode::Up => {
            let models = app.filtered_models_flat();
            if models.is_empty() { return true; }
            if app.model_dialog_model_idx > 0 {
                app.model_dialog_model_idx -= 1;
            } else {
                app.model_dialog_model_idx = models.len() - 1;
            }
            app.clamp_model_scroll();
            true
        }
        KeyCode::Down => {
            let models = app.filtered_models_flat();
            if models.is_empty() { return true; }
            if app.model_dialog_model_idx < models.len() - 1 {
                app.model_dialog_model_idx += 1;
            } else {
                app.model_dialog_model_idx = 0;
            }
            app.clamp_model_scroll();
            true
        }
        KeyCode::Enter => {
            let models = app.filtered_models_flat();
            if let Some(selected_model) = models.get(app.model_dialog_model_idx).cloned() {
                let provider_name = selected_model.provider.clone();
                let model_id = selected_model.id.clone();
                let base_url = app
                    .available_providers
                    .iter()
                    .find(|p| p.name == provider_name)
                    .and_then(|p| p.default_base_url.clone());
                let needs_key = app
                    .available_providers
                    .iter()
                    .find(|p| p.name == provider_name)
                    .map(|p| p.needs_api_key && !p.has_key)
                    .unwrap_or(false);
                if needs_key {
                    app.connect_target = Some(provider_name.clone());
                    app.connect_pending_model = Some(model_id.clone());
                    app.api_key_input.clear();
                    app.active_modal = Some(AppModal::ApiKeyPrompt);
                    return true;
                }
                if let Err(e) = app.bridge.switch_model(
                    &provider_name,
                    Some(&model_id),
                    base_url.as_deref(),
                ).await {
                    app.add_error_message(format!("Failed to switch: {}", e));
                    app.model_dialog_filter.clear();
                    app.active_modal = None;
                    return true;
                }
                app.provider = provider_name.clone();
                app.model = Some(model_id);
                if let Some(url) = &base_url {
                    app.base_url = Some(url.clone());
                }
                app.add_system_message(format!("Switched to {}", app.display_model_id()));
            }
            app.model_dialog_filter.clear();
            app.active_modal = None;
            if let Ok(providers) = app.bridge.list_providers().await {
                app.available_providers = providers;
            }
            if let Ok(models) = app.bridge.list_models(None).await {
                app.model_list = models;
            }
            true
        }
        KeyCode::Backspace => {
            app.model_dialog_filter.pop();
            app.model_dialog_model_idx = 0;
            app.model_dialog_scroll = 0;
            true
        }
        KeyCode::Tab => {
            app.model_dialog_filter.push('\t');
            app.model_dialog_model_idx = 0;
            app.model_dialog_scroll = 0;
            true
        }
        KeyCode::Char(c) => {
            app.model_dialog_filter.push(c);
            app.model_dialog_model_idx = 0;
            app.model_dialog_scroll = 0;
            true
        }
        _ => false,
    }
}
