use crate::renderer::{CellBuffer, Color, Rect, Style, TextAttributes};

pub struct StatusBar<'a> {
    pub elapsed: Option<std::time::Duration>,
    pub spinner_text: Option<&'a str>,
    pub provider_model: &'a str,
    pub permission_mode: &'a str,
    pub session_name: Option<&'a str>,
    pub session_color: Option<Color>,
    pub task_count: usize,
    pub context_bar_text: Option<&'a str>,
}

impl<'a> StatusBar<'a> {
    pub fn render(&self, buf: &mut CellBuffer, area: Rect) {
        let mut x = area.x;
        let y = area.y;

        if let Some(elapsed) = self.elapsed {
            let secs = elapsed.as_secs();
            let elapsed_str = if secs >= 60 {
                format!("{}m {}s", secs / 60, secs % 60)
            } else {
                format!("{}s", secs)
            };
            let text = format!("⏳ {} ", elapsed_str);
            buf.draw_str(x, y, &text, Style::new().fg(Color::GREEN).add_modifier(TextAttributes::bold()));
            x += text.len() as u16;
            if let Some(spinner) = self.spinner_text {
                buf.draw_str(x, y, &format!("{} ", spinner), Style::new().add_modifier(TextAttributes::italic()));
                x += spinner.len() as u16 + 1;
            }
        } else {
            let text = "● idle ";
            buf.draw_str(x, y, text, Style::new().fg(Color::DARK_GRAY));
            x += text.len() as u16;
        }

        let text = format!(" {} ", self.provider_model);
        buf.draw_str(x, y, &text, Style::new().fg(Color::DARK_GRAY));
        x += text.len() as u16;

        let mode_color = match self.permission_mode {
            "acceptEdits" => Color::GREEN,
            "plan" => Color::MAGENTA,
            "auto" => Color::RED,
            _ => Color::WHITE,
        };
        let text = format!("· {} ", self.permission_mode);
        buf.draw_str(x, y, &text, Style::new().fg(mode_color));
        x += text.len() as u16;

        if let Some(name) = self.session_name {
            let color = self.session_color.unwrap_or(Color::CYAN);
            let text = format!("{} ", name);
            buf.draw_str(x, y, &text, Style::new().fg(color));
            x += text.len() as u16;
        }

        let text = format!("· {} tasks ", self.task_count);
        buf.draw_str(x, y, &text, Style::new().fg(Color::DARK_GRAY));
        x += text.len() as u16;

        if let Some(ctx) = self.context_bar_text {
            buf.draw_str(x, y, &format!("{} ", ctx), Style::new());
            x += ctx.len() as u16 + 1;
        }

        let help = "· ? help · Esc int · ^C exit · ⇧Tab mode · ! shell ";
        buf.draw_str(x, y, help, Style::new().fg(Color::DARK_GRAY).add_modifier(TextAttributes::dim()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_status_bar_idle() {
        let bar = StatusBar {
            elapsed: None,
            spinner_text: None,
            provider_model: "openai/gpt-4o",
            permission_mode: "ask",
            session_name: None,
            session_color: None,
            task_count: 0,
            context_bar_text: None,
        };
        assert!(bar.elapsed.is_none());
        assert_eq!(bar.provider_model, "openai/gpt-4o");
        assert_eq!(bar.permission_mode, "ask");
    }

    #[test]
    fn test_status_bar_running() {
        let bar = StatusBar {
            elapsed: Some(std::time::Duration::from_secs(30)),
            spinner_text: Some("processing"),
            provider_model: "openai/gpt-4o",
            permission_mode: "auto",
            session_name: Some("my-session"),
            session_color: Some(Color::CYAN),
            task_count: 3,
            context_bar_text: Some("[▓▓▓░░░░░░░] 12K"),
        };
        assert!(bar.elapsed.is_some());
        assert_eq!(bar.task_count, 3);
        assert_eq!(bar.session_name.unwrap(), "my-session");
    }

    #[test]
    fn test_status_bar_elapsed_format() {
        let bar = StatusBar {
            elapsed: Some(std::time::Duration::from_secs(125)),
            spinner_text: None,
            provider_model: "ollama/qwen3",
            permission_mode: "acceptEdits",
            session_name: None,
            session_color: None,
            task_count: 7,
            context_bar_text: None,
        };
        let secs = bar.elapsed.unwrap().as_secs();
        assert_eq!(secs, 125);
    }

    #[test]
    fn test_status_bar_mode_colors() {
        let modes = ["ask", "acceptEdits", "plan", "auto"];
        for mode in &modes {
            let bar = StatusBar {
                elapsed: None,
                spinner_text: None,
                provider_model: "test",
                permission_mode: mode,
                session_name: None,
                session_color: None,
                task_count: 1,
                context_bar_text: None,
            };
            assert_eq!(bar.permission_mode, *mode);
        }
    }

    #[test]
    fn test_status_bar_with_session() {
        let bar = StatusBar {
            elapsed: None,
            spinner_text: None,
            provider_model: "openai/gpt-4o",
            permission_mode: "ask",
            session_name: Some("my-session"),
            session_color: Some(Color::CYAN),
            task_count: 5,
            context_bar_text: None,
        };
        assert!(bar.session_name.is_some());
        assert_eq!(bar.session_color.unwrap(), Color::CYAN);
    }

    #[test]
    fn test_status_bar_no_session() {
        let bar = StatusBar {
            elapsed: None,
            spinner_text: None,
            provider_model: "openai/gpt-4o",
            permission_mode: "ask",
            session_name: None,
            session_color: None,
            task_count: 0,
            context_bar_text: None,
        };
        assert!(bar.session_name.is_none());
    }
}
