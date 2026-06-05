use crate::app::App;
use tracing::error;

#[cfg(feature = "gpu")]
use std::sync::Arc;

#[cfg(feature = "gpu")]
use sediman_tui_core::{
    event::AppEvent,
    renderer::CellBuffer,
    renderer::gpu::{GpuRenderer, GpuRendererConfig},
};

#[cfg(feature = "gpu")]
use crate::update::handle_message;

#[cfg(feature = "gpu")]
use winit::{
    application::ApplicationHandler,
    event::{ElementState, KeyEvent, WindowEvent},
    event_loop::{ActiveEventLoop, ControlFlow, EventLoop},
    keyboard::{Key, ModifiersState, NamedKey},
    window::{Window, WindowId},
};

#[cfg(feature = "gpu")]
const DEFAULT_FONT_SIZE: f32 = 16.0;
#[cfg(feature = "gpu")]
const DEFAULT_WINDOW_WIDTH: u32 = 960;
#[cfg(feature = "gpu")]
const DEFAULT_WINDOW_HEIGHT: u32 = 600;
#[cfg(feature = "gpu")]
const SPINNER_TICK_INTERVAL: u64 = 3;

#[cfg(feature = "gpu")]
const FONT_SEARCH_PATHS: &[&str] = &[
    "/System/Library/Fonts/Monaco.ttf",
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/SFMono-Regular.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/TTF/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    "C:\\Windows\\Fonts\\consola.ttf",
];

#[cfg(feature = "gpu")]
fn load_system_font() -> Option<Vec<u8>> {
    for path in FONT_SEARCH_PATHS {
        if let Ok(data) = std::fs::read(path) {
            return Some(data);
        }
    }
    None
}

#[cfg(feature = "gpu")]
fn map_winit_key(event: &KeyEvent, mod_state: &ModifiersState) -> Option<crossterm::event::KeyEvent> {
    use crossterm::event::{KeyCode, KeyEvent as CKeyEvent, KeyModifiers};

    let code = match &event.logical_key {
        Key::Named(named) => match named {
            NamedKey::Enter => KeyCode::Enter,
            NamedKey::Escape => KeyCode::Esc,
            NamedKey::Tab => KeyCode::Tab,
            NamedKey::Backspace => KeyCode::Backspace,
            NamedKey::Delete => KeyCode::Delete,
            NamedKey::Insert => KeyCode::Insert,
            NamedKey::Home => KeyCode::Home,
            NamedKey::End => KeyCode::End,
            NamedKey::PageUp => KeyCode::PageUp,
            NamedKey::PageDown => KeyCode::PageDown,
            NamedKey::ArrowUp => KeyCode::Up,
            NamedKey::ArrowDown => KeyCode::Down,
            NamedKey::ArrowLeft => KeyCode::Left,
            NamedKey::ArrowRight => KeyCode::Right,
            NamedKey::F1 => KeyCode::F(1),
            NamedKey::F2 => KeyCode::F(2),
            NamedKey::F3 => KeyCode::F(3),
            NamedKey::F4 => KeyCode::F(4),
            NamedKey::F5 => KeyCode::F(5),
            NamedKey::F6 => KeyCode::F(6),
            NamedKey::F7 => KeyCode::F(7),
            NamedKey::F8 => KeyCode::F(8),
            NamedKey::F9 => KeyCode::F(9),
            NamedKey::F10 => KeyCode::F(10),
            NamedKey::F11 => KeyCode::F(11),
            NamedKey::F12 => KeyCode::F(12),
            _ => return None,
        },
        Key::Character(ch) if ch.len() == 1 => {
            KeyCode::Char(ch.chars().next().unwrap())
        }
        _ => return None,
    };

    let mut modifiers = KeyModifiers::NONE;
    if mod_state.shift_key() { modifiers |= KeyModifiers::SHIFT; }
    if mod_state.control_key() { modifiers |= KeyModifiers::CONTROL; }
    if mod_state.alt_key() { modifiers |= KeyModifiers::ALT; }
    if mod_state.super_key() { modifiers |= KeyModifiers::SUPER; }

    Some(CKeyEvent::new(code, modifiers))
}

#[cfg(feature = "gpu")]
pub async fn run_gpu(app: App) -> Result<(), Box<dyn std::error::Error>> {
    use tokio::sync::mpsc;

    let font_data = load_system_font().unwrap_or_default();
    if font_data.is_empty() {
        error!("No monospace font found. Searched paths: {:?}", FONT_SEARCH_PATHS);
        return Err("No monospace font found. Install one and try again.".into());
    }

    let event_loop = EventLoop::new()?;
    let rt = tokio::runtime::Handle::current();
    let (event_tx, event_rx) = mpsc::channel::<AppEvent>(1024);

    let mut handler = GpuAppHandler {
        app,
        gpu: None,
        buffer: CellBuffer::empty(),
        window: None,
        font_data,
        needs_full_redraw: true,
        event_tx,
        event_rx,
        rt,
        tick: 0,
        mod_state: ModifiersState::empty(),
    };

    event_loop.run_app(&mut handler).map_err(|e| Box::new(e) as Box<dyn std::error::Error>)
}

