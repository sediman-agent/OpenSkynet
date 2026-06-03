//! Modal key handler modules.

pub mod api_key_prompt;
pub mod browser_mode_picker;
pub mod coder_picker;
pub mod connect_picker;
pub mod doctor;
pub mod help;
pub mod memory_editor;
pub mod memory_menu;
pub mod memory_system_picker;
pub mod model_picker;
pub mod provider_picker;
pub mod schedule_browser;
pub mod search_mode_picker;
pub mod session_browser;
pub mod skill_browser;
pub mod soul_editor;
pub mod theme_picker;

pub use api_key_prompt::handle_api_key_prompt;
pub use browser_mode_picker::handle_browser_mode_picker;
pub use coder_picker::handle_coder_picker;
pub use connect_picker::handle_connect_picker;
pub use doctor::handle_doctor;
pub use help::{handle_help_modal, handle_info_modal};
pub use memory_editor::handle_memory_editor;
pub use memory_menu::handle_memory_menu;
pub use memory_system_picker::handle_memory_system_picker;
pub use model_picker::handle_model_picker;
pub use provider_picker::handle_provider_picker;
pub use schedule_browser::handle_schedule_browser;
pub use search_mode_picker::handle_search_mode_picker;
pub use session_browser::handle_session_browser;
pub use skill_browser::handle_skill_browser;
pub use soul_editor::handle_soul_editor;
pub use theme_picker::handle_theme_picker;
