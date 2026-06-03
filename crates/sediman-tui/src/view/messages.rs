//! Message rendering with newest messages at bottom and collapsible sections.
//!
//! Features:
//! - Chat-style rendering (newest messages at bottom)
//! - Collapsible thinking/planning sections
//! - Auto-scroll to latest messages
//! - No Python log leakage

use sediman_tui_core::renderer::{CellBuffer, Color, Line, Rect, Style, TextAttributes, display_width};
use sediman_tui_core::markdown;
use unicode_width::UnicodeWidthChar;

use crate::app::{App, ChatMessage};

/// Phase information for step styling
#[allow(dead_code)]
struct PhaseInfo {
    name: &'static str,
    color_fn: fn(&App) -> Color,
    symbol: &'static str,
}

#[allow(dead_code)]
const PHASES: &[PhaseInfo] = &[
    PhaseInfo { name: "planning", color_fn: |a| a.theme.warning, symbol: "◆" },
    PhaseInfo { name: "thinking", color_fn: |a| a.theme.warning, symbol: "◆" },
    PhaseInfo { name: "executing", color_fn: |a| a.theme.primary, symbol: "▸" },
    PhaseInfo { name: "observing", color_fn: |a| a.theme.secondary, symbol: "○" },
    PhaseInfo { name: "reflecting", color_fn: |a| a.theme.info, symbol: "◆" },
    PhaseInfo { name: "delegating", color_fn: |a| a.theme.success, symbol: "◇" },
    PhaseInfo { name: "done", color_fn: |a| a.theme.success, symbol: "✓" },
    PhaseInfo { name: "failed", color_fn: |a| a.theme.error, symbol: "✗" },
    PhaseInfo { name: "Interrupted", color_fn: |a| a.theme.warning, symbol: "⚠" },
    PhaseInfo { name: "streaming", color_fn: |a| a.theme.info, symbol: "▶" },
    PhaseInfo { name: "responding", color_fn: |a| a.theme.info, symbol: "▶" },
];

