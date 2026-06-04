//! Message rendering with newest messages at bottom and inline sections.
//!
//! Features:
//! - Chat-style rendering (newest messages at bottom)
//! - Inline sections during streaming (Thinking, Steps, Response all visible)
//! - Collapsible sections with live content
//! - Auto-scroll with pause-on-scroll-up

use std::cell::RefCell;

use sediman_tui_core::renderer::{CellBuffer, Color, Line, Rect, Style, TextAttributes, display_width};
use sediman_tui_core::markdown;
use unicode_width::UnicodeWidthChar;

use crate::app::{App, ChatMessage, AgentTab};

thread_local! {
    static LINE_CACHE: RefCell<(u64, u16, u16, Vec<MessageLine>)> = RefCell::new((0, 0, 0, Vec::new()));
}

pub fn render_messages(buf: &mut CellBuffer, area: Rect, app: &mut App) {
    if app.show_banner && app.messages.is_empty() {
        super::banner::render_banner(buf, area, app);
        return;
    }

    if app.messages.is_empty() {
        super::banner::render_idle(buf, area, app);
        return;
    }

    let max_width = area.width.saturating_sub(6) as usize;

    let need_rebuild = LINE_CACHE.with(|cache| {
        let cached = cache.borrow();
        cached.0 != app.render_version
            || cached.1 != area.width
            || cached.2 != area.height
    });

    if need_rebuild {
        let mut new_lines: Vec<MessageLine> = Vec::new();

        if app.agent_running {
            render_streaming_sections(&mut new_lines, app, max_width, area);
        }

        let skip_last = app.agent_running && !app.messages.is_empty();
        let end = app.messages.len().saturating_sub(if skip_last { 1 } else { 0 });
        for msg in app.messages.iter().take(end) {
            render_completed_message(msg, &mut new_lines, app, max_width);
        }

        LINE_CACHE.with(|cache| {
            let mut cached = cache.borrow_mut();
            cached.0 = app.render_version;
            cached.1 = area.width;
            cached.2 = area.height;
            cached.3 = new_lines;
        });
    }

    let total_lines = LINE_CACHE.with(|cache| cache.borrow().3.len()) as u16;
    let visible_height = area.height;
    let max_scroll = total_lines.saturating_sub(visible_height);

    handle_scroll(app, max_scroll);
    let scroll = max_scroll.min(app.scroll_offset);
    if app.scroll_offset > max_scroll {
        app.scroll_offset = max_scroll;
    }

    LINE_CACHE.with(|cache| {
        render_lines(buf, area, &cache.borrow().3, scroll, visible_height, total_lines, app);
    });
}

fn render_streaming_sections(lines: &mut Vec<MessageLine>, app: &mut App, max_width: usize, _area: Rect) {
    let spinner = app.spinner_char();
    let elapsed = app.agent_start.elapsed().as_secs();
    let elapsed_str = format_elapsed(elapsed);
    let step_count = app.step_log.len().saturating_sub(1);
    let last_step = app.step_log.last()
        .map(|s| truncate_end(s, max_width.saturating_sub(18)))
        .unwrap_or_else(|| "Starting...".into());

    lines.push(MessageLine::empty());
    lines.push(MessageLine::text(
        format!("  {} Working\u{2026} {} \u{b7} {} steps", spinner, elapsed_str, step_count),
        Style::new().fg(app.theme.primary).add_modifier(TextAttributes::bold()),
    ));
    lines.push(MessageLine::text(
        format!("    {}", last_step),
        Style::new().fg(app.theme.text_muted),
    ));
    lines.push(MessageLine::empty());

    let has_thinking = !app.streaming_thinking.is_empty();
    let has_response = !app.streaming_response.is_empty();
    let has_execution = !app.streaming_execution.is_empty();
    let has_steps = app.step_log.len() > 1;
    let is_thinking_phase = app.streaming_phase == "thinking" || app.streaming_phase == "planning";

    if has_thinking || has_steps {
        if has_thinking {
            render_inline_section(
                lines, app, max_width,
                "\u{25c6}", "Thinking", &app.streaming_thinking,
                app.theme.warning, app.theme.text_muted,
                app.thinking_expanded, is_thinking_phase, 10,
            );
            if has_steps {
                lines.push(MessageLine::empty());
            }
        }

        if has_steps {
            render_inline_steps(lines, app, max_width);
            if has_response || has_execution {
                lines.push(MessageLine::empty());
            }
        }
    }

    if has_response || has_execution {
        let is_response_phase = !is_thinking_phase && app.streaming_phase != "executing";
        let combined = if has_response && has_execution {
            format!("{}\n{}", app.streaming_execution, app.streaming_response)
        } else if has_response {
            app.streaming_response.clone()
        } else {
            app.streaming_execution.clone()
        };
        let phase_label = if has_response && has_execution || has_execution {
            "Output"
        } else {
            "Response"
        };
        render_inline_section(
            lines, app, max_width,
            "\u{25b6}", phase_label, &combined,
            app.theme.info, app.theme.text,
            true, is_response_phase, 0,
        );
    }
}

