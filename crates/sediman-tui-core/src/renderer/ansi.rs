use std::fmt::Write as FmtWrite;
use std::io::{self, Write as IoWrite};

use super::{Cell, CellBuffer, Color, Style};

pub struct AnsiWriter {
    last_fg: Option<Color>,
    last_bg: Option<Color>,
}

impl AnsiWriter {
    pub fn new() -> Self {
        Self {
            last_fg: None,
            last_bg: None,
        }
    }

    pub fn clear_all(stdout: &mut dyn IoWrite) {
        let _ = write!(stdout, "\x1b[2J\x1b[H");
        let _ = stdout.flush();
    }

    pub fn hide_cursor(stdout: &mut dyn IoWrite) {
        let _ = write!(stdout, "\x1b[?25l");
        let _ = stdout.flush();
    }

    pub fn show_cursor(stdout: &mut dyn IoWrite) {
        let _ = write!(stdout, "\x1b[?25h");
        let _ = stdout.flush();
    }

    pub fn write(&mut self, stdout: &mut dyn IoWrite, changes: &[super::diff::Change]) -> io::Result<()> {
        for change in changes {
            write!(stdout, "\x1b[{};{}H", change.y + 1, change.x + 1)?;
            self.write_style_io(stdout, change.cell.style);
            let ch = if change.cell.ch == '\0' { ' ' } else { change.cell.ch };
            stdout.write_all(ch.to_string().as_bytes())?;
        }
        stdout.flush()
    }

    pub fn render(buffer: &CellBuffer) -> String {
        let mut out = String::with_capacity((buffer.width() * buffer.height() * 8) as usize);
        let mut last_style: Option<Style> = None;

        for y in 0..buffer.height() {
            for x in 0..buffer.width() {
                let cell = buffer.get(x, y).unwrap_or(&Cell::EMPTY);
                if cell.skip {
                    continue;
                }

                let style_changed = last_style != Some(cell.style);
                if style_changed {
                    Self::write_sgr(&mut out, cell.style);
                    last_style = Some(cell.style);
                }

                out.push(if cell.ch == '\0' { ' ' } else { cell.ch });
            }
            if y + 1 < buffer.height() {
                out.push('\n');
            }
        }

        out.push_str("\x1b[0m");
        out
    }

    fn write_style_io(&mut self, out: &mut dyn IoWrite, style: Style) {
        let fg_changed = self.last_fg != style.fg;
        let bg_changed = self.last_bg != style.bg;

        if fg_changed || bg_changed {
            out.write_all(b"\x1b[").unwrap();
            if let Some(fg) = style.fg {
                Self::write_color_io(out, 38, fg);
            } else {
                out.write_all(b"39").unwrap();
            }
            if let Some(bg) = style.bg {
                Self::write_color_io(out, 48, bg);
            } else {
                out.write_all(b";49").unwrap();
            }
            out.write_all(b"m").unwrap();
            self.last_fg = style.fg;
            self.last_bg = style.bg;
        }
    }

    fn write_color_io(out: &mut dyn IoWrite, base: u8, color: Color) {
        let (r, g, b) = color.to_rgb();
        write!(out, ";{};2;{};{};{}", base + 8, r, g, b).unwrap();
    }

    fn write_sgr(out: &mut String, style: Style) {
        out.push_str("\x1b[0");
        if let Some(fg) = style.fg {
            Self::write_color(out, 38, fg);
        }
        if let Some(bg) = style.bg {
            Self::write_color(out, 48, bg);
        }
        if style.attrs.bold { out.push_str(";1"); }
        if style.attrs.dim { out.push_str(";2"); }
        if style.attrs.italic { out.push_str(";3"); }
        if style.attrs.underline { out.push_str(";4"); }
        if style.attrs.reverse { out.push_str(";7"); }
        if style.attrs.strikethrough { out.push_str(";9"); }
        out.push('m');
    }

