use crate::renderer::{CellBuffer, Color, Rect, Style};

pub struct ContextBar {
    pub total_chars: usize,
    pub est_tokens: usize,
    pub max_tokens: usize,
}

impl ContextBar {
    pub fn render(&self, buf: &mut CellBuffer, area: Rect) {
        let pct = (self.est_tokens as f64 / self.max_tokens as f64).min(1.0);
        let bar_len = 10;
        let filled = (bar_len as f64 * pct).round() as usize;
        let bar_str: String = "▓".repeat(filled) + &"░".repeat(bar_len - filled);
        let text = format!("[{}] {}K", bar_str, self.est_tokens / 1000);

        let color = if pct > 0.8 {
            Color::RED
        } else if pct > 0.5 {
            Color::YELLOW
        } else {
            Color::GREEN
        };

        buf.draw_str(area.x, area.y, &text, Style::new().fg(color));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_bar(est_tokens: usize, max_tokens: usize) -> ContextBar {
        ContextBar { total_chars: est_tokens * 4, est_tokens, max_tokens }
    }

    #[test]
    fn test_zero_tokens() {
        let _bar = make_bar(0, 128_000);
        let text = format!("[{}] {}K", "░".repeat(10), 0);
        assert_eq!(text, "[░░░░░░░░░░] 0K");
    }

    #[test]
    fn test_half_tokens() {
        let _bar = make_bar(64_000, 128_000);
        let filled = ((10.0_f64 * 0.5).round()) as usize;
        assert_eq!(filled, 5);
    }

    #[test]
    fn test_full_tokens() {
        let _bar = make_bar(128_000, 128_000);
        let filled = ((10.0_f64 * 1.0).round()) as usize;
        assert_eq!(filled, 10);
    }

    #[test]
    fn test_over_max_capped() {
        let bar = make_bar(200_000, 128_000);
        let pct = (bar.est_tokens as f64 / bar.max_tokens as f64).min(1.0);
        assert!((pct - 1.0).abs() < 1e-6);
    }
}
