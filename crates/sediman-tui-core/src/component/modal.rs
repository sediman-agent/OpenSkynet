use crate::renderer::{CellBuffer, Rect, Style, TextAttributes, display_width, truncate_str};
use crate::styling::Theme;

use super::block::{fill_area, fill_row};
use super::border::{draw_border, draw_rounded_border};

pub struct ModalFrame {
    pub modal: Rect,
    pub inner_x: u16,
    pub inner_w: usize,
}

impl ModalFrame {
    pub fn new(buf: &mut CellBuffer, area: Rect, theme: &Theme, modal_w: u16, modal_h: u16) -> Self {
        let modal_x = area.x + (area.width.saturating_sub(modal_w)) / 2;
        let modal_y = area.y + (area.height.saturating_sub(modal_h)) / 2;
        let modal = Rect::new(modal_x, modal_y, modal_w, modal_h);

        dim_background(buf, area, theme.background_darker, theme.text_muted);
        fill_area(buf, modal, Style::new().bg(theme.background).fg(theme.text));

        Self {
            modal,
            inner_x: modal.x + 2,
            inner_w: modal.width.saturating_sub(4) as usize,
        }
    }

    pub fn draw_border(&self, buf: &mut CellBuffer, top_style: Style, bottom_style: Style) {
        draw_border(buf, self.modal, top_style, bottom_style);
    }

    pub fn draw_rounded_border(&self, buf: &mut CellBuffer, style: Style) {
        draw_rounded_border(buf, self.modal, style);
    }

    pub fn draw_title(&self, buf: &mut CellBuffer, title: &str, style: Style) {
        buf.draw_str(self.modal.x + 2, self.modal.y, title, style);
    }

    pub fn draw_close_hint(&self, buf: &mut CellBuffer, hint: &str, style: Style) {
        let x = self.modal.right().saturating_sub(display_width(hint) + 2);
        buf.draw_str(x, self.modal.y, hint, style);
    }

    pub fn draw_separator(&self, buf: &mut CellBuffer, y: u16, style: Style) {
        for sx in (self.modal.x + 1)..(self.modal.right() - 1) {
            buf.put_char(sx, y, '\u{2500}', style);
        }
    }

    pub fn draw_footer(&self, buf: &mut CellBuffer, hints: &str, hint_style: Style, sep_style: Style) {
        let sep_y = self.modal.bottom().saturating_sub(3);
        let hints_y = self.modal.bottom().saturating_sub(2);
        self.draw_separator(buf, sep_y, sep_style);
        buf.draw_str(self.inner_x, hints_y, hints, hint_style);
    }

    pub fn draw_row_highlighted(&self, buf: &mut CellBuffer, y: u16, style: Style) {
        fill_row(buf, y, self.modal.x + 1, self.modal.right() - 1, style);
    }

    pub fn draw_item(&self, buf: &mut CellBuffer, y: u16, text: &str, selected: bool, theme: &Theme) {
        if selected {
            let sel_style = Style::new().bg(theme.primary).fg(theme.background).add_modifier(TextAttributes::bold());
            self.draw_row_highlighted(buf, y, Style::new().bg(theme.primary).fg(theme.background));
            let display = truncate_str(text, self.inner_w);
            buf.draw_str(self.inner_x, y, display, sel_style);
        } else {
            buf.draw_str(self.inner_x, y, truncate_str(text, self.inner_w), Style::new().fg(theme.text).bg(theme.background));
        }
    }

    pub fn draw_item_with_marker(&self, buf: &mut CellBuffer, y: u16, text: &str, selected: bool, is_current: bool, theme: &Theme) {
        if selected {
            let sel_style = Style::new().bg(theme.primary).fg(theme.background).add_modifier(TextAttributes::bold());
            self.draw_row_highlighted(buf, y, Style::new().bg(theme.primary).fg(theme.background));
            buf.draw_str(self.inner_x, y, truncate_str(text, self.inner_w), sel_style);
        } else {
            let fg = if is_current { theme.secondary } else { theme.text };
            buf.draw_str(self.inner_x, y, truncate_str(text, self.inner_w), Style::new().fg(fg).bg(theme.background));
        }
    }

