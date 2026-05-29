use super::Cell;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Hash)]
pub struct Rect {
    pub x: u16,
    pub y: u16,
    pub width: u16,
    pub height: u16,
}

impl Rect {
    pub fn new(x: u16, y: u16, width: u16, height: u16) -> Self {
        Self { x, y, width, height }
    }

    pub fn from_points(x1: u16, y1: u16, x2: u16, y2: u16) -> Self {
        Self {
            x: x1,
            y: y1,
            width: x2.saturating_sub(x1),
            height: y2.saturating_sub(y1),
        }
    }

    pub fn right(self) -> u16 {
        self.x.saturating_add(self.width)
    }

    pub fn bottom(self) -> u16 {
        self.y.saturating_add(self.height)
    }

    pub fn contains(self, x: u16, y: u16) -> bool {
        x >= self.x && x < self.right() && y >= self.y && y < self.bottom()
    }

    pub fn intersect(self, other: Self) -> Option<Self> {
        let x = self.x.max(other.x);
        let y = self.y.max(other.y);
        let right = self.right().min(other.right());
        let bottom = self.bottom().min(other.bottom());
        if right <= x || bottom <= y {
            return None;
        }
        Some(Self {
            x,
            y,
            width: right - x,
            height: bottom - y,
        })
    }

    pub fn clamp(self, other: Self) -> Self {
        let x = self.x.max(other.x);
        let y = self.y.max(other.y);
        let width = self.right().min(other.right()).saturating_sub(x);
        let height = self.bottom().min(other.bottom()).saturating_sub(y);
        Self { x, y, width, height }
    }

    pub fn inner(self, left: u16, right: u16, top: u16, bottom: u16) -> Self {
        let x = self.x.saturating_add(left);
        let y = self.y.saturating_add(top);
        let width = self.width.saturating_sub(left).saturating_sub(right);
        let height = self.height.saturating_sub(top).saturating_sub(bottom);
        Self { x, y, width, height }
    }

    pub fn split_top(self, h: u16) -> (Self, Self) {
        let top = Self {
            x: self.x,
            y: self.y,
            width: self.width,
            height: h.min(self.height),
        };
        let bottom = Self {
            x: self.x,
            y: self.y + top.height,
            width: self.width,
            height: self.height - top.height,
        };
        (top, bottom)
    }

    pub fn split_bottom(self, h: u16) -> (Self, Self) {
        let bottom_h = h.min(self.height);
        let bottom = Self {
            x: self.x,
            y: self.y + self.height - bottom_h,
            width: self.width,
            height: bottom_h,
        };
        let top = Self {
            x: self.x,
            y: self.y,
            width: self.width,
            height: self.height - bottom_h,
        };
        (top, bottom)
    }

    pub fn split_left(self, w: u16) -> (Self, Self) {
        let left = Self {
            x: self.x,
            y: self.y,
            width: w.min(self.width),
            height: self.height,
        };
        let right = Self {
            x: self.x + left.width,
            y: self.y,
            width: self.width - left.width,
            height: self.height,
        };
        (left, right)
    }

    pub fn split_right(self, w: u16) -> (Self, Self) {
        let right_w = w.min(self.width);
        let right = Self {
            x: self.x + self.width - right_w,
            y: self.y,
            width: right_w,
            height: self.height,
        };
        let left = Self {
            x: self.x,
            y: self.y,
            width: self.width - right_w,
            height: self.height,
        };
        (left, right)
    }

    pub fn rows(self, heights: &[u16]) -> Vec<Self> {
        let total: u16 = heights.iter().sum();
        let scale = if total > 0 { self.height as f32 / total as f32 } else { 0.0 };
        let mut y = self.y;
        heights
            .iter()
            .map(|&h| {
                let scaled = ((h as f32 * scale).round() as u16).max(1).min(self.height);
                let height = scaled.min(self.height - (y - self.y));
                let r = Self { x: self.x, y, width: self.width, height };
                y += height;
                r
            })
            .collect()
    }

