use sediman_tui_core::renderer::{CellBuffer, Cell, Color, Rect, Style, TextAttributes};

use crate::app::{App, ChatMessage, SideTab};

pub fn render_into(buf: &mut CellBuffer, app: &mut App) {
    let area = buf.area();
    buf.fill(area, Cell::EMPTY);

    // Background fill.
    buf.fill_style(area, Style::new().bg(app.theme.background));

    let show_side = app.show_side_panel;
    app.layout.show_side_panel = show_side;
    let zones = app.layout.split(area);

    render_title_bar(buf, zones.title_bar, app);

    if let Some(side_area) = zones.side_panel {
        render_side_panel(buf, side_area, app);
    }

    render_messages(buf, zones.main, app);
    render_status_bar(buf, zones.status_bar, app);
    render_input(buf, zones.input, app);

    if show_completion(app) {
        render_completion_popup(buf, zones.input, app);
    }
}

fn show_completion(app: &App) -> bool {
    let input = app.editor.lines().join(" ").trim().to_string();
    input.starts_with('/') && !app.completer.filtered().is_empty()
}

// ── Title Bar ─────────────────────────────────────────────────

fn render_title_bar(buf: &mut CellBuffer, area: Rect, app: &App) {
    let spinner = if app.agent_running {
        format!(" {} ", app.spinner_char())
    } else {
        "   ".into()
    };

    let left = format!(" sediman{}", spinner);
    buf.draw_str(area.x, area.y, &left, Style::new()
        .fg(app.theme.primary)
        .add_modifier(TextAttributes::bold()));

    let model = app.model.as_deref().unwrap_or("default");
    let model_style = Style::new().fg(app.theme.text_muted);

    let status_text = if app.agent_running {
        format_elapsed(app.agent_start.elapsed().as_secs())
    } else {
        "idle".into()
    };
    let status_style = if app.agent_running {
        Style::new().fg(app.theme.success)
    } else {
        Style::new().fg(app.theme.text_muted)
    };

    // Right-aligned: model + status
    let full_right = format!("{}   {}", model, status_text);
    let rx = area.right().saturating_sub(full_right.len() as u16);
    buf.draw_str(rx, area.y, &full_right, Style::new());

    // Overlay model in muted color, status in success/muted.
    buf.draw_str(rx, area.y, model, model_style);
    let status_x = rx + model.len() as u16 + 3;
    if status_x < area.right() {
        buf.draw_str(status_x, area.y, &status_text, status_style);
    }
}

// ── Messages ──────────────────────────────────────────────────

fn render_messages(buf: &mut CellBuffer, area: Rect, app: &mut App) {
    if app.show_help {
        render_help(buf, area, app);
        return;
    }

    if app.show_banner && app.messages.is_empty() {
        render_banner(buf, area, app);
        return;
    }

    if app.messages.is_empty() {
        render_idle(buf, area, app);
        return;
    }

    let mut lines: Vec<(String, Style)> = Vec::new();

    for msg in &app.messages {
        match msg {
            ChatMessage::User { text, task_num } => {
                lines.push((String::new(), Style::new()));
                let line = format!(" {}  {}", task_num, text);
                lines.push((line, Style::new()
                    .fg(app.theme.text)));
            }
            ChatMessage::Agent { steps, result, success, elapsed_secs, skill_created, scheduled_job, .. } => {
                for step in steps {
                    let (style, symbol) = parse_step_style(step, app);
                    let line = format!(" {}  {}", symbol, step);
                    lines.push((line, style));
                }
                if let Some(res) = result {
                    lines.push((String::new(), Style::new()));
                    let icon = if *success { "\u{2713}" } else { "\u{2717}" };
                    let color = if *success { app.theme.success } else { app.theme.error };
                    lines.push((format!(" {}  completed ({})", icon, format_elapsed(*elapsed_secs)), Style::new().fg(color)));
                    if !res.is_empty() && res.len() < 500 {
                        lines.push((format!("    {}", res), Style::new().fg(app.theme.text)));
                    }
                    if let Some(skill) = skill_created {
                        lines.push((format!("    \u{2726} Skill: {}", skill), Style::new().fg(app.theme.info)));
                    }
                    if let Some(job) = scheduled_job {
                        lines.push((format!("    \u{25C8} Job: {}", job), Style::new().fg(app.theme.secondary)));
                    }
                }
            }
            ChatMessage::System { text } => {
                lines.push((format!("  {}", text), Style::new().fg(app.theme.text_muted)));
            }
            ChatMessage::Error { text } => {
                lines.push((format!("  \u{2717} {}", text), Style::new().fg(app.theme.error)));
            }
        }
    }

    let total_lines = lines.len() as u16;
    let visible_height = area.height.saturating_sub(2).max(1);
    let max_scroll = total_lines.saturating_sub(visible_height);

    if app.auto_scroll {
        app.scroll_offset = 0;
    }
    let scroll = app.scroll_offset.min(max_scroll);

    let mut y = area.y;
    for (i, (text, style)) in lines.iter().enumerate() {
        let i = i as u16;
        if i < scroll {
            continue;
        }
        if y >= area.y + visible_height {
            break;
        }
        if y >= area.bottom() {
            break;
        }
        if text.is_empty() {
            y += 1;
            continue;
        }
        buf.draw_str(area.x, y, text, *style);
        y += 1;
    }

    // Scroll indicator.
    if total_lines > visible_height {
        let pct = if max_scroll > 0 {
            (scroll as f64 / max_scroll as f64 * 100.0) as u16
        } else {
            0
        };
        let indicator = format!(" {}% ", pct);
        let ix = area.right().saturating_sub(indicator.len() as u16);
        let iy = area.bottom().saturating_sub(1);
        if iy > area.y && ix < area.right() {
            buf.draw_str(ix, iy, &indicator, Style::new().fg(app.theme.text_muted));
        }
    }
}

