use crate::app::App;

pub async fn handle_help(app: &mut App, _args: &str) {
    app.show_help = true;
}

pub async fn handle_clear(app: &mut App, _args: &str) {
    app.messages.clear();
    app.step_log.clear();
    app.output_text.clear();
    app.add_system_message("Conversation cleared.".into());
}

pub async fn handle_reset(app: &mut App, _args: &str) {
    app.messages.clear();
    app.step_log.clear();
    app.output_text.clear();
    app.task_count = 0;
    app.last_result = None;
    app.editor = sediman_tui_core::input::TextEditor::new();
    app.show_banner = true;
    app.scroll_offset = 0;
    app.add_system_message("Full reset done.".into());
}

pub async fn handle_compress(app: &mut App, _args: &str) {
    app.add_system_message("Compressing conversation...".into());
    app.step_log.truncate(50);
    let mut compressed = Vec::new();
    let mut keep = true;
    for msg in app.messages.drain(..) {
        if keep {
            compressed.push(msg);
        }
        keep = false;
    }
    app.messages = compressed;
    app.add_system_message("Conversation compressed.".into());
}

pub async fn handle_exit(app: &mut App, _args: &str) {
    app.running = false;
}

pub async fn handle_status(app: &mut App, _args: &str) {
    match app.bridge.status().await {
        Ok(status) => {
            let uptime = if status.uptime_secs >= 60 {
                format!("{}m {}s", status.uptime_secs / 60, status.uptime_secs % 60)
            } else {
                format!("{}s", status.uptime_secs)
            };
            app.add_system_message("Status".into());
            app.add_system_message(format!("  Server uptime: {}", uptime));
            app.add_system_message(format!("  Browser open: {}", status.browser_open));
            app.add_system_message(format!("  Tasks completed: {}", status.tasks_completed));
            app.add_system_message(format!("  Model: {}/{}", app.provider, app.model.as_deref().unwrap_or("-")));
            app.add_system_message(format!("  Tasks this session: {}", app.task_count));
            app.add_system_message(format!("  Mode: {}", app.permission.current_label()));
        }
        Err(e) => app.add_error_message(format!("Status check failed: {}", e)),
    }
}

use sediman_tui_core::command::{Command, CommandCategory};

pub static CMD_HELP: Command = Command {
    name: "/help",
    aliases: &["/h", "/?"],
    description: "Show categorized command list",
    category: CommandCategory::General,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_CLEAR: Command = Command {
    name: "/clear",
    aliases: &[],
    description: "Clear conversation",
    category: CommandCategory::General,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_RESET: Command = Command {
    name: "/reset",
    aliases: &[],
    description: "Full reset: agent, LLM, task count",
    category: CommandCategory::General,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_COMPRESS: Command = Command {
    name: "/compress",
    aliases: &[],
    description: "Compress conversation history",
    category: CommandCategory::Agent,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_EXIT: Command = Command {
    name: "/exit",
    aliases: &["/quit", "/q"],
    description: "Exit Sediman",
    category: CommandCategory::General,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_STATUS: Command = Command {
    name: "/status",
    aliases: &[],
    description: "Show agent, browser, model, task status",
    category: CommandCategory::General,
    handler: |_, _| Box::new(std::future::ready(())),
};