    pub fn columns(self, widths: &[u16]) -> Vec<Self> {
        let total: u16 = widths.iter().sum();
        let scale = if total > 0 { self.width as f32 / total as f32 } else { 0.0 };
        let mut x = self.x;
        widths
            .iter()
            .map(|&w| {
                let scaled = ((w as f32 * scale).round() as u16).max(1).min(self.width);
                let width = scaled.min(self.width - (x - self.x));
                let r = Self { x, y: self.y, width, height: self.height };
                x += width;
                r
            })
            .collect()
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct CellBuffer {
    area: Rect,
    cells: Vec<Cell>,
}

impl CellBuffer {
    pub fn empty() -> Self {
        Self {
            area: Rect::new(0, 0, 0, 0),
            cells: Vec::new(),
        }
    }

    pub fn new(width: u16, height: u16) -> Self {
        let area = Rect::new(0, 0, width, height);
        let len = (width as usize) * (height as usize);
        Self {
            area,
            cells: vec![Cell::default(); len],
        }
    }

    pub fn area(&self) -> Rect {
        self.area
    }

    pub fn width(&self) -> u16 {
        self.area.width
    }

    pub fn height(&self) -> u16 {
        self.area.height
    }

    fn index(&self, x: u16, y: u16) -> Option<usize> {
        if x >= self.area.width || y >= self.area.height {
            return None;
        }
        Some((y as usize) * (self.area.width as usize) + (x as usize))
    }

    pub fn get(&self, x: u16, y: u16) -> Option<&Cell> {
        self.index(x, y).map(|i| &self.cells[i])
    }

    pub fn get_mut(&mut self, x: u16, y: u16) -> Option<&mut Cell> {
        let i = self.index(x, y)?;
        Some(&mut self.cells[i])
    }

    pub fn put(&mut self, x: u16, y: u16, cell: Cell) {
        if let Some(i) = self.index(x, y) {
            self.cells[i] = cell;
        }
    }

    pub fn put_char(&mut self, x: u16, y: u16, ch: char, style: super::Style) {
        self.put(x, y, Cell::new(ch, style));
    }

    pub fn set_style(&mut self, x: u16, y: u16, style: super::Style) {
        if let Some(c) = self.get_mut(x, y) {
            c.style = style;
        }
    }

    pub fn resize(&mut self, width: u16, height: u16) {
        let new_area = Rect::new(self.area.x, self.area.y, width, height);
        let new_len = (width as usize) * (height as usize);
        let mut new_cells = vec![Cell::default(); new_len];
        for y in 0..self.area.height.min(height) {
            for x in 0..self.area.width.min(width) {
                if let Some(old) = self.get(x, y) {
                    let idx = (y as usize) * (width as usize) + (x as usize);
                    new_cells[idx] = *old;
                }
            }
        }
        self.area = new_area;
        self.cells = new_cells;
    }

    pub fn clear(&mut self) {
        for c in &mut self.cells {
            c.clear();
        }
    }

    pub fn fill(&mut self, rect: Rect, cell: Cell) {
        let clamped = rect.clamp(self.area);
        for y in clamped.y..clamped.bottom() {
            for x in clamped.x..clamped.right() {
                self.put(x, y, cell);
            }
        }
    }

    pub fn fill_style(&mut self, rect: Rect, style: super::Style) {
        let clamped = rect.clamp(self.area);
        for y in clamped.y..clamped.bottom() {
            for x in clamped.x..clamped.right() {
                if let Some(c) = self.get_mut(x, y) {
                    c.style = style;
                }
            }
        }
    }

    pub fn clear_rect(&mut self, rect: Rect) {
        let clamped = rect.clamp(self.area);
        for y in clamped.y..clamped.bottom() {
            for x in clamped.x..clamped.right() {
                if let Some(c) = self.get_mut(x, y) {
                    c.clear();
                }
            }
        }
    }

    pub fn draw_str(&mut self, x: u16, y: u16, text: &str, style: super::Style) {
        let mut cx = x;
        for ch in text.chars() {
            if cx >= self.area.width || y >= self.area.height {
                break;
            }
            self.put(cx, y, Cell::new(ch, style));
            cx += 1;
        }
    }

    pub fn draw_wrapped_str(&mut self, rect: Rect, text: &str, style: super::Style) {
        let clamped = rect.clamp(self.area);
        let mut x = clamped.x;
        let mut y = clamped.y;
        for ch in text.chars() {
            if y >= clamped.bottom() {
                break;
            }
            if ch == '\n' {
                x = clamped.x;
                y += 1;
                continue;
            }
            if x >= clamped.right() {
                x = clamped.x;
                y += 1;
                if y >= clamped.bottom() {
                    break;
                }
            }
            self.put(x, y, Cell::new(ch, style));
            x += 1;
        }
    }

    pub fn blit(&mut self, dst_rect: Rect, src: &CellBuffer, src_rect: Rect) {
        let dst_clamped = dst_rect.clamp(self.area);
        let w = dst_clamped.width.min(src_rect.width);
        let h = dst_clamped.height.min(src_rect.height);
        for dy in 0..h {
            for dx in 0..w {
                let sx = src_rect.x + dx;
                let sy = src_rect.y + dy;
                let dx = dst_clamped.x + dx;
                let dy = dst_clamped.y + dy;
                if let Some(cell) = src.get(sx, sy) {
                    self.put(dx, dy, *cell);
                }
            }
        }
    }

    pub fn iter_cells(&self) -> impl Iterator<Item = (u16, u16, &Cell)> {
        let width = self.area.width;
        self.cells.iter().enumerate().filter_map(move |(i, cell)| {
            if cell.is_empty() {
                return None;
            }
            let x = (i % width as usize) as u16;
            let y = (i / width as usize) as u16;
            Some((x, y, cell))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::renderer::{Color, Style};

    #[test]
    fn test_rect_new() {
        let r = Rect::new(1, 2, 10, 20);
        assert_eq!(r.x, 1);
        assert_eq!(r.y, 2);
        assert_eq!(r.width, 10);
        assert_eq!(r.height, 20);
    }

    #[test]
    fn test_rect_from_points() {
        let r = Rect::from_points(0, 0, 10, 5);
        assert_eq!(r.width, 10);
        assert_eq!(r.height, 5);
    }

    #[test]
    fn test_rect_from_points_inverted() {
        let r = Rect::from_points(10, 5, 0, 0);
        assert_eq!(r.width, 0);
        assert_eq!(r.height, 0);
    }

    #[test]
    fn test_rect_right_and_bottom() {
        let r = Rect::new(5, 3, 10, 8);
        assert_eq!(r.right(), 15);
        assert_eq!(r.bottom(), 11);
    }

    #[test]
    fn test_rect_contains() {
        let r = Rect::new(1, 1, 5, 5);
        assert!(r.contains(1, 1));
        assert!(r.contains(5, 5));
        assert!(!r.contains(6, 5));
        assert!(!r.contains(1, 6));
        assert!(!r.contains(0, 0));
    }

    #[test]
    fn test_rect_intersect() {
        let a = Rect::new(0, 0, 10, 10);
        let b = Rect::new(5, 5, 10, 10);
        let c = a.intersect(b).unwrap();
        assert_eq!(c, Rect::new(5, 5, 5, 5));
    }

    #[test]
    fn test_rect_no_intersect() {
        let a = Rect::new(0, 0, 5, 5);
        let b = Rect::new(10, 10, 5, 5);
        assert!(a.intersect(b).is_none());
    }

    #[test]
    fn test_rect_intersect_touching() {
        let a = Rect::new(0, 0, 5, 5);
        let b = Rect::new(5, 0, 5, 5);
        assert!(a.intersect(b).is_none());
    }

    #[test]
    fn test_rect_clamp() {
        let outer = Rect::new(0, 0, 10, 10);
        let inner = Rect::new(5, 5, 10, 10);
        assert_eq!(inner.clamp(outer), Rect::new(5, 5, 5, 5));
    }

    #[test]
    fn test_rect_clamp_fully_inside() {
        let outer = Rect::new(0, 0, 20, 20);
        let inner = Rect::new(5, 5, 5, 5);
        assert_eq!(inner.clamp(outer), inner);
    }

    #[test]
    fn test_rect_inner() {
        let r = Rect::new(0, 0, 10, 10);
        let i = r.inner(1, 1, 1, 1);
        assert_eq!(i, Rect::new(1, 1, 8, 8));
    }

    #[test]
    fn test_rect_inner_oversized() {
        let r = Rect::new(0, 0, 5, 5);
        let i = r.inner(3, 3, 3, 3);
        assert_eq!(i.width, 0);
        assert_eq!(i.height, 0);
    }

    #[test]
    fn test_rect_split_top() {
        let r = Rect::new(0, 0, 80, 24);
        let (top, bottom) = r.split_top(3);
        assert_eq!(top.height, 3);
        assert_eq!(top.y, 0);
        assert_eq!(bottom.height, 21);
        assert_eq!(bottom.y, 3);
    }

    #[test]
    fn test_rect_split_top_oversized() {
        let r = Rect::new(0, 0, 80, 24);
        let (top, bottom) = r.split_top(100);
        assert_eq!(top.height, 24);
        assert_eq!(bottom.height, 0);
    }

    #[test]
    fn test_rect_split_bottom() {
        let r = Rect::new(0, 0, 80, 24);
        let (top, bottom) = r.split_bottom(5);
        assert_eq!(bottom.height, 5);
        assert_eq!(bottom.y, 19);
        assert_eq!(top.height, 19);
    }

    #[test]
    fn test_rect_split_left() {
        let r = Rect::new(0, 0, 80, 24);
        let (left, right) = r.split_left(20);
        assert_eq!(left.width, 20);
        assert_eq!(right.width, 60);
    }

    #[test]
    fn test_rect_split_right() {
        let r = Rect::new(0, 0, 80, 24);
        let (left, right) = r.split_right(30);
        assert_eq!(right.width, 30);
        assert_eq!(right.x, 50);
        assert_eq!(left.width, 50);
    }

    #[test]
    fn test_rect_rows() {
        let r = Rect::new(0, 0, 80, 24);
        let rows = r.rows(&[1, 1, 1, 1]);
        assert_eq!(rows.len(), 4);
        let sum: u16 = rows.iter().map(|r| r.height).sum();
        assert_eq!(sum, 24);
    }

    #[test]
    fn test_rect_columns() {
        let r = Rect::new(0, 0, 80, 24);
        let cols = r.columns(&[60, 40]);
        assert_eq!(cols.len(), 2);
        let sum: u16 = cols.iter().map(|c| c.width).sum();
        assert_eq!(sum, 80);
    }

    #[test]
    fn test_rect_default() {
        let r = Rect::default();
        assert_eq!(r.x, 0);
        assert_eq!(r.y, 0);
        assert_eq!(r.width, 0);
        assert_eq!(r.height, 0);
    }

    #[test]
    fn test_buffer_empty() {
        let b = CellBuffer::empty();
        assert_eq!(b.width(), 0);
        assert_eq!(b.height(), 0);
    }

    #[test]
    fn test_buffer_new() {
        let b = CellBuffer::new(80, 24);
        assert_eq!(b.width(), 80);
        assert_eq!(b.height(), 24);
        assert_eq!(b.area(), Rect::new(0, 0, 80, 24));
    }

    #[test]
    fn test_buffer_put_get() {
        let mut buf = CellBuffer::new(10, 10);
        buf.put(5, 5, Cell::new('a', Style::new().fg(Color::RED)));
        let c = buf.get(5, 5).unwrap();
        assert_eq!(c.ch, 'a');
        assert_eq!(c.style.fg, Some(Color::RED));
    }

    #[test]
    fn test_buffer_out_of_bounds() {
        let mut buf = CellBuffer::new(5, 5);
        assert!(buf.get(10, 0).is_none());
        assert!(buf.get(0, 10).is_none());
        buf.put(10, 0, Cell::new('x', Style::new()));
    }

    #[test]
    fn test_buffer_clear() {
        let mut buf = CellBuffer::new(5, 5);
        buf.put(2, 2, Cell::new('x', Style::new().fg(Color::RED)));
        buf.clear();
        assert!(buf.get(2, 2).unwrap().is_empty());
    }

    #[test]
    fn test_buffer_fill() {
        let mut buf = CellBuffer::new(10, 10);
        let cell = Cell::new('#', Style::new().fg(Color::GREEN));
        buf.fill(Rect::new(2, 2, 3, 3), cell);
        assert_eq!(buf.get(2, 2).unwrap().ch, '#');
        assert_eq!(buf.get(4, 4).unwrap().ch, '#');
        assert!(buf.get(5, 5).unwrap().is_empty());
    }

    #[test]
    fn test_buffer_fill_clamps() {
        let mut buf = CellBuffer::new(5, 5);
        let cell = Cell::new('X', Style::new());
        buf.fill(Rect::new(3, 3, 10, 10), cell);
        assert_eq!(buf.get(3, 3).unwrap().ch, 'X');
        assert_eq!(buf.get(4, 4).unwrap().ch, 'X');
        assert!(buf.get(5, 5).is_none());
    }

    #[test]
    fn test_buffer_draw_str() {
        let mut buf = CellBuffer::new(10, 5);
        buf.draw_str(0, 0, "hello", Style::new());
        assert_eq!(buf.get(0, 0).unwrap().ch, 'h');
        assert_eq!(buf.get(4, 0).unwrap().ch, 'o');
    }

    #[test]
    fn test_buffer_draw_str_clips() {
        let mut buf = CellBuffer::new(3, 1);
        buf.draw_str(0, 0, "hello", Style::new());
        assert_eq!(buf.get(2, 0).unwrap().ch, 'l');
        assert!(buf.get(3, 0).is_none());
    }

    #[test]
    fn test_buffer_draw_wrapped_str() {
        let mut buf = CellBuffer::new(10, 5);
        buf.draw_wrapped_str(Rect::new(0, 0, 5, 5), "hello\nworld", Style::new());
        assert_eq!(buf.get(0, 0).unwrap().ch, 'h');
        assert_eq!(buf.get(0, 1).unwrap().ch, 'w');
    }

    #[test]
    fn test_buffer_draw_wrapped_str_wraps() {
        let mut buf = CellBuffer::new(5, 5);
        buf.draw_wrapped_str(Rect::new(0, 0, 3, 5), "abcdef", Style::new());
        assert_eq!(buf.get(0, 0).unwrap().ch, 'a');
        assert_eq!(buf.get(2, 0).unwrap().ch, 'c');
        assert_eq!(buf.get(0, 1).unwrap().ch, 'd');
    }

    #[test]
    fn test_buffer_resize_grow() {
        let mut buf = CellBuffer::new(5, 5);
        buf.put(2, 2, Cell::new('x', Style::new()));
        buf.resize(10, 10);
        assert_eq!(buf.get(2, 2).unwrap().ch, 'x');
        assert_eq!(buf.width(), 10);
        assert_eq!(buf.height(), 10);
    }

    #[test]
    fn test_buffer_resize_shrink() {
        let mut buf = CellBuffer::new(10, 10);
        buf.put(9, 9, Cell::new('z', Style::new()));
        buf.resize(5, 5);
        assert!(buf.get(9, 9).is_none());
        assert_eq!(buf.width(), 5);
        assert_eq!(buf.height(), 5);
    }

    #[test]
    fn test_buffer_clear_rect() {
        let mut buf = CellBuffer::new(10, 10);
        buf.fill(Rect::new(0, 0, 10, 10), Cell::new('X', Style::new()));
        buf.clear_rect(Rect::new(2, 2, 3, 3));
        assert!(buf.get(2, 2).unwrap().is_empty());
        assert_eq!(buf.get(0, 0).unwrap().ch, 'X');
    }

    #[test]
    fn test_buffer_fill_style() {
        let mut buf = CellBuffer::new(5, 5);
        buf.put(0, 0, Cell::new('a', Style::new()));
        buf.fill_style(Rect::new(0, 0, 5, 5), Style::new().bg(Color::RED));
        assert_eq!(buf.get(0, 0).unwrap().style.bg, Some(Color::RED));
        assert_eq!(buf.get(0, 0).unwrap().ch, 'a');
    }

    #[test]
    fn test_buffer_put_char() {
        let mut buf = CellBuffer::new(10, 1);
        buf.put_char(0, 0, 'Z', Style::new().fg(Color::CYAN));
        assert_eq!(buf.get(0, 0).unwrap().ch, 'Z');
        assert_eq!(buf.get(0, 0).unwrap().style.fg, Some(Color::CYAN));
    }

    #[test]
    fn test_buffer_set_style() {
        let mut buf = CellBuffer::new(5, 5);
        buf.put(0, 0, Cell::new('x', Style::new()));
        buf.set_style(0, 0, Style::new().fg(Color::GREEN));
        assert_eq!(buf.get(0, 0).unwrap().style.fg, Some(Color::GREEN));
        assert_eq!(buf.get(0, 0).unwrap().ch, 'x');
    }

    #[test]
    fn test_buffer_get_mut() {
        let mut buf = CellBuffer::new(5, 5);
        buf.get_mut(0, 0).unwrap().ch = 'M';
        assert_eq!(buf.get(0, 0).unwrap().ch, 'M');
    }

    #[test]
    fn test_buffer_blit() {
        let mut src = CellBuffer::new(5, 5);
        src.put(0, 0, Cell::new('A', Style::new()));
        src.put(1, 0, Cell::new('B', Style::new()));

        let mut dst = CellBuffer::new(10, 10);
        dst.blit(Rect::new(5, 5, 2, 1), &src, Rect::new(0, 0, 2, 1));

        assert_eq!(dst.get(5, 5).unwrap().ch, 'A');
        assert_eq!(dst.get(6, 5).unwrap().ch, 'B');
    }

    #[test]
    fn test_buffer_iter_cells() {
        let mut buf = CellBuffer::new(3, 3);
        buf.put(0, 0, Cell::new('a', Style::new()));
        buf.put(1, 1, Cell::new('b', Style::new()));
        let cells: Vec<_> = buf.iter_cells().collect();
        assert_eq!(cells.len(), 2);
        assert_eq!(cells[0].0, 0);
        assert_eq!(cells[0].1, 0);
        assert_eq!(cells[1].0, 1);
        assert_eq!(cells[1].1, 1);
    }

    #[test]
    fn test_buffer_iter_cells_skips_empty() {
        let buf = CellBuffer::new(10, 10);
        let cells: Vec<_> = buf.iter_cells().collect();
        assert!(cells.is_empty());
    }

    #[test]
    fn test_buffer_clone() {
        let mut buf = CellBuffer::new(5, 5);
        buf.put(0, 0, Cell::new('x', Style::new()));
        let clone = buf.clone();
        assert_eq!(clone.get(0, 0).unwrap().ch, 'x');
    }
}