fn format_elapsed(secs: u64) -> String {
    if secs >= 3600 {
        format!("{}h {:02}m", secs / 3600, (secs % 3600) / 60)
    } else if secs >= 60 {
        format!("{}m {:02}s", secs / 60, secs % 60)
    } else {
        format!("{}s", secs)
    }
}

fn parse_step_style(step: &str, app: &App) -> (Style, &'static str) {
    let phase_map: &[(&str, Color, &str)] = &[
        ("planning", app.theme.warning, "\u{25C6}"),
        ("executing", app.theme.primary, "\u{25B8}"),
        ("observing", app.theme.secondary, "\u{25CB}"),
        ("reflecting", app.theme.info, "\u{25C6}"),
        ("delegating", app.theme.success, "\u{25C7}"),
        ("done", app.theme.success, "\u{2713}"),
        ("failed", app.theme.error, "\u{2717}"),
        ("Interrupted", app.theme.warning, "\u{26A0}"),
    ];

    for &(name, color, symbol) in phase_map {
        if step.contains(name) {
            return (Style::new().fg(color), symbol);
        }
    }

    if step.contains("done") || step.starts_with('\u{2713}') {
        return (Style::new().fg(app.theme.success), "\u{2713}");
    }
    if step.contains("fail") || step.starts_with('\u{2717}') {
        return (Style::new().fg(app.theme.error), "\u{2717}");
    }

    (Style::new().fg(app.theme.text), "\u{2022}")
}

// ── Banner ────────────────────────────────────────────────────

fn render_banner(buf: &mut CellBuffer, area: Rect, app: &App) {
    let mut y = area.y;

    let secondary = Style::new().fg(app.theme.secondary);
    let primary = Style::new().fg(app.theme.primary);
    let muted = Style::new().fg(app.theme.text_muted);
    let muted_italic = Style::new().fg(app.theme.text_muted).add_modifier(TextAttributes::italic());
    let success = Style::new().fg(app.theme.success);
    let dim = Style::new().fg(app.theme.secondary).add_modifier(TextAttributes::dim());

    let logo = [
        ("    ______                   __  __", secondary),
        ("    /      \\                 /  |/  |", secondary),
        ("   /$$$$$$  |  ______    ____$$ |$$/  _____  ____    ______   _______", primary),
        ("   $$ \\__$$/  /      \\  /    $$ |/  |/     \\/    \\  /      \\ /       \\", primary),
        ("   $$      \\ /$$$$$$  |/$$$$$$$ |$$ |$$$$$$ $$$$  | $$$$$$  |$$$$$$$  |", primary),
        ("    $$$$$$  |$$    $$ |$$ |  $$ |$$ |$$ | $$ | $$ | /    $$ |$$ |  $$ |", primary),
        ("   /  \\__$$ |$$$$$$$$/ $$ \\__$$ |$$ |$$ | $$ | $$ |/$$$$$$$ |$$ |  $$ |", primary),
        ("   $$    $$/ $$       |$$    $$ |$$ |$$ | $$ | $$ |$$    $$ |$$ |  $$ |", primary),
        ("    $$$$$$/   $$$$$$$/  $$$$$$$/ $$/ $$/  |$$/  $$/  $$$$$$$/ $$/   $$/", primary),
    ];

    for (line, style) in &logo {
        if y >= area.bottom() { return; }
        buf.draw_str(area.x, y, line, *style);
        y += 1;
    }

    y += 1;
    if y >= area.bottom() { return; }
    buf.draw_str(area.x, y, &format!("  v{}", env!("CARGO_PKG_VERSION")), muted_italic);
    y += 1; y += 1;

    if y >= area.bottom() { return; }
    let browser_str = if app.headless { "headless" } else { "headed + vision" };
    buf.draw_str(area.x, y, &format!("  Browser: {}", browser_str), success);
    y += 1; y += 1;

    if y >= area.bottom() { return; }
    buf.draw_str(area.x, y, "  ━ Keys ━", dim);
    y += 1;

    let keys = [
        "    Enter      Submit",
        "    Esc        Cancel / clear",
        "    Tab        Complete command",
        "    ⇧Tab       Cycle mode",
        "    PgUp/Dn    Scroll",
        "    ^P         Help",
    ];
    for k in &keys {
        if y >= area.bottom() { return; }
        buf.draw_str(area.x, y, k, muted);
        y += 1;
    }

    y += 1;
    if y >= area.bottom() { return; }
    buf.draw_str(area.x, y, "  Type /help for commands or just type a task to begin.", muted);
}

