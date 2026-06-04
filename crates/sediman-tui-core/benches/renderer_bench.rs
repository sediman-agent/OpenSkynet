use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};

use sediman_tui_core::renderer::{
    AnsiWriter, Cell, CellBuffer, Change, Color, DiffEngine, Line, Rect, Span, Style,
    TextAttributes,
};
use sediman_tui_core::command::{fuzzy_match, Command, CommandCategory};
use sediman_tui_core::input::TextEditor;
use sediman_tui_core::markdown;
use sediman_tui_core::styling::Theme;
use sediman_tui_core::layout::LayoutManager;

// ── CellBuffer ──────────────────────────────────────────────────────

fn bench_cellbuffer_new(c: &mut Criterion) {
    c.bench_function("cellbuffer/new_80x24", |b| {
        b.iter(|| CellBuffer::new(black_box(80), black_box(24)))
    });
    c.bench_function("cellbuffer/new_200x60", |b| {
        b.iter(|| CellBuffer::new(black_box(200), black_box(60)))
    });
}

fn bench_cellbuffer_draw_str(c: &mut Criterion) {
    let mut group = c.benchmark_group("cellbuffer/draw_str");
    for len in [20, 80, 200] {
        let text = "a".repeat(len);
        group.throughput(Throughput::Elements(len as u64));
        group.bench_with_input(BenchmarkId::from_parameter(len), &text, |b, text| {
            let mut buf = CellBuffer::new(220, 1);
            b.iter(|| {
                buf.clear();
                buf.draw_str(0, 0, black_box(text), Style::new())
            });
        });
    }
    group.finish();
}

fn bench_cellbuffer_draw_str_styled(c: &mut Criterion) {
    let mut group = c.benchmark_group("cellbuffer/draw_str_styled");
    for len in [20, 80, 200] {
        let text = "x".repeat(len);
        group.throughput(Throughput::Elements(len as u64));
        group.bench_with_input(BenchmarkId::from_parameter(len), &text, |b, text| {
            let mut buf = CellBuffer::new(220, 1);
            let style = Style::new().fg(Color::GREEN).bg(Color::BLACK).add_modifier(TextAttributes::bold());
            b.iter(|| {
                buf.clear();
                buf.draw_str(0, 0, black_box(text), style)
            });
        });
    }
    group.finish();
}

fn bench_cellbuffer_fill(c: &mut Criterion) {
    c.bench_function("cellbuffer/fill_80x24", |b| {
        let cell = Cell::new(' ', Style::new().bg(Color::Rgb(30, 30, 46)));
        b.iter(|| {
            let mut buf = CellBuffer::new(80, 24);
            buf.fill(black_box(Rect::new(0, 0, 80, 24)), cell)
        });
    });
}

fn bench_cellbuffer_resize(c: &mut Criterion) {
    c.bench_function("cellbuffer/resize_80x24_to_120x40", |b| {
        b.iter(|| {
            let mut buf = CellBuffer::new(80, 24);
            buf.draw_str(0, 0, "hello world", Style::new());
            buf.resize(black_box(120), black_box(40))
        });
    });
}

fn bench_cellbuffer_blit(c: &mut Criterion) {
    let mut src = CellBuffer::new(40, 20);
    for y in 0..20 {
        src.draw_str(0, y, &format!("line {:03} content here", y), Style::new().fg(Color::CYAN));
    }
    c.bench_function("cellbuffer/blit_40x20", |b| {
        b.iter(|| {
            let mut dst = CellBuffer::new(80, 24);
            dst.blit(black_box(Rect::new(0, 0, 40, 20)), &src, Rect::new(0, 0, 40, 20))
        });
    });
}

fn bench_cellbuffer_draw_wrapped(c: &mut Criterion) {
    let text = "The quick brown fox jumps over the lazy dog. This is a longer paragraph of text that will wrap across multiple lines when rendered into a narrow buffer area. ".repeat(5);
    c.bench_function("cellbuffer/draw_wrapped_500chars_40wide", |b| {
        b.iter(|| {
            let mut buf = CellBuffer::new(40, 60);
            buf.draw_wrapped_str(black_box(Rect::new(0, 0, 40, 60)), &text, Style::new())
        });
    });
}