fn render_inline_section(
    lines: &mut Vec<MessageLine>,
    app: &App,
    max_width: usize,
    icon: &str,
    label: &str,
    content: &str,
    header_color: Color,
    content_color: Color,
    expanded: bool,
    is_active: bool,
    max_content_lines: usize,
) {
    let header = format!("  {} {}", icon, label);
    let expand_icon = if expanded { "\u{25bc}" } else { "\u{25b6}" };
    let header_full = format!("{} {}", header, expand_icon);
    lines.push(MessageLine::text(
        header_full,
        Style::new().fg(header_color).add_modifier(TextAttributes::bold()),
    ));

    if !expanded {
        lines.push(MessageLine::text(
            "    (collapsed)",
            Style::new().fg(app.theme.text_muted),
        ));
        return;
    }

    let content_lines: Vec<&str> = content.lines().collect();
    let total = content_lines.len();
    let show: Vec<&str> = if max_content_lines > 0 && total > max_content_lines {
        let start = total.saturating_sub(max_content_lines);
        content_lines[start..].to_vec()
    } else {
        content_lines
    };

    if max_content_lines > 0 && total > max_content_lines {
        let skipped = total.saturating_sub(max_content_lines);
        lines.push(MessageLine::text(
            format!("    \u{2026} {} earlier lines", skipped),
            Style::new().fg(app.theme.text_muted),
        ));
    }

    for (i, text_line) in show.iter().enumerate() {
        let is_last = i == show.len() - 1;
        let cursor = if is_last && is_active { "\u{2588}" } else { "" };
        if text_line.is_empty() {
            lines.push(MessageLine::empty());
        } else {
            push_wrapped(lines, &format!("    {}{}", text_line, cursor),
                Style::new().fg(content_color), max_width);
        }
    }
}

fn render_inline_steps(lines: &mut Vec<MessageLine>, app: &App, max_width: usize) {
    let step_count = app.step_log.len().saturating_sub(1);
    let expand_icon = if app.steps_expanded { "\u{25bc}" } else { "\u{25b6}" };
    lines.push(MessageLine::text(
        format!("  \u{25b8} Steps ({}) {}", step_count, expand_icon),
        Style::new().fg(app.theme.info).add_modifier(TextAttributes::bold()),
    ));

    if !app.steps_expanded {
        if step_count > 0 {
            let last = app.step_log.last().map(|s| truncate_end(s, max_width.saturating_sub(4))).unwrap_or_default();
            lines.push(MessageLine::text(
                format!("    {}", last),
                Style::new().fg(app.theme.text_muted),
            ));
        }
        return;
    }

    let max_show = 5usize;
    let total = app.step_log.len();
    let show: Vec<&String> = if total > max_show {
        app.step_log.iter().rev().take(max_show).collect::<Vec<_>>().into_iter().rev().collect()
    } else {
        app.step_log.iter().collect()
    };

    if total > max_show {
        lines.push(MessageLine::text(
            format!("    \u{2026} {} earlier steps", total.saturating_sub(max_show)),
            Style::new().fg(app.theme.text_muted),
        ));
    }

    for step in &show {
        render_structured_step(step, lines, app, max_width);
    }
}

fn render_completed_message(
    msg: &ChatMessage,
    lines: &mut Vec<MessageLine>,
    app: &App,
    max_width: usize,
) {
    match msg {
        ChatMessage::User { text, task_num } => {
            lines.push(MessageLine::empty());
            lines.push(MessageLine::text(
                format!("  \u{27a4} Task #{}", task_num),
                Style::new().fg(app.theme.secondary).add_modifier(TextAttributes::bold()),
            ));
            push_wrapped(lines, &format!("    {}", text), Style::new().fg(app.theme.text), max_width);
        }
        ChatMessage::Agent {
            steps, thinking_text, result, success, elapsed_secs,
            skill_created, scheduled_job, selected_tab, tab_expanded,
            cached_response_md,
        } => {
            lines.push(MessageLine::empty());

            let has_thinking = !thinking_text.is_empty();
            let has_steps = !steps.is_empty();
            let has_response = result.is_some();

            if has_thinking || has_steps || has_response {
                let tabs = [
                    (AgentTab::Thinking, has_thinking, "\u{25c6} Thinking"),
                    (AgentTab::Steps, has_steps, "\u{25b8} Steps"),
                    (AgentTab::Response, has_response, "\u{25b6} Response"),
                ];

                let tab_labels: Vec<String> = tabs.iter()
                    .filter(|(_, has, _)| *has)
                    .map(|(tab, _, label)| {
                        let is_selected = *selected_tab == *tab;
                        let prefix = if is_selected { "[" } else { " " };
                        let suffix = if is_selected { "]" } else { " " };
                        format!("{}{}{}", prefix, label, suffix)
                    })
                    .collect();

                lines.push(MessageLine::text(
                    format!("  {}", tab_labels.join(" ")),
                    Style::new().fg(app.theme.primary).add_modifier(TextAttributes::bold()),
                ));

                if *tab_expanded {
                    match selected_tab {
                        AgentTab::Thinking if has_thinking => {
                            let content_lines: Vec<&str> = thinking_text.lines().collect();
                            let total = content_lines.len();
                            let show_all = total <= 100;
                            let limit = if show_all { total } else { 50 };

                            for tline in content_lines.iter().take(limit) {
                                if !tline.is_empty() {
                                    let md_lines = markdown::render_markdown_with_theme(tline, &app.theme);
                                    for md_line in &md_lines {
                                        let (text, style) = flatten_line(md_line, app);
                                        if !text.is_empty() {
                                            push_wrapped(lines, &format!("    {}", text), style, max_width);
                                        } else {
                                            lines.push(MessageLine::empty());
    }
}
                                } else {
                                    lines.push(MessageLine::empty());
                                }
                            }
                            if !show_all {
                                lines.push(MessageLine::text(
                                    format!("    \u{2026} {} more lines (collapsed)", total - 50),
                                    Style::new().fg(app.theme.text_muted),
                                ));
                            }
                        }
                        AgentTab::Steps if has_steps => {
                            let icon = if *success { "\u{2713}" } else { "\u{2717}" };
                            let color = if *success { app.theme.success } else { app.theme.error };
                            lines.push(MessageLine::text(
                                format!("    {} {} steps", icon, steps.len()),
                                Style::new().fg(color),
                            ));

                            let max_show = 5;
                            let show_steps: Vec<_> = if steps.len() > max_show {
                                steps.iter().rev().take(max_show).collect::<Vec<_>>().into_iter().rev().collect()
                            } else {
                                steps.iter().collect()
                            };

                            if steps.len() > max_show {
                                lines.push(MessageLine::text(
                                    format!("    \u{2026} {} earlier steps", steps.len() - max_show),
                                    Style::new().fg(app.theme.text_muted),
                                ));
                            }

                            for step in &show_steps {
                                render_structured_step(step, lines, app, max_width);
                            }
                        }
                        AgentTab::Response if has_response => {
                            if let Some(res) = result.as_ref() {
                                let icon = if *success { "\u{2713}" } else { "\u{2717}" };
                                let color = if *success { app.theme.success } else { app.theme.error };
                                let elapsed_str = format_elapsed(*elapsed_secs);

                                lines.push(MessageLine::text(
                                    format!("    {} Done \u{b7} {}", icon, elapsed_str),
                                    Style::new().fg(color).add_modifier(TextAttributes::bold()),
                                ));
                                lines.push(MessageLine::text(
                                    format!("    \u{25b8} {} \u{b7} {}", app.provider, app.model.as_deref().unwrap_or("default")),
                                    Style::new().fg(app.theme.text_muted),
                                ));

                                if !res.is_empty() {
                                    lines.push(MessageLine::empty());
                                    let md_lines = match cached_response_md.as_ref() {
                                        Some(cached) => cached.clone(),
                                        None => markdown::render_markdown_with_theme(res, &app.theme),
                                    };
                                    for md_line in &md_lines {
                                        let (text, style) = flatten_line(md_line, app);
                                        if !text.is_empty() {
                                            push_wrapped(lines, &format!("    {}", text), style, max_width);
                                        } else {
                                            lines.push(MessageLine::empty());
                                        }
        }
    }
}
                        }
                        _ => {}
                    }
                } else {
                    lines.push(MessageLine::text(
                        "    (collapsed, press Space to expand)",
                        Style::new().fg(app.theme.text_muted),
                    ));
                }

                lines.push(MessageLine::empty());
            }

            if let Some(skill) = skill_created {
                lines.push(MessageLine::text(
                    format!("    \u{2726} Skill created: {}", skill),
                    Style::new().fg(app.theme.info),
                ));
            }
            if let Some(job) = scheduled_job {
                lines.push(MessageLine::text(
                    format!("    \u{23f0} Scheduled: {}", job),
                    Style::new().fg(app.theme.secondary),
                ));
            }
        }
        ChatMessage::System { text, .. } => {
            lines.push(MessageLine::empty());
            push_wrapped(lines, &format!("  {}", text), Style::new().fg(app.theme.text_muted), max_width);
        }
        ChatMessage::Error { text, .. } => {
            lines.push(MessageLine::empty());
            push_wrapped(lines, &format!("  \u{2717} {}", text), Style::new().fg(app.theme.error), max_width);
        }
    }
}

