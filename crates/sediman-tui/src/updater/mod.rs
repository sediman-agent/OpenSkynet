//! Update module for checking and installing updates.

mod github;
mod installer;

pub use github::check_for_update;
pub use installer::install_update;

use anyhow::Result;

/// Release information from GitHub.
#[derive(Debug, Clone)]
pub struct Release {
    pub tag_name: String,
    pub name: String,
    pub body: String,
    pub published_at: String,
}

impl Release {
    /// Get the version number without 'v' prefix.
    pub fn version(&self) -> &str {
        self.tag_name.strip_prefix('v').unwrap_or(&self.tag_name)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_release_version() {
        let release = Release {
            tag_name: "v0.3.2".to_string(),
            name: "v0.3.2".to_string(),
            body: String::new(),
            published_at: String::new(),
        };
        assert_eq!(release.version(), "0.3.2");
    }

    #[test]
    fn test_release_version_no_prefix() {
        let release = Release {
            tag_name: "0.3.2".to_string(),
            name: "0.3.2".to_string(),
            body: String::new(),
            published_at: String::new(),
        };
        assert_eq!(release.version(), "0.3.2");
    }
}
