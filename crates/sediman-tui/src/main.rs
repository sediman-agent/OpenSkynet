use std::panic;

use clap::Parser;

mod app;
mod update;
mod view;
mod commands;
mod shell;
mod permission;
mod interrupt;
mod logging;
mod gpu_app;

#[derive(Parser, Debug)]
#[command(name = "sediman-tui", about = "Sediman TUI — browser agent terminal frontend", version = "0.1.1")]
struct Args {
    #[arg(long, default_value = "openai")]
    provider: String,

    #[arg(long)]
    model: Option<String>,

    #[arg(long)]
    headless: bool,

    #[arg(long, default_value = "/tmp/sediman.sock")]
    socket: String,

    #[arg(long)]
    gpu: bool,
}

#[tokio::main]
async fn main() {
    logging::setup();

    let original_hook = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        crossterm::terminal::disable_raw_mode().ok();
        use std::io::Write;
        let mut stdout = std::io::stdout();
        let _ = stdout.write_all(b"\x1b[?25h");
        let _ = stdout.write_all(b"\x1b[?1049l");
        let _ = stdout.flush();
        original_hook(info);
    }));

    let args = Args::parse();

    let bridge = sediman_tui_bridge::ApiClient::new(&args.socket);
    let app_state = app::App::new(args.provider, args.model, args.headless, bridge);

    if args.gpu {
        #[cfg(feature = "gpu")]
        {
            let result = gpu_app::run_gpu(app_state).await;
            if let Err(e) = result {
                eprintln!("GPU error: {}", e);
                std::process::exit(1);
            }
            return;
        }
        #[cfg(not(feature = "gpu"))]
        {
            eprintln!("GPU support not compiled in. Rebuild with: cargo build --features gpu");
            std::process::exit(1);
        }
    }

    crossterm::terminal::enable_raw_mode().expect("Failed to enable raw mode");
    let mut stdout = std::io::stdout();
    let _ = std::io::Write::write_all(&mut stdout, b"\x1b[?1049h");
    let _ = std::io::Write::write_all(&mut stdout, b"\x1b[?25l");

    let result = app::run(app_state).await;

    crossterm::terminal::disable_raw_mode().ok();
    let _ = std::io::Write::write_all(&mut stdout, b"\x1b[?25h");
    let _ = std::io::Write::write_all(&mut stdout, b"\x1b[?1049l");
    let _ = std::io::Write::flush(&mut stdout);

    if let Err(e) = result {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
}