fn render_idle(buf: &mut CellBuffer, area: Rect, app: &App) {
    let txt = if app.messages.is_empty() {
        "  ready — type a task or /help"
    } else {
        "  scroll ↑↓ or type a new task"
    };
    buf.draw_str(area.x, area.y, txt,
        Style::new().fg(app.theme.text_muted).add_modifier(TextAttributes::italic()));
}

// ── Help ──────────────────────────────────────────────────────

fn render_help(buf: &mut CellBuffer, area: Rect, app: &App) {
    let categories = [
        ("General", &["/help", "/exit", "/status", "/clear", "/reset"][..]),
        ("Agent", &["/model", "/models", "/plan", "/compress", "/soul"]),
        ("Skills", &["/skills", "/skill", "/run-skill", "/record", "/stop"]),
        ("Hub", &["/hub browse", "/hub search", "/hub install", "/hub info", "/hub publish"]),
        ("Browser", &["/browser", "/screenshot"]),
        ("Sessions", &["/sessions", "/memory", "/remember", "/resume"]),
        ("Schedule", &["/schedule", "/schedule-add", "/schedule-remove"]),
        ("Terminal", &["/terminal", "/color", "/rename"]),
        ("Tasks", &["/delegate", "/parallel"]),
        ("Utilities", &["/usage", "/doctor", "/export", "/btw"]),
    ];

    let mut y = area.y + 1;
    let bold = Style::new().fg(app.theme.secondary).add_modifier(TextAttributes::bold());
    let dim = Style::new().fg(app.theme.warning).add_modifier(TextAttributes::dim());
    let text_style = Style::new().fg(app.theme.text);
    let muted = Style::new().fg(app.theme.text_muted);

    if y >= area.bottom() { return; }
    buf.draw_str(area.x, y, "  Commands", bold); y += 1; y += 1;

    for (category, cmds) in &categories {
        if y >= area.bottom() { return; }
        buf.draw_str(area.x, y, &format!("  │ {} ", category), dim); y += 1;
        for cmd in *cmds {
            if y >= area.bottom() { return; }
            buf.draw_str(area.x, y, &format!("    {}", cmd), text_style); y += 1;
        }
        y += 1;
    }

    if y < area.bottom() {
        buf.draw_str(area.x, y, "  Esc or ^P to close", muted);
    }
}

// ── Status Bar ────────────────────────────────────────────────

