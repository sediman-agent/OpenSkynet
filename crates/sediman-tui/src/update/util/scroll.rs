//! Scroll utilities for the TUI.

use crate::app::App;

/// Scroll up by a specified amount.
pub fn scroll_up(app: &mut App, amount: u16) {
    app.scroll_offset = app.scroll_offset.saturating_sub(amount);
}

/// Scroll down by a specified amount.
pub fn scroll_down(app: &mut App, amount: u16) {
    let max = 2000u16;
    app.scroll_offset = (app.scroll_offset + amount).min(max);
}