#[cfg(feature = "gpu")]
struct GpuAppHandler {
    app: App,
    gpu: Option<GpuRenderer>,
    buffer: CellBuffer,
    window: Option<Arc<Window>>,
    font_data: Vec<u8>,
    needs_full_redraw: bool,
    event_tx: tokio::sync::mpsc::Sender<AppEvent>,
    event_rx: tokio::sync::mpsc::UnboundedReceiver<AppEvent>,
    rt: tokio::runtime::Handle,
    tick: u64,
    mod_state: ModifiersState,
}

#[cfg(feature = "gpu")]
impl GpuAppHandler {
    fn cell_dimensions(&self) -> (f32, f32) {
        self.gpu
            .as_ref()
            .map(|g| g.cell_dimensions())
            .unwrap_or((9.6, 20.0))
    }

    fn cols_rows_from_size(&self, width: u32, height: u32) -> (u16, u16) {
        let (cell_w, cell_h) = self.cell_dimensions();
        let cols = ((width as f32) / cell_w).floor() as u16;
        let rows = ((height as f32) / cell_h).floor() as u16;
        (cols.max(1), rows.max(1))
    }
}

#[cfg(feature = "gpu")]
impl ApplicationHandler for GpuAppHandler {
    fn resumed(&mut self, event_loop: &ActiveEventLoop) {
        if self.window.is_none() {
            let win = Arc::new(
                event_loop
                    .create_window(
                        winit::window::WindowAttributes::default()
                            .with_title("Sediman TUI")
                            .with_inner_size(winit::dpi::PhysicalSize::new(
                                DEFAULT_WINDOW_WIDTH,
                                DEFAULT_WINDOW_HEIGHT,
                            )),
                    )
                    .expect("Failed to create GPU window — no display available"),
            );
            self.window = Some(win.clone());

            let sz = win.inner_size();
            let (cols, rows) = self.cols_rows_from_size(sz.width, sz.height);
            self.buffer = CellBuffer::new(cols, rows);

            let gpu_config = GpuRendererConfig {
                font_size: DEFAULT_FONT_SIZE,
                theme: self.app.theme.clone(),
                ..Default::default()
            };
            let gpu = pollster::block_on(GpuRenderer::new(win, &self.font_data, gpu_config));
            self.gpu = Some(gpu);
            self.needs_full_redraw = true;
        }
        event_loop.set_control_flow(ControlFlow::Poll);
    }

    fn window_event(&mut self, event_loop: &ActiveEventLoop, _id: WindowId, event: WindowEvent) {
        match event {
            WindowEvent::CloseRequested => {
                self.app.running = false;
                event_loop.exit();
            }
            WindowEvent::RedrawRequested => {
                if let Some(ref mut gpu) = self.gpu {
                    gpu.set_theme(&self.app.theme);

                    self.buffer.clear();
                    crate::view::render_into(&mut self.buffer, &mut self.app);

                    let (cell_w, cell_h) = gpu.cell_dimensions();
                    if self.needs_full_redraw {
                        gpu.full_redraw(&self.buffer, cell_w, cell_h).ok();
                        self.needs_full_redraw = false;
                    } else {
                        gpu.render(&self.buffer, cell_w, cell_h).ok();
                    }
                }
            }
            WindowEvent::Resized(sz) => {
                if let Some(ref mut gpu) = self.gpu {
                    gpu.resize(sz.width, sz.height);
                    let (cols, rows) = self.cols_rows_from_size(sz.width, sz.height);
                    self.buffer = CellBuffer::new(cols, rows);
                    self.needs_full_redraw = true;
                }
            }
            WindowEvent::ModifiersChanged(m) => {
                self.mod_state = m.state();
            }
            WindowEvent::KeyboardInput { event, .. } => {
                if event.state == ElementState::Pressed {
                    if let Some(k) = map_winit_key(&event, &self.mod_state) {
                        let tx = self.event_tx.clone();
                        let _ = self.rt.block_on(async {
                            handle_message(&mut self.app, AppEvent::Key(k), &tx).await;
                        });
                        self.needs_full_redraw = true;
                        if let Some(ref w) = self.window {
                            w.request_redraw();
                        }
                    }
                }
            }
            _ => {}
        }
    }

    fn about_to_wait(&mut self, event_loop: &ActiveEventLoop) {
        while let Ok(ev) = self.event_rx.try_recv() {
            let tx = self.event_tx.clone();
            let _ = self.rt.block_on(async {
                handle_message(&mut self.app, ev, &tx).await;
            });
        }
        self.tick += 1;
        if self.app.agent.running && self.tick % SPINNER_TICK_INTERVAL == 0 {
            self.app.advance_spinner();
            self.needs_full_redraw = true;
        }
        if !self.app.agent.running {
            event_loop.exit();
            return;
        }
        if let Some(ref w) = self.window {
            w.request_redraw();
        }
    }
}

#[cfg(not(feature = "gpu"))]
#[allow(dead_code)]
pub async fn run_gpu(_app: App) -> Result<(), Box<dyn std::error::Error>> {
    error!("GPU feature not enabled. Build with --features gpu");
    Ok(())
}