fn handle_scroll(app: &mut App, max_scroll: u16) {
    if app.scroll_paused {
        return;
    }

    if app.auto_scroll {
        if max_scroll < 3 || (app.scroll_offset < 3 && max_scroll >= 3) {
            app.scroll_offset = 0;
        }
        app.auto_scroll = false;
    }
}

fn render_lines(
    buf: &mut CellBuffer,
    area: Rect,
    lines: &[MessageLine],
    scroll: u16,
    visible_height: u16,
    total_lines: u16,
    app: &App,
) {
    let skip_from_newest = scroll.min(total_lines.saturating_sub(visible_height));
    let take_count = visible_height.min(total_lines);

    let window = lines.iter().rev().skip(skip_from_newest as usize).take(take_count as usize);

    let mut y = area.bottom().saturating_sub(1);
    for line in window {
        if y < area.y {
            break;
        }
        match line {
            MessageLine::Empty => {
                y = y.saturating_sub(1);
            }
            MessageLine::Text { text, style } => {
                if !text.is_empty() {
                    buf.draw_str_clipped(area, area.x + 2, y, text, *style);
                }
                y = y.saturating_sub(1);
            }
            MessageLine::Collapsible { label, expanded, style } => {
                let indicator = if *expanded { "\u{25bc}" } else { "\u{25b6}" };
                let text = format!("  {} {}", indicator, label);
                buf.draw_str_clipped(area, area.x + 2, y, &text, *style);
                y = y.saturating_sub(1);
            }
        }
    }

    render_scroll_indicator(buf, area, app, scroll, total_lines, visible_height);
}

fn render_scroll_indicator(buf: &mut CellBuffer, area: Rect, app: &App, scroll: u16, total_lines: u16, visible_height: u16) {
    if total_lines > visible_height {
        let max_scroll = total_lines.saturating_sub(visible_height);
        let pct = if max_scroll > 0 {
            (scroll as f64 / max_scroll as f64 * 100.0) as u16
        } else {
            0
        };
        let indicator = format!(" {}% ", pct);
        let ix = area.right().saturating_sub(display_width(&indicator));
        let iy = area.bottom().saturating_sub(1);
        if iy > area.y && ix < area.right() {
            buf.draw_str(ix, iy, &indicator, Style::new().fg(app.theme.border));
        }
    }

    if total_lines > visible_height && area.height > 4 {
        let track_x = area.right().saturating_sub(1);
        let track_top = area.y + 1;
        let track_bottom = area.bottom().saturating_sub(2);
        let track_height = track_bottom.saturating_sub(track_top) as usize;
        if track_height > 0 {
            for ty in track_top..track_bottom {
                if ty < area.bottom() {
                    buf.put_char(track_x, ty, '\u{2502}', Style::new().fg(app.theme.border_dim));
                }
            }
            let max_scroll = total_lines.saturating_sub(visible_height);
            let thumb_pos = if max_scroll > 0 {
                ((scroll as f64 / max_scroll as f64) * (track_height as f64 - 1.0)) as u16
            } else {
                0
            };
            let thumb_y = track_top + thumb_pos;
            if thumb_y < track_bottom {
                buf.put_char(track_x, thumb_y, '\u{2588}', Style::new().fg(app.theme.primary));
            }
        }
    }

    if app.scroll_paused && app.agent_running && scroll > 0 {
        let new_label = " \u{2193} New content ";
        let nx = area.right().saturating_sub(display_width(new_label) + 2);
        if nx > area.x {
            buf.draw_str(nx, area.y, new_label,
                Style::new().bg(app.theme.primary).fg(app.theme.background).add_modifier(TextAttributes::bold()));
        }
    }
}

