use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::App;

pub async fn handle_skills(app: &mut App, _args: &str) {
    match app.bridge.list_skills().await {
        Ok(skills) => {
            if skills.is_empty() {
                app.add_system_message("No skills saved yet.".into());
                return;
            }
            app.add_system_message(format!("Skills ({})", skills.len()));
            for s in &skills {
                let cat = s.category.as_deref().unwrap_or("general");
                app.add_system_message(format!(
                    "  {} v{} - {} [{}]",
                    s.name, s.version, s.description, cat
                ));
            }
        }
        Err(e) => app.add_error_message(format!("Failed to list skills: {}", e)),
    }
}

pub async fn handle_skill(app: &mut App, args: &str) {
    if args.is_empty() || args == "list" {
        handle_skills(app, args).await;
        return;
    }
    match app.bridge.get_skill(args).await {
        Ok(skill) => {
            app.add_system_message(format!("{} v{}", skill.name, skill.version));
            app.add_system_message(format!("  {}", skill.description));
            if let Some(ref cat) = skill.category {
                app.add_system_message(format!("  Category: {}", cat));
            }
            app.add_system_message(format!("  Steps: {}", skill.steps.len()));
            for (i, step) in skill.steps.iter().enumerate() {
                let url = step.url.as_deref().unwrap_or("");
                app.add_system_message(format!("   {}. {} {}", i + 1, step.description, url));
            }
            if !skill.when_to_use.is_empty() {
                app.add_system_message("  When to use:".into());
                for w in &skill.when_to_use {
                    app.add_system_message(format!("    - {}", w));
                }
            }
            if !skill.pitfalls.is_empty() {
                app.add_system_message("  Pitfalls:".into());
                for p in &skill.pitfalls {
                    app.add_system_message(format!("    - {}", p));
                }
            }
        }
        Err(e) => app.add_error_message(format!("Skill not found: {}", e)),
    }
}

pub async fn handle_run_skill(app: &mut App, args: &str) {
    if args.is_empty() {
        app.add_system_message("Usage: /run-skill <name>".into());
        return;
    }
    app.add_system_message(format!("Executing skill: {}", args));
    app.agent_running = true;
    app.agent_start = std::time::Instant::now();

    match app.bridge.execute_skill(args).await {
        Ok(result) => {
            let status = if result.success { "Done" } else { "Failed" };
            app.add_system_message(format!("{} skill ({})s", status, result.elapsed_secs));
            app.last_result = Some(result);
        }
        Err(e) => {
            app.add_error_message(format!("Skill failed: {}", e));
        }
    }
    app.agent_running = false;
}

pub static CMD_SKILLS: Command = Command {
    name: "/skills",
    aliases: &["/skill list"],
    description: "List all saved skills",
    category: CommandCategory::Skills,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_SKILL: Command = Command {
    name: "/skill",
    aliases: &[],
    description: "Show skill details: /skill <name>",
    category: CommandCategory::Skills,
    handler: |_, _| Box::new(std::future::ready(())),
};

pub static CMD_RUN_SKILL: Command = Command {
    name: "/run-skill",
    aliases: &[],
    description: "Execute a saved skill: /run-skill <name>",
    category: CommandCategory::Skills,
    handler: |_, _| Box::new(std::future::ready(())),
};
