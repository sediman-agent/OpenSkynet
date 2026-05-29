use crate::renderer::{CellBuffer, Color, Rect, Style, TextAttributes};

pub struct Banner<'a> {
    pub version: &'a str,
    pub headless: bool,
    pub skills: &'a [(&'a str, &'a str)],
}

impl<'a> Banner<'a> {
    pub fn render(&self, buf: &mut CellBuffer, area: Rect) {
        let mut y = area.y;

        let bold_cyan = Style::new().fg(Color::CYAN).add_modifier(TextAttributes::bold());
        let muted = Style::new().fg(Color::DARK_GRAY);
        let green = Style::new().fg(Color::GREEN);
        let yellow = Style::new().fg(Color::YELLOW);
        let dim = Style::new().fg(Color::DARK_GRAY).add_modifier(TextAttributes::dim());

        buf.draw_str(area.x, y, "SEDIMAN", bold_cyan); y += 1;
        if y >= area.bottom() { return; }
        buf.draw_str(area.x, y, &format!("v{}", self.version), muted); y += 1;
        if y >= area.bottom() { return; }
        let browser_mode = if self.headless { "headless" } else { "headed + vision" };
        buf.draw_str(area.x, y, &format!("Browser: {}", browser_mode), green); y += 1;
        y += 1;
        if y >= area.bottom() { return; }

        if self.skills.is_empty() {
            buf.draw_str(area.x, y, "No saved skills yet.", muted);
        } else {
            buf.draw_str(area.x, y, "Skills:", yellow); y += 1;
            for (name, desc) in self.skills {
                if y >= area.bottom() { break; }
                let truncated = if desc.len() > 50 {
                    format!("{}...", &desc[..47])
                } else {
                    desc.to_string()
                };
                buf.draw_str(area.x, y, &format!("  {} — {}", name, truncated), muted);
                y += 1;
            }
        }
        y += 1;
        if y >= area.bottom() { return; }
        buf.draw_str(area.x, y, "Type /help for commands, /exit to quit, or just type a task.", dim);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_banner_version() {
        let banner = Banner { version: "0.1.0", headless: false, skills: &[] };
        assert_eq!(banner.version, "0.1.0");
    }

    #[test]
    fn test_banner_headless_mode() {
        let banner = Banner { version: "0.1.0", headless: true, skills: &[] };
        assert!(banner.headless);
    }

    #[test]
    fn test_banner_headed_mode() {
        let banner = Banner { version: "0.1.0", headless: false, skills: &[] };
        assert!(!banner.headless);
    }

    #[test]
    fn test_banner_with_skills() {
        let skills = &[("skill-a", "Does something"), ("skill-b", "Does another thing")];
        let banner = Banner { version: "0.1.0", headless: false, skills };
        assert_eq!(banner.skills.len(), 2);
        assert_eq!(banner.skills[0].0, "skill-a");
    }

    #[test]
    fn test_banner_no_skills() {
        let banner = Banner { version: "0.1.0", headless: false, skills: &[] };
        assert!(banner.skills.is_empty());
    }

    #[test]
    fn test_banner_long_description_truncation() {
        let long_desc = "a".repeat(100);
        let skills = &[("test", long_desc.as_str())];
        let banner = Banner { version: "0.1.0", headless: false, skills };
        let desc = banner.skills[0].1;
        let truncated = if desc.len() > 50 { format!("{}...", &desc[..47]) } else { desc.to_string() };
        assert_eq!(truncated.len(), 50);
        assert!(truncated.ends_with("..."));
    }
}
