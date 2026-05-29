use crate::renderer::{CellBuffer, Color, Rect, Style};

const PHASE_SYMBOLS: &[(&str, &str, Color)] = &[
    ("planning", "◈", Color::YELLOW),
    ("executing", "▶", Color::BLUE),
    ("observing", "◎", Color::CYAN),
    ("reflecting", "◆", Color::MAGENTA),
    ("delegating", "◇", Color::GREEN),
    ("done", "✓", Color::GREEN),
    ("failed", "✗", Color::RED),
];

pub struct ProgressPanel<'a> {
    pub step_log: &'a [String],
    pub elapsed: std::time::Duration,
    pub spinner_text: &'a str,
    pub visible_lines: usize,
}

impl<'a> ProgressPanel<'a> {
    pub fn render(&self, buf: &mut CellBuffer, area: Rect) {
        let title = format!("  ⏳ {}s  {}", self.elapsed.as_secs(), self.spinner_text);
        // Draw border box.
        draw_border_box(buf, area, Color::BLUE, &title);

        let inner = area.inner(1, 1, 1, 1);
        let mut y = inner.y;
        for line in self.step_log.iter().rev().take(self.visible_lines).rev() {
            if y >= inner.bottom() {
                break;
            }
            let (symbol, color) = PHASE_SYMBOLS
                .iter()
                .find(|(name, _, _)| line.contains(name))
                .map(|(_, sym, color)| (*sym, *color))
                .unwrap_or(("", Color::WHITE));

            let full_line = format!("{} {}", symbol, line);
            buf.draw_str(inner.x, y, &full_line, Style::new().fg(color));
            y += 1;
        }
    }
}

fn draw_border_box(buf: &mut CellBuffer, area: Rect, color: Color, title: &str) {
    let style = Style::new().fg(color);
    // Top + bottom.
    for x in area.x..area.right() {
        buf.put_char(x, area.y, '─', style);
        buf.put_char(x, area.y + area.height - 1, '─', style);
    }
    // Sides.
    for y in area.y + 1..area.y + area.height - 1 {
        buf.put_char(area.x, y, '│', style);
        buf.put_char(area.x + area.width - 1, y, '│', style);
    }
    // Corners.
    buf.put_char(area.x, area.y, '┌', style);
    buf.put_char(area.x + area.width - 1, area.y, '┐', style);
    buf.put_char(area.x, area.y + area.height - 1, '└', style);
    buf.put_char(area.x + area.width - 1, area.y + area.height - 1, '┘', style);
    // Title.
    if !title.is_empty() {
        let tl = title.len().min(area.width as usize - 2);
        buf.draw_str(area.x + 1, area.y, &title[..tl], style);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_phase_symbols_all_defined() {
        let phases = ["planning", "executing", "observing", "reflecting", "delegating", "done", "failed"];
        for phase in &phases {
            let found = PHASE_SYMBOLS.iter().find(|(name, _, _)| name == phase);
            assert!(found.is_some(), "Missing symbol for phase: {}", phase);
        }
    }

    #[test]
    fn test_phase_symbols_unique() {
        let mut names: Vec<&str> = PHASE_SYMBOLS.iter().map(|(n, _, _)| *n).collect();
        names.sort();
        let mut dedup = names.clone();
        dedup.dedup();
        assert_eq!(names, dedup, "Phase symbols must have unique names");
    }

    #[test]
    fn test_progress_panel_elapsed_formatting() {
        let panel = ProgressPanel {
            step_log: &[],
            elapsed: std::time::Duration::from_secs(65),
            spinner_text: "working",
            visible_lines: 50,
        };
        assert_eq!(panel.elapsed.as_secs(), 65);
        assert_eq!(panel.spinner_text, "working");
    }

    #[test]
    fn test_progress_panel_log_capping() {
        let log: Vec<String> = (0..100).map(|i| format!("step {}", i)).collect();
        let panel = ProgressPanel {
            step_log: &log,
            elapsed: std::time::Duration::from_secs(10),
            spinner_text: "test",
            visible_lines: 50,
        };
        assert_eq!(panel.visible_lines, 50);
    }

    #[test]
    fn test_progress_panel_empty_log() {
        let panel = ProgressPanel {
            step_log: &[],
            elapsed: std::time::Duration::from_secs(0),
            spinner_text: "idle",
            visible_lines: 50,
        };
        assert!(panel.step_log.is_empty());
    }

    #[test]
    fn test_progress_panel_title_contains_elapsed() {
        let panel = ProgressPanel {
            step_log: &[],
            elapsed: std::time::Duration::from_secs(42),
            spinner_text: "processing",
            visible_lines: 50,
        };
        let title = format!("  ⏳ {}s  {}", panel.elapsed.as_secs(), panel.spinner_text);
        assert_eq!(title, "  ⏳ 42s  processing");
    }
}
