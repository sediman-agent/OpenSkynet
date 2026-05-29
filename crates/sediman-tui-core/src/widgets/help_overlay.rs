use crate::renderer::{CellBuffer, Color, Rect, Style, TextAttributes};

pub struct HelpOverlay<'a> {
    pub categories: &'a [(&'a str, &'a [&'a str])],
}

impl<'a> HelpOverlay<'a> {
    pub fn render(&self, buf: &mut CellBuffer, area: Rect) {
        let mut y = area.y;
        let bold_cyan = Style::new().fg(Color::CYAN).add_modifier(TextAttributes::bold());
        let yellow_dim = Style::new().fg(Color::YELLOW).add_modifier(TextAttributes::dim());
        let white = Style::new().fg(Color::WHITE);
        let dark = Style::new().fg(Color::DARK_GRAY);

        buf.draw_str(area.x, y, "Commands", bold_cyan); y += 1;
        y += 1;

        for (category, cmds) in self.categories {
            if y >= area.bottom() { break; }
            buf.draw_str(area.x, y, &format!("[{}]", category), yellow_dim); y += 1;
            for cmd in *cmds {
                if y >= area.bottom() { break; }
                buf.draw_str(area.x, y, &format!("  {}", cmd), white); y += 1;
            }
            y += 1;
        }
        if y < area.bottom() {
            buf.draw_str(area.x, y, "Or just type a task and press Enter to run it.", dark);
        }
    }
}
