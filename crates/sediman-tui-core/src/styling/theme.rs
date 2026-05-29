use crate::renderer::{Color, Style};

#[derive(Clone, Debug)]
pub struct Theme {
    pub primary: Color,
    pub secondary: Color,
    pub success: Color,
    pub error: Color,
    pub warning: Color,
    pub info: Color,
    pub muted: Color,
    pub muted_bg: Color,
    pub accent: Color,
    pub text: Color,
    pub text_muted: Color,
    pub background: Color,
    pub background_panel: Color,
    pub border: Color,
    pub user_message: Color,
    pub agent_message: Color,
}

impl Default for Theme {
    fn default() -> Self {
        // Nord-inspired palette — matches OpenCode's default feel
        Self {
            primary: Color::from_rgb(136, 192, 208),     // nord8  - cyan
            secondary: Color::from_rgb(129, 161, 193),    // nord9  - blue
            success: Color::from_rgb(163, 190, 140),      // nord14 - green
            error: Color::from_rgb(191, 97, 106),          // nord11 - red
            warning: Color::from_rgb(208, 135, 112),       // nord12 - orange
            info: Color::from_rgb(180, 142, 173),           // nord15 - purple
            muted: Color::from_rgb(76, 86, 106),            // nord3  - gray
            muted_bg: Color::from_rgb(59, 66, 82),          // nord1  - dark gray
            accent: Color::from_rgb(143, 188, 187),         // nord7  - teal
            text: Color::from_rgb(216, 222, 233),           // nord4  - light gray
            text_muted: Color::from_rgb(76, 86, 106),        // nord3  - muted text
            background: Color::from_rgb(46, 52, 64),         // nord0  - dark bg
            background_panel: Color::from_rgb(46, 52, 64),   // same as bg
            border: Color::from_rgb(59, 66, 82),             // nord1  - subtle border
            user_message: Color::from_rgb(136, 192, 208),    // nord8  - cyan label
            agent_message: Color::from_rgb(216, 222, 233),   // nord4  - white text
        }
    }
}

impl Theme {
    pub fn primary_style(&self) -> Style {
        Style::new().fg(self.primary)
    }

    pub fn secondary_style(&self) -> Style {
        Style::new().fg(self.secondary)
    }

    pub fn success_style(&self) -> Style {
        Style::new().fg(self.success)
    }

    pub fn error_style(&self) -> Style {
        Style::new().fg(self.error)
    }

    pub fn muted_style(&self) -> Style {
        Style::new().fg(self.muted)
    }

    pub fn warning_style(&self) -> Style {
        Style::new().fg(self.warning)
    }

    pub fn info_style(&self) -> Style {
        Style::new().fg(self.info)
    }

    pub fn accent_style(&self) -> Style {
        Style::new().fg(self.accent)
    }

    pub fn text_style(&self) -> Style {
        Style::new().fg(self.text)
    }

    pub fn text_muted_style(&self) -> Style {
        Style::new().fg(self.text_muted)
    }

    pub fn border_style(&self) -> Style {
        Style::new().fg(self.border)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_theme_has_nord_palette() {
        let theme = Theme::default();
        assert_eq!(theme.primary, Color::from_rgb(136, 192, 208));
        assert_eq!(theme.background, Color::from_rgb(46, 52, 64));
    }

    #[test]
    fn test_primary_style() {
        let theme = Theme::default();
        let style = theme.primary_style();
        assert_eq!(style.fg, Some(theme.primary));
    }

    #[test]
    fn test_success_style() {
        let theme = Theme::default();
        let style = theme.success_style();
        assert_eq!(style.fg, Some(theme.success));
    }

    #[test]
    fn test_error_style() {
        let theme = Theme::default();
        let style = theme.error_style();
        assert_eq!(style.fg, Some(theme.error));
    }

    #[test]
    fn test_muted_style() {
        let theme = Theme::default();
        let style = theme.muted_style();
        assert_eq!(style.fg, Some(theme.muted));
    }
}
