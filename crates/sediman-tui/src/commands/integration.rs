use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::{App, AppModal, ModalLine};

// ── /integrations — list all integrations and their status ────────────

pub async fn handle_integrations(app: &mut App, _args: &str) {
    match app.bridge.list_integrations().await {
        Ok(integrations) => {
            if integrations.is_empty() {
                app.add_system_message(String::from("No integrations available."));
                return;
            }

            let mut lines = vec![ModalLine::heading(String::from("  Integrations"))];
            for i in &integrations {
                lines.push(ModalLine::blank());
                let status = if i.connected {
                    "\u{25cf} connected"
                } else if i.configured {
                    "\u{25cb} configured"
                } else {
                    "\u{25cb} not configured"
                };
                lines.push(ModalLine::accent(format!("  {}  {}", i.name, status)));
                if i.enabled {
                    lines.push(ModalLine::muted(String::from("    enabled: true")));
                }
                if i.connected {
                    lines.push(ModalLine::muted(String::from("    listener: active")));
                }
            }

            lines.push(ModalLine::blank());
            lines.push(ModalLine::muted(String::from("  Use /connect-discord or /connect-telegram to configure")));

            app.active_modal = Some(AppModal::Info {
                title: String::from("Integrations"),
                lines,
                scroll: 0,
            });
        }
        Err(e) => app.add_error_message(format!("Failed to list integrations: {}", e)),
    }
}

// ── /connect-discord — configure Discord integration ─────────────────

pub async fn handle_connect_discord(app: &mut App, args: &str) {
    let args = args.trim();

    if args.is_empty() {
        // Show current status
        match app.bridge.integration_status("discord").await {
            Ok(status) => {
                let mut lines = vec![ModalLine::heading(String::from("  Discord Integration"))];
                lines.push(ModalLine::blank());

                if status.connected {
                    lines.push(ModalLine::normal(String::from("  Status:    \u{25cf} connected")));
                } else if status.configured {
                    lines.push(ModalLine::normal(String::from("  Status:    \u{25cb} configured (not connected)")));
                } else {
                    lines.push(ModalLine::normal(String::from("  Status:    \u{25cb} not configured")));
                }

                lines.push(ModalLine::normal(format!("  Enabled:   {}", status.enabled)));
                lines.push(ModalLine::blank());
                lines.push(ModalLine::muted(String::from("  Usage:")));
                lines.push(ModalLine::muted(String::from("    /connect-discord <bot-token>       Set bot token & enable")));
                lines.push(ModalLine::muted(String::from("    /connect-discord --disable         Disable Discord")));
                lines.push(ModalLine::muted(String::from("    /connect-discord --channel <name>=<id>  Map channel name")));

                app.active_modal = Some(AppModal::Info {
                    title: String::from("Discord"),
                    lines,
                    scroll: 0,
                });
            }
            Err(e) => app.add_error_message(format!("Discord status failed: {}", e)),
        }
        return;
    }

    if args == "--disable" {
        match app.bridge.configure_integration("discord", serde_json::json!({"enabled": false})).await {
            Ok(_) => app.add_system_message(String::from("Discord integration disabled.")),
            Err(e) => app.add_error_message(format!("Failed to disable Discord: {}", e)),
        }
        return;
    }

    if let Some(channel_spec) = args.strip_prefix("--channel ") {
        let parts: Vec<&str> = channel_spec.splitn(2, '=').collect();
        if parts.len() != 2 {
            app.add_system_message(String::from("Usage: /connect-discord --channel <name>=<channel-id>"));
            return;
        }
        let name = parts[0].trim();
        let id = parts[1].trim();
        match app.bridge.configure_integration("discord", serde_json::json!({"channels": {name: id}})).await {
            Ok(_) => app.add_system_message(format!("Discord channel mapped: {} \u{2192} {}", name, id)),
            Err(e) => app.add_error_message(format!("Failed to set channel: {}", e)),
        }
        return;
    }

    // Treat argument as bot token
    let token = args.to_string();
    match app.bridge.configure_integration("discord", serde_json::json!({
        "token": token,
        "enabled": true,
    })).await {
        Ok(_) => app.add_system_message(String::from("Discord integration enabled. Bot will start on next task.")),
        Err(e) => app.add_error_message(format!("Failed to configure Discord: {}", e)),
    }
}

