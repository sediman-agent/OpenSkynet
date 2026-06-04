use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};

use sediman_tui_core::renderer::{
    AnsiWriter, Cell, CellBuffer, Color, DiffEngine, Line, Rect, Span, Style, TextAttributes,
};
use sediman_tui_core::layout::LayoutManager;
use sediman_tui_core::markdown;
use sediman_tui_core::styling::Theme;

// ── Full Render Pipeline: Render → Diff → Write ────────────────────

fn bench_full_pipeline(c: &mut Criterion) {
    let mut group = c.benchmark_group("pipeline/full");
    let theme = Theme::default();

    for (w, h) in [(80, 24), (120, 40)] {
        let label = format!("{}x{}", w, h);

        group.bench_with_input(
            BenchmarkId::new("static_content", &label),
            &(w, h),
            |b, &(w, h)| {
                let mut front = CellBuffer::new(w, h);
                b.iter(|| {
                    let mut back = CellBuffer::new(w, h);
                    render_static_screen(&mut back, &theme, w, h);
                    let mut changes = DiffEngine::diff_and_clear(&mut front, &mut back);
                    DiffEngine::optimize(&mut changes);
                    let mut writer = AnsiWriter::new();
                    let mut out = Vec::with_capacity(8192);
                    writer.write(&mut out, &changes).unwrap();
                    black_box(out);
                    std::mem::swap(&mut front, &mut back);
                });
            },
        );

        group.bench_with_input(
            BenchmarkId::new("streaming_update", &label),
            &(w, h),
            |b, &(w, h)| {
                let mut front = CellBuffer::new(w, h);
                render_static_screen(&mut front, &theme, w, h);
                b.iter(|| {
                    let mut back = front.clone();
                    simulate_streaming_update(&mut back, &theme, w, h);
                    let mut changes = DiffEngine::diff_and_clear(&mut front, &mut back);
                    DiffEngine::optimize(&mut changes);
                    let mut writer = AnsiWriter::new();
                    let mut out = Vec::with_capacity(4096);
                    writer.write(&mut out, &changes).unwrap();
                    black_box(out);
                    std::mem::swap(&mut front, &mut back);
                });
            },
        );

        group.bench_with_input(
            BenchmarkId::new("scroll_update", &label),
            &(w, h),
            |b, &(w, h)| {
                let mut front = CellBuffer::new(w, h);
                fill_chat_messages(&mut front, &theme, w, h, 0);
                b.iter(|| {
                    let mut back = front.clone();
                    scroll_content(&mut back, &theme, w, h);
                    let mut changes = DiffEngine::diff_and_clear(&mut front, &mut back);
                    DiffEngine::optimize(&mut changes);
                    let mut writer = AnsiWriter::new();
                    let mut out = Vec::with_capacity(4096);
                    writer.write(&mut out, &changes).unwrap();
                    black_box(out);
                    std::mem::swap(&mut front, &mut back);
                });
            },
        );
    }
    group.finish();
}

// ── Markdown rendering at scale ─────────────────────────────────────

fn bench_markdown_pipeline(c: &mut Criterion) {
    let mut group = c.benchmark_group("pipeline/markdown");
    let theme = Theme::default();

    let md = r#"
## Agent Response

I'll help you with that task. Here's my plan:

1. Navigate to the website
2. Extract the relevant data
3. Format and present the results

### Code Example

```rust
fn main() {
    println!("Hello, world!");
    let data = vec![1, 2, 3, 4, 5];
    for item in data.iter() {
        println!("Item: {}", item);
    }
}
```

### Results

| Metric | Value |
|--------|-------|
| Speed  | 42ms  |
| Accuracy | 99.2% |

> **Note**: This is a benchmark test to measure rendering performance.

The agent completed the task successfully in **3 steps** with a total
execution time of `2.4 seconds`. All assertions passed and the output
matches the expected format.

---

**Skill created:** `extract-data`
**Scheduled:** `0 9 * * *`
"#;

    for repeat in [1, 5, 20] {
        let doc = md.repeat(repeat);
        let label = format!("{}x", repeat);
        group.throughput(Throughput::Bytes(doc.len() as u64));
        group.bench_with_input(
            BenchmarkId::new("parse_render", &label),
            &doc,
            |b, doc| {
                b.iter(|| {
                    let lines = markdown::render_markdown_with_theme(
                        black_box(doc),
                        black_box(&theme),
                    );
                    black_box(lines);
                });
            },
        );
    }
    group.finish();
}

// ── Stress: rapid small updates (simulates typing) ──────────────────

fn bench_rapid_micro_updates(c: &mut Criterion) {
    let mut group = c.benchmark_group("pipeline/micro_update");

    group.bench_function("typing_1char_80x24", |b| {
        let mut front = CellBuffer::new(80, 24);
        render_static_screen(&mut front, &Theme::default(), 80, 24);
        let mut char_idx = 0u8;
        b.iter(|| {
            let mut back = front.clone();
            let ch = (b'a' + (char_idx % 26)) as char;
            let input_x = 7 + (char_idx as u16 % 70);
            let input_y = 22;
            back.put_char(input_x, input_y, ch, Style::new().fg(Color::WHITE));
            char_idx = char_idx.wrapping_add(1);
            let changes = DiffEngine::diff_and_clear(&mut front, &mut back);
            black_box(changes);
            std::mem::swap(&mut front, &mut back);
        });
    });

    group.bench_function("spinner_1char_80x24", |b| {
        let mut front = CellBuffer::new(80, 24);
        render_static_screen(&mut front, &Theme::default(), 80, 24);
        let frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let mut idx = 0;
        b.iter(|| {
            let mut back = front.clone();
            let ch = frames[idx % frames.len()];
            back.put_char(2, 0, ch, Style::new().fg(Color::GREEN));
            idx += 1;
            let changes = DiffEngine::diff_and_clear(&mut front, &mut back);
            black_box(changes);
            std::mem::swap(&mut front, &mut back);
        });
    });

    group.finish();
}

