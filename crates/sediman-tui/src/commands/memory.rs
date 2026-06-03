use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::App;

/// `/memory` — opens memory menu (view entries, switch system, view stats).
pub async fn handle_memory(app: &mut App, _args: &str) {
    app.open_memory_menu();
}

/// `/remember <text>` — quick-add to memory.
pub async fn handle_remember(app: &mut App, args: &str) {
    if args.is_empty() {
        app.add_system_message("Usage: /remember <text>".into());
        return;
    }
    match app.bridge.remember(args).await {
        Ok(_) => {
            let preview: String = args.chars().take(60).collect();
            app.add_system_message(format!("Remembered: {}", preview))
        }
        Err(e) => app.add_error_message(format!("Failed to save: {}", e)),
    }
}

pub static CMD_MEMORY: Command = Command {
    name: "/memory",
    aliases: &[],
    description: "Memory menu (view entries, switch system, view stats)",
    category: CommandCategory::Sessions,
};

pub static CMD_REMEMBER: Command = Command {
    name: "/remember",
    aliases: &[],
    description: "Save to memory: /remember <text>",
    category: CommandCategory::Sessions,
};
