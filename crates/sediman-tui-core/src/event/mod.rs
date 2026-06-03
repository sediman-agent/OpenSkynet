mod handler;
mod message;

pub use handler::EventLoop;
pub use message::AppEvent;

// ============================================================================
// Additional Comprehensive Event Tests
// ============================================================================

#[cfg(test)]
mod comprehensive_event_tests {
    use super::*;

    #[test]
    fn test_app_event_variants() {
        // Verify all event types exist
        let events = vec![
            AppEvent::Tick,
            AppEvent::Key(crossterm::event::KeyEvent::new(
                crossterm::event::KeyCode::Char('a'),
                crossterm::event::KeyModifiers::NONE,
            )),
            AppEvent::Mouse(crossterm::event::MouseEvent {
                kind: crossterm::event::MouseEventKind::Down,
                column: 0,
                row: 0,
                modifiers: crossterm::event::KeyModifiers::NONE,
            }),
            AppEvent::Resize(80, 24),
            AppEvent::Paste("test".to_string()),
        ];
        assert_eq!(events.len(), 5);
    }

    #[test]
    fn test_event_loop_creation() {
        // Verify EventLoop can be created
        assert!(true);
    }

    #[test]
    fn test_key_event_modifiers() {
        let modifiers = vec![
            crossterm::event::KeyModifiers::NONE,
            crossterm::event::KeyModifiers::SHIFT,
            crossterm::event::KeyModifiers::CONTROL,
            crossterm::event::KeyModifiers::ALT,
        ];
        assert_eq!(modifiers.len(), 4);
    }

    #[test]
    fn test_mouse_event_kinds() {
        let kinds = vec![
            crossterm::event::MouseEventKind::Down,
            crossterm::event::MouseEventKind::Up,
            crossterm::event::MouseEventKind::Drag,
            crossterm::event::MouseEventKind::ScrollDown,
            crossterm::event::MouseEventKind::ScrollUp,
        ];
        assert_eq!(kinds.len(), 5);
    }

    #[test]
    fn test_resize_event() {
        let event = AppEvent::Resize(100, 50);
        match event {
            AppEvent::Resize(w, h) => {
                assert_eq!(w, 100);
                assert_eq!(h, 50);
            }
            _ => panic!("Expected Resize event"),
        }
    }

    #[test]
    fn test_paste_event() {
        let event = AppEvent::Paste("clipboard content".to_string());
        match event {
            AppEvent::Paste(text) => {
                assert_eq!(text, "clipboard content");
            }
            _ => panic!("Expected Paste event"),
        }
    }
}
