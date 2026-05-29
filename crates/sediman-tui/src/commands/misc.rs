use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::App;

pub async fn handle_usage(app: &mut App, _args: &str) {
    let conv_chars: usize = app.step_log.iter().map(|s| s.len()).sum();
    let est_tokens = conv_chars / 4;
    app.add_system_message("Session Usage".into());
    app.add_system_message(format!("  Tasks run:  {}", app.task_count));
    app.add_system_message(format!("  Est. tokens: ~{}", est_tokens));
    app.add_system_message(format!("  Messages: {}", app.messages.len()));
    app.add_system_message(format!(
        "  Model: {}/{}",
        app.provider,
        app.model.as_deref().unwrap_or("default")
    ));
    app.add_system_message(format!("  Agent running: {}", app.agent_running));
}

pub async fn handle_doctor(app: &mut App, _args: &str) {
    app.add_system_message("Sediman Diagnostics".into());
    match app.bridge.status().await {
        Ok(status) => {
            app.add_system_message(format!("  API server: ok (uptime: {}s)", status.uptime_secs));
            app.add_system_message(format!(
                "  Browser: {}",
                if status.browser_open { "open" } else { "closed" }
            ));
        }
        Err(_) => {
            app.add_error_message("API server not reachable".into());
        }
    }
    app.add_system_message("  Config dir: ~/.sediman/".into());
    app.add_system_message(format!("  Mode: {}", app.permission.current_label()));
}

pub async fn handle_export(app: &mut App, _args: &str) {
    let mut content = String::new();
    for msg in &app.messages {
        match msg {
            crate::app::ChatMessage::User { text, task_num } => {
                content.push_str(&format!("[{}] {}\n", task_num, text));
            }
            crate::app::ChatMessage::Agent { steps, result, success, elapsed_secs, .. } => {
                for s in steps {
                    content.push_str(&format!("> {}\n", s));
                }
                if let Some(r) = result {
                    let status = if *success { "Done" } else { "Failed" };
                    content.push_str(&format!("{} ({}s): {}\n", status, elapsed_secs, r));
                }
            }
            crate::app::ChatMessage::System { text } => {
                content.push_str(&format!("# {}\n", text));
            }
            crate::app::ChatMessage::Error { text } => {
                content.push_str(&format!("! {}\n", text));
            }
        }
    }

    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let dir = format!("{}/.sediman", home);
    let _ = std::fs::create_dir_all(&dir);
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let path = format!("{}/export_{}.md", dir, timestamp);

    match std::fs::write(&path, &content) {
        Ok(_) => app.add_system_message(format!("Exported to: {}", path)),
        Err(e) => app.add_error_message(format!("Export failed: {}", e)),
    }
}

pub async fn handle_btw(app: &mut App, args: &str) {
    if args.is_empty() {
        app.add_system_message("Usage: /btw <question>".into());
        return;
    }
    app.add_system_message(format!("Side question: {}", args));
    app.add_system_message("(ephemeral - does not affect conversation context)".into());
}

pub async fn handle_color(app: &mut App, args: &str) {
    let args = args.trim();
    let valid_colors = ["red", "blue", "green", "yellow", "purple", "orange", "pink", "cyan", "default"];
    if args.is_empty() {
        let current = app.session_color.as_deref().unwrap_or("default");
        app.add_system_message(format!("Session color: {}", current));
        app.add_system_message(format!("Usage: /color <{}>", valid_colors.join("|")));
        return;
    }
    if args == "random" {
        let colors = ["red", "blue", "green", "yellow", "purple", "cyan"];
        use std::time::SystemTime;
        let idx = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos() as usize % colors.len();
        app.session_color = Some(colors[idx].to_string());
        app.add_system_message(format!("Color set to: {}", colors[idx]));
        return;
    }
    if valid_colors.contains(&args) {
        app.session_color = if args == "default" {
            None
        } else {
            Some(args.to_string())
        };
        app.add_system_message(format!("Color set to: {}", args));
    } else {
        app.add_system_message(format!("Unknown color '{}'. Use: {}", args, valid_colors.join(", ")));
    }
}

pub async fn handle_rename(app: &mut App, args: &str) {
    let args = args.trim();
    if args.is_empty() {
        let current = app.session_name.as_deref().unwrap_or("(unnamed)");
        app.add_system_message(format!("Session name: {}", current));
        app.add_system_message("Usage: /rename <name>".into());
        return;
    }
    let name: String = args.chars().take(30).collect();
    app.session_name = Some(name.clone());
    app.add_system_message(format!("Session renamed to: {}", name));
}

pub static CMD_USAGE: Command = Command {
    name: "/usage",
    aliases: &[],
    description: "Show session usage stats",
    category: CommandCategory::Utilities,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_DOCTOR: Command = Command {
    name: "/doctor",
    aliases: &[],
    description: "Diagnose installation and settings",
    category: CommandCategory::Utilities,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_EXPORT: Command = Command {
    name: "/export",
    aliases: &[],
    description: "Export conversation to Markdown file",
    category: CommandCategory::Utilities,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_BTW: Command = Command {
    name: "/btw",
    aliases: &[],
    description: "Ephemeral side question: /btw <question>",
    category: CommandCategory::Utilities,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_COLOR: Command = Command {
    name: "/color",
    aliases: &[],
    description: "Set prompt bar color",
    category: CommandCategory::Terminal,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_RENAME: Command = Command {
    name: "/rename",
    aliases: &[],
    description: "Name this session: /rename <name>",
    category: CommandCategory::Terminal,
    handler: |_, _| Box::new(std::future::ready(())),
};
