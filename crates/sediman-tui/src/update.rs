use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use tokio::sync::mpsc;

use sediman_tui_core::event::AppEvent;

use crate::app::App;
use crate::commands::{
    browser, delegate, hub, memory, misc, model, plan, record, schedule, sessions,
    skills, soul, system, terminal, theming,
};

pub async fn handle_message(app: &mut App, event: AppEvent, event_tx: &mpsc::UnboundedSender<AppEvent>) {
    match event {
        AppEvent::Key(key) => {
            use crossterm::event::{KeyCode, KeyModifiers};
            match key.code {
                KeyCode::Esc => {
                    if app.agent_running {
                        app.interrupt.trigger();
                        app.agent_running = false;
                        app.append_step("-- Interrupted --".to_string());
                    } else if app.show_help {
                        app.show_help = false;
                    } else {
                        app.editor.delete_line_by_head();
                    }
                }
                KeyCode::Enter => {
                    if key.modifiers.contains(KeyModifiers::SHIFT) {
                        app.editor.input(key);
                    } else {
                        let input = app.editor.submit();
                        if !input.is_empty() {
                            if input.starts_with('/') {
                                handle_slash(app, &input).await;
                            } else if let Some(stripped) = input.strip_prefix('!') {
                                handle_shell(app, stripped).await;
                            } else {
                                handle_task(app, &input, event_tx).await;
                            }
                        }
                    }
                }
                KeyCode::Tab => {
                    let prefix = app.editor.lines().join(" ").trim().to_string();
                    if prefix.starts_with('/') {
                        app.completer.complete(&prefix);
                        if let Some(cmd) = app.completer.next() {
                            app.editor.delete_line_by_head();
                            app.editor.insert_str(&cmd);
                        }
                    } else if let Some(cmd) = app.command_registry.find_fuzzy(&prefix) {
                        app.editor.delete_line_by_head();
                        app.editor.insert_str(cmd.name);
                    }
                }
                KeyCode::Up => {
                    if key.modifiers.contains(KeyModifiers::SHIFT) {
                        scroll_up(app, 3);
                    } else {
                        app.editor.history_up();
                    }
                }
                KeyCode::Down => {
                    if key.modifiers.contains(KeyModifiers::SHIFT) {
                        scroll_down(app, 3);
                    } else {
                        app.editor.history_down();
                    }
                }
                KeyCode::PageUp => {
                    scroll_up(app, 20);
                }
                KeyCode::PageDown => {
                    scroll_down(app, 20);
                }
                KeyCode::BackTab => {
                    app.permission.cycle();
                    app.add_system_message(format!("Mode: {}", app.permission.current_label()));
                }
                KeyCode::Char('p') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                    app.show_help = !app.show_help;
                }
                _ => {
                    app.editor.input(key);
                    // Update completer on every key press when typing a slash command
                    let current = app.editor.lines().join(" ").trim().to_string();
                    if current.starts_with('/') {
                        app.completer.complete(&current);
                    } else {
                        app.completer.complete(""); // clears filtered list
                    }
                }
            }
        }
        AppEvent::Mouse(mouse) => {
            use crossterm::event::MouseEventKind;
            match mouse.kind {
                MouseEventKind::ScrollUp => scroll_up(app, 3),
                MouseEventKind::ScrollDown => scroll_down(app, 3),
                _ => {}
            }
        }
        AppEvent::Tick => {
            if app.agent_running {
                app.advance_spinner();
            }
        }
        AppEvent::Resize(_, _) => {}
        AppEvent::AgentStep(phase, action) => {
            let line = format!("{} {}", phase, action);
            app.append_step(line);
        }
        AppEvent::AgentResult(success, result_text, elapsed_secs) => {
            let skill_created = None;
            let scheduled_job = None;
            app.complete_agent_message(success, result_text, elapsed_secs, skill_created, scheduled_job);
        }
        AppEvent::AgentError(err) => {
            app.agent_running = false;
            app.add_error_message(format!("Error: {}", err));
        }
        AppEvent::AgentDone => {
            app.agent_running = false;
        }
        AppEvent::CommandOutput(text) => {
            app.add_system_message(text);
        }
    }
}

fn scroll_up(app: &mut App, amount: u16) {
    app.scroll_offset = app.scroll_offset.saturating_add(amount);
    app.auto_scroll = false;
}

