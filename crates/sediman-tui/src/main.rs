use std::path::PathBuf;
use std::panic;
use std::time::Duration;
use std::io::Write;

use clap::Parser;
use crossterm::{execute, event::{EnableBracketedPaste, DisableBracketedPaste, EnableMouseCapture, DisableMouseCapture}};
use crossterm::terminal::{EnterAlternateScreen, LeaveAlternateScreen};
use tracing::{debug, error, info, warn};

mod app;
mod update;
mod view;
mod commands;
mod shell;
mod permission;
mod interrupt;
mod logging;
mod gpu_app;
mod config;
mod updater;
mod error;
mod constants;
#[allow(dead_code)]
mod strings;

#[derive(Parser, Debug)]
#[command(name = "openskynet", about = "OpenSkynet — Your AI browser employee", version)]
struct Args {
    #[arg(long, default_value = "openai")]
    provider: String,

    #[arg(long)]
    model: Option<String>,

    /// Base URL for the LLM provider API (e.g. https://api.minimax.chat/v1)
    #[arg(long)]
    base_url: Option<String>,

    #[arg(long)]
    headless: bool,

    /// Unix socket path for the Python backend.
    /// Default: /tmp/sediman-python.sock (connects directly to Python RPC server)
    #[arg(long, default_value = "/tmp/sediman-python.sock")]
    socket: String,

    /// Skip auto-starting the Python backend (expect it to already be running)
    #[arg(long)]
    no_spawn: bool,

    #[arg(long)]
    gpu: bool,

    /// Show backend (Python) stderr output in the terminal
    #[arg(long)]
    verbose: bool,

    #[arg(long)]
    resume: bool,
}

fn find_project_root() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join("pyproject.toml").exists() && dir.join("src/sediman/__init__.py").exists() {
            return Some(dir);
        }
        if !dir.pop() { return None; }
    }
}

fn default_install_root() -> PathBuf {
    std::env::current_exe().ok()
        .and_then(|p| p.parent().and_then(|p| p.parent().map(|p| p.to_path_buf())))
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")).join(".terminator"))
}

