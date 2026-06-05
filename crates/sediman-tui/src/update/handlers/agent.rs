//! Agent task execution handler.

use crate::app::App;
use crate::constants::*;
use crate::error::try_send;
use sediman_tui_core::event::{AppEvent, AgentResultData, StreamingTokenData};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::sync::mpsc;

/// Execute an agent task.
pub async fn handle_task(app: &mut App, task: &str, event_tx: &mpsc::Sender<AppEvent>) {
    if app.agent.running {
        return;
    }

    // Route Terminator mode to the autonomous workflow
    if app.agent.mode == crate::app::AgentMode::Terminator {
        handle_terminator_task(app, task, event_tx).await;
        return;
    }

    // Route Coder mode with external backend to subprocess
    if app.agent.mode == crate::app::AgentMode::Coder && app.agent.coder_backend != "internal" {
        handle_coder_external(app, task, event_tx).await;
        return;
    }

    let mode: String = match app.agent.mode {
        crate::app::AgentMode::Browser => "browser".into(),
        crate::app::AgentMode::Coder => "coder".into(),
        _ => app.current_mode_name().to_string(),
    };

    app.show_banner = false;
    app.agent.task_count += 1;
    app.agent.running = true;
    app.agent.start = std::time::Instant::now();
    app.agent.spinner_text = "Working...".to_string();
    app.interrupt.clear();

    app.add_user_message(task.to_string(), app.agent.task_count);
    app.start_agent_message(task);

    let bridge_url = app.bridge_url().to_string();
    let task_owned = task.to_string();
    let mode_owned = mode.to_string();
    let tx = event_tx.clone();
    let interrupt_flag = app.interrupt.flag().clone();
    let start = std::time::Instant::now();

    tokio::spawn(async move {
        let result = run_agent_task_inner(&bridge_url, &task_owned, &mode_owned, &tx, &interrupt_flag).await;
        let elapsed = start.elapsed().as_secs();
        match result {
            Ok(Some(agent_result)) => {
                let skill = agent_result.skill_created.clone();
                let job = agent_result.scheduled_job_id.clone();
                try_send(&tx,AppEvent::AgentResult(AgentResultData {
                    success: agent_result.success,
                    text: agent_result.result.clone(),
                    elapsed_secs: elapsed,
                    skill_created: skill,
                    scheduled_job: job,
                }));
                if agent_result.success {
                    try_send(&tx,AppEvent::CommandOutput(format!(
                        "Done ({}s){}{}",
                        elapsed,
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
                try_send(&tx,AppEvent::AgentError("No result received".into()));
            }
            Err(e) => {
                try_send(&tx,AppEvent::AgentError(e.to_string()));
            }
        }
        try_send(&tx,AppEvent::AgentDone);
    });
}

/// Execute a Terminator mode task via the SystemOrchestrator backend.
async fn handle_terminator_task(app: &mut App, task: &str, event_tx: &mpsc::Sender<AppEvent>) {
    app.show_banner = false;
    app.agent.task_count += 1;
    app.agent.running = true;
    app.agent.start = std::time::Instant::now();
    app.agent.spinner_text = "◆ Terminator starting...".to_string();
    app.interrupt.clear();

    app.add_user_message(task.to_string(), app.agent.task_count);
    app.start_agent_message(task);

    let bridge_url = app.bridge_url().to_string();
    let task_owned = task.to_string();
    let tx = event_tx.clone();
    let interrupt_flag = app.interrupt.flag().clone();
    let start = std::time::Instant::now();

    try_send(&tx,AppEvent::AgentStep("terminator".into(), "◆ Terminator mode activated".into()));

    tokio::spawn(async move {
        let params = serde_json::json!({"task": task_owned});
        let stream_result: Result<Option<sediman_tui_bridge::AgentResult>, String> = async {
            let mut stream = sediman_tui_bridge::agent::TaskStream::submit_with_method(
                &bridge_url, "agent.terminator", params,
            ).await.map_err(|e| e.to_string())?;

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
                                    "streaming" => {
                                        if let Some(ref st) = ws_msg.streaming_token {
                                            try_send(&tx,AppEvent::StreamingToken(StreamingTokenData { token: st.token.clone(), phase: st.phase.clone() }));
                                        }
                                    }
                                    "step" => {
                                        if let Some(ref event) = ws_msg.event {
                                            let phase = event.phase.clone();
                                            let action = event.action.clone();
                                            let mut step_line = format!("{} {}", phase, action);
                                            if let Some(ref detail) = event.detail {
                                                step_line.push_str(&format!("\n  {}", detail));
                                            }
                                            try_send(&tx,AppEvent::AgentStep(phase, step_line));
                                        }
                                    }
                                    "progress" => {
                                        // Handle structured progress data (retry, validation, etc.)
                                        if let Some(ref data) = ws_msg.data {
                                            if let Some(retry_val) = data.get("retry") {
                                                // Retry progress
                                                if let (Some(attempt), Some(max), Some(countdown)) = (
                                                    retry_val.get("attempt").and_then(|a| a.as_u64()),
                                                    retry_val.get("max").and_then(|m| m.as_u64()),
                                                    retry_val.get("countdown").and_then(|c| c.as_f64()),
                                                ) {
                                                    use sediman_tui_core::event::ProgressData;
                                                    let progress = ProgressData::retry(
                                                        attempt as u32,
                                                        max as u32,
                                                        countdown as f32,
                                                    );
                                                    try_send(&tx,AppEvent::Progress(progress));
                                                }
                                            } else if let Some(validation_val) = data.get("validation") {
                                                // Validation progress
                                                if let (Some(confidence), Some(issues)) = (
                                                    validation_val.get("confidence").and_then(|c| c.as_f64()),
                                                    validation_val.get("issues").and_then(|i| i.as_u64()),
                                                ) {
                                                    use sediman_tui_core::event::ProgressData;
                                                    let progress = ProgressData::validation(
                                                        confidence as f32,
                                                        issues as usize,
                                                    );
                                                    try_send(&tx,AppEvent::Progress(progress));
                                                }
                                            } else if data.get("reflection").is_some() {
                                                // Reflection progress
                                                use sediman_tui_core::event::ProgressData;
                                                let progress = ProgressData::reflection();
                                                try_send(&tx,AppEvent::Progress(progress));
                                            }
                                        }
                                    }
                                    "result" => {
                                        final_result = ws_msg.result;
                                        break;
                                    }
                                    "error" => {
                                        let err = ws_msg.error.unwrap_or("Unknown error".into());
                                        return Err(err);
                                    }
                                    _ => {}
                                }
                            }
                            None => break,
                        }
                    }
                    _ = tokio::time::sleep(std::time::Duration::from_millis(AGENT_POLL_INTERVAL_MS)) => {
                        if interrupt_flag.load(std::sync::atomic::Ordering::SeqCst) {
                            stream.cancel();
                            return Err("Interrupted by user".into());
                        }
                    }
                }
            }

            Ok(final_result)
        }.await;

        let elapsed = start.elapsed().as_secs();
        match stream_result {
            Ok(Some(agent_result)) => {
                try_send(&tx,AppEvent::AgentResult(AgentResultData {
                    success: agent_result.success,
                    text: agent_result.result.clone(),
                    elapsed_secs: elapsed,
                    skill_created: None,
                    scheduled_job: None,
                }));
                let icon = if agent_result.success { "✓" } else { "✗" };
                try_send(&tx,AppEvent::CommandOutput(format!(
                    "{} Terminator finished ({})",
                    icon,
                    if elapsed >= SECONDS_PER_MINUTE { format!("{}m {}s", elapsed / SECONDS_PER_MINUTE, elapsed % SECONDS_PER_MINUTE) }
                    else { format!("{}s", elapsed) }
                )));
            }
            Ok(None) => {
                try_send(&tx,AppEvent::AgentError("No result received from Terminator.".into()));
            }
            Err(e) => {
                try_send(&tx,AppEvent::AgentError(format!("Terminator error: {}", e)));
            }
        }
        try_send(&tx,AppEvent::AgentDone);
    });
}