fn render_status_bar(buf: &mut CellBuffer, area: Rect, app: &App) {
    let mut x = area.x;
    let y = area.y;

    if app.agent_running {
        let spinner = format!(" {} ", app.spinner_char());
        buf.draw_str(x, y, &spinner, Style::new().fg(app.theme.success).add_modifier(TextAttributes::bold()));
        x += spinner.len() as u16;

        let elapsed = format!("{} ", format_elapsed(app.agent_start.elapsed().as_secs()));
        buf.draw_str(x, y, &elapsed, Style::new().fg(app.theme.success));
        x += elapsed.len() as u16;
    } else if app.task_count > 0 {
        let text = format!(" {} ", app.task_count);
        buf.draw_str(x, y, &text, Style::new().fg(app.theme.text_muted));
        x += text.len() as u16;
    }

    let sep = " │ ";
    buf.draw_str(x, y, sep, Style::new().fg(app.theme.muted));
    x += sep.len() as u16;

    let mode = app.permission.current_label();
    let mc = match mode {
        "acceptEdits" => app.theme.success,
        "plan" => app.theme.info,
        "auto" => app.theme.error,
        _ => app.theme.text,
    };
    let mode_text = format!("{} ", mode);
    buf.draw_str(x, y, &mode_text, Style::new().fg(mc));
    x += mode_text.len() as u16;

    if let Some(ref name) = app.session_name {
        buf.draw_str(x, y, &format!("{} ", name), Style::new().fg(app.theme.secondary));
        x += name.len() as u16 + 1;
    }

    let sep2 = " │ ";
    buf.draw_str(x, y, sep2, Style::new().fg(app.theme.muted));
    x += sep2.len() as u16;

    let model = app.model.as_deref().unwrap_or("default");
    let model_text = format!("{} ", model);
    buf.draw_str(x, y, &model_text, Style::new().fg(app.theme.text_muted));
    x += model_text.len() as u16;

    let ctx = app.context_bar_text();
    let ctx_text = format!("{} ", ctx);
    buf.draw_str(x, y, &ctx_text, Style::new().fg(app.theme.text_muted));
}

// ── Completion Popup ──────────────────────────────────────────

fn render_completion_popup(buf: &mut CellBuffer, input_area: Rect, app: &App) {
    let completions = app.completer.filtered();
    if completions.is_empty() {
        return;
    }

    let max_items = 10.min(completions.len());
    let popup_height = max_items as u16 + 2;
    let popup_area = Rect::new(
        input_area.x,
        input_area.y.saturating_sub(popup_height),
        input_area.width.min(40),
        popup_height,
    );

    // Border box.
    let border_style = Style::new().fg(app.theme.muted);
    for bx in popup_area.x..popup_area.right() {
        buf.put_char(bx, popup_area.y, '─', border_style);
        buf.put_char(bx, popup_area.y + popup_height - 1, '─', border_style);
    }
    for by in popup_area.y..popup_area.bottom() {
        buf.put_char(popup_area.x, by, '│', border_style);
        buf.put_char(popup_area.right() - 1, by, '│', border_style);
    }
    buf.put_char(popup_area.x, popup_area.y, '┌', border_style);
    buf.put_char(popup_area.right() - 1, popup_area.y, '┐', border_style);
    buf.put_char(popup_area.x, popup_area.bottom() - 1, '└', border_style);
    buf.put_char(popup_area.right() - 1, popup_area.bottom() - 1, '┘', border_style);

    // Title: " Commands "
    let title = " Commands ";
    let tlen = title.len().min(popup_area.width as usize - 2);
    buf.draw_str(popup_area.x + 1, popup_area.y, &title[..tlen], border_style);

    // Completion items.
    let inner_x = popup_area.x + 1;
    let inner_y = popup_area.y + 1;
    for (i, cmd) in completions.iter().take(max_items).enumerate() {
        if inner_y + i as u16 >= popup_area.bottom() - 1 {
            break;
        }
        let text = format!("  {}", cmd);
        buf.draw_str(inner_x, inner_y + i as u16, &text, Style::new().fg(app.theme.text));
    }
}

// ── Side Panel ────────────────────────────────────────────────

fn render_side_panel(buf: &mut CellBuffer, area: Rect, app: &App) {
    let tab_labels: &[(&str, SideTab)] = &[
        ("Skills", SideTab::Skills),
        ("Memory", SideTab::Memory),
        ("Schedule", SideTab::Schedule),
        ("Status", SideTab::Status),
    ];

    let current = app.side_panel_tab;

    let tab_area = Rect::new(area.x, area.y, area.width, 1);
    let content_area = Rect::new(area.x, area.y + 1, area.width, area.height - 1);

    // Draw tab bar.
    let mut x = area.x;
    for (label, tab) in tab_labels {
        let active = *tab == current;
        let sep = if active { " ▸ " } else { "   " };
        let style = if active {
            Style::new().fg(app.theme.primary).add_modifier(TextAttributes::bold())
        } else {
            Style::new().fg(app.theme.text_muted)
        };
        let full = format!("{}{}{}", sep, label, active.then_some("").unwrap_or(""));
        buf.draw_str(x, tab_area.y, &full, style);
        x += full.len() as u16 + 1;
    }

    // Draw top border separator.
    let sep_style = Style::new().fg(app.theme.muted);
    let sy = content_area.y;
    for sx in content_area.x..content_area.right() {
        buf.put_char(sx, sy.saturating_sub(1), '─', sep_style);
    }

    // Content area.
    let lines: Vec<(String, Style)> = match current {
        SideTab::Skills => render_skills_tab(app),
        SideTab::Memory => render_memory_tab(app),
        SideTab::Schedule => render_schedule_tab(app),
        SideTab::Status => render_status_tab_inner(app),
    };

    let mut y = content_area.y;
    for (text, style) in &lines {
        if y >= content_area.bottom() {
            break;
        }
        buf.draw_str(content_area.x, y, text, *style);
        y += 1;
    }
}