// ── DiffEngine ──────────────────────────────────────────────────────

fn bench_diff_empty(c: &mut Criterion) {
    c.bench_function("diff/empty_80x24", |b| {
        b.iter(|| {
            let a = CellBuffer::new(80, 24);
            let b_ = CellBuffer::new(80, 24);
            DiffEngine::diff(black_box(&a), black_box(&b_))
        });
    });
}

fn bench_diff_full_screen(c: &mut Criterion) {
    c.bench_function("diff/full_screen_change_80x24", |b| {
        let mut front = CellBuffer::new(80, 24);
        b.iter(|| {
            let mut back = CellBuffer::new(80, 24);
            for y in 0..24 {
                back.draw_str(0, y, &format!("row {:02} new content here!!", y), Style::new().fg(Color::WHITE));
            }
            let changes = DiffEngine::diff(black_box(&front), black_box(&back));
            front = back;
            changes
        });
    });
}

fn bench_diff_single_row_change(c: &mut Criterion) {
    c.bench_function("diff/single_row_change_80x24", |b| {
        let mut front = CellBuffer::new(80, 24);
        for y in 0..24 {
            front.draw_str(0, y, &format!("row {:02} original content", y), Style::new());
        }
        b.iter(|| {
            let mut back = front.clone();
            back.draw_str(0, 12, "CHANGED ROW CONTENT HERE!!!                    ", Style::new().fg(Color::RED));
            DiffEngine::diff(black_box(&front), black_box(&back))
        });
    });
}

fn bench_diff_and_clear(c: &mut Criterion) {
    c.bench_function("diff/diff_and_clear_80x24", |b| {
        b.iter(|| {
            let mut a = CellBuffer::new(80, 24);
            let mut b_ = CellBuffer::new(80, 24);
            b_.draw_str(0, 0, "changed", Style::new().fg(Color::GREEN));
            DiffEngine::diff_and_clear(black_box(&mut a), black_box(&mut b_))
        });
    });
}

fn bench_diff_optimize(c: &mut Criterion) {
    c.bench_function("diff/optimize_1000_changes", |b| {
        let changes: Vec<Change> = (0..1000)
            .map(|i| Change {
                x: (i * 7 % 80) as u16,
                y: (i % 24) as u16,
                cell: Cell::new('x', Style::new().fg(Color::GREEN)),
            })
            .collect();
        b.iter(|| {
            let mut c = changes.clone();
            DiffEngine::optimize(black_box(&mut c))
        });
    });
}

// ── AnsiWriter ──────────────────────────────────────────────────────

fn bench_ansi_render(c: &mut Criterion) {
    let mut group = c.benchmark_group("ansi/render");
    for (w, h) in [(80, 24), (120, 40), (200, 60)] {
        let mut buf = CellBuffer::new(w, h);
        for y in 0..h {
            let style = Style::new().fg(Color::from_rgb(
                (y * 11 % 256) as u8,
                (y * 23 % 256) as u8,
                (y * 37 % 256) as u8,
            ));
            buf.draw_str(0, y, &"A".repeat(w as usize), style);
        }
        group.throughput(Throughput::Elements((w * h) as u64));
        group.bench_with_input(
            BenchmarkId::new("full_buffer", format!("{}x{}", w, h)),
            &(buf),
            |b, buf| {
                b.iter(|| AnsiWriter::render(black_box(buf)))
            },
        );
    }
    group.finish();
}

