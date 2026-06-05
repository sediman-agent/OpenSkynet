//! Update command handler - checks for and installs updates.

use sediman_tui_core::command::{Command, CommandCategory};
use sediman_tui_core::event::AppEvent;

use crate::app::App;
use crate::error::try_send;

/// Handle the /update command.
pub async fn handle_update(app: &mut App, _args: &str) {
    app.show_toast("Checking for updates...".to_string());

    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let tx = app.event_tx.clone();

    tokio::spawn(async move {
        match crate::updater::check_for_update().await {
            Ok(Some(release)) => {
                if let Some(tx) = &tx {
                    try_send(tx, AppEvent::UpdateAvailable {
                        version: release.version().to_string(),
                        release_notes: release.body,
                        current_version,
                    });
                }
            }
            Ok(None) => {
                if let Some(tx) = &tx {
                    try_send(tx, AppEvent::CommandOutput("Already up to date!".into()));
                }
            }
            Err(e) => {
                if let Some(tx) = &tx {
                    try_send(tx, AppEvent::CommandOutput(format!("Update check failed: {}", e)));
                }
            }
        }
    });
}

pub static CMD_UPDATE: Command = Command {
    name: "/update",
    aliases: &["/upgrade"],
    description: "Check for and install updates",
    category: CommandCategory::Utilities,
};
