//! Agent task execution handler.

use crate::app::App;
use sediman_tui_core::event::AppEvent;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use tokio::sync::mpsc;

/// Execute an agent task.
pub async fn handle_task(app: &mut App, task: &str, event_tx: &mpsc::UnboundedSender<AppEvent>) {
    // Route Coder mode with external backend to subprocess
    if app.agent_mode == crate::app::AgentMode::Coder && app.coder_backend != "internal" {
        handle_coder_external(app, task).await;
        return;
    }

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
    let start = std::time::Instant::now();

    tokio::spawn(async move {
        let result = run_agent_task_inner(&bridge_url, &task_owned, &tx, &interrupt_flag).await;
        let elapsed = start.elapsed().as_secs();
        match result {
            Ok(Some(agent_result)) => {
                let _ = tx.send(AppEvent::AgentResult(
                    agent_result.success,
                    agent_result.result.clone(),
                    elapsed,
                ));
                if agent_result.success {
                    let _ = tx.send(AppEvent::CommandOutput(format!(
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
                let _ = tx.send(AppEvent::AgentError("No result received".into()));
            }
            Err(e) => {
                let _ = tx.send(AppEvent::AgentError(e.to_string()));
            }
        }
        let _ = tx.send(AppEvent::AgentDone);
    });
}

/// Launch an external coder tool (claude-code, codex, opencode) as a subprocess.
async fn handle_coder_external(app: &mut App, task: &str) {
    let (cmd_name, args) = match app.coder_backend.as_str() {
        "claude-code" => ("claude", vec!["--print", task]),
        "codex" => ("codex", vec!["-q", task]),
        "opencode" => ("opencode", vec!["-p", task]),
        other => {
            app.add_error_message(format!("Unknown coder backend: {}", other));
            return;
        }
    };

    app.show_banner = false;
    app.task_count += 1;
    app.agent_running = true;
    app.agent_start = std::time::Instant::now();
    app.spinner_text = format!("Running {}...", cmd_name);
    app.interrupt.clear();

    app.add_user_message(task.to_string(), app.task_count);
    app.start_agent_message(task);

    let output = tokio::process::Command::new(cmd_name)
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .await;

    let elapsed = app.agent_start.elapsed().as_secs();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout).to_string();
            let stderr = String::from_utf8_lossy(&out.stderr).to_string();
            let success = out.status.success();
            let result_text = if stdout.is_empty() { stderr.clone() } else { stdout };

            app.complete_agent_message(success, result_text, elapsed, None, None);

            if success {
                app.add_system_message(format!("{} done ({}s)", cmd_name, elapsed));
            } else {
                app.add_error_message(format!("{} failed ({}s): {}", cmd_name, elapsed, stderr));
            }
        }
        Err(e) => {
            app.complete_agent_message(false, format!("Failed to launch {}: {}", cmd_name, e), elapsed, None, None);
            app.add_error_message(format!("Is '{}' installed? Error: {}", cmd_name, e));
        }
    }
}

/// Run the agent task with WebSocket streaming.
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
                            "streaming" => {
                                if let Some(ref st) = ws_msg.streaming_token {
                                    let _ = tx.send(AppEvent::StreamingToken(st.token.clone(), st.phase.clone()));
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
