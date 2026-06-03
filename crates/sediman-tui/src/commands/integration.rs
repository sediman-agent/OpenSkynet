use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::App;

pub async fn handle_connect(app: &mut App, args: &str) {
    let args = args.trim();

    if args.is_empty() {
        open_connect_picker(app).await;
        return;
    }

    let (service, rest) = match args.split_once(' ') {
        Some((s, r)) => (s.trim(), r.trim()),
        None => (args, ""),
    };

    match service {
        "discord" | "telegram" | "slack" | "whatsapp" => {
            if rest.is_empty() {
                open_connect_picker(app).await;
                return;
            }
            let token = rest.to_string();
            match app
                .bridge
                .configure_integration(service, serde_json::json!({
                    "token": token,
                    "enabled": true,
                }))
                .await
            {
                Ok(_) => app.add_system_message(format!(
                    "{} integration enabled. Bot will start on next task.",
                    capitalize(service)
                )),
                Err(e) => app.add_error_message(format!("Failed to configure {}: {}", service, e)),
            }
        }
        "lark" => {
            if rest.is_empty() {
                open_connect_picker(app).await;
                return;
            }
            // Lark uses app_id and app_secret
            let parts: Vec<&str> = rest.split_whitespace().collect();
            if parts.len() < 2 {
                app.add_system_message("Usage: /connect lark <app_id> <app_secret>".into());
                return;
            }
            let app_id = parts[0];
            let app_secret = parts[1];
            match app
                .bridge
                .configure_integration(service, serde_json::json!({
                    "app_id": app_id,
                    "app_secret": app_secret,
                    "enabled": true,
                }))
                .await
            {
                Ok(_) => app.add_system_message(format!(
                    "{} integration enabled. Bot will start on next task.",
                    capitalize(service)
                )),
                Err(e) => app.add_error_message(format!("Failed to configure {}: {}", service, e)),
            }
        }
        "wechat" => {
            if rest.is_empty() {
                open_connect_picker(app).await;
                return;
            }
            let account_id = rest.to_string();
            match app
                .bridge
                .configure_integration(service, serde_json::json!({
                    "account_id": account_id,
                    "enabled": true,
                }))
                .await
            {
                Ok(_) => app.add_system_message(format!(
                    "{} integration enabled. Bot will start on next task.",
                    capitalize(service)
                )),
                Err(e) => app.add_error_message(format!("Failed to configure {}: {}", service, e)),
            }
        }
        _ => {
            app.add_error_message(format!(
                "Unknown service: {}. Available: discord, telegram, slack, whatsapp, lark, wechat",
                service
            ));
        }
    }
}

async fn open_connect_picker(app: &mut App) {
    match app.bridge.list_integrations().await {
        Ok(mut integrations) => {
            // Ensure all expected integrations are present
            const EXPECTED_INTEGRATIONS: &[&str] = &["discord", "telegram", "slack", "whatsapp", "lark", "wechat"];
            let existing_names: Vec<String> = integrations.iter().map(|i| i.name.clone()).collect();

            for &expected in EXPECTED_INTEGRATIONS {
                if !existing_names.iter().any(|n| n == expected) {
                    // Add missing integration with default values
                    integrations.push(sediman_tui_bridge::IntegrationInfo {
                        name: expected.to_string(),
                        configured: false,
                        connected: false,
                        enabled: false,
                    });
                }
            }

            // Sort by name for consistent ordering
            integrations.sort_by(|a, b| a.name.cmp(&b.name));

            if integrations.is_empty() {
                app.add_error_message("No integrations available.".into());
                return;
            }
            app.connect_integration_list = integrations;
            app.connect_picker_idx = 0;
            app.connect_picker_scroll = 0;
            app.active_modal = Some(crate::app::AppModal::ConnectPicker);
        }
        Err(e) => app.add_error_message(format!("Failed to load integrations: {}", e)),
    }
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

pub static CMD_CONNECT: Command = Command {
    name: "/connect",
    aliases: &[],
    description: "Connect integrations (Discord, Telegram)",
    category: CommandCategory::General,
};
