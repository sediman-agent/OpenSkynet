use crate::renderer::{CellBuffer, Style, display_width, truncate_str};
use crate::styling::Theme;

fn char_width(ch: char) -> u16 {
    unicode_width::UnicodeWidthChar::width(ch).unwrap_or(0) as u16
}

pub struct InputRowConfig<'a> {
    pub prompt: &'a str,
    pub text: &'a str,
    pub cursor: usize,
    pub placeholder: &'a str,
    pub scroll: usize,
}

impl<'a> InputRowConfig<'a> {
    pub fn new(text: &'a str, cursor: usize, placeholder: &'a str) -> Self {
        Self {
            prompt: "\u{276F} ",
            text,
            cursor,
            placeholder,
            scroll: 0,
        }
    }

    pub fn with_prompt(mut self, prompt: &'a str) -> Self {
        self.prompt = prompt;
        self
    }

    pub fn with_scroll(mut self, scroll: usize) -> Self {
        self.scroll = scroll;
        self
    }
}

pub fn draw_input_row(buf: &mut CellBuffer, x: u16, y: u16, max_w: usize, config: &InputRowConfig, theme: &Theme) {
    let bg_style = Style::new().bg(theme.background_panel).fg(theme.text);
    let prompt_style = Style::new().bg(theme.background_panel).fg(theme.primary);
    let placeholder_style = Style::new().bg(theme.background_panel).fg(theme.text_muted);
    let cursor_style = Style::new().bg(theme.primary).fg(theme.background);

    for sx in x..x + max_w as u16 {
        buf.put_char(sx, y, ' ', bg_style);
    }

    let mut cx = x;
    buf.draw_str(cx, y, config.prompt, prompt_style);
    cx += display_width(config.prompt);

    let available = max_w.saturating_sub(display_width(config.prompt) as usize);
    let text_chars: Vec<char> = config.text.chars().collect();

    if text_chars.is_empty() && config.cursor == 0 {
        if !config.placeholder.is_empty() {
            let ph = truncate_str(config.placeholder, available);
            buf.draw_str(cx, y, ph, placeholder_style);
            buf.put_char(cx, y, ' ', cursor_style);
        } else {
            buf.put_char(cx, y, ' ', cursor_style);
        }
        return;
    }

    let scroll = config.scroll;
    let mut visible: Vec<char> = Vec::new();
    let mut width = 0usize;
    for &ch in text_chars.iter().skip(scroll) {
        let w = char_width(ch) as usize;
        if width + w > available { break; }
        visible.push(ch);
        width += w;
    }

    for (i, &ch) in visible.iter().enumerate() {
        let char_idx = scroll + i;
        let w = char_width(ch);
        let style = if char_idx == config.cursor { cursor_style } else { bg_style };
        buf.put_char(cx, y, ch, style);
        cx += 1;
        for _ in 1..w {
            if (cx as usize) < (x as usize) + max_w {
                if let Some(cell) = buf.get_mut(cx, y) {
                    cell.skip = true;
                }
            }
            cx += 1;
        }
    }

    if config.cursor == text_chars.len() && config.cursor >= scroll + visible.len()
        && (cx as usize) < (x as usize) + max_w
    {
        buf.put_char(cx, y, ' ', cursor_style);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_draw_input_row_empty_with_placeholder() {
        let mut buf = CellBuffer::new(40, 3);
        let theme = Theme::default();
        let config = InputRowConfig::new("", 0, "type here...");
        draw_input_row(&mut buf, 0, 1, 30, &config, &theme);
        assert_eq!(buf.get(0, 1).unwrap().ch, '\u{276F}');
    }

    #[test]
    fn test_draw_input_row_with_text() {
        let mut buf = CellBuffer::new(40, 3);
        let theme = Theme::default();
        let config = InputRowConfig::new("hello", 5, "");
        draw_input_row(&mut buf, 0, 1, 30, &config, &theme);
        assert_eq!(buf.get(2, 1).unwrap().ch, 'h');
        assert_eq!(buf.get(6, 1).unwrap().ch, 'o');
    }

    #[test]
    fn test_draw_input_row_cursor_at_start() {
        let mut buf = CellBuffer::new(40, 3);
        let theme = Theme::default();
        let config = InputRowConfig::new("hi", 0, "");
        draw_input_row(&mut buf, 0, 1, 30, &config, &theme);
        let cell = buf.get(2, 1).unwrap();
        assert_eq!(cell.ch, 'h');
        assert_eq!(cell.style.bg, Some(theme.primary));
    }

    #[test]
    fn test_draw_input_row_fills_background() {
        let mut buf = CellBuffer::new(40, 3);
        let theme = Theme::default();
        let config = InputRowConfig::new("a", 1, "");
        draw_input_row(&mut buf, 0, 1, 20, &config, &theme);
        let cell = buf.get(19, 1).unwrap();
        assert_eq!(cell.style.bg, Some(theme.background_panel));
    }

    #[test]
    fn test_draw_input_row_wide_char() {
        let mut buf = CellBuffer::new(40, 3);
        let theme = Theme::default();
        let config = InputRowConfig::new("a\u{4e16}b", 3, "");
        draw_input_row(&mut buf, 0, 1, 30, &config, &theme);
        assert_eq!(buf.get(2, 1).unwrap().ch, 'a');
        assert_eq!(buf.get(3, 1).unwrap().ch, '\u{4e16}');
        assert!(buf.get(4, 1).unwrap().skip);
        assert_eq!(buf.get(5, 1).unwrap().ch, 'b');
    }

    #[test]
    fn test_draw_input_row_cursor_at_end() {
        let mut buf = CellBuffer::new(40, 3);
        let theme = Theme::default();
        let config = InputRowConfig::new("abc", 3, "");
        draw_input_row(&mut buf, 0, 1, 30, &config, &theme);
        let cursor_cell = buf.get(5, 1).unwrap();
        assert_eq!(cursor_cell.style.bg, Some(theme.primary));
    }
}
