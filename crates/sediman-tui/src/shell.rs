use std::process::Stdio;

use tokio::io::AsyncBufReadExt;
use tokio::process::Command;

use crate::app::App;

pub async fn run_shell_command(app: &mut App, cmd: &str) {
    app.add_system_message(format!("$ {}", cmd));

    let child = Command::new("sh")
        .arg("-c")
        .arg(cmd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    match child {
        Ok(mut child) => {
            let stdout = child.stdout.take();
            if let Some(stdout) = stdout {
                let mut reader = tokio::io::BufReader::new(stdout).lines();
                let mut count = 0;
                while let Ok(Some(line)) = reader.next_line().await {
                    if count < 100 {
                        app.add_system_message(format!("  {}", line));
                    }
                    count += 1;
                }
                if count > 100 {
                    app.add_system_message(format!("  ... ({} more lines)", count - 100));
                }
            }

            let stderr = child.stderr.take();
            if let Some(stderr) = stderr {
                let mut reader = tokio::io::BufReader::new(stderr).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    app.add_system_message(format!("  {}", line));
                }
            }

            let status = child.wait().await;
            match status {
                Ok(s) if s.success() => {
                    app.add_system_message("done".into());
                }
                Ok(s) => {
                    app.add_system_message(format!("exit code: {}", s.code().unwrap_or(-1)));
                }
                Err(e) => {
                    app.add_system_message(format!("error: {}", e));
                }
            }
        }
        Err(e) => {
            app.add_system_message(format!("failed to spawn: {}", e));
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::permission::PermissionManager;

    #[test]
    fn test_shell_command_permission_check_ask() {
        let mut app = create_test_app();
        app.permission = PermissionManager::new();
        assert!(!app.permission.is_allowed("rm -rf /"));
    }

    #[test]
    fn test_shell_command_permission_check_auto() {
        let mut app = create_test_app();
        app.permission.cycle();
        app.permission.cycle();
        app.permission.cycle();
        assert!(app.permission.is_allowed("ls"));
    }

    #[test]
    fn test_shell_command_permission_check_plan() {
        let mut app = create_test_app();
        app.permission.set_plan_mode(true);
        assert!(!app.permission.is_allowed("touch file.txt"));
    }

    fn create_test_app() -> crate::app::App {
        let bridge = sediman_tui_bridge::ApiClient::new("/tmp/sediman.sock");
        crate::app::App::new("openai".into(), None, false, bridge)
    }
}