enum MessageLine {
    Empty,
    Text { text: String, style: Style },
    Collapsible { label: String, expanded: bool, style: Style },
}

impl MessageLine {
    fn empty() -> Self { MessageLine::Empty }

    fn text(text: impl Into<String>, style: Style) -> Self {
        MessageLine::Text { text: text.into(), style }
    }

    #[allow(dead_code)]
    fn collapsible(label: impl Into<String>, expanded: bool, style: Style) -> Self {
        MessageLine::Collapsible { label: label.into(), expanded, style }
    }
}

fn truncate_end(s: &str, max_len: usize) -> String {
    if max_len < 4 {
        return s.chars().take(max_len).collect();
    }
    if display_width(s) <= max_len as u16 {
        return s.to_string();
    }
    let mut result = String::new();
    let mut width = 0usize;
    for ch in s.chars() {
        let cw = UnicodeWidthChar::width(ch).unwrap_or(0);
        if width + cw > max_len - 3 {
            break;
        }
        result.push(ch);
        width += cw;
    }
    result.push_str("...");
    result
}

fn push_wrapped(lines: &mut Vec<MessageLine>, text: &str, style: Style, max_width: usize) {
    if max_width < 4 {
        lines.push(MessageLine::text(text, style));
        return;
    }

    let text_width = display_width(text) as usize;
    if text_width <= max_width {
        lines.push(MessageLine::text(text, style));
        return;
    }

    let chars: Vec<char> = text.chars().collect();
    let inner_width = max_width.saturating_sub(4);
    let mut first = true;
    let mut pos = 0;

    while pos < chars.len() {
        let limit = if first { max_width } else { inner_width };
        let mut end = pos;
        let mut w = 0usize;
        while end < chars.len() {
            let cw = UnicodeWidthChar::width(chars[end]).unwrap_or(0);
            if w + cw > limit { break; }
            w += cw;
            end += 1;
        }

        if end == pos {
            end = pos + 1;
        }

        if end < chars.len() {
            for i in (pos..end).rev() {
                if chars[i] == ' ' || chars[i] == '-' || chars[i] == ',' || chars[i] == ')' {
                    end = i + 1;
                    break;
                }
            }
        }

        let chunk: String = chars[pos..end].iter().collect();
        let line = if first { chunk } else { format!("    {}", chunk) };
        lines.push(MessageLine::text(line, style));

        pos = end;
        first = false;
        while pos < chars.len() && chars[pos] == ' ' {
            pos += 1;
        }
    }
}

pub fn format_elapsed(secs: u64) -> String {
    if secs >= 3600 {
        format!("{}h {:02}m", secs / 3600, (secs % 3600) / 60)
    } else if secs >= 60 {
        format!("{}m {:02}s", secs / 60, secs % 60)
    } else if secs == 0 {
        "< 1s".to_string()
    } else {
        format!("{}s", secs)
    }
}

#[allow(dead_code)]
struct PhaseInfo {
    name: &'static str,
    color_fn: fn(&App) -> Color,
    symbol: &'static str,
}

#[allow(dead_code)]
const PHASES: &[PhaseInfo] = &[
    PhaseInfo { name: "planning", color_fn: |a| a.theme.warning, symbol: "\u{25c6}" },
    PhaseInfo { name: "thinking", color_fn: |a| a.theme.warning, symbol: "\u{25c6}" },
    PhaseInfo { name: "executing", color_fn: |a| a.theme.primary, symbol: "\u{25b8}" },
    PhaseInfo { name: "observing", color_fn: |a| a.theme.secondary, symbol: "\u{25cb}" },
    PhaseInfo { name: "reflecting", color_fn: |a| a.theme.info, symbol: "\u{25c6}" },
    PhaseInfo { name: "delegating", color_fn: |a| a.theme.success, symbol: "\u{25c7}" },
    PhaseInfo { name: "done", color_fn: |a| a.theme.success, symbol: "\u{2713}" },
    PhaseInfo { name: "failed", color_fn: |a| a.theme.error, symbol: "\u{2717}" },
    PhaseInfo { name: "Interrupted", color_fn: |a| a.theme.warning, symbol: "\u{26a0}" },
    PhaseInfo { name: "streaming", color_fn: |a| a.theme.info, symbol: "\u{25b6}" },
    PhaseInfo { name: "responding", color_fn: |a| a.theme.info, symbol: "\u{25b6}" },
];

#[allow(dead_code)]
fn parse_step_style(step: &str, app: &App) -> (Style, &'static str) {
    for info in PHASES {
        if step.contains(info.name) {
            let color = (info.color_fn)(app);
            return (Style::new().fg(color), info.symbol);
        }
    }

    let t = &app.theme;
    if step.contains("done") || step.starts_with('\u{2713}') {
        return (Style::new().fg(t.success), "\u{2713}");
    }
    if step.contains("fail") || step.starts_with('\u{2717}') {
        return (Style::new().fg(t.error), "\u{2717}");
    }

    (Style::new().fg(t.text), "\u{2022}")
}

#[allow(dead_code)]
pub fn detect_phase(step: &str) -> Option<&str> {
    for info in PHASES {
        if step.contains(info.name) {
            return Some(info.name);
        }
    }
    None
}