fn bench_ansi_write_changes(c: &mut Criterion) {
    let mut group = c.benchmark_group("ansi/write_changes");
    for count in [10, 100, 1000] {
        let changes: Vec<Change> = (0..count)
            .map(|i| Change {
                x: (i * 3 % 80) as u16,
                y: (i % 24) as u16,
                cell: Cell::new(
                    (b'A' + (i % 26) as u8) as char,
                    Style::new().fg(Color::from_rgb(i as u8, (i * 3) as u8, (i * 7) as u8)),
                ),
            })
            .collect();
        group.throughput(Throughput::Elements(count as u64));
        group.bench_with_input(
            BenchmarkId::new("changes", count),
            &changes,
            |b, changes| {
                b.iter(|| {
                    let mut writer = AnsiWriter::new();
                    let mut out = Vec::with_capacity(4096);
                    writer.write(black_box(&mut out), black_box(changes)).unwrap()
                });
            },
        );
    }
    group.finish();
}

// ── Line & Span rendering ───────────────────────────────────────────

fn bench_line_render(c: &mut Criterion) {
    let mut group = c.benchmark_group("line/render");
    for span_count in [1, 5, 20] {
        let line = Line::from_spans(
            (0..span_count)
                .map(|i| {
                    Span::styled(
                        format!("span{} ", i),
                        Style::new().fg(Color::from_rgb(i as u8, 100, 200)),
                    )
                })
                .collect(),
        );
        group.throughput(Throughput::Elements(span_count as u64));
        group.bench_with_input(
            BenchmarkId::new("spans", span_count),
            &line,
            |b, line| {
                b.iter(|| {
                    let mut buf = CellBuffer::new(200, 1);
                    line.render(black_box(&mut buf), 0, 0)
                });
            },
        );
    }
    group.finish();
}

// ── Markdown ────────────────────────────────────────────────────────

