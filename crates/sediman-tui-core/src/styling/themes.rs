use super::theme::Theme;
use crate::renderer::Color;

fn nord() -> Theme {
    Theme::default()
}

fn tokyo_night() -> Theme {
    Theme {
        primary: Color::from_rgb(122, 162, 247),
        secondary: Color::from_rgb(187, 154, 247),
        success: Color::from_rgb(158, 206, 106),
        error: Color::from_rgb(247, 118, 142),
        warning: Color::from_rgb(224, 175, 104),
        info: Color::from_rgb(125, 207, 255),
        muted: Color::from_rgb(86, 95, 137),
        muted_bg: Color::from_rgb(36, 40, 59),
        accent: Color::from_rgb(125, 207, 255),
        text: Color::from_rgb(169, 177, 214),
        text_muted: Color::from_rgb(86, 95, 137),
        background: Color::from_rgb(26, 27, 38),
        background_panel: Color::from_rgb(36, 40, 59),
        border: Color::from_rgb(59, 66, 97),
        user_message: Color::from_rgb(122, 162, 247),
        agent_message: Color::from_rgb(169, 177, 214),
    }
}

fn catppuccin_mocha() -> Theme {
    Theme {
        primary: Color::from_rgb(137, 180, 250),
        secondary: Color::from_rgb(203, 166, 247),
        success: Color::from_rgb(166, 227, 161),
        error: Color::from_rgb(243, 139, 168),
        warning: Color::from_rgb(249, 226, 175),
        info: Color::from_rgb(148, 226, 213),
        muted: Color::from_rgb(88, 91, 112),
        muted_bg: Color::from_rgb(49, 50, 68),
        accent: Color::from_rgb(148, 226, 213),
        text: Color::from_rgb(205, 214, 244),
        text_muted: Color::from_rgb(88, 91, 112),
        background: Color::from_rgb(30, 30, 46),
        background_panel: Color::from_rgb(49, 50, 68),
        border: Color::from_rgb(69, 71, 90),
        user_message: Color::from_rgb(137, 180, 250),
        agent_message: Color::from_rgb(205, 214, 244),
    }
}

fn dracula() -> Theme {
    Theme {
        primary: Color::from_rgb(189, 147, 249),
        secondary: Color::from_rgb(139, 233, 253),
        success: Color::from_rgb(80, 250, 123),
        error: Color::from_rgb(255, 85, 85),
        warning: Color::from_rgb(241, 250, 140),
        info: Color::from_rgb(98, 114, 164),
        muted: Color::from_rgb(98, 114, 164),
        muted_bg: Color::from_rgb(40, 42, 54),
        accent: Color::from_rgb(255, 121, 198),
        text: Color::from_rgb(248, 248, 242),
        text_muted: Color::from_rgb(98, 114, 164),
        background: Color::from_rgb(40, 42, 54),
        background_panel: Color::from_rgb(40, 42, 54),
        border: Color::from_rgb(68, 71, 90),
        user_message: Color::from_rgb(189, 147, 249),
        agent_message: Color::from_rgb(248, 248, 242),
    }
}

pub fn builtin_themes() -> Vec<(&'static str, Theme)> {
    vec![
        ("nord", nord()),
        ("tokyo-night", tokyo_night()),
        ("catppuccin-mocha", catppuccin_mocha()),
        ("dracula", dracula()),
    ]
}

pub fn list_theme_names() -> Vec<String> {
    let mut names = vec!["default".to_string()];
    for (name, _) in builtin_themes() {
        names.push(name.to_string());
    }
    names
}

pub fn load_theme(name: &str) -> Option<Theme> {
    if name == "default" || name == "nord" {
        return Some(Theme::default());
    }
    builtin_themes().into_iter().find(|(n, _)| *n == name).map(|(_, t)| t)
}

pub fn load_theme_from_file(_path: &str) -> Option<Theme> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_theme_names() {
        let names = list_theme_names();
        assert!(names.contains(&"default".to_string()));
        assert!(names.contains(&"nord".to_string()));
        assert!(names.contains(&"tokyo-night".to_string()));
        assert!(names.contains(&"catppuccin-mocha".to_string()));
        assert!(names.contains(&"dracula".to_string()));
    }

    #[test]
    fn test_builtin_themes_count() {
        let themes = builtin_themes();
        assert_eq!(themes.len(), 4);
    }

    #[test]
    fn test_load_theme_default() {
        let theme = load_theme("default").unwrap();
        assert_eq!(theme.background, Theme::default().background);
    }

    #[test]
    fn test_load_theme_nord() {
        let theme = load_theme("nord").unwrap();
        assert_eq!(theme.background, Theme::default().background);
    }

    #[test]
    fn test_load_theme_tokyo_night() {
        let theme = load_theme("tokyo-night").unwrap();
        assert_eq!(theme.primary, Color::from_rgb(122, 162, 247));
        assert_eq!(theme.background, Color::from_rgb(26, 27, 38));
    }

    #[test]
    fn test_load_theme_catppuccin_mocha() {
        let theme = load_theme("catppuccin-mocha").unwrap();
        assert_eq!(theme.primary, Color::from_rgb(137, 180, 250));
        assert_eq!(theme.background, Color::from_rgb(30, 30, 46));
    }

    #[test]
    fn test_load_theme_dracula() {
        let theme = load_theme("dracula").unwrap();
        assert_eq!(theme.primary, Color::from_rgb(189, 147, 249));
        assert_eq!(theme.accent, Color::from_rgb(255, 121, 198));
    }

    #[test]
    fn test_load_theme_unknown() {
        assert!(load_theme("nonexistent").is_none());
    }

    #[test]
    fn test_load_theme_empty() {
        assert!(load_theme("").is_none());
    }

    #[test]
    fn test_load_theme_from_file() {
        assert!(load_theme_from_file("/some/path").is_none());
    }

    #[test]
    fn test_themes_have_distinct_backgrounds() {
        let themes = builtin_themes();
        let bgs: Vec<_> = themes.iter().map(|(_, t)| t.background.to_rgb()).collect();
        let unique: std::collections::HashSet<_> = bgs.iter().collect();
        assert!(unique.len() >= 2, "Themes should have different backgrounds");
    }

    #[test]
    fn test_each_builtin_loadable_by_name() {
        for (name, _) in builtin_themes() {
            assert!(load_theme(name).is_some(), "Failed to load theme: {}", name);
        }
    }
}
