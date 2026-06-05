use crate::renderer::{CellBuffer, Rect, Style, display_width};

pub fn fill_row(buf: &mut CellBuffer, y: u16, x_start: u16, x_end: u16, style: Style) {
    for sx in x_start..x_end {
        buf.put_char(sx, y, ' ', style);
    }
}

pub fn fill_area(buf: &mut CellBuffer, rect: Rect, style: Style) {
    for sy in rect.y..rect.bottom() {
        fill_row(buf, sy, rect.x, rect.right(), style);
    }
}

pub fn draw_separator(buf: &mut CellBuffer, y: u16, x_start: u16, x_end: u16, style: Style) {
    for sx in x_start..x_end {
        buf.put_char(sx, y, '\u{2500}', style);
    }
}

pub fn draw_pill(buf: &mut CellBuffer, x: u16, y: u16, text: &str, text_style: Style) -> u16 {
    let w = display_width(text);
    buf.draw_str(x, y, text, text_style);
    x + w
}

pub fn draw_right_aligned(buf: &mut CellBuffer, y: u16, right_x: u16, text: &str, style: Style) {
    let w = display_width(text);
    let x = right_x.saturating_sub(w);
    buf.draw_str(x, y, text, style);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::renderer::Color;

    #[test]
    fn test_fill_row() {
        let mut buf = CellBuffer::new(10, 3);
        let style = Style::new().bg(Color::RED);
        fill_row(&mut buf, 1, 2, 8, style);
        for x in 2..8 {
            assert_eq!(buf.get(x, 1).unwrap().style.bg, Some(Color::RED));
        }
        assert!(buf.get(1, 1).unwrap().is_empty());
        assert!(buf.get(8, 1).unwrap().is_empty());
    }

    #[test]
    fn test_fill_area() {
        let mut buf = CellBuffer::new(10, 5);
        let style = Style::new().bg(Color::BLUE);
        let rect = Rect::new(2, 1, 5, 3);
        fill_area(&mut buf, rect, style);
        assert_eq!(buf.get(3, 2).unwrap().style.bg, Some(Color::BLUE));
        assert!(buf.get(0, 0).unwrap().is_empty());
    }

    #[test]
    fn test_draw_separator() {
        let mut buf = CellBuffer::new(10, 3);
        draw_separator(&mut buf, 1, 0, 10, Style::new().fg(Color::WHITE));
        for x in 0..10 {
            assert_eq!(buf.get(x, 1).unwrap().ch, '\u{2500}');
        }
    }

    #[test]
    fn test_draw_pill() {
        let mut buf = CellBuffer::new(20, 1);
        let next_x = draw_pill(&mut buf, 5, 0, "hello", Style::new().fg(Color::GREEN));
        assert_eq!(next_x, 10);
        assert_eq!(buf.get(5, 0).unwrap().ch, 'h');
    }

    #[test]
    fn test_draw_right_aligned() {
        let mut buf = CellBuffer::new(20, 1);
        draw_right_aligned(&mut buf, 0, 10, "hi", Style::new().fg(Color::WHITE));
        assert_eq!(buf.get(8, 0).unwrap().ch, 'h');
        assert_eq!(buf.get(9, 0).unwrap().ch, 'i');
    }
}