fn bench_markdown(c: &mut Criterion) {
    let mut group = c.benchmark_group("markdown");

    let plain_text = "This is a plain text paragraph with some words.\nAnd a second line.\n";
    group.bench_function("plain_text", |b| {
        b.iter(|| markdown::render_markdown(black_box(plain_text)))
    });

    let headings = "# Main Title\n## Subtitle\n### Section\n#### Detail\n".repeat(5);
    group.bench_function("headings", |b| {
        b.iter(|| markdown::render_markdown(black_box(&headings)))
    });

    let mixed = r#"
# Benchmark Document

This is a **bold** and *italic* paragraph with `inline code` spans mixed in.

## List Section

- First item with **bold text**
- Second item with `code`
- Third item with *emphasis*

> A blockquote that spans
> multiple lines of text.

### Code Block

```python
def hello(name: str) -> str:
    return f"Hello, {name}!"

for i in range(100):
    print(hello(f"world_{i}"))
```

---

## Links

Check out [this link](https://example.com) for more info.

### Final paragraph

Normal text to close out the document.
"#;
    group.bench_function("mixed_markdown", |b| {
        b.iter(|| markdown::render_markdown(black_box(mixed)))
    });

    let large_doc = mixed.repeat(20);
    group.bench_function("large_doc_20x", |b| {
        b.iter(|| markdown::render_markdown(black_box(&large_doc)))
    });

    let theme = Theme::default();
    group.bench_function("mixed_with_theme", |b| {
        b.iter(|| markdown::render_markdown_with_theme(black_box(mixed), black_box(&theme)))
    });

    group.finish();
}

// ── TextEditor ──────────────────────────────────────────────────────

fn bench_texteditor_typing(c: &mut Criterion) {
    use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

    c.bench_function("editor/type_100_chars", |b| {
        b.iter(|| {
            let mut ed = TextEditor::new();
            for i in 0..100u8 {
                let ch = (b'a' + (i % 26)) as char;
                ed.input(KeyEvent::new(KeyCode::Char(ch), KeyModifiers::NONE));
            }
            black_box(&ed);
        });
    });
}

fn bench_texteditor_submit_and_history(c: &mut Criterion) {
    use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

    c.bench_function("editor/submit_50_lines_history_nav", |b| {
        b.iter(|| {
            let mut ed = TextEditor::new();
            for i in 0..50 {
                for ch in format!("command number {:03}", i).chars() {
                    ed.input(KeyEvent::new(KeyCode::Char(ch), KeyModifiers::NONE));
                }
                ed.submit();
            }
            for _ in 0..50 {
                ed.history_up();
            }
            for _ in 0..50 {
                ed.history_down();
            }
            black_box(&ed);
        });
    });
}

fn bench_texteditor_render(c: &mut Criterion) {
    use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

    let mut ed = TextEditor::new();
    ed.set_prompt(" [3] > ");
    for ch in "search for laptops on Amazon and compare prices across stores".chars() {
        ed.input(KeyEvent::new(KeyCode::Char(ch), KeyModifiers::NONE));
    }
    c.bench_function("editor/render_70chars", |b| {
        b.iter(|| {
            let mut buf = CellBuffer::new(80, 5);
            ed.render(black_box(&mut buf), black_box(Rect::new(0, 1, 80, 3)))
        });
    });
}

// ── Fuzzy Matching ──────────────────────────────────────────────────

fn bench_fuzzy(c: &mut Criterion) {
    let mut group = c.benchmark_group("fuzzy");

    let commands: [Command; 30] = std::array::from_fn(|i| Command {
        name: Box::leak(format!("/cmd-{:02}", i).into_boxed_str()),
        aliases: if i == 0 { &["/c0"] as &[&str] } else { &[] },
        description: "",
        category: CommandCategory::General,
    });
    let cmd_refs: Vec<&Command> = commands.iter().collect();

    group.bench_function("exact_match_30cmds", |b| {
        b.iter(|| fuzzy_match(black_box("/cmd-15"), black_box(&cmd_refs)))
    });

    group.bench_function("starts_with_30cmds", |b| {
        b.iter(|| fuzzy_match(black_box("/cmd-1"), black_box(&cmd_refs)))
    });

    group.bench_function("levenshtein_fallback_30cmds", |b| {
        b.iter(|| fuzzy_match(black_box("/cmx-14"), black_box(&cmd_refs)))
    });

    group.bench_function("no_match_30cmds", |b| {
        b.iter(|| fuzzy_match(black_box("/zzzzzzz"), black_box(&cmd_refs)))
    });

    group.finish();
}

// ── Layout ──────────────────────────────────────────────────────────

fn bench_layout(c: &mut Criterion) {
    let mut group = c.benchmark_group("layout");

    group.bench_function("split_80x24_no_panel", |b| {
        let lm = LayoutManager::new();
        b.iter(|| lm.split(black_box(Rect::new(0, 0, 80, 24))))
    });

    group.bench_function("split_120x40_with_panel", |b| {
        let mut lm = LayoutManager::new();
        lm.show_side_panel = true;
        b.iter(|| lm.split(black_box(Rect::new(0, 0, 120, 40))))
    });

    group.bench_function("split_200x60_with_panel", |b| {
        let mut lm = LayoutManager::new();
        lm.show_side_panel = true;
        b.iter(|| lm.split(black_box(Rect::new(0, 0, 200, 60))))
    });

    group.finish();
}

// ── Theme ───────────────────────────────────────────────────────────

fn bench_theme(c: &mut Criterion) {
    c.bench_function("theme/default_construct", |b| {
        b.iter(|| Theme::default())
    });
}

criterion_group!(
    benches,
    bench_cellbuffer_new,
    bench_cellbuffer_draw_str,
    bench_cellbuffer_draw_str_styled,
    bench_cellbuffer_fill,
    bench_cellbuffer_resize,
    bench_cellbuffer_blit,
    bench_cellbuffer_draw_wrapped,
    bench_diff_empty,
    bench_diff_full_screen,
    bench_diff_single_row_change,
    bench_diff_and_clear,
    bench_diff_optimize,
    bench_ansi_render,
    bench_ansi_write_changes,
    bench_line_render,
    bench_markdown,
    bench_texteditor_typing,
    bench_texteditor_submit_and_history,
    bench_texteditor_render,
    bench_fuzzy,
    bench_layout,
    bench_theme,
);

criterion_main!(benches);