/// Render all messages into the buffer
///
/// Rendering order: newest messages at bottom (chat-style)
/// Scroll behavior: auto-scroll shows latest messages, manual scroll for history
pub fn render_messages(buf: &mut CellBuffer, area: Rect, app: &mut App) {
    // Show banner when empty
    if app.show_banner && app.messages.is_empty() {
        super::banner::render_banner(buf, area, app);
        return;
    }

    if app.messages.is_empty() {
        super::banner::render_idle(buf, area, app);
        return;
    }

    let max_width = area.width.saturating_sub(6) as usize; // 3px padding each side
    let mut lines: Vec<MessageLine> = Vec::new();

    // ── Compact running indicator ──
    if app.agent_running {
        let spinner = app.spinner_char();
        let elapsed = app.agent_start.elapsed().as_secs();
        let elapsed_str = format_elapsed(elapsed);
        let step_count = app.step_log.len();
        let last_step = app.step_log.last()
            .map(|s| truncate_end(s, max_width.saturating_sub(18)))
            .unwrap_or_else(|| "Starting...".into());

        lines.push(MessageLine::empty());
        lines.push(MessageLine::text(
            format!("  {} Working… {} · {} steps", spinner, elapsed_str, step_count),
            Style::new().fg(app.theme.primary).add_modifier(TextAttributes::bold()),
        ));
        lines.push(MessageLine::text(
            format!("    {}", last_step),
            Style::new().fg(app.theme.text_muted),
        ));

        // ── Live streaming text block (only if not empty) ──
        if !app.streaming_text.is_empty() {
            lines.push(MessageLine::empty());

            let (label, label_color, content_color) = match app.streaming_phase.as_str() {
                "planning" | "thinking" => ("◆ Thinking", app.theme.warning, app.theme.text_muted),
                "responding" => ("▶ Responding", app.theme.info, app.theme.text),
                "executing" => ("▸ Executing", app.theme.primary, app.theme.text),
                "result" => ("◇ Result", app.theme.success, app.theme.text),
                _ => ("▶ Streaming", app.theme.info, app.theme.text),
            };
            lines.push(MessageLine::text(
                format!("    {}", label),
                Style::new().fg(label_color).add_modifier(TextAttributes::bold()),
            ));

            // Show last N lines of streaming text with muted color for thinking
            let preview_lines: Vec<&str> = app.streaming_text.lines().rev().take(15).collect();
            let preview_lines: Vec<&str> = preview_lines.into_iter().rev().collect();

            for (i, text_line) in preview_lines.iter().enumerate() {
                let is_last = i == preview_lines.len() - 1;
                let cursor = if is_last { "█" } else { "" };
                push_wrapped(&mut lines, &format!("    {}{}", text_line, cursor),
                    Style::new().fg(content_color), max_width);
            }
        }
    }

    // ── Render all messages (chat-style: newest at bottom) ──
    for msg in &app.messages {
        render_message(msg, &mut lines, app, max_width);
    }
    // ── Calculate scroll for chat-style rendering ──
    let total_lines = lines.len() as u16;
    let visible_height = area.height;
    let max_scroll = total_lines.saturating_sub(visible_height);

    // Auto-scroll: show latest messages (scroll to bottom of view)
    // scroll_offset = 0 means show newest content at bottom
    // scroll_offset = max_scroll means show oldest content at bottom
    // Only auto-scroll if user is already near the newest content
    if app.auto_scroll {
        // Only reset if we're already close to the newest content (scroll < 10)
        // This prevents bouncing back when user is actively scrolling up
        if app.scroll_offset < 10 || max_scroll < 10 {
            app.scroll_offset = 0;
        }
        app.auto_scroll = false;
    }
    let scroll = app.scroll_offset.min(max_scroll);

    // ── Fill background ──
    for sy in area.y..area.bottom() {
        for sx in area.x..area.right() {
            buf.put_char(sx, sy, ' ', Style::new().bg(app.theme.background));
        }
    }

    // ── Render lines from bottom up (chat-style: newest at bottom) ──
    // Scroll offset: 0 = newest at bottom, max_scroll = oldest at bottom
    // Higher scroll_offset = show older content (skip more from newest end)
    let skip_from_newest = scroll.min(total_lines.saturating_sub(visible_height));
    let take_count = visible_height.min(total_lines);

    // Reverse to start from newest, skip oldest of newest, then take visible_count
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
                let indicator = if *expanded { "▼" } else { "▶" };
                let text = format!("  {} {}", indicator, label);
                buf.draw_str_clipped(area, area.x + 2, y, &text, *style);
                y = y.saturating_sub(1);
            }
        }
    }

    // ── Scroll indicator (shows position from top) ──
    if total_lines > visible_height {
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

    // ── Scroll bar (vertical track) ──
    if total_lines > visible_height && area.height > 4 {
        let track_x = area.right().saturating_sub(1);
        let track_top = area.y + 1;
        let track_bottom = area.bottom().saturating_sub(2);
        let track_height = track_bottom.saturating_sub(track_top) as usize;
        if track_height > 0 {
            for ty in track_top..track_bottom {
                if ty < area.bottom() {
                    buf.put_char(track_x, ty, '│', Style::new().fg(app.theme.border_dim));
                }
            }
            let thumb_pos = if max_scroll > 0 {
                ((scroll as f64 / max_scroll as f64) * (track_height as f64 - 1.0)) as u16
            } else {
                0
            };
            let thumb_y = track_top + thumb_pos;
            if thumb_y < track_bottom {
                buf.put_char(track_x, thumb_y, '█', Style::new().fg(app.theme.primary));
            }
        }
    }
}

