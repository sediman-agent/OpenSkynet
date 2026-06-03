//! Scroll utilities for the TUI.

use crate::app::App;

/// Calculate the total number of scrollable lines based on current content.
/// This estimates the total height of all messages and running indicator.
fn calculate_total_content(app: &App) -> u16 {
    // Base: ~3 lines per message on average
    let message_lines = app.messages.len() as u16 * 3;

    // Running indicator: ~5 lines when active
    let running_lines = if app.agent_running { 5 } else { 0 };

    // Streaming text: estimate lines from current streaming text
    let streaming_lines = if app.agent_running && !app.streaming_text.is_empty() {
        // Count actual line breaks in streaming text (up to 20)
        let line_count = app.streaming_text.lines().count() as u16;
        line_count.min(20)
    } else {
        0
    };

    message_lines + running_lines + streaming_lines + 10 // +10 for padding
}

/// Scroll up by a specified amount (show older content).
pub fn scroll_up(app: &mut App, amount: u16) {
    let max = calculate_total_content(app);
    app.scroll_offset = (app.scroll_offset + amount).min(max);
    app.auto_scroll = false;
}

/// Scroll down by a specified amount (show newer content).
pub fn scroll_down(app: &mut App, amount: u16) {
    app.scroll_offset = app.scroll_offset.saturating_sub(amount);
    app.auto_scroll = false;
}
