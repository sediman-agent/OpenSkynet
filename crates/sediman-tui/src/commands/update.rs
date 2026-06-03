//! Update command handler - checks for and installs updates.

use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::App;

/// Handle the /update command.
pub async fn handle_update(app: &mut App, _args: &str) {
    // Show a toast that we're checking for updates
    app.show_toast("Checking for updates...".to_string());

    // Clone necessary data for the async task
    let current_version = env!("CARGO_PKG_VERSION").to_string();

    // Spawn a background task to check for updates
    let app_ref = unsafe { &mut *(app as *const _ as *mut App) };

    tokio::spawn(async move {
        match crate::updater::check_for_update().await {
            Ok(Some(release)) => {
                // Update available - show the modal
                app_ref.active_modal = Some(crate::app::AppModal::UpdateAvailable {
                    version: release.version().to_string(),
                    release_notes: release.body,
                    current_version,
                    selected: 0,
                    show_notes: false,
                    notes_scroll: 0,
                    installing: false,
                    install_progress: String::new(),
                });
            }
            Ok(None) => {
                // No update available
                app_ref.show_toast("Already up to date!".to_string());
            }
            Err(e) => {
                // Error checking for updates
                app_ref.show_toast(format!("Update check failed: {}", e));
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