fn scroll_down(app: &mut App, amount: u16) {
    app.scroll_offset = app.scroll_offset.saturating_sub(amount);
}

async fn handle_slash(app: &mut App, input: &str) {
    let input = input.trim();
    let (cmd_name, args) = parse_command(input);

    match cmd_name {
        "/help" | "/h" | "/?" => system::handle_help(app, args).await,
        "/exit" | "/quit" | "/q" => system::handle_exit(app, args).await,
        "/clear" => system::handle_clear(app, args).await,
        "/reset" => system::handle_reset(app, args).await,
        "/compress" => system::handle_compress(app, args).await,
        "/status" => {
            system::handle_status(app, args).await;
            refresh_sidebar(app).await;
        }
        "/skills" => {
            skills::handle_skills(app, args).await;
            refresh_sidebar(app).await;
        }
        "/skill" => skills::handle_skill(app, args).await,
        "/run-skill" => skills::handle_run_skill(app, args).await,
        "/hub" => {
            let (sub_cmd, sub_args) = parse_command(args);
            match sub_cmd {
                "browse" => hub::handle_hub_browse(app, sub_args).await,
                "search" => hub::handle_hub_search(app, sub_args).await,
                "install" => hub::handle_hub_install(app, sub_args).await,
                "info" => hub::handle_hub_info(app, sub_args).await,
                "publish" => hub::handle_hub_publish(app, sub_args).await,
                _ => {
                    app.add_system_message("Usage: /hub <browse|search|install|info|publish>".into());
                }
            }
        }
        "/memory" => {
            memory::handle_memory(app, args).await;
            refresh_sidebar(app).await;
        }
        "/remember" => memory::handle_remember(app, args).await,
        "/model" => model::handle_model(app, args).await,
        "/models" => model::handle_models(app, args).await,
        "/schedule" => {
            schedule::handle_schedule(app, args).await;
            refresh_sidebar(app).await;
        }
        "/schedule-add" => schedule::handle_schedule_add(app, args).await,
        "/schedule-remove" => schedule::handle_schedule_remove(app, args).await,
        "/sessions" => sessions::handle_sessions(app, args).await,
        "/resume" => sessions::handle_resume(app, args).await,
        "/browser" => browser::handle_browser(app, args).await,
        "/screenshot" => browser::handle_screenshot(app, args).await,
        "/record" => record::handle_record(app, args).await,
        "/stop" => record::handle_stop(app, args).await,
        "/delegate" => delegate::handle_delegate(app, args).await,
        "/parallel" => delegate::handle_parallel(app, args).await,
        "/terminal" => terminal::handle_terminal(app, args).await,
        "/plan" => plan::handle_plan(app, args).await,
        "/soul" => soul::handle_soul(app, args).await,
        "/usage" => misc::handle_usage(app, args).await,
        "/doctor" => misc::handle_doctor(app, args).await,
        "/export" => misc::handle_export(app, args).await,
        "/btw" => misc::handle_btw(app, args).await,
        "/color" => misc::handle_color(app, args).await,
        "/rename" => misc::handle_rename(app, args).await,
        "/themes" | "/theme" => theming::handle_themes(app, args).await,
        _ => {
            app.add_system_message(format!("Unknown command: {}. Type /help", cmd_name));
        }
    }
}

async fn refresh_sidebar(app: &mut App) {
    // Populate skills cache
    if let Ok(skills) = app.bridge.list_skills().await {
        app.skills_cache = skills.iter().map(|s| {
            format!("{}: {}", s.name, s.description.chars().take(40).collect::<String>())
        }).collect();
    }

    // Populate memory cache
    if let Ok(mem) = app.bridge.get_memory().await {
        let mut lines = Vec::new();
        if !mem.memory.is_empty() {
            lines.push(format!("Mem: {} chars", mem.memory.len()));
        }
        if !mem.user.is_empty() {
            lines.push(format!("User: {} chars", mem.user.len()));
        }
        app.memory_cache = lines;
    }

    // Populate schedule cache
    if let Ok(jobs) = app.bridge.list_schedules().await {
        app.schedule_cache = jobs.iter().map(|j| {
            format!("{}: {}", j.cron_expr, j.task.chars().take(35).collect::<String>())
        }).collect();
    }
}