/// Auto-start the Python RPC backend if the socket doesn't exist yet.
/// Returns the child process handle if we spawned it (so we can kill on exit),
/// or None if the backend was already running.
async fn ensure_backend(
    socket_path: &str,
    no_spawn: bool,
    provider: &str,
    model: Option<&str>,
    base_url: Option<&str>,
    verbose: bool,
) -> Option<tokio::process::Child> {

    // If socket exists, verify the backend is actually responsive
    if tokio::fs::metadata(socket_path).await.is_ok() {
        let bridge = sediman_tui_bridge::ApiClient::new(socket_path);

        // Try multiple verification methods to detect stale sockets
        let backend_alive = match tokio::time::timeout(Duration::from_secs(2), bridge.status()).await {
            Ok(Ok(_)) => {
                // Status succeeded, but let's double-check with another call
                // to make sure the backend is actually responsive
                match tokio::time::timeout(Duration::from_secs(1), bridge.list_models(None)).await {
                    Ok(Ok(_)) => true,
                    _ => {
                        warn!("Backend status OK but models call failed - treating as stale");
                        false
                    }
                }
            }
            Ok(Err(e)) => {
                warn!("Backend status call failed: {} - treating as stale", e);
                false
            }
            Err(_) => {
                warn!("Backend status call timed out - treating as stale");
                false
            }
        };

        if backend_alive {
            return None;
        }

        warn!("Stale socket detected at {}, removing...", socket_path);
        // Try multiple times to remove the socket
        for _ in 0..3 {
            if tokio::fs::remove_file(socket_path).await.is_ok() {
                info!("Successfully removed stale socket");
                break;
            }
            tokio::time::sleep(Duration::from_millis(100)).await;
        }
    }

    if no_spawn {
        warn!("Backend not running at {} and --no-spawn set.", socket_path);
        info!("  Start it manually: sediman rpc-server");
        return None;
    }

    // Candidate backends to try in order.
    // Prefer `uv run` (local source) over the installed `sediman` binary
    // so that development changes are picked up immediately.
    let candidates: Vec<(&str, Vec<&str>)> = {
        let mut c = Vec::new();
        if which_exists("uv").await {
            c.push(("uv", vec!["run", "python", "-m", "sediman.rpc_server"]));
        }
        if which_exists("sediman").await {
            c.push(("sediman", vec!["rpc-server"]));
        }
        if which_exists("python3").await {
            c.push(("python3", vec!["-m", "sediman.rpc_server"]));
        }
        if which_exists("python").await {
            c.push(("python", vec!["-m", "sediman.rpc_server"]));
        }
        c
    };

    if candidates.is_empty() {
        error!("Cannot find Python or uv to start the backend.");
        error!("  Install uv: curl -LsSf https://astral.sh/uv/install.sh | sh");
        return None;
    }

    let project_root = find_project_root();
    let root = std::env::var("SEDIMAN_ROOT").ok().map(PathBuf::from)
        .or_else(|| project_root.clone())
        .unwrap_or_else(default_install_root);
    info!("  Backend root: {}", root.display());

    let cwd = std::env::current_dir().unwrap_or_else(|_| root.clone());

    for (cmd, args) in &candidates {
        info!("Starting backend: {} {}", cmd, args.join(" "));

        let is_uv_run = *cmd == "uv";
        let work_dir = if is_uv_run {
            project_root.as_ref().unwrap_or(&cwd)
        } else {
            &cwd
        };

        let mut child_cmd = tokio::process::Command::new(cmd);
        child_cmd
            .args(args)
            .env("SEDIMAN_PYTHON_SOCKET", socket_path)
            .env("SEDIMAN_PROVIDER", provider)
            .env("SEDIMAN_ROOT", &root)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .current_dir(work_dir);

        if let Some(m) = model {
            child_cmd.env("SEDIMAN_MODEL", m);
        }
        if let Some(url) = base_url {
            child_cmd.env("SEDIMAN_BASE_URL", url);
        }

        let mut child = match child_cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                warn!("  Failed to start: {}", e);
                continue;
            }
        };

        if let Some(stderr) = child.stderr.take() {
            use tokio::io::AsyncBufReadExt;
            tokio::spawn(async move {
                let reader = tokio::io::BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    if verbose {
                        debug!("[backend] {}", line);
                    }
                }
            });
        }

        // Wait for the socket to appear (up to 5 seconds per candidate)
        let mut died = false;
        for i in 0..10 {
            tokio::time::sleep(Duration::from_millis(500)).await;
            if tokio::fs::metadata(socket_path).await.is_ok() {
                info!("  Backend ready ({})", socket_path);
                return Some(child);
            }
            match child.try_wait() {
                Ok(Some(status)) => {
                    warn!("  Backend exited: {} — trying next...", status);
                    died = true;
                    break;
                }
                Ok(None) => {}
                Err(_) => {}
            }
            if i == 2 {
                info!("  Waiting for backend...");
            }
        }

        if !died {
            let _ = child.kill().await;
        }
    }

    error!("All backend candidates failed.");
    None
}