fn render_structured_step(step: &str, lines: &mut Vec<MessageLine>, app: &App, max_width: usize) {
    let parts: Vec<&str> = step.lines().collect();
    let main_line = if let Some(line) = parts.get(0) {
        *line
    } else {
        return;
    };
    let (_phase, action_detail) = main_line.split_once(' ').unwrap_or(("executing", main_line));

    let parsed = parse_tool_action(action_detail);
    let action_text = format!("{} {}", parsed.tool_icon, parsed.display_action);
    let tool_line = format!("    {}", action_text);
    let tool_style = Style::new().fg(app.theme.primary).add_modifier(TextAttributes::bold());
    lines.push(MessageLine::text(tool_line, tool_style));

    if parts.len() > 1 {
        let detail_joined = parts[1..].join("\n    ");
        let detail = detail_joined.trim();
        if !detail.is_empty() {
            let obs_style = if detail.contains("\u{2713}") || detail.contains("success") {
                Style::new().fg(app.theme.success)
            } else if detail.contains("\u{2717}") || detail.contains("fail") || detail.contains("error") {
                Style::new().fg(app.theme.error)
            } else {
                Style::new().fg(app.theme.text_muted)
            };
            push_wrapped(lines, &format!("    {}", detail), obs_style, max_width);
        }
    }
}

#[allow(dead_code)]
struct ParsedAction {
    tool_name: String,
    tool_icon: &'static str,
    display_action: String,
}

fn parse_tool_action(action: &str) -> ParsedAction {
    let action_lower = action.to_lowercase();

    if action_lower.contains("write_file") || action_lower.contains("create") {
        if let Some(file) = extract_file_path(action) {
            return ParsedAction {
                tool_name: "write_file".into(),
                tool_icon: "[WRITE]",
                display_action: format!("WRITE_FILE: {}", file),
            };
        }
    }
    if action_lower.contains("read_file") {
        if let Some(file) = extract_file_path(action) {
            return ParsedAction {
                tool_name: "read_file".into(),
                tool_icon: "[READ]",
                display_action: format!("READ_FILE: {}", file),
            };
        }
    }
    if action_lower.contains("edit") || action_lower.contains("modify") {
        if let Some(file) = extract_file_path(action) {
            return ParsedAction {
                tool_name: "edit_file".into(),
                tool_icon: "[EDIT]",
                display_action: format!("EDIT_FILE: {}", file),
            };
        }
    }

    if action_lower.contains("bash") || action_lower.contains("shell") || action_lower.contains("run") {
        let cmd = extract_command(action).unwrap_or_else(|| action.to_string());
        return ParsedAction {
            tool_name: "bash".into(),
            tool_icon: "[BASH]",
            display_action: format!("BASH: {}", cmd),
        };
    }

    if action_lower.contains("click") {
        return ParsedAction {
            tool_name: "click".into(),
            tool_icon: "[CLICK]",
            display_action: format!("CLICK: {}", action),
        };
    }
    if action_lower.contains("goto") || action_lower.contains("navigate") {
        let url = extract_url(action).unwrap_or_else(|| action.to_string());
        return ParsedAction {
            tool_name: "goto".into(),
            tool_icon: "[GOTO]",
            display_action: format!("GOTO: {}", url),
        };
    }
    if action_lower.contains("search") {
        return ParsedAction {
            tool_name: "search".into(),
            tool_icon: "[SEARCH]",
            display_action: format!("SEARCH: {}", action),
        };
    }

    ParsedAction {
        tool_name: "action".into(),
        tool_icon: "[ACTION]",
        display_action: action.to_string(),
    }
}

fn extract_file_path(action: &str) -> Option<String> {
    for part in action.split_whitespace() {
        if part.contains('.') || part.contains('/') || part.contains('\\') {
            if !part.contains("http") && !part.contains("://") {
                return Some(part.to_string());
            }
        }
    }
    None
}

fn extract_command(action: &str) -> Option<String> {
    action.find(' ').map(|idx| action[idx + 1..].to_string())
}

fn extract_url(action: &str) -> Option<String> {
    for word in action.split_whitespace() {
        if word.starts_with("http://") || word.starts_with("https://") {
            return Some(word.to_string());
        }
    }
    None
}

