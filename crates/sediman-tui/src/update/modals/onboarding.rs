use crate::app::{App, AppModal};
use crossterm::event::{KeyCode, KeyEvent};
use tracing::warn;

pub async fn handle_onboarding(app: &mut App, key: KeyEvent) -> bool {
    let step = if let Some(AppModal::OnboardingWizard { step }) = &app.active_modal {
        *step
    } else {
        return false;
    };

    match key.code {
        KeyCode::Esc | KeyCode::Char('q') => {
            app.active_modal = None;
            true
        }
        KeyCode::Enter if step == 0 => {
            if app.available_providers.is_empty() {
                if let Ok(providers) = app.bridge.list_providers().await {
                    app.available_providers = providers;
                }
            }
            app.active_modal = Some(AppModal::OnboardingWizard { step: 1 });
            app.mark_dirty();
            true
        }
        KeyCode::Enter if step == 1 => {
            if let Some(provider) = app.available_providers.get(app.provider_picker_idx) {
                app.onboarding_provider = provider.name.clone();
            } else if !app.available_providers.is_empty() {
                app.onboarding_provider = app.available_providers[0].name.clone();
            }
            app.active_modal = Some(AppModal::OnboardingWizard { step: 2 });
            app.api_key_input.clear();
            true
        }
        KeyCode::Enter if step == 2 => {
            if !app.api_key_input.is_empty() {
                let provider = app.onboarding_provider.clone();
                let key_val = app.api_key_input.clone();

                let _ = app.bridge.auth_set(&provider, &key_val).await;

                save_onboarding_done(app);
                app.add_system_message(format!("Connected to {}", provider));
                app.active_modal = None;
            }
            true
        }
        KeyCode::Up | KeyCode::Char('k') if step == 1 => {
            if app.provider_picker_idx > 0 {
                app.provider_picker_idx -= 1;
            }
            if app.provider_picker_idx < app.provider_picker_scroll {
                app.provider_picker_scroll = app.provider_picker_idx;
            }
            true
        }
        KeyCode::Down | KeyCode::Char('j') if step == 1 => {
            let count = app.available_providers.len();
            if count > 0 && app.provider_picker_idx + 1 < count {
                app.provider_picker_idx += 1;
            }
            const VISIBLE: usize = 10;
            if app.provider_picker_idx >= app.provider_picker_scroll + VISIBLE {
                app.provider_picker_scroll = app.provider_picker_idx - (VISIBLE - 1);
            }
            true
        }
        KeyCode::Backspace | KeyCode::Delete if step == 2 => {
            app.api_key_input.pop();
            true
        }
        KeyCode::Char(c) if step == 2 => {
            if !matches!(c, '\t' | '\n' | '\r') {
                app.api_key_input.push(c);
            }
            true
        }
        _ => false,
    }
}

fn save_onboarding_done(app: &App) {
    let mut config = crate::config::TuiConfig::load();
    config.onboarding_complete = true;
    config.provider = app.onboarding_provider.clone();
    if let Err(e) = config.save() {
        warn!("Failed to save onboarding state: {}", e);
    }
}