async fn which_exists(cmd: &str) -> bool {
    tokio::process::Command::new("which")
        .arg(cmd)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Spawn a background task to check for updates if the check is due.
fn spawn_update_check_if_due(config: &crate::config::TuiConfig) {
    use std::time::Duration;

    let frequency = config.update_frequency.as_str();
    if frequency == "never" {
        return;
    }

    let last_check = config.last_update_check.as_deref();

    // Parse the last check timestamp
    let last_check_time = last_check.and_then(|s| {
        chrono::DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|dt| dt.with_timezone(&chrono::Utc))
    });

    let now = chrono::Utc::now();
    let should_check = match frequency {
        "always" => true,
        "daily" => {
            match last_check_time {
                Some(last) => now.signed_duration_since(last).num_days() >= 1,
                None => true,
            }
        }
        "weekly" => {
            match last_check_time {
                Some(last) => now.signed_duration_since(last).num_days() >= 7,
                None => true,
            }
        }
        _ => false,
    };

    if !should_check {
        return;
    }

    // Spawn the update check task
    tokio::spawn(async move {
        // Wait a bit to avoid slowing down startup
        tokio::time::sleep(Duration::from_secs(2)).await;

        match crate::updater::check_for_update().await {
            Ok(Some(release)) => {
                // Update available - show toast notification
                // For now, we'll just log it since we don't have access to the app
                info!("Update available: {} -> {}", env!("CARGO_PKG_VERSION"), release.version());

                // Save the check timestamp
                let mut config = crate::config::TuiConfig::load();
                config.last_update_check = Some(chrono::Utc::now().to_rfc3339());
                let _ = config.save();
            }
            Ok(None) => {
                // No update available - still save the check timestamp
                let mut config = crate::config::TuiConfig::load();
                config.last_update_check = Some(chrono::Utc::now().to_rfc3339());
                let _ = config.save();
            }
            Err(e) => {
                warn!("Update check failed: {}", e);
            }
        }
    });
}

fn main() {
    // Parse args FIRST using a synchronous approach - handles --version, --help
    // This runs before ANY async runtime or terminal operations
    let args = Args::parse();

    // Now enter the async runtime for the actual TUI
    let runtime = match tokio::runtime::Runtime::new() {
        Ok(rt) => rt,
        Err(e) => {
            eprintln!("Cannot start: async runtime creation failed: {}", e);
            eprintln!("This usually means system resource limits are exhausted.");
            eprintln!("Try: ulimit -n 65536");
            std::process::exit(1);
        }
    };
    runtime.block_on(async_main(args));
}

fn apply_saved_config(app_state: &mut app::App, saved_config: &config::TuiConfig) {
    if !saved_config.theme.is_empty() {
        if let Some(theme) = sediman_tui_core::styling::load_theme(&saved_config.theme) {
            app_state.theme = theme;
            app_state.theme_name = saved_config.theme.clone();
        }
    }
    if saved_config.side_panel_open {
        app_state.show_side_panel = true;
    }
    app_state.side_panel_tab = match saved_config.side_panel_tab.as_str() {
        "Skills" => app::SideTab::Skills,
        "Memory" => app::SideTab::Memory,
        "Schedule" => app::SideTab::Schedule,
        _ => app::SideTab::Status,
    };
    if !saved_config.coder_backend.is_empty() {
        app_state.agent.coder_backend = saved_config.coder_backend.clone();
    }
    if !saved_config.search_mode.is_empty() {
        app_state.agent.search_mode = saved_config.search_mode.clone();
    }
}

