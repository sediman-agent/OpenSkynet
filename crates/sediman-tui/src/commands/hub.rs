use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::App;

pub async fn handle_hub_browse(app: &mut App, args: &str) {
    let category = if args.is_empty() { None } else { Some(args) };
    match app.bridge.hub_browse(category).await {
        Ok(skills) => {
            if skills.is_empty() {
                app.add_system_message("No skills found in hub.".into());
                return;
            }
            app.add_system_message(format!("Hub Skills ({})", skills.len()));
            for s in &skills {
                app.add_system_message(format!(
                    "  {} v{} by {} - {} [{}]",
                    s.name, s.version, s.author, s.description, s.trust
                ));
            }
        }
        Err(e) => app.add_error_message(format!("Hub browse failed: {}", e)),
    }
}

pub async fn handle_hub_search(app: &mut App, args: &str) {
    if args.is_empty() {
        app.add_system_message("Usage: /hub search <query>".into());
        return;
    }
    match app.bridge.hub_search(args).await {
        Ok(skills) => {
            if skills.is_empty() {
                app.add_system_message("No matches found.".into());
                return;
            }
            app.add_system_message(format!("Search results for '{}'", args));
            for s in &skills {
                app.add_system_message(format!("  {} - {}", s.name, s.description));
            }
        }
        Err(e) => app.add_error_message(format!("Search failed: {}", e)),
    }
}

pub async fn handle_hub_install(app: &mut App, args: &str) {
    if args.is_empty() {
        app.add_system_message("Usage: /hub install <name> [--force]".into());
        return;
    }
    let force = args.contains("--force");
    let name = args.trim().trim_end_matches(" --force");
    app.add_system_message(format!("Installing {} from hub...", name));
    match app.bridge.hub_install(name, force).await {
        Ok(_) => app.add_system_message(format!("Installed {}", name)),
        Err(e) => app.add_error_message(format!("Install failed: {}", e)),
    }
}

pub async fn handle_hub_info(app: &mut App, args: &str) {
    if args.is_empty() {
        app.add_system_message("Usage: /hub info <name>".into());
        return;
    }
    match app.bridge.hub_info(args).await {
        Ok(skill) => {
            app.add_system_message(format!("{} v{} by {}", skill.name, skill.version, skill.author));
            app.add_system_message(format!("  {}", skill.description));
            app.add_system_message(format!("  Category: {}", skill.category));
            app.add_system_message(format!("  Trust: {}", skill.trust));
        }
        Err(e) => app.add_error_message(format!("Info failed: {}", e)),
    }
}

pub async fn handle_hub_publish(app: &mut App, args: &str) {
    if args.is_empty() {
        app.add_system_message("Usage: /hub publish <name>".into());
        return;
    }
    app.add_system_message(format!("Publishing {}...", args));
    app.add_system_message("Publish requires a GitHub token. Use the Python CLI for now.".into());
}

pub static CMD_HUB_BROWSE: Command = Command {
    name: "/hub browse",
    aliases: &[],
    description: "Browse Skills Hub: /hub browse [--category <cat>]",
    category: CommandCategory::Hub,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_HUB_SEARCH: Command = Command {
    name: "/hub search",
    aliases: &[],
    description: "Search Skills Hub: /hub search <query>",
    category: CommandCategory::Hub,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_HUB_INSTALL: Command = Command {
    name: "/hub install",
    aliases: &[],
    description: "Install a hub skill: /hub install <name> [--force]",
    category: CommandCategory::Hub,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_HUB_INFO: Command = Command {
    name: "/hub info",
    aliases: &[],
    description: "Show hub skill details: /hub info <name>",
    category: CommandCategory::Hub,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_HUB_PUBLISH: Command = Command {
    name: "/hub publish",
    aliases: &[],
    description: "Publish a local skill: /hub publish <name>",
    category: CommandCategory::Hub,
    handler: |_, _| Box::new(std::future::ready(())),
};
