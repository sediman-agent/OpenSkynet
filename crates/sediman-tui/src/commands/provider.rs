use sediman_tui_core::command::{Command, CommandCategory};

use crate::app::App;

pub async fn handle_provider(app: &mut App, _args: &str) {
    app.provider_picker_idx = 0;
    app.provider_picker_scroll = 0;
    app.active_modal = Some(crate::app::AppModal::ProviderPicker);
}

pub static CMD_PROVIDER: Command = Command {
    name: "/provider",
    aliases: &[],
    description: "Select provider",
    category: CommandCategory::Agent,
};