async fn async_main(args: Args) {
    let original_hook = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        let _ = crossterm::terminal::disable_raw_mode();
        let mut stdout = std::io::stdout();
        let _ = execute!(stdout, DisableMouseCapture, DisableBracketedPaste, crossterm::cursor::Show, LeaveAlternateScreen);
        let _ = stdout.flush();
        original_hook(info);
    }));

    logging::setup(args.verbose);

    let socket_path = args.socket.clone();
    let no_spawn = args.no_spawn;
    let provider_cli = args.provider.clone();
    let _model_cli = args.model.clone();
    let _base_url_cli = args.base_url.clone();
    let verbose = args.verbose;

    let saved_config = crate::config::TuiConfig::load();
    let headless = if args.headless { true } else { saved_config.headless };

    let provider = if provider_cli == "openai" && !saved_config.provider.is_empty() {
        saved_config.provider.clone()
    } else {
        provider_cli.clone()
    };
    let model = args.model.or_else(|| saved_config.model.clone());
    let base_url = args.base_url.or_else(|| saved_config.base_url.clone());

    let bridge = sediman_tui_bridge::ApiClient::new(&socket_path);
    spawn_update_check_if_due(&saved_config);

    let mut app_state = app::App::new(provider.clone(), model.clone(), base_url.clone(), headless, bridge);
    app_state.connection.is_connected = false;

    // Apply saved config
    apply_saved_config(&mut app_state, &saved_config);

    if !saved_config.onboarding_complete {
        app_state.modals.active = Some(app::AppModal::OnboardingWizard { step: 0 });
    }

    if args.resume && app_state.load_session() {
        info!("Resumed previous session ({} messages)", app_state.messages.len());
    }

    // Set up backend restart function
    let restart_socket = socket_path.clone();
    let restart_provider = provider.clone();
    let restart_model = model.clone();
    let restart_base_url = base_url.clone();
    let restart_verbose = verbose;
    app_state.backend_restart_fn = Some(std::sync::Arc::new(move || {
        let socket = restart_socket.clone();
        let p = restart_provider.clone();
        let m = restart_model.clone();
        let url = restart_base_url.clone();
        Box::pin(async move {
            ensure_backend(&socket, false, &p, m.as_deref(), url.as_deref(), restart_verbose).await;
            let bridge = sediman_tui_bridge::ApiClient::new(&socket);
            for _ in 0..10 {
                if bridge.is_connected().await { return true; }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            false
        })
    }));

    // Spawn backend startup in background
    let startup_socket = socket_path.clone();
    let startup_provider = provider.clone();
    let startup_model = model.clone();
    let startup_base_url = base_url.clone();
    let startup_bridge = sediman_tui_bridge::ApiClient::new(&startup_socket);
    let startup_no_spawn = no_spawn;
    let startup_verbose = verbose;

    let backend_child: std::sync::Arc<tokio::sync::Mutex<Option<tokio::process::Child>>> =
        std::sync::Arc::new(tokio::sync::Mutex::new(None));

    let child_handle = backend_child.clone();
    tokio::spawn(async move {
        let child = ensure_backend(
            &startup_socket, startup_no_spawn,
            &startup_provider, startup_model.as_deref(), startup_base_url.as_deref(),
            startup_verbose,
        ).await;
        *child_handle.lock().await = child;

        // Sync model
        for _ in 0..5 {
            if startup_bridge.switch_model(
                &startup_provider, startup_model.as_deref(), startup_base_url.as_deref(),
            ).await.is_ok() { break; }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }

        // Load providers
        if let Ok(Ok(providers)) = tokio::time::timeout(
            Duration::from_secs(5), startup_bridge.list_providers(),
        ).await {
            info!("Loaded {} providers", providers.len());
        }

        // Load models
        if let Ok(Ok(models)) = tokio::time::timeout(
            Duration::from_secs(5), startup_bridge.list_models(None),
        ).await {
            info!("Loaded {} models", models.len());
        }
    });

    if args.gpu {
        #[cfg(feature = "gpu")]
        {
            let result = gpu_app::run_gpu(app_state).await;
            if let Err(e) = result {
                error!("GPU error: {}", e);
                std::process::exit(1);
            }
            return;
        }
        #[cfg(not(feature = "gpu"))]
        {
            error!("GPU support not compiled in.");
            std::process::exit(1);
        }
    }

    crossterm::terminal::enable_raw_mode().expect("Failed to enable raw mode");
    let mut stdout = std::io::stdout();
    let _ = execute!(stdout, EnterAlternateScreen, crossterm::cursor::Hide, EnableBracketedPaste, EnableMouseCapture);
    let _ = stdout.flush();

    let result = app::run(app_state).await;

    crossterm::terminal::disable_raw_mode().ok();
    let _ = execute!(stdout, DisableMouseCapture, DisableBracketedPaste, crossterm::cursor::Show, LeaveAlternateScreen);
    let _ = stdout.flush();

    // Kill the Python backend child process on TUI exit
    if let Ok(mut guard) = backend_child.try_lock() {
        if let Some(ref mut child) = *guard {
            let _ = child.kill().await;
            info!("Backend child process killed.");
        }
    }

    if let Err(e) = result {
        error!("Error: {}", e);
        std::process::exit(1);
    }
}