/// Render a single message into the lines buffer
fn render_message(msg: &ChatMessage, lines: &mut Vec<MessageLine>, app: &App, max_width: usize) {
    match msg {
        ChatMessage::User { text, task_num, timestamp: _ } => {
            lines.push(MessageLine::empty());
            lines.push(MessageLine::text(
                format!("  ➤ Task #{}", task_num),
                Style::new().fg(app.theme.secondary).add_modifier(TextAttributes::bold()),
            ));
            push_wrapped(lines, &format!("    {}", text), Style::new().fg(app.theme.text), max_width);
        }
        ChatMessage::Agent { steps, thinking_text, result, success, elapsed_secs, skill_created, scheduled_job, selected_tab, tab_expanded, timestamp: _ } => {
            use crate::app::AgentTab;

            // Add separator line before agent messages
            lines.push(MessageLine::empty());

            // ── Tabbed interface ──
            let has_thinking = !thinking_text.is_empty();
            let has_steps = !steps.is_empty();
            let has_response = result.is_some();

            // Only show tabs if we have content
            if has_thinking || has_steps || has_response {
                // Render tabs
                let tabs = [
                    (AgentTab::Thinking, has_thinking),
                    (AgentTab::Steps, has_steps),
                    (AgentTab::Response, has_response),
                ];

                let tab_labels: Vec<String> = tabs.iter()
                    .filter(|(_, has)| *has)
                    .map(|(tab, _)| {
                        let is_selected = *selected_tab == *tab;
                        let prefix = if is_selected { "[" } else { " " };
                        let suffix = if is_selected { "]" } else { " " };
                        format!("{}{}{}", prefix, tab.name(), suffix)
                    })
                    .collect();

                let tabs_line = tab_labels.join(" ");
                lines.push(MessageLine::text(
                    format!("  {}", tabs_line),
                    Style::new().fg(app.theme.primary).add_modifier(TextAttributes::bold()),
                ));

                // ── Show selected tab content if expanded ──
                if *tab_expanded {
                    match selected_tab {
                        AgentTab::Thinking if has_thinking => {
                            // Show thinking content
                            let thinking_lines: Vec<&str> = thinking_text.lines().collect();
                            for tline in thinking_lines.iter().take(20) {
                                if !tline.is_empty() {
                                    push_wrapped(lines, &format!("    {}", tline), Style::new().fg(app.theme.text_muted), max_width);
                                } else {
                                    lines.push(MessageLine::empty());
                                }
                            }
                            if thinking_lines.len() > 20 {
                                lines.push(MessageLine::text(
                                    format!("    … {} more lines", thinking_lines.len() - 20),
                                    Style::new().fg(app.theme.text_muted),
                                ));
                            }
                        }
                        AgentTab::Steps if has_steps => {
                            // Show steps
                            let step_count = steps.len();
                            let (icon, color) = if *success {
                                ("✓", app.theme.success)
                            } else if result.is_some() {
                                ("✗", app.theme.error)
                            } else {
                                ("○", app.theme.info)
                            };

                            lines.push(MessageLine::text(
                                format!("    {} {} steps", icon, step_count),
                                Style::new().fg(color),
                            ));

                            let show_steps: Vec<_> = if steps.len() > 3 {
                                steps.iter().rev().take(3).collect::<Vec<_>>().into_iter().rev().collect()
                            } else {
                                steps.iter().collect()
                            };

                            if steps.len() > 3 {
                                lines.push(MessageLine::text(
                                    format!("    … {} earlier steps", steps.len() - 3),
                                    Style::new().fg(app.theme.text_muted),
                                ));
                            }

                            for step in &show_steps {
                                render_structured_step(step, lines, app, max_width);
                            }
                        }
                        AgentTab::Response if has_response => {
                            // Show response content
                            let res = result.as_ref().unwrap();
                            let icon = if *success { "✓" } else { "✗" };
                            let color = if *success { app.theme.success } else { app.theme.error };
                            let elapsed_str = format_elapsed(*elapsed_secs);

                            // Show status line
                            lines.push(MessageLine::text(
                                format!("    {} Done · {}", icon, elapsed_str),
                                Style::new().fg(color).add_modifier(TextAttributes::bold()),
                            ));
                            lines.push(MessageLine::text(
                                format!("    ▸ {} · {}", app.provider, app.model.as_deref().unwrap_or("default")),
                                Style::new().fg(app.theme.text_muted),
                            ));

                            if !res.is_empty() {
                                lines.push(MessageLine::empty());
                                // Render markdown result with proper padding
                                let md_lines = markdown::render_markdown_with_theme(res, &app.theme);
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
                        _ => {
                            // Tab not available or not selected
                            lines.push(MessageLine::text(
                                "    (not available)",
                                Style::new().fg(app.theme.text_muted),
                            ));
                        }
                    }
                } else {
                    // Collapsed - show hint
                    lines.push(MessageLine::text(
                        "    (collapsed, press Space to expand)",
                        Style::new().fg(app.theme.text_muted),
                    ));
                }

                lines.push(MessageLine::empty());
            }

            // ── Skill/job info (shown regardless of tab selection) ──
            if let Some(skill) = skill_created {
                lines.push(MessageLine::empty());
                lines.push(MessageLine::text(
                    format!("    ✦ Skill created: {}", skill),
                    Style::new().fg(app.theme.info),
                ));
            }
            if let Some(job) = scheduled_job {
                lines.push(MessageLine::text(
                    format!("    ⏰ Scheduled: {}", job),
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
            push_wrapped(lines, &format!("  ✗ {}", text), Style::new().fg(app.theme.error), max_width);
        }
    }
}

/// Line types for rendering
#[allow(dead_code)]
enum MessageLine {
    Empty,
    Text { text: String, style: Style },
    Collapsible { label: String, expanded: bool, style: Style },
}

impl MessageLine {
    #[allow(dead_code)]
    fn empty() -> Self {
        MessageLine::Empty
    }

    #[allow(dead_code)]
    fn text(text: impl Into<String>, style: Style) -> Self {
        MessageLine::Text { text: text.into(), style }
    }

    #[allow(dead_code)]
    fn collapsible(label: impl Into<String>, expanded: bool, style: Style) -> Self {
        MessageLine::Collapsible { label: label.into(), expanded, style }
    }
}

/// Truncate a string to max_len, adding "..." if truncated.
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

/// Push a line, wrapping it into multiple lines if it exceeds max_width.
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
fn parse_step_style(step: &str, app: &App) -> (Style, &'static str) {
    for info in PHASES {
        if step.contains(info.name) {
            let color = (info.color_fn)(app);
            return (Style::new().fg(color), info.symbol);
        }
    }

    let t = &app.theme;
    if step.contains("done") || step.starts_with('✓') {
        return (Style::new().fg(t.success), "✓");
    }
    if step.contains("fail") || step.starts_with('✗') {
        return (Style::new().fg(t.error), "✗");
    }

    (Style::new().fg(t.text), "•")
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

/// Render a step in structured format showing tool, action, and result
fn render_structured_step(step: &str, lines: &mut Vec<MessageLine>, app: &App, max_width: usize) {
    // Parse the step format: "phase action\n  detail"
    let parts: Vec<&str> = step.lines().collect();
    if parts.is_empty() {
        return;
    }

    // Parse main line: "phase action"
    let main_line = parts[0];
    let (_phase, action_detail) = main_line.split_once(' ').unwrap_or(("executing", main_line));

    // Parse action to extract tool and arguments
    let parsed = parse_tool_action(action_detail);

    // Display tool with icon and action
    let action_text = format!("{} {}", parsed.tool_icon, parsed.display_action);
    let tool_line = format!("    {}", action_text);
    let tool_style = Style::new().fg(app.theme.primary).add_modifier(TextAttributes::bold());
    lines.push(MessageLine::text(tool_line, tool_style));

    // Display detail/observation if present
    if parts.len() > 1 {
        let detail_joined = parts[1..].join("\n    ");
        let detail = detail_joined.trim();
        if !detail.is_empty() {
            // Show observation/result
            let obs_style = if detail.contains("✓") || detail.contains("success") {
                Style::new().fg(app.theme.success)
            } else if detail.contains("✗") || detail.contains("fail") || detail.contains("error") {
                Style::new().fg(app.theme.error)
            } else {
                Style::new().fg(app.theme.text_muted)
            };
            push_wrapped(lines, &format!("    {}", detail), obs_style, max_width);
        }
    }
}

/// Parsed tool/action information
#[allow(dead_code)]
struct ParsedAction {
    tool_name: String,
    tool_icon: &'static str,
    display_action: String,
}

/// Parse action string to extract tool and arguments
fn parse_tool_action(action: &str) -> ParsedAction {
    // Common tool patterns
    let action_lower = action.to_lowercase();

    // File operations
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

    // Shell/Bash operations
    if action_lower.contains("bash") || action_lower.contains("shell") || action_lower.contains("run") {
        let cmd = extract_command(action).unwrap_or_else(|| action.to_string());
        return ParsedAction {
            tool_name: "bash".into(),
            tool_icon: "[BASH]",
            display_action: format!("BASH: {}", cmd),
        };
    }

    // Browser operations
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

    // Default: just show the action
    ParsedAction {
        tool_name: "action".into(),
        tool_icon: "[ACTION]",
        display_action: action.to_string(),
    }
}

/// Extract file path from action string
fn extract_file_path(action: &str) -> Option<String> {
    // Try to extract file path from patterns like:
    // "write_file src/main.py"
    // "create file:src/main.py"
    // "edit src/main.py"
    let _action_lower = action.to_lowercase();

    // Find file-like patterns
    for part in action.split_whitespace() {
        if part.contains('.') || part.contains('/') || part.contains('\\') {
            // Skip common non-file parts
            if !part.contains("http") && !part.contains("://") {
                return Some(part.to_string());
            }
        }
    }
    None
}

/// Extract command from bash action
fn extract_command(action: &str) -> Option<String> {
    // Extract command after "bash", "run", etc.
    action.find(' ').map(|idx| action[idx + 1..].to_string())
}

/// Extract URL from action
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
        assert_eq!(symbol, "◆");

        let (_, symbol) = parse_step_style("executing", &app);
        assert_eq!(symbol, "▸");

        let (_, symbol) = parse_step_style("done", &app);
        assert_eq!(symbol, "✓");

        let (_, symbol) = parse_step_style("failed", &app);
        assert_eq!(symbol, "✗");
    }

    #[test]
    fn test_parse_step_style_unknown() {
        let app = make_app();
        let (_, symbol) = parse_step_style("something random", &app);
        assert_eq!(symbol, "•");
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
        if let MessageLine::Text { text, .. } = &lines[0] {
            assert!(text.starts_with("abcdefg"));
        } else {
            panic!("First line should be Text");
        }
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
        let s = "aé bé cé dé é";
        let result = truncate_end(s, 6);
        assert!(result.ends_with("..."));
        assert!(display_width(&result) <= 6, "truncated display width should be <= max_len");
    }

    #[test]
    fn test_truncate_end_wide_chars() {
        let wide: String = "一丁七乃九".to_string();
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
        let wide: String = "一".repeat(10);
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
        let mixed = "hello一世界world";
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
        let text = format!("abc{}一", "x".repeat(5));
        push_wrapped(&mut lines, &text, Style::new(), 8);
        for (i, line) in lines.iter().enumerate() {
            if let MessageLine::Text { text, .. } = line {
                let w = display_width(text) as usize;
                assert!(w <= 8, "line {} display width {} exceeds max 8", i, w);
            }
        }
    }
}
