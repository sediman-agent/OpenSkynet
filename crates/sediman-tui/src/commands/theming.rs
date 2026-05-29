use sediman_tui_core::command::{AppContext, Command, CommandCategory};
use sediman_tui_core::styling::themes;

use crate::app::App;

pub static CMD_THEMES: Command = Command {
    name: "/themes",
    aliases: &["/theme"],
    description: "List and switch color themes",
    category: CommandCategory::General,
    handler: |_ctx: &AppContext, _args: &str| {
        Box::new(async {})
    },
};

pub async fn handle_themes(app: &mut App, args: &str) {
    let name = args.trim();
    if name.is_empty() {
        let names = themes::list_theme_names();
        app.add_system_message(format!("Available themes: {}", names.join(", ")));
        return;
    }
    if let Some(theme) = themes::load_theme(name) {
        app.theme = theme;
        app.add_system_message(format!("Theme switched to: {}", name));
    } else {
        app.add_system_message(format!("Unknown theme: {}. Available: {}", name, themes::list_theme_names().join(", ")));
    }
}
