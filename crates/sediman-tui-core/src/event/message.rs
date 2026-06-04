use crossterm::event::{KeyEvent, MouseEvent};

pub enum AppEvent {
    Key(KeyEvent),
    Mouse(MouseEvent),
    Paste(String),
    Tick,
    Resize(u16, u16),
    Shutdown,
    AgentStep(String, String),
    AgentResult(bool, String, u64, Option<String>, Option<String>),
    AgentError(String),
    AgentDone,
    CommandOutput(String),
    StreamingToken(String, String),
    /// Progress event with structured data (retry countdown, validation status, etc.)
    Progress(ProgressData),
    UpdateSuccess,
    UpdateFailed(String),
    UpdateAvailable {
        version: String,
        release_notes: String,
        current_version: String,
    },
}

/// Progress data for streaming progress updates
#[derive(Clone, Debug)]
pub struct ProgressData {
    /// Progress type: "retry", "validation", "reflection", etc.
    pub progress_type: String,
    /// Current attempt (for retry progress)
    pub current_attempt: Option<u32>,
    /// Max attempts (for retry progress)
    pub max_attempts: Option<u32>,
    /// Countdown in seconds (for retry backoff)
    pub countdown_seconds: Option<f32>,
    /// Confidence score (for validation progress)
    pub confidence: Option<f32>,
    /// Number of issues found (for validation progress)
    pub issues_count: Option<usize>,
    /// Human-readable status message
    pub message: String,
}

impl ProgressData {
    /// Create retry progress data
    pub fn retry(attempt: u32, max: u32, countdown: f32) -> Self {
        Self {
            progress_type: "retry".to_string(),
            current_attempt: Some(attempt),
            max_attempts: Some(max),
            countdown_seconds: Some(countdown),
            confidence: None,
            issues_count: None,
            message: format!("Retrying ({}/{})", attempt, max),
        }
    }

    /// Create validation progress data
    pub fn validation(confidence: f32, issues: usize) -> Self {
        Self {
            progress_type: "validation".to_string(),
            current_attempt: None,
            max_attempts: None,
            countdown_seconds: None,
            confidence: Some(confidence),
            issues_count: Some(issues),
            message: format!("Validating (confidence: {:.2})", confidence),
        }
    }

    /// Create reflection progress data
    pub fn reflection() -> Self {
        Self {
            progress_type: "reflection".to_string(),
            current_attempt: None,
            max_attempts: None,
            countdown_seconds: None,
            confidence: None,
            issues_count: None,
            message: "Reflecting...".to_string(),
        }
    }
}