fn parse_command(input: &str) -> (&str, &str) {
    let mut parts = input.splitn(2, char::is_whitespace);
    let cmd = parts.next().unwrap_or("");
    let args = parts.next().unwrap_or("");
    (cmd, args.trim())
}

async fn handle_shell(app: &mut App, cmd: &str) {
    if !app.permission.is_allowed(cmd) {
        app.add_system_message("Shell command denied by permission mode".into());
        return;
    }
    app.add_system_message(format!("$ {}", cmd));
    crate::shell::run_shell_command(app, cmd).await;
}

async fn handle_task(app: &mut App, task: &str, event_tx: &mpsc::UnboundedSender<AppEvent>) {
    app.show_banner = false;
    app.task_count += 1;
    app.agent_running = true;
    app.agent_start = std::time::Instant::now();
    app.spinner_text = "Working...".to_string();
    app.interrupt.clear();

    app.add_user_message(task.to_string(), app.task_count);
    app.start_agent_message(task);

    let bridge_url = app.bridge_url().to_string();
    let task_owned = task.to_string();
    let tx = event_tx.clone();
    let interrupt_flag = app.interrupt.flag().clone();

    tokio::spawn(async move {
        let result = run_agent_task_inner(&bridge_url, &task_owned, &tx, &interrupt_flag).await;
        match result {
            Ok(Some(agent_result)) => {
                let _ = tx.send(AppEvent::AgentResult(
                    agent_result.success,
                    agent_result.result.clone(),
                    agent_result.elapsed_secs,
                ));
                if agent_result.success {
                    let _ = tx.send(AppEvent::CommandOutput(format!(
                        "Done ({}s){}{}",
                        agent_result.elapsed_secs,
                        agent_result.skill_created
                            .as_ref()
                            .map(|s| format!(" - Skill: {}", s))
                            .unwrap_or_default(),
                        agent_result.scheduled_job_id
                            .as_ref()
                            .map(|s| format!(" - Job: {}", s))
                            .unwrap_or_default(),
                    )));
                }
            }
            Ok(None) => {
                let _ = tx.send(AppEvent::AgentError("No result received".into()));
            }
            Err(e) => {
                let _ = tx.send(AppEvent::AgentError(e.to_string()));
            }
        }
        let _ = tx.send(AppEvent::AgentDone);
    });
}

