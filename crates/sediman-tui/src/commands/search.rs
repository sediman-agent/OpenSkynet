use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::App;

const SEARCH_MODES: &[&str] = &["auto", "simple", "advanced"];

/// `/search` — open picker to select search mode.
pub async fn handle_search(app: &mut App, _args: &str) {
    // Open picker, pre-select current mode
    app.search_mode_picker_selected = SEARCH_MODES.iter()
        .position(|&m| m == app.search_mode)
        .unwrap_or(0);
    app.active_modal = Some(crate::app::AppModal::SearchModePicker);
}

pub static CMD_SEARCH: Command = Command {
    name: "/search",
    aliases: &[],
    description: "Select search mode (auto|simple|advanced)",
    category: CommandCategory::Agent,
};
