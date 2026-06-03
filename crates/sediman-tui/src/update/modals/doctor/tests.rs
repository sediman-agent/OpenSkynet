#[cfg(test)]
mod tests {
    use crate::app::{App, AppModal, DoctorCheck, DoctorStatus};
    use crate::update::modals::doctor::handle_doctor;
    use crossterm::event::{KeyCode, KeyEvent, KeyEventKind, KeyModifiers};

    fn create_test_app_with_doctor(num_checks: usize, cursor: usize, scroll: u16) -> App {
        let checks: Vec<DoctorCheck> = (0..num_checks)
            .map(|i| DoctorCheck {
                category: "Test".to_string(),
                name: format!("Check {}", i),
                status: DoctorStatus::Pass,
                message: format!("Check {} message", i),
                optional: false,
                install_cmd: None,
            })
            .collect();

        // Create app with minimal setup
        let mut app = App::new(
            "test".to_string(),
            Some("test".to_string()),
            None,
            true,
            sediman_tui_bridge::ApiClient::new("/tmp/test.sock"),
        );
        app.active_modal = Some(AppModal::Doctor {
            checks,
            cursor,
            scroll,
            installing: false,
            install_output: Vec::new(),
        });

        app
    }

    fn create_key_event(code: KeyCode) -> KeyEvent {
        KeyEvent {
            code,
            kind: KeyEventKind::Press,
            state: crossterm::event::KeyEventState::NONE,
            modifiers: KeyModifiers::empty(),
        }
    }

    #[tokio::test]
    async fn test_doctor_scroll_down_keeps_cursor_visible() {
        // Create doctor modal with 20 checks, VISIBLE = 12
        let mut app = create_test_app_with_doctor(20, 0, 0);

        // Simulate pressing Down 15 times
        for i in 0..15 {
            let event = create_key_event(KeyCode::Down);
            handle_doctor(&mut app, event).await;

            if let Some(AppModal::Doctor { ref cursor, ref scroll, .. }) = app.active_modal {
                let visible_start = *scroll as usize;
                let visible_end = (visible_start + 12).min(20);

                println!("Step {}: cursor={}, scroll={}, visible=[{}, {})", i, cursor, scroll, visible_start, visible_end);

                // Cursor should ALWAYS be within visible range
                assert!(
                    *cursor >= visible_start && *cursor < visible_end,
                    "Cursor {} not visible! visible range: [{}, {}), scroll: {}",
                    cursor, visible_start, visible_end, scroll
                );
            }
        }

        // After 15 Down presses, cursor should be at 15
        if let Some(AppModal::Doctor { ref cursor, ref scroll, .. }) = app.active_modal {
            assert_eq!(*cursor, 15, "Cursor should be at position 15 after 15 Down presses");
            assert!(*scroll > 0, "Scroll should have incremented to keep cursor visible");
        }
    }

    #[tokio::test]
    async fn test_doctor_scroll_up_keeps_cursor_visible() {
        // Create doctor modal with 20 checks, start at bottom
        let mut app = create_test_app_with_doctor(20, 19, 8);

        // Simulate pressing Up 15 times
        for i in 0..15 {
            let event = create_key_event(KeyCode::Up);
            handle_doctor(&mut app, event).await;

            if let Some(AppModal::Doctor { ref cursor, ref scroll, .. }) = app.active_modal {
                let visible_start = *scroll as usize;
                let visible_end = (visible_start + 12).min(20);

                println!("Step {}: cursor={}, scroll={}, visible=[{}, {})", i, cursor, scroll, visible_start, visible_end);

                // Cursor should ALWAYS be within visible range
                assert!(
                    *cursor >= visible_start && *cursor < visible_end,
                    "Cursor {} not visible! visible range: [{}, {}), scroll: {}",
                    cursor, visible_start, visible_end, scroll
                );
            }
        }

        // After 15 Up presses, cursor should be at 4
        if let Some(AppModal::Doctor { ref cursor, ref scroll, .. }) = app.active_modal {
            assert_eq!(*cursor, 4, "Cursor should be at position 4 after 15 Up presses");
            assert!(*scroll < 8, "Scroll should have decremented to keep cursor visible");
        }
    }

    #[tokio::test]
    async fn test_doctor_scroll_at_boundary() {
        // Test the exact boundary case where cursor = 11 (last visible when scroll=0)
        let mut app = create_test_app_with_doctor(20, 10, 0);

        // Press Down to get to position 11 (boundary)
        let event = create_key_event(KeyCode::Down);
        handle_doctor(&mut app, event).await;

        if let Some(AppModal::Doctor { ref cursor, ref scroll, .. }) = app.active_modal {
            println!("After pressing Down: cursor={}, scroll={}", cursor, scroll);
            let visible_start = *scroll as usize;
            let visible_end = (visible_start + 12).min(20);
            assert!(*cursor >= visible_start && *cursor < visible_end,
                "Cursor at boundary should still be visible");
        }
    }

    #[tokio::test]
    async fn test_doctor_no_scroll_when_not_needed() {
        // Test that scroll doesn't change when cursor is in middle of visible area
        let mut app = create_test_app_with_doctor(20, 5, 0);
        let initial_scroll = if let Some(AppModal::Doctor { ref scroll, .. }) = app.active_modal {
            *scroll
        } else {
            panic!("No doctor modal active");
        };

        // Press Down - cursor moves to 6 but no scroll needed
        let event = create_key_event(KeyCode::Down);
        handle_doctor(&mut app, event).await;

        if let Some(AppModal::Doctor { ref cursor, ref scroll, .. }) = app.active_modal {
            assert_eq!(*cursor, 6, "Cursor should have moved");
            assert_eq!(*scroll, initial_scroll, "Scroll should not have changed");
        }
    }
}
