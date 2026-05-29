use crossterm::event::{KeyEvent, MouseEvent};

pub enum AppEvent {
    Key(KeyEvent),
    Mouse(MouseEvent),
    Tick,
    Resize(u16, u16),
    AgentStep(String, String),
    AgentResult(bool, String, u64),
    AgentError(String),
    AgentDone,
    CommandOutput(String),
}
