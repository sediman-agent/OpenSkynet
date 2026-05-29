use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::App;

pub async fn handle_model(app: &mut App, args: &str) {
    if args.is_empty() {
        app.add_system_message(format!(
            "Current model: {}/{}",
            app.provider,
            app.model.as_deref().unwrap_or("default")
        ));
        app.add_system_message("Usage: /model <provider:model>".into());
        app.add_system_message("    or: /model <model> (keeps current provider)".into());
        return;
    }

    let (new_provider, new_model) = if let Some(idx) = args.find(':') {
        (args[..idx].to_string(), Some(args[idx + 1..].to_string()))
    } else {
        (app.provider.clone(), Some(args.to_string()))
    };

    app.provider = new_provider;
    app.model = new_model;
    app.add_system_message(format!(
        "Switched to {}/{}",
        app.provider,
        app.model.as_deref().unwrap_or("default")
    ));
    app.add_system_message("Agent will use new model on next task".into());
}

pub async fn handle_models(app: &mut App, _args: &str) {
    app.add_system_message("Available providers:".into());
    app.add_system_message("  openai - gpt-4o (default), gpt-4o-mini, etc.".into());
    app.add_system_message("  ollama - qwen3, llama3, etc. (http://localhost:11434/v1)".into());
    app.add_system_message("  custom - any OpenAI-compatible API".into());
    app.add_system_message("".into());
    app.add_system_message(format!(
        "Current: {}",
        app.model.as_deref().unwrap_or("not set")
    ));
    app.add_system_message("Switch with: /model <provider:model>".into());
}

pub static CMD_MODEL: Command = Command {
    name: "/model",
    aliases: &[],
    description: "Show or switch model: /model or /model <provider:model>",
    category: CommandCategory::Agent,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_MODELS: Command = Command {
    name: "/models",
    aliases: &[],
    description: "List available provider presets",
    category: CommandCategory::Agent,
    handler: |_, _| Box::new(std::future::ready(())),
};
