use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::App;

pub async fn handle_schedule(app: &mut App, _args: &str) {
    match app.bridge.list_schedules().await {
        Ok(jobs) => {
            if jobs.is_empty() {
                app.add_system_message("No scheduled jobs.".into());
                return;
            }
            app.add_system_message(format!("Scheduled Jobs ({})", jobs.len()));
            for j in &jobs {
                let status = if j.enabled { "active" } else { "paused" };
                app.add_system_message(format!(
                    "  [{}] {} - cron: {} ({})",
                    &j.id[..j.id.len().min(8)], j.task, j.cron_expr, status
                ));
                if let Some(ref next) = j.next_run {
                    app.add_system_message(format!("    next: {}", next));
                }
            }
        }
        Err(e) => app.add_error_message(format!("Failed to list schedules: {}", e)),
    }
}

pub async fn handle_schedule_add(app: &mut App, args: &str) {
    if args.is_empty() {
        app.add_system_message("Usage: /schedule-add <cron> <task>".into());
        return;
    }
    let parts: Vec<&str> = args.splitn(2, ' ').collect();
    if parts.len() < 2 {
        app.add_system_message("Usage: /schedule-add <cron> <task>".into());
        return;
    }
    match app.bridge.add_schedule(parts[0], parts[1]).await {
        Ok(id) => app.add_system_message(format!("Scheduled job created: {}", id)),
        Err(e) => app.add_error_message(format!("Failed: {}", e)),
    }
}

pub async fn handle_schedule_remove(app: &mut App, args: &str) {
    if args.is_empty() {
        app.add_system_message("Usage: /schedule-remove <id>".into());
        return;
    }
    match app.bridge.remove_schedule(args).await {
        Ok(_) => app.add_system_message(format!("Removed job: {}", args)),
        Err(e) => app.add_error_message(format!("Failed: {}", e)),
    }
}

pub static CMD_SCHEDULE: Command = Command {
    name: "/schedule",
    aliases: &[],
    description: "List scheduled cron jobs",
    category: CommandCategory::Schedule,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_SCHEDULE_ADD: Command = Command {
    name: "/schedule-add",
    aliases: &[],
    description: "Add a scheduled task: /schedule-add <cron> <task>",
    category: CommandCategory::Schedule,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_SCHEDULE_REMOVE: Command = Command {
    name: "/schedule-remove",
    aliases: &[],
    description: "Remove a scheduled job: /schedule-remove <id>",
    category: CommandCategory::Schedule,
    handler: |_, _| Box::new(std::future::ready(())),
};