async fn run_agent_task_inner(
    bridge_url: &str,
    task: &str,
    tx: &mpsc::UnboundedSender<AppEvent>,
    interrupt_flag: &Arc<AtomicBool>,
) -> Result<Option<sediman_tui_bridge::AgentResult>, Box<dyn std::error::Error + Send + Sync>> {
    let mut stream = sediman_tui_bridge::agent::TaskStream::submit(bridge_url, task).await?;

    let mut final_result: Option<sediman_tui_bridge::AgentResult> = None;

    loop {
        if interrupt_flag.load(std::sync::atomic::Ordering::SeqCst) {
            stream.cancel();
            return Err("Interrupted by user".into());
        }

        tokio::select! {
            msg = stream.rx.recv() => {
                match msg {
                    Some(ws_msg) => {
                        match ws_msg.msg_type.as_str() {
                            "step" => {
                                if let Some(ref event) = ws_msg.event {
                                    let phase = event.phase.clone();
                                    let action = event.action.clone();
                                    let mut step_line = format!("{} {}", phase, action);
                                    if let Some(ref url) = event.url {
                                        step_line.push_str(&format!(" ({})", url));
                                    }
                                    if let Some(ref detail) = event.detail {
                                        step_line.push_str(&format!("\n  {}", detail));
                                    }
                                    let _ = tx.send(AppEvent::AgentStep(phase, step_line));
                                }
                            }
                            "result" => {
                                final_result = ws_msg.result;
                                break;
                            }
                            "error" => {
                                let err = ws_msg.error.unwrap_or("Unknown error".into());
                                return Err(err.into());
                            }
                            _ => {}
                        }
                    }
                    None => break,
                }
            }
            _ = tokio::time::sleep(std::time::Duration::from_millis(100)) => {
                if interrupt_flag.load(std::sync::atomic::Ordering::SeqCst) {
                    stream.cancel();
                    return Err("Interrupted by user".into());
                }
            }
        }
    }

    Ok(final_result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sediman_tui_bridge::ApiClient;
    use crate::app::ChatMessage;

    fn test_app() -> App {
        App::new("test".into(), Some("gpt-4".into()), true, ApiClient::new("/tmp/test.sock"))
    }

    fn test_tx() -> mpsc::UnboundedSender<AppEvent> {
        mpsc::unbounded_channel().0
    }

    #[test]
    fn test_parse_command_simple() {
        assert_eq!(parse_command("/help"), ("/help", ""));
    }

    #[test]
    fn test_parse_command_with_args() {
        assert_eq!(parse_command("/model openai:gpt-4"), ("/model", "openai:gpt-4"));
    }

    #[test]
    fn test_parse_command_multiple_spaces() {
        assert_eq!(parse_command("/hub   browse   foo"), ("/hub", "browse   foo"));
    }

    #[test]
    fn test_parse_command_empty() {
        assert_eq!(parse_command(""), ("", ""));
    }

    #[test]
    fn test_parse_command_trailing_space() {
        assert_eq!(parse_command("/help  "), ("/help", ""));
    }

    #[test]
    fn test_parse_command_single_word_no_args() {
        assert_eq!(parse_command("/exit"), ("/exit", ""));
    }

    #[tokio::test]
    async fn test_scroll_up_increases_offset() {
        let mut app = test_app();
        app.scroll_offset = 0;
        scroll_up(&mut app, 5);
        assert_eq!(app.scroll_offset, 5);
        assert!(!app.auto_scroll);
    }

    #[tokio::test]
    async fn test_scroll_up_saturating() {
        let mut app = test_app();
        app.scroll_offset = u16::MAX - 1;
        scroll_up(&mut app, 10);
        assert_eq!(app.scroll_offset, u16::MAX);
    }

    #[tokio::test]
    async fn test_scroll_down_decreases_offset() {
        let mut app = test_app();
        app.scroll_offset = 10;
        scroll_down(&mut app, 3);
        assert_eq!(app.scroll_offset, 7);
    }

    #[tokio::test]
    async fn test_scroll_down_saturating_at_zero() {
        let mut app = test_app();
        app.scroll_offset = 2;
        scroll_down(&mut app, 10);
        assert_eq!(app.scroll_offset, 0);
    }

    #[tokio::test]
    async fn test_handle_slash_help() {
        let mut app = test_app();
        handle_slash(&mut app, "/help").await;
        assert!(app.show_help);
    }

    #[tokio::test]
    async fn test_handle_slash_exit() {
        let mut app = test_app();
        handle_slash(&mut app, "/exit").await;
        assert!(!app.running);
    }

    #[tokio::test]
    async fn test_handle_slash_quit_alias() {
        let mut app = test_app();
        handle_slash(&mut app, "/quit").await;
        assert!(!app.running);
    }

    #[tokio::test]
    async fn test_handle_slash_q_alias() {
        let mut app = test_app();
        handle_slash(&mut app, "/q").await;
        assert!(!app.running);
    }

    #[tokio::test]
    async fn test_handle_slash_clear() {
        let mut app = test_app();
        app.add_system_message("msg".into());
        app.step_log.push("step".into());
        handle_slash(&mut app, "/clear").await;
        let has_user_msgs = app.messages.iter().any(|m| !matches!(m, ChatMessage::System { .. }));
        assert!(!has_user_msgs);
        assert!(app.step_log.is_empty());
    }

    #[tokio::test]
    async fn test_handle_slash_reset() {
        let mut app = test_app();
        app.task_count = 5;
        app.add_system_message("msg".into());
        app.show_banner = false;
        handle_slash(&mut app, "/reset").await;
        assert_eq!(app.task_count, 0);
        assert!(app.show_banner);
        assert_eq!(app.scroll_offset, 0);
    }

    #[tokio::test]
    async fn test_handle_slash_unknown() {
        let mut app = test_app();
        handle_slash(&mut app, "/nonexistent").await;
        let has_unknown = app.messages.iter().any(|m| matches!(m, ChatMessage::System { text } if text.contains("Unknown command")));
        assert!(has_unknown);
    }

    #[tokio::test]
    async fn test_handle_slash_color_valid() {
        let mut app = test_app();
        handle_slash(&mut app, "/color red").await;
        assert_eq!(app.session_color.as_deref(), Some("red"));
    }

    #[tokio::test]
    async fn test_handle_slash_color_default_clears() {
        let mut app = test_app();
        app.session_color = Some("red".into());
        handle_slash(&mut app, "/color default").await;
        assert!(app.session_color.is_none());
    }

    #[tokio::test]
    async fn test_handle_slash_color_invalid() {
        let mut app = test_app();
        handle_slash(&mut app, "/color magenta_fuchsia").await;
        assert!(app.session_color.is_none());
        let has_err = app.messages.iter().any(|m| matches!(m, ChatMessage::System { text } if text.contains("Unknown color")));
        assert!(has_err);
    }

    #[tokio::test]
    async fn test_handle_slash_rename() {
        let mut app = test_app();
        handle_slash(&mut app, "/rename my session").await;
        assert_eq!(app.session_name.as_deref(), Some("my session"));
    }

    #[tokio::test]
    async fn test_handle_slash_rename_truncates_to_30() {
        let mut app = test_app();
        let long_name = "a".repeat(50);
        handle_slash(&mut app, &format!("/rename {}", long_name)).await;
        assert_eq!(app.session_name.as_ref().unwrap().len(), 30);
    }

    #[tokio::test]
    async fn test_handle_slash_rename_empty_shows_current() {
        let mut app = test_app();
        handle_slash(&mut app, "/rename ").await;
        assert!(app.session_name.is_none());
        let has_unnamed = app.messages.iter().any(|m| matches!(m, ChatMessage::System { text } if text.contains("(unnamed)")));
        assert!(has_unnamed);
    }

    #[tokio::test]
    async fn test_handle_slash_browser_headless() {
        let mut app = test_app();
        app.headless = false;
        handle_slash(&mut app, "/browser headless").await;
        assert!(app.headless);
    }

    #[tokio::test]
    async fn test_handle_slash_browser_headed() {
        let mut app = test_app();
        app.headless = true;
        handle_slash(&mut app, "/browser headed").await;
        assert!(!app.headless);
    }

    #[tokio::test]
    async fn test_handle_slash_browser_invalid() {
        let mut app = test_app();
        let prev = app.headless;
        handle_slash(&mut app, "/browser foobar").await;
        assert_eq!(app.headless, prev);
    }

    #[tokio::test]
    async fn test_handle_slash_delegate_empty() {
        let mut app = test_app();
        handle_slash(&mut app, "/delegate").await;
        let has_usage = app.messages.iter().any(|m| matches!(m, ChatMessage::System { text } if text.contains("Usage")));
        assert!(has_usage);
    }

    #[tokio::test]
    async fn test_handle_slash_parallel_too_many() {
        let mut app = test_app();
        handle_slash(&mut app, "/parallel a | b | c | d | e | f").await;
        let has_max = app.messages.iter().any(|m| matches!(m, ChatMessage::System { text } if text.contains("Max 5")));
        assert!(has_max);
    }

    #[tokio::test]
    async fn test_handle_slash_parallel_empty() {
        let mut app = test_app();
        handle_slash(&mut app, "/parallel").await;
        let has_usage = app.messages.iter().any(|m| matches!(m, ChatMessage::System { text } if text.contains("Usage")));
        assert!(has_usage);
    }

    #[tokio::test]
    async fn test_handle_slash_parallel_pipes_only() {
        let mut app = test_app();
        handle_slash(&mut app, "/parallel  |  |  ").await;
        let has_empty = app.messages.iter().any(|m| matches!(m, ChatMessage::System { text } if text.contains("No tasks")));
        assert!(has_empty);
    }

    #[tokio::test]
    async fn test_handle_slash_hub_no_subcommand() {
        let mut app = test_app();
        handle_slash(&mut app, "/hub").await;
        let has_usage = app.messages.iter().any(|m| matches!(m, ChatMessage::System { text } if text.contains("Usage")));
        assert!(has_usage);
    }

    #[tokio::test]
    async fn test_handle_slash_btw_empty() {
        let mut app = test_app();
        handle_slash(&mut app, "/btw").await;
        let has_usage = app.messages.iter().any(|m| matches!(m, ChatMessage::System { text } if text.contains("Usage")));
        assert!(has_usage);
    }

    #[tokio::test]
    async fn test_handle_slash_btw_with_question() {
        let mut app = test_app();
        handle_slash(&mut app, "/btw what is 2+2").await;
        let has_q = app.messages.iter().any(|m| matches!(m, ChatMessage::System { text } if text.contains("Side question")));
        assert!(has_q);
    }

    #[tokio::test]
    async fn test_handle_slash_compress_keeps_first() {
        let mut app = test_app();
        app.add_system_message("keep".into());
        app.add_user_message("remove".into(), 1);
        app.add_system_message("remove too".into());
        handle_slash(&mut app, "/compress").await;
        assert!(app.messages.len() >= 1);
        match &app.messages[0] {
            ChatMessage::System { text } => assert_eq!(text, "keep"),
            _ => panic!("Expected first message kept"),
        }
    }

    #[tokio::test]
    async fn test_handle_slash_plan_toggles() {
        let mut app = test_app();
        let was_plan = app.permission.is_plan_mode();
        handle_slash(&mut app, "/plan").await;
        assert_ne!(was_plan, app.permission.is_plan_mode());
        handle_slash(&mut app, "/plan").await;
        assert_eq!(was_plan, app.permission.is_plan_mode());
    }

    #[tokio::test]
    async fn test_handle_slash_terminal_empty_shows_status() {
        let mut app = test_app();
        handle_slash(&mut app, "/terminal").await;
        let has_status = app.messages.iter().any(|m| matches!(m, ChatMessage::System { text } if text.contains("Terminal access")));
        assert!(has_status);
    }

    #[tokio::test]
    async fn test_handle_slash_terminal_invalid() {
        let mut app = test_app();
        handle_slash(&mut app, "/terminal maybe").await;
        let has_usage = app.messages.iter().any(|m| matches!(m, ChatMessage::System { text } if text.contains("Usage")));
        assert!(has_usage);
    }

    #[tokio::test]
    async fn test_handle_message_tick() {
        let mut app = test_app();
        app.agent_running = true;
        app.agent_start = std::time::Instant::now();
        let tx = test_tx();
        handle_message(&mut app, AppEvent::Tick, &tx).await;
    }

    #[tokio::test]
    async fn test_handle_message_agent_step() {
        let mut app = test_app();
        app.start_agent_message("task");
        let tx = test_tx();
        handle_message(&mut app, AppEvent::AgentStep("planning".into(), "reading code".into()), &tx).await;
        match &app.messages[0] {
            ChatMessage::Agent { steps, .. } => {
                assert_eq!(steps.len(), 1);
                assert!(steps[0].contains("planning"));
                assert!(steps[0].contains("reading code"));
            }
            _ => panic!("Expected Agent message"),
        }
    }

    #[tokio::test]
    async fn test_handle_message_agent_result() {
        let mut app = test_app();
        app.agent_running = true;
        app.start_agent_message("task");
        let tx = test_tx();
        handle_message(&mut app, AppEvent::AgentResult(true, "done".into(), 10), &tx).await;
        assert!(!app.agent_running);
        match &app.messages[0] {
            ChatMessage::Agent { result, success, elapsed_secs, .. } => {
                assert_eq!(result.as_deref(), Some("done"));
                assert!(*success);
                assert_eq!(*elapsed_secs, 10);
            }
            _ => panic!("Expected Agent message"),
        }
    }

    #[tokio::test]
    async fn test_handle_message_agent_error() {
        let mut app = test_app();
        app.agent_running = true;
        let tx = test_tx();
        handle_message(&mut app, AppEvent::AgentError("timeout".into()), &tx).await;
        assert!(!app.agent_running);
        let has_err = app.messages.iter().any(|m| matches!(m, ChatMessage::Error { text } if text.contains("timeout")));
        assert!(has_err);
    }

    #[tokio::test]
    async fn test_handle_message_agent_done() {
        let mut app = test_app();
        app.agent_running = true;
        let tx = test_tx();
        handle_message(&mut app, AppEvent::AgentDone, &tx).await;
        assert!(!app.agent_running);
    }

    #[tokio::test]
    async fn test_handle_message_command_output() {
        let mut app = test_app();
        let tx = test_tx();
        handle_message(&mut app, AppEvent::CommandOutput("output text".into()), &tx).await;
        let has_msg = app.messages.iter().any(|m| matches!(m, ChatMessage::System { text } if text == "output text"));
        assert!(has_msg);
    }

    #[tokio::test]
    async fn test_handle_message_resize() {
        let mut app = test_app();
        let tx = test_tx();
        handle_message(&mut app, AppEvent::Resize(80, 24), &tx).await;
    }
}
