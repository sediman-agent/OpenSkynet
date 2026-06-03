use sediman_tui_core::command::{Command, CommandCategory};
use sediman_tui_core::styling;

use crate::app::{App, AppModal};

pub static CMD_THEMES: Command = Command {
    name: "/themes",
    aliases: &[],
    description: "Select color theme",
    category: CommandCategory::General,
};

pub async fn handle_themes(app: &mut App, _args: &str) {
    let names = styling::list_theme_names();
    let current_idx = names.iter().position(|n| n == &app.theme_name).unwrap_or(0);
    app.theme_picker_saved_theme = app.theme.clone();
    app.theme_picker_saved_name = app.theme_name.clone();
    app.theme_picker_names = names;
    app.theme_picker_selected = current_idx;
    app.active_modal = Some(AppModal::ThemePicker);
}

pub fn save_config_now(app: &App) {
    let config = crate::config::TuiConfig {
        theme: app.theme_name.clone(),
        permission_mode: app.permission.current_label().to_string(),
        side_panel_open: app.show_side_panel,
        side_panel_tab: match app.side_panel_tab {
            crate::app::SideTab::Skills => "Skills".into(),
            crate::app::SideTab::Memory => "Memory".into(),
            crate::app::SideTab::Schedule => "Schedule".into(),
            crate::app::SideTab::Status => "Status".into(),
        },
        headless: app.headless,
        coder_backend: app.coder_backend.clone(),
        search_mode: app.search_mode.clone(),
        update_frequency: crate::config::default_update_frequency(),
        last_update_check: None,
    };
    if let Err(e) = config.save() {
        eprintln!("Warning: {}", e);
    }
}