// ── Stress: large screen ────────────────────────────────────────────

fn bench_large_screens(c: &mut Criterion) {
    let mut group = c.benchmark_group("pipeline/large_screen");
    let theme = Theme::default();

    for (w, h) in [(200, 60), (300, 80), (400, 100)] {
        let label = format!("{}x{}", w, h);
        group.throughput(Throughput::Elements((w * h) as u64));
        group.bench_with_input(
            BenchmarkId::new("full_render", &label),
            &(w, h),
            |b, &(w, h)| {
                b.iter(|| {
                    let mut buf = CellBuffer::new(w, h);
                    render_static_screen(&mut buf, &theme, w, h);
                    let out = AnsiWriter::render(black_box(&buf));
                    black_box(out);
                });
            },
        );
    }
    group.finish();
}

// ── Helpers ─────────────────────────────────────────────────────────

fn render_static_screen(buf: &mut CellBuffer, theme: &Theme, w: u16, h: u16) {
    let title_style = Style::new().fg(theme.primary).bg(theme.background).add_modifier(TextAttributes::bold());
    let border_style = Style::new().fg(Color::from_rgb(60, 60, 80));
    let text_style = Style::new().fg(theme.text).bg(theme.background);
    let muted_style = Style::new().fg(theme.text_muted);
    let prompt_style = Style::new().fg(theme.primary).bg(theme.background);

    // Title bar
    let title = format!(" [Mgr] OpenSkynet \u{2014} openai/gpt-4 \u{2014} ");
    buf.draw_str(0, 0, &title, title_style);
    let remainder = w as usize - title.chars().count();
    if remainder > 0 {
        buf.draw_str(
            title.chars().count() as u16,
            0,
            &"\u{2500}".repeat(remainder),
            border_style,
        );
    }

    // Chat messages area
    let messages = [
        ("You", "search for laptops on Amazon"),
        ("Agent", "I'll search for laptops on Amazon and compare prices. Let me navigate to the website."),
        ("Step", "Navigating to https://amazon.com"),
        ("Step", "Searching for 'laptops' in the search bar"),
        ("Step", "Filtering results by rating 4+ stars"),
        ("Agent", "Found 15 laptops matching your criteria. Here are the top results:\n\n| Model | Price | Rating |\n|-------|-------|--------|\n| ThinkPad X1 | $1,299 | 4.7 |\n| MacBook Air | $1,099 | 4.8 |\n| Dell XPS 13 | $1,199 | 4.6 |"),
    ];

    let mut y = 2u16;
    for (role, content) in &messages {
        if y >= h.saturating_sub(4) {
            break;
        }
        let role_style = match *role {
            "You" => Style::new().fg(Color::GREEN).add_modifier(TextAttributes::bold()),
            "Agent" => Style::new().fg(theme.primary).add_modifier(TextAttributes::bold()),
            "Step" => Style::new().fg(theme.text_muted),
            _ => text_style,
        };
        buf.draw_str(2, y, &format!("[{}] ", role), role_style);
        let prefix_len = role.len() + 4;
        for (i, line) in content.lines().enumerate() {
            let draw_y = y + i as u16;
            if draw_y >= h.saturating_sub(4) {
                break;
            }
            let line_to_draw = if i == 0 { line } else { line };
            let draw_x = if i == 0 { 2 + prefix_len as u16 } else { 4 };
            buf.draw_str_clipped(
                Rect::new(2, 0, w.saturating_sub(4), h),
                draw_x,
                draw_y,
                line_to_draw,
                text_style,
            );
            y += 1;
        }
        y += 1;
    }

    // Border before input
    buf.draw_str(0, h.saturating_sub(3), &"\u{2500}".repeat(w as usize), border_style);

    // Input area
    buf.draw_str(0, h.saturating_sub(2), " [4] > ", prompt_style);
    buf.put_char(8, h.saturating_sub(2), ' ', Style::new().fg(theme.background).bg(theme.primary));

    // Status bar
    let status_style = Style::new().fg(theme.text_muted).bg(theme.background);
    buf.draw_str(0, h.saturating_sub(1), " Manager | \u{25CF} Connected | Tab: switch agent | /help", status_style);
}

fn simulate_streaming_update(buf: &mut CellBuffer, theme: &Theme, w: u16, _h: u16) {
    let text_style = Style::new().fg(theme.text);
    let response = "Here is the streaming response that simulates real-time token output from the agent. ";
    buf.draw_str_clipped(
        Rect::new(4, 10, w.saturating_sub(8), 5),
        4,
        10,
        response,
        text_style,
    );
}

fn fill_chat_messages(buf: &mut CellBuffer, theme: &Theme, w: u16, h: u16, _offset: u16) {
    render_static_screen(buf, theme, w, h);
}

fn scroll_content(buf: &mut CellBuffer, theme: &Theme, w: u16, h: u16) {
    buf.clear();
    render_static_screen(buf, theme, w, h);
    let text_style = Style::new().fg(theme.text);
    buf.draw_str(4, h.saturating_sub(8), "New message appeared at bottom after scroll", text_style);
}

criterion_group!(
    name = pipeline_benches;
    config = Criterion::default();
    targets = bench_full_pipeline, bench_markdown_pipeline, bench_rapid_micro_updates, bench_large_screens,
);

criterion_main!(pipeline_benches);
