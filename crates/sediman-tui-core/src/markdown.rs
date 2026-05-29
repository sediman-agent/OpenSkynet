use crate::renderer::{Line, Style, Color};

pub fn render_markdown(text: &str) -> Vec<Line> {
    text.lines().map(|line| {
        if line.starts_with("# ") {
            Line::from_styled(&line[2..], Style::new().fg(Color::WHITE).add_modifier(crate::renderer::TextAttributes::bold()))
        } else if line.starts_with("## ") {
            Line::from_styled(&line[3..], Style::new().fg(Color::LIGHT_BLUE).add_modifier(crate::renderer::TextAttributes::bold()))
        } else if line.starts_with("- ") {
            Line::from_raw(line)
        } else if line.starts_with("```") {
            Line::from_styled(line, Style::new().fg(Color::DARK_GRAY))
        } else {
            Line::from_raw(line)
        }
    }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::renderer::TextAttributes;

    #[test]
    fn test_render_empty() {
        let lines = render_markdown("");
        assert!(lines.is_empty());
    }

    #[test]
    fn test_render_plain_text() {
        let lines = render_markdown("hello world");
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].spans[0].text, "hello world");
    }

    #[test]
    fn test_render_h1() {
        let lines = render_markdown("# Title");
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].spans[0].text, "Title");
        assert_eq!(lines[0].spans[0].style.fg, Some(Color::WHITE));
        assert!(lines[0].spans[0].style.attrs.bold);
    }

    #[test]
    fn test_render_h2() {
        let lines = render_markdown("## Subtitle");
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].spans[0].text, "Subtitle");
        assert_eq!(lines[0].spans[0].style.fg, Some(Color::LIGHT_BLUE));
        assert!(lines[0].spans[0].style.attrs.bold);
    }

    #[test]
    fn test_render_list_item() {
        let lines = render_markdown("- item");
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].spans[0].text, "- item");
    }

    #[test]
    fn test_render_code_fence() {
        let lines = render_markdown("```rust");
        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].spans[0].style.fg, Some(Color::DARK_GRAY));
    }

    #[test]
    fn test_render_multiline() {
        let lines = render_markdown("# Title\nSome text\n- item\n```code");
        assert_eq!(lines.len(), 4);
        assert_eq!(lines[0].spans[0].text, "Title");
        assert_eq!(lines[1].spans[0].text, "Some text");
        assert_eq!(lines[2].spans[0].text, "- item");
    }

    #[test]
    fn test_render_trailing_newline() {
        let lines = render_markdown("line1\nline2\n");
        assert_eq!(lines.len(), 2);
    }
}
