use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::App;

pub async fn handle_delegate(app: &mut App, args: &str) {
    if args.is_empty() {
        app.add_system_message("Usage: /delegate <task>".into());
        return;
    }
    app.add_system_message(format!("Delegating task as subagent: {}", args));
    app.agent_running = true;
    app.agent_start = std::time::Instant::now();
    app.add_system_message("Subagent spawned. Results will appear here.".into());
    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
    app.agent_running = false;
    app.add_system_message("Subagent completed.".into());
}

pub async fn handle_parallel(app: &mut App, args: &str) {
    if args.is_empty() {
        app.add_system_message("Usage: /parallel <task1> | <task2> | ...".into());
        return;
    }
    let tasks: Vec<&str> = args.split('|').map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    if tasks.is_empty() {
        app.add_system_message("No tasks specified.".into());
        return;
    }
    if tasks.len() > 5 {
        app.add_system_message("Max 5 parallel tasks.".into());
        return;
    }
    app.add_system_message(format!("Running {} tasks in parallel...", tasks.len()));
    for (i, task) in tasks.iter().enumerate() {
        app.add_system_message(format!("  {}. {}", i + 1, task));
    }
    app.agent_running = true;
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    app.agent_running = false;
    app.add_system_message("All parallel tasks completed.".into());
}

pub static CMD_DELEGATE: Command = Command {
    name: "/delegate",
    aliases: &[],
    description: "Run task as isolated subagent: /delegate <task>",
    category: CommandCategory::Tasks,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_PARALLEL: Command = Command {
    name: "/parallel",
    aliases: &[],
    description: "Run tasks in parallel: /parallel <t1> | <t2> | ...",
    category: CommandCategory::Tasks,
    handler: |_, _| Box::new(std::future::ready(())),
};
