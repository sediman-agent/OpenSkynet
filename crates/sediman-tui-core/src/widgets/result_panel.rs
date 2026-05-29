use crate::renderer::{CellBuffer, Color, Rect, Style};

pub struct ResultPanel<'a> {
    pub text: &'a str,
    pub success: bool,
    pub elapsed_secs: u64,
    pub skill_created: bool,
    pub scheduled_job: Option<&'a str>,
}

impl<'a> ResultPanel<'a> {
    pub fn render(&self, buf: &mut CellBuffer, area: Rect) {
        let border_color = if self.success { Color::GREEN } else { Color::RED };
        let symbol = if self.success { "✓" } else { "✗" };
        let title = format!("{} Sediman ({}s)", symbol, self.elapsed_secs);

        // Draw border box.
        draw_border_box(buf, area, border_color, &title);

        let inner = area.inner(1, 1, 1, 1);
        let mut y = inner.y;

        // Draw text (wrapping).
        for line in self.text.lines() {
            if y >= inner.bottom() {
                break;
            }
            buf.draw_wrapped_str(Rect::new(inner.x, y, inner.width, 1), line, Style::new());
            y += 1;
        }

        if self.skill_created {
            if y < inner.bottom() {
                buf.draw_str(inner.x, y, "  ◆ Skill created from this task", Style::new().fg(Color::MAGENTA));
                y += 1;
            }
        }
        if let Some(job_id) = self.scheduled_job {
            if y < inner.bottom() {
                let text = format!("  ◇ Scheduled job: {}", job_id);
                buf.draw_str(inner.x, y, &text, Style::new().fg(Color::CYAN));
            }
        }
    }
}

/// Draw a single-line border box with the given color and title in the top border.
fn draw_border_box(buf: &mut CellBuffer, area: Rect, color: Color, title: &str) {
    let style = Style::new().fg(color);
    // Top border.
    for x in area.x..area.right() {
        buf.put_char(x, area.y, '─', style);
    }
    // Title at top-left.
    let title_len = title.len().min(area.width as usize - 2);
    buf.draw_str(area.x + 1, area.y, &title[..title_len], style);
    // Bottom border.
    for x in area.x..area.right() {
        buf.put_char(x, area.y + area.height - 1, '─', style);
    }
    // Left and right borders.
    for y in area.y + 1..area.y + area.height - 1 {
        buf.put_char(area.x, y, '│', style);
        buf.put_char(area.x + area.width - 1, y, '│', style);
    }
    // Corners.
    buf.put_char(area.x, area.y, '┌', style);
    buf.put_char(area.x + area.width - 1, area.y, '┐', style);
    buf.put_char(area.x, area.y + area.height - 1, '└', style);
    buf.put_char(area.x + area.width - 1, area.y + area.height - 1, '┘', style);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_result_panel_success() {
        let panel = ResultPanel {
            text: "Task completed successfully",
            success: true,
            elapsed_secs: 42,
            skill_created: true,
            scheduled_job: Some("job-123"),
        };
        assert!(panel.success);
        assert_eq!(panel.elapsed_secs, 42);
        assert_eq!(panel.text, "Task completed successfully");
    }

    #[test]
    fn test_result_panel_failure() {
        let panel = ResultPanel {
            text: "Something went wrong",
            success: false,
            elapsed_secs: 10,
            skill_created: false,
            scheduled_job: None,
        };
        assert!(!panel.success);
        assert!(panel.scheduled_job.is_none());
    }

    #[test]
    fn test_result_panel_with_job() {
        let panel = ResultPanel {
            text: "ok",
            success: true,
            elapsed_secs: 5,
            skill_created: false,
            scheduled_job: Some("scheduled-999"),
        };
        assert_eq!(panel.scheduled_job.unwrap(), "scheduled-999");
    }

    #[test]
    fn test_result_panel_elapsed_format() {
        let panel = ResultPanel {
            text: "",
            success: true,
            elapsed_secs: 3600,
            skill_created: false,
            scheduled_job: None,
        };
        assert_eq!(panel.elapsed_secs, 3600);
    }
}
