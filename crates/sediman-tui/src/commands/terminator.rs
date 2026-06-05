use sediman_tui_core::command::{Command, CommandCategory};
use sediman_tui_core::event::{AppEvent, AgentResultData, StreamingTokenData};

use crate::app::App;
use crate::error::try_send;

pub async fn handle_terminator(app: &mut App, args: &str) {
    let task = args.trim();
    if task.is_empty() {
        app.add_system_message("Usage: /terminator <task description>".into());
        app.add_system_message("Launches the autonomous Terminator workflow to handle multi-issue tasks.".into());
        return;
    }

    app.show_banner = false;
    app.agent.running = true;
    app.agent.start = std::time::Instant::now();
    app.agent.spinner_text = "Terminator starting...".into();
    app.interrupt.clear();
    app.agent.task_count += 1;

    app.add_user_message(task.to_string(), app.agent.task_count);
    app.start_agent_message(task);

    let bridge_url = app.bridge_url().to_string();
    let task_owned = task.to_string();
    let tx = match app.event_tx.clone() {
        Some(tx) => tx,
        None => {
            app.add_error_message("No event channel available.".into());
            return;
        }
    };
    let interrupt_flag = app.interrupt.flag().clone();
    let start = std::time::Instant::now();

    try_send(&tx, AppEvent::AgentStep("terminator".into(), "◆ Terminator mode activated".into()));

    tokio::spawn(async move {
        let result = run_terminator_stream(&bridge_url, &task_owned, &tx, &interrupt_flag).await;
        let elapsed = start.elapsed().as_secs();

        match result {
            Ok(Some(agent_result)) => {
                try_send(&tx, AppEvent::AgentResult(AgentResultData {
                    success: agent_result.success,
                    text: agent_result.result.clone(),
                    elapsed_secs: elapsed,
                    skill_created: None,
                    scheduled_job: None,
                }));
                let icon = if agent_result.success { "✓" } else { "✗" };
                try_send(&tx, AppEvent::CommandOutput(format!(
                    "{} Terminator finished ({})",
                    icon,
                    if elapsed >= 60 {
                        format!("{}m {}s", elapsed / 60, elapsed % 60)
                    } else {
                        format!("{}s", elapsed)
                    }
                )));
            }
            Ok(None) => {
                try_send(&tx, AppEvent::AgentError("No result received from Terminator.".into()));
            }
            Err(e) => {
                try_send(&tx, AppEvent::AgentError(format!("Terminator error: {}", e)));
            }
        }
        try_send(&tx, AppEvent::AgentDone);
    });
}

async fn run_terminator_stream(
    bridge_url: &str,
    task: &str,
    tx: &tokio::sync::mpsc::Sender<AppEvent>,
    interrupt_flag: &std::sync::Arc<std::sync::atomic::AtomicBool>,
) -> Result<Option<sediman_tui_bridge::AgentResult>, Box<dyn std::error::Error + Send + Sync>> {
    let params = serde_json::json!({"task": task});
    let mut stream = sediman_tui_bridge::agent::TaskStream::submit_with_method(
        bridge_url, "agent.terminator", params,
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
                                    try_send(tx, AppEvent::StreamingToken(StreamingTokenData { token: st.token.clone(), phase: st.phase.clone() }));
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
                                    try_send(tx, AppEvent::AgentStep(phase, step_line));
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

pub static CMD_TERMINATOR: Command = Command {
    name: "/terminator",
    aliases: &[],
    description: "Run autonomous Terminator workflow for multi-issue tasks",
    category: CommandCategory::Agent,
};