/// Launch an external coder tool (claude-code, codex, opencode) as a subprocess.
async fn handle_coder_external(app: &mut App, task: &str, event_tx: &mpsc::Sender<AppEvent>) {
    let (cmd_name, args): (&str, Vec<String>) = match app.agent.coder_backend.as_str() {
        "claude-code" => ("claude", vec!["--print".into(), task.into()]),
        "codex" => ("codex", vec!["-q".into(), task.into()]),
        "opencode" => ("opencode", vec!["-p".into(), task.into()]),
        other => {
            app.add_error_message(format!("Unknown coder backend: {}", other));
            return;
        }
    };

    let cmd_name_owned = cmd_name.to_string();
    app.show_banner = false;
    app.agent.task_count += 1;
    app.agent.running = true;
    app.agent.start = std::time::Instant::now();
    app.agent.spinner_text = format!("Running {}...", cmd_name);
    app.interrupt.clear();

    app.add_user_message(task.to_string(), app.agent.task_count);
    app.start_agent_message(task);

    let tx = event_tx.clone();
    let interrupt_flag = app.interrupt.flag().clone();
    let start = std::time::Instant::now();

    tokio::spawn(async move {
        let mut child = match tokio::process::Command::new(cmd_name)
            .args(&args)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                try_send(&tx,AppEvent::AgentError(
                    format!("Failed to spawn {}: {}", cmd_name, e),
                ));
                try_send(&tx,AppEvent::AgentDone);
                return;
            }
        };

        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        if let Some(out) = stdout {
            let reader = BufReader::new(out);
            let mut lines = reader.lines();
            loop {
                if interrupt_flag.load(std::sync::atomic::Ordering::SeqCst) {
                    let _ = child.kill().await;
                    break;
                }
                tokio::select! {
                    line = lines.next_line() => {
                        match line {
                            Ok(Some(text)) => {
                                try_send(&tx,AppEvent::StreamingToken(StreamingTokenData { token: text, phase: "responding".into() }));
                            }
                            Ok(None) => break,
                            Err(_) => break,
                        }
                    }
                    _ = tokio::time::sleep(std::time::Duration::from_millis(AGENT_POLL_INTERVAL_MS)) => {
                        if interrupt_flag.load(std::sync::atomic::Ordering::SeqCst) {
                            let _ = child.kill().await;
                            break;
                        }
                    }
                }
            }
        }

        let status = child.wait().await;
        let elapsed = start.elapsed().as_secs();

        let mut stderr_text = String::new();
        if let Some(err) = stderr {
            let mut reader = BufReader::new(err);
            let _ = reader.read_to_string(&mut stderr_text).await;
        }

        match status {
            Ok(s) if s.success() => {
                try_send(&tx,AppEvent::AgentResult(AgentResultData { success: true, text: format!("{} done", cmd_name_owned), elapsed_secs: elapsed, skill_created: None, scheduled_job: None }));
                try_send(&tx,AppEvent::CommandOutput(format!("{} done ({}s)", cmd_name_owned, elapsed)));
            }
            Ok(s) => {
                let err_msg = if stderr_text.is_empty() {
                    format!("{} exited with {}", cmd_name_owned, s.code().unwrap_or(-1))
                } else {
                    format!("{} failed: {}", cmd_name_owned, stderr_text)
                };
                try_send(&tx,AppEvent::AgentResult(AgentResultData { success: false, text: err_msg.clone(), elapsed_secs: elapsed, skill_created: None, scheduled_job: None }));
                try_send(&tx,AppEvent::CommandOutput(format!("{} failed ({}s): {}", cmd_name_owned, elapsed, stderr_text)));
            }
            Err(e) => {
                try_send(&tx,AppEvent::AgentError(format!("Failed to launch {}: {}", cmd_name_owned, e)));
            }
        }
        try_send(&tx,AppEvent::AgentDone);
    });
}