    fn write_color(out: &mut String, base: u8, color: Color) {
        let (r, g, b) = color.to_rgb();
        let _ = write!(out, ";{};2;{};{};{}", base + 8, r, g, b);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::renderer::diff::Change;
    use crate::renderer::TextAttributes;

    #[test]
    fn test_ansi_writer_new() {
        let w = AnsiWriter::new();
        assert!(w.last_fg.is_none());
        assert!(w.last_bg.is_none());
    }

    #[test]
    fn test_render_empty_buffer() {
        let buf = CellBuffer::new(3, 2);
        let out = AnsiWriter::render(&buf);
        assert!(out.contains("\x1b[0m"));
    }

    #[test]
    fn test_render_single_char() {
        let mut buf = CellBuffer::new(5, 1);
        buf.put(0, 0, Cell::new('A', Style::new().fg(Color::RED)));
        let out = AnsiWriter::render(&buf);
        assert!(out.contains('A'));
        assert!(out.contains("\x1b["));
        assert!(out.ends_with("\x1b[0m"));
    }

    #[test]
    fn test_render_plain_text() {
        let mut buf = CellBuffer::new(10, 1);
        buf.draw_str(0, 0, "hello", Style::new());
        let out = AnsiWriter::render(&buf);
        assert!(out.contains("hello"));
    }

    #[test]
    fn test_render_bold() {
        let mut buf = CellBuffer::new(5, 1);
        buf.put(0, 0, Cell::new('B', Style::new().add_modifier(TextAttributes::bold())));
        let out = AnsiWriter::render(&buf);
        assert!(out.contains(";1"));
    }

    #[test]
    fn test_render_italic() {
        let mut buf = CellBuffer::new(5, 1);
        buf.put(0, 0, Cell::new('I', Style::new().add_modifier(TextAttributes::italic())));
        let out = AnsiWriter::render(&buf);
        assert!(out.contains(";3"));
    }

    #[test]
    fn test_render_underline() {
        let mut buf = CellBuffer::new(5, 1);
        buf.put(0, 0, Cell::new('U', Style::new().add_modifier(TextAttributes::underline())));
        let out = AnsiWriter::render(&buf);
        assert!(out.contains(";4"));
    }

    #[test]
    fn test_render_multiline() {
        let mut buf = CellBuffer::new(5, 3);
        buf.draw_str(0, 0, "aaa", Style::new());
        buf.draw_str(0, 1, "bbb", Style::new());
        buf.draw_str(0, 2, "ccc", Style::new());
        let out = AnsiWriter::render(&buf);
        assert!(out.contains("aaa"));
        assert!(out.contains("bbb"));
        assert!(out.contains("ccc"));
    }

    #[test]
    fn test_render_skip_cells() {
        let mut buf = CellBuffer::new(5, 1);
        let mut cell = Cell::new('X', Style::new());
        cell.skip = true;
        buf.put(0, 0, cell);
        let out = AnsiWriter::render(&buf);
        assert!(!out.contains('X'));
    }

    #[test]
    fn test_render_null_char_replaced() {
        let mut buf = CellBuffer::new(5, 1);
        buf.put(0, 0, Cell::new('\0', Style::new().fg(Color::RED)));
        let out = AnsiWriter::render(&buf);
        assert!(out.contains(' '));
    }

    #[test]
    fn test_write_changes() {
        let mut w = AnsiWriter::new();
        let changes = vec![
            Change { x: 0, y: 0, cell: Cell::new('H', Style::new().fg(Color::RED)) },
            Change { x: 1, y: 0, cell: Cell::new('i', Style::new()) },
        ];
        let mut out = Vec::new();
        w.write(&mut out, &changes).unwrap();
        let s = String::from_utf8(out).unwrap();
        assert!(s.contains('H'));
        assert!(s.contains('i'));
    }

    #[test]
    fn test_write_changes_style_tracking() {
        let mut w = AnsiWriter::new();
        let changes = vec![
            Change { x: 0, y: 0, cell: Cell::new('A', Style::new().fg(Color::RED)) },
            Change { x: 1, y: 0, cell: Cell::new('B', Style::new().fg(Color::BLUE)) },
        ];
        let mut out = Vec::new();
        w.write(&mut out, &changes).unwrap();
        let s = String::from_utf8(out).unwrap();
        assert!(s.contains(";46;2;"));
        assert!(s.contains(";46;2;") );
    }

    #[test]
    fn test_clear_all() {
        let mut out = Vec::new();
        AnsiWriter::clear_all(&mut out);
        let s = String::from_utf8(out).unwrap();
        assert!(s.contains("\x1b[2J"));
        assert!(s.contains("\x1b[H"));
    }

    #[test]
    fn test_hide_cursor() {
        let mut out = Vec::new();
        AnsiWriter::hide_cursor(&mut out);
        let s = String::from_utf8(out).unwrap();
        assert!(s.contains("\x1b[?25l"));
    }

    #[test]
    fn test_show_cursor() {
        let mut out = Vec::new();
        AnsiWriter::show_cursor(&mut out);
        let s = String::from_utf8(out).unwrap();
        assert!(s.contains("\x1b[?25h"));
    }
}
