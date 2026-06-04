use sediman_tui_core::renderer::{CellBuffer, Rect, Style, display_width};
use crate::app::App;

use super::messages::format_elapsed;

pub fn render_status_bar(buf: &mut CellBuffer, area: Rect, app: &App) {
    let t = &app.theme;
    let y = area.y;

    for sx in area.x..area.right() {
        buf.put_char(sx, y, ' ', Style::new().bg(t.background_panel).fg(t.text));
    }

    let mut x = area.x;

    if app.agent_running {
        let elapsed = format_elapsed(app.agent_start.elapsed().as_secs());
        let pill = format!(" \u{25cf} {} ", elapsed);
        buf.draw_str(x, y, &pill, Style::new().bg(t.primary).fg(t.background_darker));
        x += display_width(&pill);

        // Show streaming phase with enhanced indicators
        if !app.streaming_phase.is_empty() {
            let (phase_label, phase_color) = match app.streaming_phase.as_str() {
                "thinking" => ("thinking", t.warning),
                "planning" => ("planning", t.info),
                "executing" => ("executing", t.primary),
                "observing" => ("observing", t.primary),
                "reflecting" => ("reflecting", t.warning),
                "responding" => ("responding", t.success),
                "retrying" => ("retrying", t.error),
                _ => ("", t.text),
            };
            if !phase_label.is_empty() {
                let phase_pill = format!(" {} ", phase_label);
                buf.draw_str(x, y, &phase_pill, Style::new().bg(phase_color).fg(t.background_darker));
                x += display_width(&phase_pill);
            }
        }

        // Show retry countdown
        if let (Some(attempt), Some(max), Some(countdown)) = (app.retry_attempt, app.retry_max, app.retry_countdown) {
            if countdown > 0.0 {
                let retry_text = format!(" {} ({}/{}) {:.1}s ", "⟳", attempt, max, countdown);
                buf.draw_str(x, y, &retry_text, Style::new().bg(t.error).fg(t.background_darker));
                x += display_width(&retry_text);
            }
        }

        // Show validation confidence
        if let Some(confidence) = app.validation_confidence {
            let conf_color = if confidence >= 0.8 {
                t.success
            } else if confidence >= 0.5 {
                t.warning
            } else {
                t.error
            };
            let conf_text = format!(" {:.0}% ", confidence * 100.0);
            buf.draw_str(x, y, &conf_text, Style::new().bg(conf_color).fg(t.background_darker));
            x += display_width(&conf_text);
        }

        // Show validation issues count
        if let Some(issues) = app.validation_issues {
            if issues > 0 {
                let issues_text = format!(" ⚠ {} ", issues);
                buf.draw_str(x, y, &issues_text, Style::new().bg(t.warning).fg(t.background_darker));
                x += display_width(&issues_text);
            }
        }
    } else if app.task_count > 0 {
        let pill = format!(" {} ", app.task_count);
        buf.draw_str(x, y, &pill, Style::new().bg(t.background_darker).fg(t.text_muted));
        x += display_width(&pill);
    }

    let mode = app.permission.current_label();
    let mode_color = match mode {
        "acceptEdits" => t.success,
        "plan" => t.info,
        "auto" => t.error,
        _ => t.text,
    };
    let mode_text = format!(" {} ", mode);
    buf.draw_str(x, y, &mode_text, Style::new().bg(mode_color).fg(t.background_darker));
    x += display_width(&mode_text);

    let model = app.model.as_deref().unwrap_or("default");
    let model_text = format!(" {} ", model);
    let model_x = area.right().saturating_sub(display_width(&model_text));
    if model_x > x + 2 {
        buf.draw_str(model_x, y, &model_text, Style::new().bg(t.background_darker).fg(t.text_muted));
    }
}
