use sediman_tui_core::renderer::{CellBuffer, Rect, Style, TextAttributes};
use crate::app::{App, AgentMode};

pub fn render_input(buf: &mut CellBuffer, area: Rect, app: &mut App) {
    let t = &app.theme;

    let mode_color = match app.agent_mode {
        AgentMode::Manager => t.primary,
        AgentMode::Browser => t.success,
        AgentMode::Coder => t.warning,
        AgentMode::Terminator => t.error,
    };
    let mode_label = app.agent_mode.label();

    // ── Row 0: Muted separator ──
    let sep_y = area.y;
    for sx in area.x..area.right() {
        buf.put_char(sx, sep_y, '\u{2500}', Style::new().fg(t.border_dim).bg(t.background));
    }

    let x_left = area.x + 1;
    let x_right = area.right().saturating_sub(2);
    let border = Style::new().fg(t.border).bg(t.background);
    let panel = Style::new().bg(t.background).fg(t.text);

    // ── Row 1: Top border ╭──────────────────╮ ──
    let row_top = area.y + 1;
    buf.put_char(x_left, row_top, '\u{256d}', border);
    buf.put_char(x_right, row_top, '\u{256e}', border);
    for sx in (x_left + 1)..x_right {
        buf.put_char(sx, row_top, '\u{2500}', border);
    }

    // ── Rows 2..N-1: Input content (mode badge + editor) ──
    let row_bot = area.y + area.height.saturating_sub(1);
    let content_start = area.y + 2;
    let content_rows = row_bot.saturating_sub(content_start);

    // Fill all content rows with bg
    for row in content_start..row_bot {
        for sx in x_left..=x_right {
            buf.put_char(sx, row, ' ', panel);
        }
        buf.put_char(x_left, row, '\u{2502}', Style::new().fg(mode_color).bg(t.background));
        buf.put_char(x_right, row, '\u{2502}', border);
    }

    // Mode badge on first content row
    let badge = format!(" {} ", mode_label);
    let badge_style = Style::new().bg(mode_color).fg(t.background).add_modifier(TextAttributes::bold());
    buf.draw_str(x_left + 2, content_start, &badge, badge_style);

    // Editor prompt
    let prompt = if app.agent_running { "\u{25cf} " } else { "\u{276f} " };
    app.editor.set_prompt(prompt);

    // Inner editor area: starts after badge on first row, full width on subsequent rows
    let badge_w = badge.chars().count() as u16;
    let inner_start = x_left + 2 + badge_w + 1;
    let inner_w = x_right.saturating_sub(inner_start);

    if inner_w > 0 && content_rows > 0 {
        let inner = Rect::new(inner_start, content_start, inner_w, content_rows);
        app.editor.render_into(buf, inner, &app.theme);
    }

    // ── Last row: Bottom border ╰──────────────────╯ + hints ──
    buf.put_char(x_left, row_bot, '\u{2570}', Style::new().fg(mode_color).bg(t.background));
    buf.put_char(x_right, row_bot, '\u{256f}', border);
    for sx in (x_left + 1)..x_right {
        buf.put_char(sx, row_bot, '\u{2500}', border);
    }

    let hint = if app.agent_running {
        " esc cancel"
    } else {
        " enter send \u{2502} tab mode \u{2502} / commands"
    };
    let hint_x = x_right.saturating_sub(hint.len() as u16 + 1);
    buf.draw_str(hint_x, row_bot, hint, Style::new().fg(t.text_muted).bg(t.background));
}
