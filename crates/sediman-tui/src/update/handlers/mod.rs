//! Handler modules for the update system.

pub mod agent;
pub mod clipboard;
pub mod command;
pub mod editor;

pub use agent::handle_task;
pub use clipboard::{handle_copy, handle_paste};
pub use command::handle_slash;
pub use editor::handle_editor_key;
