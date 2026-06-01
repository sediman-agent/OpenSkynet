use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::{App, AppModal, ModalLine};

/// Run a sediman-sandbox CLI command and return stdout.
async fn run_sandbox(args: &[&str]) -> Result<String, String> {
    let output = tokio::process::Command::new("sediman-sandbox")
        .args(args)
        .output()
        .await
        .map_err(|_| "sediman-sandbox not found in PATH".to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).trim().to_string())
    }
}

pub async fn handle_checkpoint(app: &mut App, _args: &str) {
    // Try the sandbox CLI first
    match run_sandbox(&["checkpoint", "list"]).await {
        Ok(output) if !output.is_empty() => {
            let mut lines = vec![ModalLine::heading("  Checkpoints")];
            for line in output.lines().take(30) {
                lines.push(ModalLine::normal(format!("  {}", line)));
            }
            app.active_modal = Some(AppModal::Info {
                title: "Checkpoints".into(),
                lines,
                scroll: 0,
            });
            return;
        }
        _ => {}
    }

    // Fallback: scan directory
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
    let cp_dir = std::path::PathBuf::from(format!("{}/.terminator/sandbox/checkpoints", home));

    if !cp_dir.exists() {
        app.add_system_message("No checkpoints yet.".into());
        return;
    }

    let mut entries: Vec<_> = match std::fs::read_dir(&cp_dir) {
        Ok(rd) => rd.filter_map(|e| e.ok()).collect(),
        Err(e) => {
            app.add_error_message(format!("Cannot read checkpoints: {}", e));
            return;
        }
    };

    if entries.is_empty() {
        app.add_system_message("No checkpoints yet.".into());
        return;
    }

    entries.sort_by(|a, b| {
        b.metadata().and_then(|m| m.modified()).ok()
            .cmp(&a.metadata().and_then(|m| m.modified()).ok())
    });

    let mut lines = vec![ModalLine::heading("  Checkpoints")];
    for entry in entries.iter().take(30) {
        if !entry.path().is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let meta_path = entry.path().join("checkpoint.json");
        let label = if meta_path.exists() {
            match std::fs::read_to_string(&meta_path) {
                Ok(content) => {
                    if let Ok(info) = serde_json::from_str::<serde_json::Value>(&content) {
                        let cp_name = info.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        if cp_name.is_empty() {
                            name.clone()
                        } else {
                            format!("{} ({})", cp_name, name)
                        }
                    } else {
                        name.clone()
                    }
                }
                Err(_) => name.clone(),
            }
        } else {
            name.clone()
        };
        lines.push(ModalLine::normal(format!("  {}", label)));
    }

    app.active_modal = Some(AppModal::Info {
        title: "Checkpoints".into(),
        lines,
        scroll: 0,
    });
}

pub async fn handle_checkpoint_create(app: &mut App, args: &str) {
    let args = args.trim();
    if args.is_empty() {
        app.add_system_message("Usage: /checkpoint-create <dir> [--name=<name>]".into());
        return;
    }

    let parts: Vec<&str> = args.split_whitespace().collect();
    let target = parts[0];
    let target_path = std::path::Path::new(target);
    if !target_path.exists() {
        app.add_error_message(format!("Directory not found: {}", target));
        return;
    }

    let name = parts.iter().find(|p| p.starts_with("--name=")).map(|p| &p[7..]);
    let mut cmd_args = vec!["checkpoint", "create", target];
    let name_arg;
    if let Some(n) = name {
        name_arg = format!("--name={}", n);
        cmd_args.push(&name_arg);
    }

    match run_sandbox(&cmd_args).await {
        Ok(output) => app.add_system_message(format!("✓ {}", output)),
        Err(e) => app.add_error_message(format!("✗ {}", e)),
    }
}

pub async fn handle_checkpoint_revert(app: &mut App, args: &str) {
    let args = args.trim();
    if args.is_empty() {
        app.add_system_message("Usage: /checkpoint-revert <dir> <id>".into());
        return;
    }

    let parts: Vec<&str> = args.split_whitespace().collect();
    if parts.len() < 2 {
        app.add_system_message("Usage: /checkpoint-revert <dir> <id>".into());
        return;
    }

    let target = parts[0];
    let cp_id = parts[1];
    let target_path = std::path::Path::new(target);
    if !target_path.exists() {
        app.add_error_message(format!("Directory not found: {}", target));
        return;
    }

    let id_arg = format!("--id={}", cp_id);
    match run_sandbox(&["checkpoint", "revert", target, &id_arg]).await {
        Ok(output) => app.add_system_message(format!("✓ {}", output)),
        Err(e) => app.add_error_message(format!("✗ {}", e)),
    }
}

pub async fn handle_rewind(app: &mut App, args: &str) {
    let cp_id = args.trim();
    if cp_id.is_empty() {
        app.add_system_message("Usage: /rewind <checkpoint-id>".into());
        app.add_system_message("Use /checkpoint to list IDs.".into());
        return;
    }

    let cwd = std::env::current_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| ".".into());

    let id_arg = format!("--id={}", cp_id);
    match run_sandbox(&["checkpoint", "revert", &cwd, &id_arg]).await {
        Ok(output) => app.add_system_message(format!("✓ {}", output)),
        Err(e) => app.add_error_message(format!("✗ {}", e)),
    }
}

pub async fn handle_branch(app: &mut App, args: &str) {
    let args = args.trim();
    if args.is_empty() {
        app.add_system_message("Usage: /branch <name> [dir]".into());
        return;
    }

    let parts: Vec<&str> = args.split_whitespace().collect();
    let name = parts[0];
    let target = if parts.len() > 1 {
        parts[1].to_string()
    } else {
        std::env::current_dir()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| ".".into())
    };

    let target_path = std::path::Path::new(&target);
    if !target_path.exists() {
        app.add_error_message(format!("Directory not found: {}", target));
        return;
    }

    let name_arg = format!("--name={}", name);
    match run_sandbox(&["checkpoint", "create", &target, &name_arg]).await {
        Ok(output) => app.add_system_message(format!("✓ Branch saved: {}", output)),
        Err(e) => app.add_error_message(format!("✗ {}", e)),
    }
}

pub async fn handle_branches(app: &mut App, args: &str) {
    // /branches is an alias for /checkpoint
    handle_checkpoint(app, args).await;
}

// ── Command definitions ──────────────────────────────────────────

pub static CMD_CHECKPOINT: Command = Command {
    name: "/checkpoint",
    aliases: &[],
    description: "List filesystem checkpoints",
    category: CommandCategory::General,
};

pub static CMD_CHECKPOINT_CREATE: Command = Command {
    name: "/checkpoint-create",
    aliases: &[],
    description: "Create a checkpoint: /checkpoint-create <dir> [--name=<name>]",
    category: CommandCategory::General,
};

pub static CMD_CHECKPOINT_REVERT: Command = Command {
    name: "/checkpoint-revert",
    aliases: &[],
    description: "Revert directory to checkpoint: /checkpoint-revert <dir> <id>",
    category: CommandCategory::General,
};

pub static CMD_REWIND: Command = Command {
    name: "/rewind",
    aliases: &[],
    description: "Revert current directory to a checkpoint",
    category: CommandCategory::General,
};

pub static CMD_BRANCH: Command = Command {
    name: "/branch",
    aliases: &[],
    description: "Save named checkpoint: /branch <name> [dir]",
    category: CommandCategory::General,
};

pub static CMD_BRANCHES: Command = Command {
    name: "/branches",
    aliases: &[],
    description: "List saved branch checkpoints",
    category: CommandCategory::General,
};