fn flatten_line(line: &Line, app: &App) -> (String, Style) {
    if line.spans.is_empty() {
        return (String::new(), Style::new());
    }

    let text: String = line.spans.iter().map(|s| s.text.as_str()).collect();
    let style = line.spans.first()
        .map(|s| s.style)
        .unwrap_or_else(|| Style::new().fg(app.theme.text));

    (text, style)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app::App;
    use sediman_tui_bridge::ApiClient;

    fn make_app() -> App {
        App::new("test".into(), Some("gpt-4".into()), None, true, ApiClient::new("/tmp/test.sock"))
    }

    #[test]
    fn test_format_elapsed_large() {
        assert_eq!(format_elapsed(86400), "24h 00m");
    }

    #[test]
    fn test_format_elapsed_boundary_minute() {
        assert_eq!(format_elapsed(59), "59s");
    }

    #[test]
    fn test_format_elapsed_exact_minute() {
        assert_eq!(format_elapsed(60), "1m 00s");
    }

    #[test]
    fn test_format_elapsed_boundary_hour() {
        assert_eq!(format_elapsed(3599), "59m 59s");
    }

    #[test]
    fn test_format_elapsed_exact_hour() {
        assert_eq!(format_elapsed(3600), "1h 00m");
    }

    #[test]
    fn test_detect_phase_known() {
        assert_eq!(detect_phase("planning routes"), Some("planning"));
        assert_eq!(detect_phase("executing click"), Some("executing"));
        assert_eq!(detect_phase("observing results"), Some("observing"));
        assert_eq!(detect_phase("reflecting on output"), Some("reflecting"));
        assert_eq!(detect_phase("delegating task"), Some("delegating"));
        assert_eq!(detect_phase("done!"), Some("done"));
        assert_eq!(detect_phase("failed!"), Some("failed"));
        assert_eq!(detect_phase("Interrupted"), Some("Interrupted"));
    }

    #[test]
    fn test_detect_phase_unknown() {
        assert_eq!(detect_phase("unknown phase"), None);
        assert_eq!(detect_phase(""), None);
    }

    #[test]
    fn test_parse_step_style_known_phases() {
        let app = make_app();
        let (_, symbol) = parse_step_style("planning", &app);
        assert_eq!(symbol, "\u{25c6}");

        let (_, symbol) = parse_step_style("executing", &app);
        assert_eq!(symbol, "\u{25b8}");

        let (_, symbol) = parse_step_style("done", &app);
        assert_eq!(symbol, "\u{2713}");

        let (_, symbol) = parse_step_style("failed", &app);
        assert_eq!(symbol, "\u{2717}");
    }

    #[test]
    fn test_parse_step_style_unknown() {
        let app = make_app();
        let (_, symbol) = parse_step_style("something random", &app);
        assert_eq!(symbol, "\u{2022}");
    }

    #[test]
    fn test_push_wrapped_short_line() {
        let mut lines = Vec::new();
        push_wrapped(&mut lines, "hello", Style::new(), 80);
        assert_eq!(lines.len(), 1);
        assert!(matches!(&lines[0], MessageLine::Text { text, .. } if text == "hello"));
    }

    #[test]
    fn test_push_wrapped_long_line() {
        let mut lines = Vec::new();
        let long = "abcdefghijklmnopqrstuvwxyz";
        push_wrapped(&mut lines, long, Style::new(), 10);
        assert!(lines.len() > 1, "Should wrap into multiple lines");
        assert!(matches!(&lines[0], MessageLine::Text { .. }), "First line should be Text");
    }

    #[test]
    fn test_truncate_end_short() {
        assert_eq!(truncate_end("hello", 10), "hello");
    }

    #[test]
    fn test_truncate_end_long() {
        assert_eq!(truncate_end("abcdefghijklmnopqrstuvwxyz", 10), "abcdefg...");
    }

    #[test]
    fn test_truncate_end_multi_byte() {
        let s = "a\u{e9} b\u{e9} c\u{e9} d\u{e9} \u{e9}";
        let result = truncate_end(s, 6);
        assert!(result.ends_with("..."));
        assert!(display_width(&result) <= 6, "truncated display width should be <= max_len");
    }

    #[test]
    fn test_truncate_end_wide_chars() {
        let wide: String = "\u{4e00}\u{4e01}\u{4e03}\u{4e5d}\u{4e43}".to_string();
        let result = truncate_end(&wide, 6);
        assert!(result.ends_with("..."));
        assert!(display_width(&result) <= 6, "display width should be <= 6");
    }

    #[test]
    fn test_truncate_end_exact_width() {
        assert_eq!(truncate_end("hello", 5), "hello");
    }

    #[test]
    fn test_truncate_end_ascii_preserves_original() {
        let s = "test string";
        assert_eq!(truncate_end(s, 100), s);
    }

    #[test]
    fn test_push_wrapped_wide_chars() {
        let mut lines = Vec::new();
        let wide: String = "\u{4e00}".repeat(10);
        push_wrapped(&mut lines, &wide, Style::new(), 10);
        for (i, line) in lines.iter().enumerate() {
            if let MessageLine::Text { text, .. } = line {
                let w = display_width(text) as usize;
                assert!(w <= 10, "line {} display width {} exceeds max 10", i, w);
            }
        }
    }

    #[test]
    fn test_push_wrapped_mixed_width() {
        let mut lines = Vec::new();
        let mixed = "hello\u{4e00}\u{4e16}\u{754c}world";
        push_wrapped(&mut lines, mixed, Style::new(), 10);
        for (i, line) in lines.iter().enumerate() {
            if let MessageLine::Text { text, .. } = line {
                let w = display_width(text) as usize;
                assert!(w <= 10, "line {} display width {} exceeds max 10", i, w);
            }
        }
        assert!(lines.len() > 1, "should wrap into multiple lines");
    }

    #[test]
    fn test_push_wrapped_continuation_indent() {
        let mut lines = Vec::new();
        let long = "a".repeat(100);
        push_wrapped(&mut lines, &long, Style::new(), 10);
        assert!(lines.len() > 1);
        for (i, line) in lines.iter().enumerate() {
            if i > 0 {
                if let MessageLine::Text { text, .. } = line {
                    assert!(text.starts_with("    "), "continuation line should have 4-space indent");
                }
            }
        }
    }

    #[test]
    fn test_push_wrapped_no_wider_than_max() {
        let mut lines = Vec::new();
        let text = "the quick brown fox jumps over the lazy dog and keeps going";
        push_wrapped(&mut lines, text, Style::new(), 20);
        for (i, line) in lines.iter().enumerate() {
            if let MessageLine::Text { text, .. } = line {
                let w = display_width(text) as usize;
                assert!(w <= 20, "line {} display width {} exceeds max 20", i, w);
            }
        }
    }

    #[test]
    fn test_push_wrapped_single_wide_char_at_boundary() {
        let mut lines = Vec::new();
        let text = format!("abc{}\u{4e00}", "x".repeat(5));
        push_wrapped(&mut lines, &text, Style::new(), 8);
        for (i, line) in lines.iter().enumerate() {
            if let MessageLine::Text { text, .. } = line {
                let w = display_width(text) as usize;
                assert!(w <= 8, "line {} display width {} exceeds max 8", i, w);
            }
        }
    }

        fn build_lines(app: &mut App) -> Vec<MessageLine> {
            let mut lines = Vec::new();
            let max_width = 80usize;
            for msg in &app.messages {
                render_completed_message(msg, &mut lines, app, max_width);
            }
            lines
        }
    
        // ── render_inline_section tests ──────────────────────────────
    
        #[test]
        fn test_inline_section_expanded_shows_content() {
            let mut app = make_app();
            app.streaming_response = "hello world".into();
            app.streaming_phase = "responding".into();
            let mut lines = Vec::new();
            render_inline_section(
                &mut lines, &app, 80,
                "\u{25b6}", "Response", "hello world",
                app.theme.info, app.theme.text,
                true, true, 0,
            );
            assert!(!lines.is_empty());
            let has_content = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("hello world"),
                _ => false,
            });
            assert!(has_content, "Should contain 'hello world'");
        }
    
        #[test]
        fn test_inline_section_collapsed_hides_content() {
            let app = make_app();
            let mut lines = Vec::new();
            render_inline_section(
                &mut lines, &app, 80,
                "\u{25b6}", "Response", "hidden content",
                app.theme.info, app.theme.text,
                false, false, 0,
            );
            let has_collapsed = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("collapsed"),
                _ => false,
            });
            assert!(has_collapsed);
        }
    
        #[test]
        fn test_inline_section_cursor_on_active() {
            let app = make_app();
            let mut lines = Vec::new();
            render_inline_section(
                &mut lines, &app, 80,
                "\u{25b6}", "Response", "streaming",
                app.theme.info, app.theme.text,
                true, true, 0,
            );
            let has_cursor = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains('\u{2588}'),
                _ => false,
            });
            assert!(has_cursor, "Active section should have cursor");
        }
    
        #[test]
        fn test_inline_section_no_cursor_when_inactive() {
            let app = make_app();
            let mut lines = Vec::new();
            render_inline_section(
                &mut lines, &app, 80,
                "\u{25b6}", "Response", "streaming",
                app.theme.info, app.theme.text,
                true, false, 0,
            );
            let has_cursor = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains('\u{2588}'),
                _ => false,
            });
            assert!(!has_cursor, "Inactive section should not have cursor");
        }
    
        #[test]
        fn test_inline_section_truncates_with_max_lines() {
            let app = make_app();
            let content = (0..20).map(|i| format!("line {}", i)).collect::<Vec<_>>().join("\n");
            let mut lines = Vec::new();
            render_inline_section(
                &mut lines, &app, 80,
                "\u{25c6}", "Thinking", &content,
                app.theme.warning, app.theme.text_muted,
                true, true, 10,
            );
            let earlier_notice = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("earlier lines"),
                _ => false,
            });
            assert!(earlier_notice, "Should show '… N earlier lines'");
        }
    
        // ── render_inline_steps tests ─────────────────────────────────
    
        #[test]
        fn test_inline_steps_shows_count() {
            let mut app = make_app();
            app.step_log = vec!["Task: test".into(), "step 1".into(), "step 2".into()];
            app.steps_expanded = true;
            let mut lines = Vec::new();
            render_inline_steps(&mut lines, &app, 80);
            let has_count = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("Steps (2)"),
                _ => false,
            });
            assert!(has_count);
        }
    
        #[test]
        fn test_inline_steps_collapsed_shows_last() {
            let mut app = make_app();
            app.step_log = vec!["Task: test".into(), "planning read code".into()];
            app.steps_expanded = false;
            let mut lines = Vec::new();
            render_inline_steps(&mut lines, &app, 80);
            let has_last = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("planning"),
                _ => false,
            });
            assert!(has_last);
        }
    
        // ── render_completed_message tests ───────────────────────────
    
        #[test]
        fn test_render_user_message() {
            let mut app = make_app();
            app.messages.push(ChatMessage::User { text: "hello".into(), task_num: 1 });
            let lines = build_lines(&mut app);
            let has_task = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("Task #1"),
                _ => false,
            });
            assert!(has_task);
        }
    
        #[test]
        fn test_render_system_message() {
            let mut app = make_app();
            app.messages.push(ChatMessage::System { text: "info".into() });
            let lines = build_lines(&mut app);
            let has_info = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("info"),
                _ => false,
            });
            assert!(has_info);
        }
    
        #[test]
        fn test_render_error_message() {
            let mut app = make_app();
            app.messages.push(ChatMessage::Error { text: "failed".into() });
            let lines = build_lines(&mut app);
            let has_error = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("failed"),
                _ => false,
            });
            assert!(has_error);
        }
    
        #[test]
        fn test_render_agent_message_with_tabs() {
            let mut app = make_app();
            app.messages.push(ChatMessage::Agent {
                steps: vec!["planning analyze".into(), "executing run".into()],
                thinking_text: "thinking content".into(),
                result: Some("done".into()),
                success: true,
                elapsed_secs: 5,
                skill_created: None,
                scheduled_job: None,
                selected_tab: AgentTab::Response,
                tab_expanded: true,
                cached_response_md: None,
            });
            let lines = build_lines(&mut app);
            let has_thinking_tab = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("Thinking"),
                _ => false,
            });
            let has_response_tab = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("Response"),
                _ => false,
            });
            let has_done = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("Done") && text.contains("5s"),
                _ => false,
            });
            assert!(has_thinking_tab);
            assert!(has_response_tab);
            assert!(has_done);
        }
    
        #[test]
        fn test_render_agent_thinking_tab() {
            let mut app = make_app();
            app.messages.push(ChatMessage::Agent {
                steps: vec![],
                thinking_text: "deep reasoning".into(),
                result: None,
                success: false,
                elapsed_secs: 0,
                skill_created: None,
                scheduled_job: None,
                selected_tab: AgentTab::Thinking,
                tab_expanded: true,
                cached_response_md: None,
            });
            let lines = build_lines(&mut app);
            let has_thinking = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("deep reasoning"),
                _ => false,
            });
            assert!(has_thinking);
        }
    
        #[test]
        fn test_render_agent_steps_tab() {
            let mut app = make_app();
            app.messages.push(ChatMessage::Agent {
                steps: vec!["executing read_file config.toml".into()],
                thinking_text: String::new(),
                result: None,
                success: false,
                elapsed_secs: 0,
                skill_created: None,
                scheduled_job: None,
                selected_tab: AgentTab::Steps,
                tab_expanded: true,
                cached_response_md: None,
            });
            let lines = build_lines(&mut app);
            let has_step = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("READ_FILE") || text.contains("config.toml"),
                _ => false,
            });
            assert!(has_step, "Should contain step content");
        }
    
        #[test]
        fn test_render_agent_skill_created() {
            let mut app = make_app();
            app.messages.push(ChatMessage::Agent {
                steps: vec![],
                thinking_text: String::new(),
                result: None,
                success: false,
                elapsed_secs: 0,
                skill_created: Some("my-skill".into()),
                scheduled_job: None,
                selected_tab: AgentTab::Response,
                tab_expanded: false,
                cached_response_md: None,
            });
            let lines = build_lines(&mut app);
            let has_skill = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("my-skill"),
                _ => false,
            });
            assert!(has_skill);
        }
    
        #[test]
        fn test_render_agent_collapsed() {
            let mut app = make_app();
            app.messages.push(ChatMessage::Agent {
                steps: vec![],
                thinking_text: "thinking content".into(),
                result: Some("result".into()),
                success: true,
                elapsed_secs: 1,
                skill_created: None,
                scheduled_job: None,
                selected_tab: AgentTab::Response,
                tab_expanded: false,
                cached_response_md: None,
            });
            let lines = build_lines(&mut app);
            let has_collapsed = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("collapsed"),
                _ => false,
            });
            assert!(has_collapsed);
        }
    
        #[test]
        fn test_render_agent_with_cached_markdown() {
            let mut app = make_app();
            let lines = sediman_tui_core::markdown::render_markdown_with_theme("# Test", &app.theme);
            app.messages.push(ChatMessage::Agent {
                steps: vec![],
                thinking_text: String::new(),
                result: Some("# Test".into()),
                success: true,
                elapsed_secs: 1,
                skill_created: None,
                scheduled_job: None,
                selected_tab: AgentTab::Response,
                tab_expanded: true,
                cached_response_md: Some(lines),
            });
            let result = build_lines(&mut app);
            assert!(!result.is_empty());
        }
    
        // ── streaming sections build test ────────────────────────────
    
        #[test]
        fn test_render_streaming_sections_with_content() {
            let mut app = make_app();
            app.agent_running = true;
            app.agent_start = std::time::Instant::now();
            app.streaming_thinking = "thinking...".into();
            app.streaming_response = "responding...".into();
            app.streaming_phase = "responding".into();
            app.thinking_expanded = true;
            app.steps_expanded = true;
            app.step_log = vec!["Task: test".into(), "planning".into()];
    
            let mut lines = Vec::new();
            render_streaming_sections(&mut lines, &mut app, 80, Rect::new(0, 0, 80, 24));
    
            let has_thinking = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("thinking..."),
                _ => false,
            });
            let has_responding = lines.iter().any(|l| match l {
                MessageLine::Text { text, .. } => text.contains("responding..."),
                _ => false,
            });
            assert!(has_thinking, "Should contain thinking content");
            assert!(has_responding, "Should contain response content");
        }
    
        // ── parse_tool_action tests ──────────────────────────────────
    
        #[test]
        fn test_parse_write_file() {
            let action = parse_tool_action("write_file src/main.rs");
            assert!(action.display_action.contains("WRITE_FILE"));
            assert!(action.display_action.contains("src/main.rs"));
        }
    
        #[test]
        fn test_parse_read_file() {
            let action = parse_tool_action("read_file config.toml");
            assert!(action.display_action.contains("READ_FILE"));
        }
    
        #[test]
        fn test_parse_bash() {
            let action = parse_tool_action("bash npm install");
            assert!(action.display_action.contains("BASH"));
            assert!(action.display_action.contains("npm install"));
        }
    
        #[test]
        fn test_parse_click() {
            let action = parse_tool_action("click button #submit");
            assert!(action.display_action.contains("CLICK"));
        }
    
        #[test]
        fn test_parse_unknown_defaults_to_action() {
            let action = parse_tool_action("unknown action text");
            assert_eq!(action.tool_icon, "[ACTION]");
            assert_eq!(action.display_action, "unknown action text");
        }
    
        #[test]
        fn test_auto_scroll_reset_when_near_bottom() {
            let mut app = make_app();
            app.scroll_offset = 2;
            app.auto_scroll = true;
            handle_scroll(&mut app, 100);
            assert_eq!(app.scroll_offset, 0);
            assert!(!app.auto_scroll);
        }
    
        #[test]
        fn test_auto_scroll_does_not_snap_when_far_from_bottom() {
            let mut app = make_app();
            app.scroll_offset = 50;
            app.auto_scroll = true;
            handle_scroll(&mut app, 200);
            assert_eq!(app.scroll_offset, 50);
            assert!(!app.auto_scroll);
        }
    
        #[test]
        fn test_scroll_paused_prevents_auto_scroll() {
            let mut app = make_app();
            app.scroll_offset = 2;
            app.auto_scroll = true;
            app.scroll_paused = true;
            handle_scroll(&mut app, 100);
            assert_eq!(app.scroll_offset, 2);
        }
    
        #[test]
        fn test_auto_scroll_reset_on_small_buffer() {
            let mut app = make_app();
            app.scroll_offset = 0;
            app.auto_scroll = true;
            handle_scroll(&mut app, 2);
            assert_eq!(app.scroll_offset, 0);
            assert!(!app.auto_scroll);
        }
    
        #[test]
        fn test_format_elapsed_zero() {
            assert_eq!(format_elapsed(0), "< 1s");
        }
    
        #[test]
        fn test_format_elapsed_seconds() {
            assert_eq!(format_elapsed(45), "45s");
        }
    
        #[test]
        fn test_format_elapsed_minutes() {
            assert_eq!(format_elapsed(125), "2m 05s");
        }
    
        #[test]
        fn test_format_elapsed_hours() {
            assert_eq!(format_elapsed(3661), "1h 01m");
        }
}
