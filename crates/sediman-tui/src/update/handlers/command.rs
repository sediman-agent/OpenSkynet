//! Slash command execution handler.

use crate::app::App;

/// Execute a slash command.
pub async fn handle_slash(app: &mut App, input: &str) {
    let (cmd, rest) = parse_command(input);

    match cmd {
        // Core commands
        "help" | "h" => {
            app.active_modal = Some(crate::app::AppModal::Help { scroll: 0 });
        }
        "exit" | "quit" | "q" => {
            app.running = false;
        }
        "clear" => {
            app.messages.clear();
            app.add_system_message("Messages cleared.".into());
        }
        "reset" => {
            app.messages.clear();
            app.step_log.clear();
            app.agent_running = false;
            app.add_system_message("Reset complete.".into());
        }
        "status" => {
            let status = format!(
                "Provider: {}\nModel: {}\nTasks completed: {}\nAgent running: {}\nMessages: {}",
                app.provider,
                app.model.as_deref().unwrap_or("default"),
                app.task_count,
                app.agent_running,
                app.messages.len()
            );
            app.add_system_message(status);
        }
        "compress" => {
            if app.messages.len() > 1 {
                // Compress old messages (keep last 10)
                let compressed_count = app.messages.len().saturating_sub(10);
                app.messages = app.messages.split_off(app.messages.len().saturating_sub(10));
                app.add_system_message(format!("Compressed {} old messages.", compressed_count));
            } else {
                app.add_system_message("Not enough messages to compress.".into());
            }
        }

        // Agent commands
        "models" | "model" => {
            crate::commands::model::handle_models(app, rest).await;
        }
        "provider" => {
            crate::commands::provider::handle_provider(app, rest).await;
        }
        "soul" => {
            crate::commands::soul::handle_soul(app, rest).await;
        }
        "themes" => {
            crate::commands::theming::handle_themes(app, rest).await;
        }
        "coder" => {
            crate::commands::coder::handle_coder(app, rest).await;
        }
        "search" => {
            crate::commands::search::handle_search(app, rest).await;
        }
        "plan" => {
            crate::commands::plan::handle_plan(app, rest).await;
        }

        // Skills
        "skills" | "skill" => {
            crate::commands::skills::handle_skills(app, rest).await;
        }

        // Memory
        "memory" => {
            crate::commands::memory::handle_memory(app, rest).await;
        }
        "remember" => {
            crate::commands::memory::handle_remember(app, rest).await;
        }

        // Schedule
        "schedule" => {
            crate::commands::schedule::handle_schedule(app, rest).await;
        }

        // Sessions
        "sessions" => {
            crate::commands::sessions::handle_sessions(app, rest).await;
        }

        // Browser
        "browser" => {
            crate::commands::browser::handle_browser(app, rest).await;
        }

        // Tasks
        "delegate" => {
            crate::commands::delegate::handle_delegate(app, rest).await;
        }
        "parallel" => {
            crate::commands::delegate::handle_parallel(app, rest).await;
        }

        // Integrations
        "connect" => {
            crate::commands::integration::handle_connect(app, rest).await;
        }

        // Checkpoint
        "checkpoint" => {
            crate::commands::checkpoint::handle_checkpoint(app, rest).await;
        }
        "checkpoint-create" => {
            crate::commands::checkpoint::handle_checkpoint_create(app, rest).await;
        }
        "checkpoint-revert" => {
            crate::commands::checkpoint::handle_checkpoint_revert(app, rest).await;
        }
        "rewind" => {
            crate::commands::checkpoint::handle_rewind(app, rest).await;
        }
        "branch" => {
            crate::commands::checkpoint::handle_branch(app, rest).await;
        }
        "branches" => {
            crate::commands::checkpoint::handle_branches(app, rest).await;
        }

        // Utilities
        "doctor" => {
            crate::commands::doctor::handle_doctor(app, rest).await;
        }
        "update" | "upgrade" => {
            crate::commands::update::handle_update(app, rest).await;
        }

        _ => {
            app.add_error_message(format!("Unknown command: /{}", cmd));
        }
    }
}

/// Parse a command string into (command, args).
fn parse_command(input: &str) -> (&str, &str) {
    let input = input.trim_start_matches('/');
    let parts: Vec<&str> = input.splitn(2, ' ').collect();
    if parts.len() >= 2 {
        (parts[0], parts[1])
    } else {
        (input, "")
    }
}