    pub fn draw_item_custom(&self, buf: &mut CellBuffer, y: u16, text: &str, selected: bool, unselected_style: Style, theme: &Theme) {
        if selected {
            let sel_style = Style::new().bg(theme.primary).fg(theme.background).add_modifier(TextAttributes::bold());
            self.draw_row_highlighted(buf, y, Style::new().bg(theme.primary).fg(theme.background));
            buf.draw_str(self.inner_x, y, truncate_str(text, self.inner_w), sel_style);
        } else {
            buf.draw_str(self.inner_x, y, truncate_str(text, self.inner_w), unselected_style);
        }
    }

    pub fn content_start_y(&self, offset: u16) -> u16 {
        self.modal.y + 1 + offset
    }
}

fn dim_background(buf: &mut CellBuffer, area: Rect, bg: crate::renderer::Color, fg: crate::renderer::Color) {
    for sy in area.y..area.bottom() {
        for sx in area.x..area.right() {
            if let Some(cell) = buf.get_mut(sx, sy) {
                cell.style = Style::new().bg(bg).fg(fg);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn theme() -> Theme {
        Theme::default()
    }

    #[test]
    fn test_modal_frame_new() {
        let mut buf = CellBuffer::new(80, 24);
        let area = Rect::new(0, 0, 80, 24);
        let frame = ModalFrame::new(&mut buf, area, &theme(), 40, 10);
        assert_eq!(frame.modal.width, 40);
        assert_eq!(frame.modal.height, 10);
        assert_eq!(frame.inner_x, frame.modal.x + 2);
        assert!(frame.inner_w > 0);
    }

    #[test]
    fn test_modal_frame_centering() {
        let mut buf = CellBuffer::new(80, 24);
        let area = Rect::new(0, 0, 80, 24);
        let frame = ModalFrame::new(&mut buf, area, &theme(), 40, 10);
        assert_eq!(frame.modal.x, 20);
        assert_eq!(frame.modal.y, 7);
    }

    #[test]
    fn test_modal_frame_draw_title() {
        let mut buf = CellBuffer::new(80, 24);
        let area = Rect::new(0, 0, 80, 24);
        let frame = ModalFrame::new(&mut buf, area, &theme(), 40, 10);
        frame.draw_title(&mut buf, "Test", Style::new().fg(crate::renderer::Color::WHITE));
        assert_eq!(buf.get(frame.modal.x + 2, frame.modal.y).unwrap().ch, 'T');
    }

    #[test]
    fn test_modal_frame_draw_item() {
        let mut buf = CellBuffer::new(80, 24);
        let area = Rect::new(0, 0, 80, 24);
        let frame = ModalFrame::new(&mut buf, area, &theme(), 40, 10);
        let y = frame.modal.y + 2;
        frame.draw_item(&mut buf, y, "hello", false, &theme());
        assert_eq!(buf.get(frame.inner_x, y).unwrap().ch, 'h');
    }

    #[test]
    fn test_modal_frame_draw_item_selected() {
        let mut buf = CellBuffer::new(80, 24);
        let area = Rect::new(0, 0, 80, 24);
        let frame = ModalFrame::new(&mut buf, area, &theme(), 40, 10);
        let y = frame.modal.y + 2;
        frame.draw_item(&mut buf, y, "hello", true, &theme());
        assert_eq!(buf.get(frame.inner_x, y).unwrap().style.attrs.bold, true);
    }

    #[test]
    fn test_content_start_y() {
        let mut buf = CellBuffer::new(80, 24);
        let area = Rect::new(0, 0, 80, 24);
        let frame = ModalFrame::new(&mut buf, area, &theme(), 40, 10);
        assert_eq!(frame.content_start_y(0), frame.modal.y + 1);
        assert_eq!(frame.content_start_y(3), frame.modal.y + 4);
    }
}
