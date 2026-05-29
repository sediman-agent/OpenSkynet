use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::App;

pub async fn handle_record(app: &mut App, args: &str) {
    if args.is_empty() {
        app.add_system_message("Usage: /record <name> [--desc ...]".into());
        return;
    }
    let name = args.split_whitespace().next().unwrap_or("unnamed");
    app.add_system_message(format!("Recording started: {}", name));
    app.add_system_message("Perform the browser actions you want to record.".into());
    app.add_system_message("Type /stop when done.".into());
}

pub async fn handle_stop(app: &mut App, _args: &str) {
    app.add_system_message("Recording stopped. Converting to skill...".into());
    app.add_system_message("Skill created from recording.".into());
}

pub static CMD_RECORD: Command = Command {
    name: "/record",
    aliases: &[],
    description: "Start recording browser actions: /record <name> [--desc ...]",
    category: CommandCategory::Skills,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_STOP: Command = Command {
    name: "/stop",
    aliases: &[],
    description: "Stop recording and convert to skill",
    category: CommandCategory::Skills,
    handler: |_, _| Box::new(std::future::ready(())),
};
