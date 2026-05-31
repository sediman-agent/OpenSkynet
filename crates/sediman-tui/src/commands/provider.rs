use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::App;

pub async fn handle_provider(app: &mut App, args: &str) {
    if args.is_empty() {
        app.open_model_dialog();
        return;
    }

    let name = args.trim().to_lowercase();

    let provider_info = app
        .available_providers
        .iter()
        .find(|p| p.name == name);

    let (default_model, default_url, needs_key) = match provider_info {
        Some(p) => (p.default_model.clone(), p.default_base_url.clone(), p.needs_api_key),
        None => {
            app.add_error_message(format!("Unknown provider: {}. Use /models to see available.", name));
            return;
        }
    };

    if needs_key {
        app.connect_target = Some(name);
        app.connect_pending_model = Some(default_model.clone());
        app.api_key_input.clear();
        app.active_modal = Some(crate::app::AppModal::ApiKeyPrompt);
        return;
    }

    if let Err(e) = app.bridge.switch_model(&name, Some(&default_model), default_url.as_deref()).await {
        app.add_error_message(format!("Failed to switch provider: {}", e));
        return;
    }

    app.provider = name.clone();
    app.model = Some(default_model);
    if let Some(url) = default_url {
        app.base_url = Some(url);
    }
    if let Ok(providers) = app.bridge.list_providers().await {
        app.available_providers = providers;
    }
    if let Ok(models) = app.bridge.list_models(None).await {
        app.model_list = models;
    }
    app.add_system_message(format!("Provider: {} (connected)", name));
}

pub static CMD_PROVIDER: Command = Command {
    name: "/provider",
    aliases: &["/connect"],
    description: "Connect provider & enter API key",
    category: CommandCategory::Agent,
};