// ── /connect-telegram — configure Telegram integration ───────────────

pub async fn handle_connect_telegram(app: &mut App, args: &str) {
    let args = args.trim();

    if args.is_empty() {
        match app.bridge.integration_status("telegram").await {
            Ok(status) => {
                let mut lines = vec![ModalLine::heading(String::from("  Telegram Integration"))];
                lines.push(ModalLine::blank());

                if status.connected {
                    lines.push(ModalLine::normal(String::from("  Status:    \u{25cf} connected")));
                } else if status.configured {
                    lines.push(ModalLine::normal(String::from("  Status:    \u{25cb} configured (not connected)")));
                } else {
                    lines.push(ModalLine::normal(String::from("  Status:    \u{25cb} not configured")));
                }

                lines.push(ModalLine::normal(format!("  Enabled:   {}", status.enabled)));
                lines.push(ModalLine::blank());
                lines.push(ModalLine::muted(String::from("  Usage:")));
                lines.push(ModalLine::muted(String::from("    /connect-telegram <bot-token>       Set bot token & enable")));
                lines.push(ModalLine::muted(String::from("    /connect-telegram --disable         Disable Telegram")));
                lines.push(ModalLine::muted(String::from("    /connect-telegram --chat <name>=<id>     Map chat name")));

                app.active_modal = Some(AppModal::Info {
                    title: String::from("Telegram"),
                    lines,
                    scroll: 0,
                });
            }
            Err(e) => app.add_error_message(format!("Telegram status failed: {}", e)),
        }
        return;
    }

    if args == "--disable" {
        match app.bridge.configure_integration("telegram", serde_json::json!({"enabled": false})).await {
            Ok(_) => app.add_system_message(String::from("Telegram integration disabled.")),
            Err(e) => app.add_error_message(format!("Failed to disable Telegram: {}", e)),
        }
        return;
    }

    if let Some(chat_spec) = args.strip_prefix("--chat ") {
        let parts: Vec<&str> = chat_spec.splitn(2, '=').collect();
        if parts.len() != 2 {
            app.add_system_message(String::from("Usage: /connect-telegram --chat <name>=<chat-id>"));
            return;
        }
        let name = parts[0].trim();
        let id = parts[1].trim();
        match app.bridge.configure_integration("telegram", serde_json::json!({"chats": {name: id}})).await {
            Ok(_) => app.add_system_message(format!("Telegram chat mapped: {} \u{2192} {}", name, id)),
            Err(e) => app.add_error_message(format!("Failed to set chat: {}", e)),
        }
        return;
    }

    // Treat argument as bot token
    let token = args.to_string();
    match app.bridge.configure_integration("telegram", serde_json::json!({
        "token": token,
        "enabled": true,
    })).await {
        Ok(_) => app.add_system_message(String::from("Telegram integration enabled. Bot will start on next task.")),
        Err(e) => app.add_error_message(format!("Failed to configure Telegram: {}", e)),
    }
}

// ── Command definitions ──────────────────────────────────────────────

pub static CMD_INTEGRATIONS: Command = Command {
    name: "/integrations",
    aliases: &[],
    description: "List and show integration status (Discord, Telegram)",
    category: CommandCategory::General,
};

pub static CMD_CONNECT_DISCORD: Command = Command {
    name: "/connect-discord",
    aliases: &[],
    description: "Configure Discord: /connect-discord <token>",
    category: CommandCategory::General,
};

pub static CMD_CONNECT_TELEGRAM: Command = Command {
    name: "/connect-telegram",
    aliases: &[],
    description: "Configure Telegram: /connect-telegram <token>",
    category: CommandCategory::General,
};