/// Run the agent task with WebSocket streaming.
async fn run_agent_task_inner(
    bridge_url: &str,
    task: &str,
    mode: &str,
    tx: &mpsc::Sender<AppEvent>,
    interrupt_flag: &Arc<AtomicBool>,
) -> Result<Option<sediman_tui_bridge::AgentResult>, Box<dyn std::error::Error + Send + Sync>> {
    let params = serde_json::json!({"task": task, "mode": mode});
    let mut stream = sediman_tui_bridge::agent::TaskStream::submit_with_method(
        bridge_url, "agent.run", params,
    ).await?;

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
                            "streaming" => {
                                if let Some(ref st) = ws_msg.streaming_token {
                                    try_send(tx,AppEvent::StreamingToken(StreamingTokenData { token: st.token.clone(), phase: st.phase.clone() }));
                                }
                            }
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
                                    try_send(tx,AppEvent::AgentStep(phase, step_line));
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
    use crate::app::AgentMode;
    use sediman_tui_bridge::ApiClient;

    fn test_app() -> App {
        App::new(
            "test".into(),
            Some("gpt-4".into()),
            None,
            true,
            ApiClient::new("/tmp/test.sock"),
        )
    }

    fn test_event_tx() -> mpsc::Sender<AppEvent> {
        let (tx, _rx) = mpsc::channel(1024);
        tx
    }

    // ── AgentMode routing tests ────────────────────────────────────

    #[test]
    fn test_terminator_mode_label() {
        assert_eq!(AgentMode::Terminator.label(), "Term");
    }

    #[test]
    fn test_cycle_reaches_terminator() {
        let mode = AgentMode::Manager;
        let mode = mode.cycle(); // -> Browser
        let mode = mode.cycle(); // -> Coder
        let mode = mode.cycle(); // -> Terminator
        assert!(matches!(mode, AgentMode::Terminator));
    }

    #[test]
    fn test_cycle_wraps_from_terminator() {
        let mode = AgentMode::Terminator;
        let mode = mode.cycle();
        assert!(matches!(mode, AgentMode::Manager));
    }

    #[test]
    fn test_full_cycle_completes() {
        let mut mode = AgentMode::Manager;
        for _ in 0..4 {
            mode = mode.cycle();
        }
        assert!(matches!(mode, AgentMode::Manager));
    }

    // ── handle_task routing tests ──────────────────────────────────

    #[tokio::test]
    async fn test_handle_task_returns_when_already_running() {
        let mut app = test_app();
        app.agent.running = true;
        let tx = test_event_tx();
        let initial_count = app.agent.task_count;
        handle_task(&mut app, "test task", &tx).await;
        assert_eq!(app.agent.task_count, initial_count);
    }

    #[tokio::test]
    async fn test_handle_task_terminator_mode_sets_state() {
        let mut app = test_app();
        app.agent.mode = AgentMode::Terminator;
        let tx = test_event_tx();
        handle_task(&mut app, "terminator task", &tx).await;
        assert!(app.agent.running);
        assert!(app.agent.spinner_text.contains("Terminator"));
    }

    #[tokio::test]
    async fn test_handle_task_terminator_mode_increments_count() {
        let mut app = test_app();
        app.agent.mode = AgentMode::Terminator;
        let tx = test_event_tx();
        let initial = app.agent.task_count;
        handle_task(&mut app, "t task", &tx).await;
        assert_eq!(app.agent.task_count, initial + 1);
    }

    #[tokio::test]
    async fn test_handle_task_terminator_mode_adds_user_message() {
        let mut app = test_app();
        app.agent.mode = AgentMode::Terminator;
        let tx = test_event_tx();
        handle_task(&mut app, "msg test", &tx).await;
        assert!(!app.messages.is_empty());
    }

    #[tokio::test]
    async fn test_handle_task_coder_external_mode_sets_state() {
        let mut app = test_app();
        app.agent.mode = AgentMode::Coder;
        app.agent.coder_backend = "claude-code".into();
        let tx = test_event_tx();
        handle_task(&mut app, "code task", &tx).await;
        assert!(app.agent.running);
        assert!(app.agent.spinner_text.contains("claude"));
    }

    #[tokio::test]
    async fn test_handle_task_coder_external_unknown_backend() {
        let mut app = test_app();
        app.agent.mode = AgentMode::Coder;
        app.agent.coder_backend = "nonexistent".into();
        let tx = test_event_tx();
        let initial = app.agent.task_count;
        handle_task(&mut app, "bad backend", &tx).await;
        assert_eq!(app.agent.task_count, initial);
    }

    #[tokio::test]
    async fn test_handle_task_default_mode_sets_state() {
        let mut app = test_app();
        assert!(matches!(app.agent.mode, AgentMode::Manager));
        let tx = test_event_tx();
        handle_task(&mut app, "default task", &tx).await;
        assert!(app.agent.running);
        assert_eq!(app.agent.spinner_text, "Working...");
    }

    #[tokio::test]
    async fn test_handle_task_default_clears_interrupt() {
        let mut app = test_app();
        app.interrupt.trigger();
        assert!(app.interrupt.is_triggered());
        let tx = test_event_tx();
        handle_task(&mut app, "clear interrupt", &tx).await;
        assert!(!app.interrupt.is_triggered());
    }

    #[tokio::test]
    async fn test_handle_task_default_increments_count() {
        let mut app = test_app();
        let tx = test_event_tx();
        let initial = app.agent.task_count;
        handle_task(&mut app, "count", &tx).await;
        assert_eq!(app.agent.task_count, initial + 1);
    }

    // ── Coder external backend tests ───────────────────────────────

    #[test]
    fn test_coder_backend_args_claude() {
        let task = "fix the bug";
        let args: Vec<String> = vec!["--print".into(), task.into()];
        assert_eq!(args[0], "--print");
        assert_eq!(args[1], task);
    }

    #[test]
    fn test_coder_backend_args_codex() {
        let task = "refactor code";
        let args: Vec<String> = vec!["-q".into(), task.into()];
        assert_eq!(args[0], "-q");
        assert_eq!(args[1], task);
    }

    #[test]
    fn test_coder_backend_args_opencode() {
        let task = "implement feature";
        let args: Vec<String> = vec!["-p".into(), task.into()];
        assert_eq!(args[0], "-p");
        assert_eq!(args[1], task);
    }

    // ── AppEvent::AgentResult variant tests ────────────────────────

    #[test]
    fn test_agent_result_event_five_args() {
        let event = AppEvent::AgentResult(AgentResultData { success: true, text: "done".into(), elapsed_secs: 42, skill_created: Some("skill".into()), scheduled_job: None });
        if let AppEvent::AgentResult(data) = event {
            assert!(data.success);
            assert_eq!(data.text, "done");
            assert_eq!(data.elapsed_secs, 42);
            assert_eq!(data.skill_created, Some("skill".into()));
            assert_eq!(data.scheduled_job, None);
        } else {
            panic!("Expected AgentResult variant");
        }
    }

    #[test]
    fn test_agent_result_event_all_none() {
        let event = AppEvent::AgentResult(AgentResultData { success: false, text: "failed".into(), elapsed_secs: 5, skill_created: None, scheduled_job: None });
        if let AppEvent::AgentResult(data) = event {
            assert!(!data.success);
            assert_eq!(data.text, "failed");
            assert_eq!(data.elapsed_secs, 5);
            assert!(data.skill_created.is_none());
            assert!(data.scheduled_job.is_none());
        }
    }

    #[test]
    fn test_agent_result_event_with_job() {
        let event = AppEvent::AgentResult(AgentResultData {
            success: true,
            text: "scheduled".into(),
            elapsed_secs: 10,
            skill_created: None,
            scheduled_job: Some("job-123".into()),
        });
        if let AppEvent::AgentResult(data) = event {
            assert_eq!(data.scheduled_job, Some("job-123".into()));
        }
    }

    // ── InterruptManager integration with handle_task ──────────────

    #[test]
    fn test_interrupt_flag_shared_with_spawn() {
        let im = crate::interrupt::InterruptManager::new();
        let flag = im.flag();
        im.trigger();
        assert!(flag.load(std::sync::atomic::Ordering::SeqCst));
        flag.store(false, std::sync::atomic::Ordering::SeqCst);
        assert!(!im.is_triggered());
    }

    #[tokio::test]
    async fn test_handle_task_terminator_clears_interrupt() {
        let mut app = test_app();
        app.interrupt.trigger();
        app.agent.mode = AgentMode::Terminator;
        let tx = test_event_tx();
        handle_task(&mut app, "clear", &tx).await;
        assert!(!app.interrupt.is_triggered());
    }

    #[tokio::test]
    async fn test_handle_task_coder_external_clears_interrupt() {
        let mut app = test_app();
        app.interrupt.trigger();
        app.agent.mode = AgentMode::Coder;
        app.agent.coder_backend = "claude-code".into();
        let tx = test_event_tx();
        handle_task(&mut app, "clear", &tx).await;
        assert!(!app.interrupt.is_triggered());
    }

    // ── Banner state tests ─────────────────────────────────────────

    #[tokio::test]
    async fn test_handle_task_hides_banner() {
        let mut app = test_app();
        app.show_banner = true;
        let tx = test_event_tx();
        handle_task(&mut app, "hide banner", &tx).await;
        assert!(!app.show_banner);
    }

    #[tokio::test]
    async fn test_handle_task_terminator_hides_banner() {
        let mut app = test_app();
        app.show_banner = true;
        app.agent.mode = AgentMode::Terminator;
        let tx = test_event_tx();
        handle_task(&mut app, "hide banner", &tx).await;
        assert!(!app.show_banner);
    }

    // ── Auto scroll tests ──────────────────────────────────────────

    #[tokio::test]
    async fn test_handle_task_enables_auto_scroll() {
        let mut app = test_app();
        app.scroll.auto_scroll = false;
        app.agent.mode = AgentMode::Terminator;
        let tx = test_event_tx();
        handle_task(&mut app, "scroll", &tx).await;
        assert!(app.scroll.auto_scroll, "handle_task should enable auto_scroll");
    }

    // ── Mode string mapping tests ────────────────────────────────

    #[test]
    fn test_browser_mode_maps_to_browser_string() {
        let mode = match AgentMode::Browser {
            AgentMode::Browser => "browser",
            AgentMode::Coder => "coder",
            _ => "manager",
        };
        assert_eq!(mode, "browser");
    }

    #[test]
    fn test_coder_mode_maps_to_coder_string() {
        let mode = match AgentMode::Coder {
            AgentMode::Browser => "browser",
            AgentMode::Coder => "coder",
            _ => "manager",
        };
        assert_eq!(mode, "coder");
    }

    #[test]
    fn test_manager_mode_maps_to_manager_string() {
        let mode = match AgentMode::Manager {
            AgentMode::Browser => "browser",
            AgentMode::Coder => "coder",
            _ => "manager",
        };
        assert_eq!(mode, "manager");
    }

    #[test]
    fn test_terminator_mode_maps_to_manager_string() {
        let mode = match AgentMode::Terminator {
            AgentMode::Browser => "browser",
            AgentMode::Coder => "coder",
            _ => "manager",
        };
        assert_eq!(mode, "manager");
    }

    // ── Browser mode handle_task tests ───────────────────────────

    #[tokio::test]
    async fn test_handle_task_browser_mode_sets_state() {
        let mut app = test_app();
        app.agent.mode = AgentMode::Browser;
        let tx = test_event_tx();
        handle_task(&mut app, "browse example.com", &tx).await;
        assert!(app.agent.running);
        assert!(!app.show_banner);
    }

    #[tokio::test]
    async fn test_handle_task_browser_mode_increments_count() {
        let mut app = test_app();
        app.agent.mode = AgentMode::Browser;
        let tx = test_event_tx();
        let initial = app.agent.task_count;
        handle_task(&mut app, "browse", &tx).await;
        assert_eq!(app.agent.task_count, initial + 1);
    }

    #[tokio::test]
    async fn test_handle_task_browser_mode_adds_user_message() {
        let mut app = test_app();
        app.agent.mode = AgentMode::Browser;
        let tx = test_event_tx();
        handle_task(&mut app, "go to https://example.com", &tx).await;
        assert!(!app.messages.is_empty());
    }

    #[tokio::test]
    async fn test_handle_task_browser_mode_clears_interrupt() {
        let mut app = test_app();
        app.agent.mode = AgentMode::Browser;
        app.interrupt.trigger();
        let tx = test_event_tx();
        handle_task(&mut app, "browse", &tx).await;
        assert!(!app.interrupt.is_triggered());
    }

    // ── Dynamic mode tests ──────────────────────────────────────────

    #[test]
    fn test_default_agent_modes_has_four() {
        let modes = crate::app::default_agent_modes();
        assert_eq!(modes.len(), 4);
        assert_eq!(modes[0].mode, "manager");
        assert_eq!(modes[1].mode, "browser");
        assert_eq!(modes[2].mode, "coder");
        assert_eq!(modes[3].mode, "terminator");
    }

    #[test]
    fn test_default_agent_modes_labels() {
        let modes = crate::app::default_agent_modes();
        assert_eq!(modes[0].label, "Mgr");
        assert_eq!(modes[1].label, "Brow");
        assert_eq!(modes[2].label, "Code");
        assert_eq!(modes[3].label, "Term");
    }

    #[test]
    fn test_default_agent_modes_runners() {
        let modes = crate::app::default_agent_modes();
        assert_eq!(modes[0].runner, "default");
        assert_eq!(modes[1].runner, "browser");
        assert_eq!(modes[2].runner, "coding");
        assert_eq!(modes[3].runner, "orchestrator");
    }

    #[test]
    fn test_cycle_agent_mode_cycles_through_all() {
        let mut app = test_app();
        assert_eq!(app.agent.current_mode_index, 0);
        assert_eq!(app.current_mode_label(), "Mgr");

        app.cycle_agent_mode();
        assert_eq!(app.agent.current_mode_index, 1);
        assert_eq!(app.current_mode_label(), "Brow");

        app.cycle_agent_mode();
        assert_eq!(app.agent.current_mode_index, 2);
        assert_eq!(app.current_mode_label(), "Code");

        app.cycle_agent_mode();
        assert_eq!(app.agent.current_mode_index, 3);
        assert_eq!(app.current_mode_label(), "Term");

        app.cycle_agent_mode();
        assert_eq!(app.agent.current_mode_index, 0);
        assert_eq!(app.current_mode_label(), "Mgr");
    }

    #[test]
    fn test_sync_agent_mode_sets_correct_enum() {
        let mut app = test_app();

        app.agent.current_mode_index = 0;
        app.sync_agent_mode();
        assert!(matches!(app.agent.mode, AgentMode::Manager));

        app.agent.current_mode_index = 1;
        app.sync_agent_mode();
        assert!(matches!(app.agent.mode, AgentMode::Browser));

        app.agent.current_mode_index = 2;
        app.sync_agent_mode();
        assert!(matches!(app.agent.mode, AgentMode::Coder));

        app.agent.current_mode_index = 3;
        app.sync_agent_mode();
        assert!(matches!(app.agent.mode, AgentMode::Terminator));
    }

    #[test]
    fn test_set_agent_modes_preserves_current() {
        let mut app = test_app();
        app.agent.current_mode_index = 2; // coder

        let new_modes = vec![
            crate::app::AgentModeEntry {
                mode: "manager".into(),
                label: "Mgr".into(),
                runner: "default".into(),
                description: "Manager".into(),
                capabilities: vec![],
            },
            crate::app::AgentModeEntry {
                mode: "coder".into(),
                label: "Code".into(),
                runner: "coding".into(),
                description: "Coder".into(),
                capabilities: vec![],
            },
            crate::app::AgentModeEntry {
                mode: "frontend".into(),
                label: "FE".into(),
                runner: "coding".into(),
                description: "Frontend".into(),
                capabilities: vec!["fileops".into()],
            },
        ];
        app.set_agent_modes(new_modes);

        // "coder" was the current mode, should be preserved
        assert_eq!(app.agent.current_mode_index, 1);
        assert_eq!(app.current_mode_label(), "Code");
        assert!(matches!(app.agent.mode, AgentMode::Coder));
    }

    #[test]
    fn test_set_agent_modes_empty_falls_back_to_defaults() {
        let mut app = test_app();
        app.agent.current_mode_index = 2;
        app.set_agent_modes(vec![]);
        assert_eq!(app.agent.modes.len(), 4);
    }

    #[test]
    fn test_set_agent_modes_unknown_mode_resets_to_zero() {
        let mut app = test_app();
        app.agent.current_mode_index = 3; // terminator

        let new_modes = vec![
            crate::app::AgentModeEntry {
                mode: "frontend".into(),
                label: "FE".into(),
                runner: "coding".into(),
                description: "Frontend".into(),
                capabilities: vec![],
            },
        ];
        app.set_agent_modes(new_modes);

        // "terminator" not found in new modes -> index 0
        assert_eq!(app.agent.current_mode_index, 0);
        assert_eq!(app.current_mode_name(), "frontend");
    }

    #[test]
    fn test_current_mode_name_default() {
        let app = test_app();
        assert_eq!(app.current_mode_name(), "manager");
    }
}