fn render_skills_tab(app: &App) -> Vec<(String, Style)> {
    let mut out = Vec::new();
    let bold = Style::new().fg(app.theme.secondary).add_modifier(TextAttributes::bold());
    let muted = Style::new().fg(app.theme.text_muted);
    let text_s = Style::new().fg(app.theme.text);

    out.push(("".into(), Style::new()));
    out.push(("  Skills".into(), bold));

    if app.skills_cache.is_empty() {
        out.push(("  none yet".into(), muted));
        out.push(("  │ /skills to load".into(), muted));
    } else {
        for entry in &app.skills_cache {
            let d: String = entry.chars().take(35).collect();
            out.push((format!("  • {}", d), text_s));
        }
    }
    out
}

fn render_memory_tab(app: &App) -> Vec<(String, Style)> {
    let mut out = Vec::new();
    let bold = Style::new().fg(app.theme.secondary).add_modifier(TextAttributes::bold());
    let muted = Style::new().fg(app.theme.text_muted);
    let text_s = Style::new().fg(app.theme.text);

    out.push(("".into(), Style::new()));
    out.push(("  Memory".into(), bold));

    if app.memory_cache.is_empty() {
        out.push(("  none yet".into(), muted));
        out.push(("  │ /memory to load".into(), muted));
    } else {
        for entry in &app.memory_cache {
            out.push((format!("  • {}", entry), text_s));
        }
    }
    out
}

fn render_schedule_tab(app: &App) -> Vec<(String, Style)> {
    let mut out = Vec::new();
    let bold = Style::new().fg(app.theme.secondary).add_modifier(TextAttributes::bold());
    let muted = Style::new().fg(app.theme.text_muted);
    let text_s = Style::new().fg(app.theme.text);

    out.push(("".into(), Style::new()));
    out.push(("  Schedule".into(), bold));

    if app.schedule_cache.is_empty() {
        out.push(("  none yet".into(), muted));
        out.push(("  │ /schedule to load".into(), muted));
    } else {
        for entry in &app.schedule_cache {
            let d: String = entry.chars().take(35).collect();
            out.push((format!("  • {}", d), text_s));
        }
    }
    out
}

fn render_status_tab_inner(app: &App) -> Vec<(String, Style)> {
    let bold = Style::new().fg(app.theme.secondary).add_modifier(TextAttributes::bold());
    let text_style = Style::new().fg(app.theme.text);
    let green = Style::new().fg(app.theme.success);
    let muted = Style::new().fg(app.theme.text_muted);

    let mode = app.permission.current_label();
    let agent_status = if app.agent_running { "running" } else { "idle" };
    let agent_style = if app.agent_running { green } else { muted };

    vec![
        ("".into(), Style::new()),
        ("  Status".into(), bold),
        ("".into(), Style::new()),
        (format!("  Model   {}", app.model.as_deref().unwrap_or("default")), text_style),
        (format!("  Mode    {}", mode), text_style),
        (format!("  Tasks   {}", app.task_count), text_style),
        (format!("  Browser {}", if app.headless { "headless" } else { "headed" }), text_style),
        (format!("  Agent   {}", agent_status), agent_style),
    ]
}

// ── Input ─────────────────────────────────────────────────────

fn render_input(buf: &mut CellBuffer, area: Rect, app: &mut App) {
    let prompt = " > ";
    app.editor.set_prompt(prompt);

    // Top border.
    let border_style = Style::new().fg(app.theme.muted);
    let by = area.y;
    for bx in area.x..area.right() {
        let existing = buf.get(bx, by).map(|c| !c.is_empty()).unwrap_or(false);
        if !existing {
            buf.put_char(bx, by, '─', border_style);
        }
    }

    // Editor render area (excluding top border).
    let inner = Rect::new(area.x, area.y + 1, area.width, area.height - 1);
    app.editor.render(buf, inner);
}
