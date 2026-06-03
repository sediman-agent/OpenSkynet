# OpenSkynet Roadmap

Features planned to close the gap with OpenCode / Claude Code and beyond.

---

## Completed

### Core Agent

- [x] **Agent loop** — think-act-observe-reflect cycle
- [x] **Browser Use integration** — real Chromium via Playwright
- [x] **Skill engine** — create, patch, delete, version, rollback, dedup, usage tracking
- [x] **Skill executor** — run skills with auto-healing on failure
- [x] **Skill learner** — Hermes-style 3-question eval, auto-extract from traces
- [x] **Skill auditor** — staleness review, auto-archive/delete unused skills
- [x] **Skill healer** — LLM-based repair when page layouts change
- [x] **Skill validator** — name format, injection/exfiltration/destructive detection, trust levels
- [x] **Skills Hub** — browse, search, install, validate, publish community skills
- [x] **Cron scheduler** — APScheduler-based 24/7 task scheduling
- [x] **Persistent memory** — dual-file bounded storage, background LLM review
- [x] **Memory security** — prompt injection, exfiltration, invisible unicode scanning
- [x] **Session storage** — SQLite + FTS5 full-text search
- [x] **Subagent orchestration** — parallel delegation with semaphore
- [x] **Context compression** — LLM-based conversation compaction
- [x] **Screen recording** — JS-injected cursor tracking, FPS capture, trace-to-skill conversion
- [x] **`clarify` tool** — ask user questions with multiple-choice support
- [x] **`todo` tool** — session-scoped task list with status tracking
- [x] **`terminal` tool** — shell execution with per-command approval, dangerous pattern blocking, and session-level override

### File Tools

- [x] **`read_file`** — Read files with line numbers and pagination (offset/limit)
- [x] **`write_file`** — Write content to files, create parent directories automatically
- [x] **`patch`** — Targeted find-and-replace edits with fuzzy matching. Auto-run syntax checks after editing
- [x] **`search_files`** — Ripgrep-backed file search by content (regex) and by name (glob). Faster than shelling out to grep/find

### Rust TUI (sediman-tui)

- [x] **Ratatui-based terminal UI** — fast, native rendering with no Python dependency
- [x] **sediman-tui-core** — reusable widget framework (command system, fuzzy matching, layout, theming, event loop, text editor, markdown rendering)
- [x] **sediman-tui-bridge** — IPC bridge to Python backend
- [x] **38 slash commands** — matching the Python TUI command set
- [x] **Fuzzy command matching** — Levenshtein distance fallback for typos
- [x] **Permission system** — ask/acceptEdits/plan/auto modes with Shift+Tab cycling
- [x] **Interrupt handling** — Esc to cancel running agent
- [x] **Scrollable output** — Shift+Up/Down and PageUp/PageDown scrolling
- [x] **Chat message history** — user messages rendered as conversation threads
- [x] **Context usage bar** — token estimation with color thresholds
- [x] **Shell command execution** — `!` prefix for running commands
- [x] **Theme system** — built-in themes + custom JSON theme loading

### Terminator Mode (Autonomous Coding)

- [x] **Phase 1: Validation gates** — `InlineVerifier` runs lint/format/test after each issue; `review` subagent critiques diff (PASS/NEEDS_FIX/REJECT); `debug` subagent diagnoses root cause on failure
- [x] **Phase 2: Dependency-aware scheduling** — issues with `depends_on` only start when deps are resolved; scratchpad cross-issue communication for API/file sharing
- [x] **Phase 3: Integration merge** — `integrate` subagent merges all feature branches, resolves conflicts, runs full test suite
- [x] **Phase 4: Adaptive resilience** — re-decomposition when >50% fail; checkpoint rollback before spawn; progressive retry with exponential backoff and enriched context
- [x] **Phase 5: Quality gates & timeline** — configurable gate pipeline (pre-merge/post-merge/final); structured workflow timeline with per-issue timing and phase tracking
- [x] **Phase 6: Learning** — per-issue and workflow trajectories saved to TrajectoryDB; failure pattern library with persistent JSON storage and keyword-matched warnings
- [x] **Phase 7: Adversarial hardening** — `redteam` subagent writes adversarial tests for edge cases; contract verification between dependent issues' APIs
- [x] **New agent templates** — `integrate` (merge agent, 50 iterations), `redteam` (adversarial test engineer)

### Architecture

- [x] **Unix socket JSON-RPC bridge** — replaced HTTP + WebSocket with `/tmp/sediman.sock` (Unix domain socket). ~15x faster than localhost HTTP loopback
- [x] **sediman-tui-bridge (Rust)** — native Rust client library for Unix socket communication to Python backend. Powers the TUI with zero external dependencies
- [x] **Python RPC server** — `rpc_server.py` replaces the FastAPI server for local usage. Same code, no HTTP overhead, single process

---

## In Progress

### Rust TUI polish (target: OpenCode-level UX)

The TUI works but has a long way to go visually. Top priorities:

- [ ] **OpenTUI-style rendering** — port from Ratatui to OpenTUI (Zig + TypeScript bindings) for GPU-like terminal performance, flexbox layout, and rich text rendering
- [ ] **Rich markdown rendering** — code blocks with syntax highlighting, inline images, tables, task lists
- [ ] **Inline browser screenshot preview** — render screenshots as ANSI/Kitty/ITerm2 inline images
- [ ] **Animated spinner** — real animation frames, not static text
- [ ] **Side panel** — skills/memory/schedule/status tabs rendered alongside main content
- [ ] **Notification system** — cron job completion, long-running task alerts
- [ ] **Tab completion** — wire the existing `Completer` into the input handler
- [ ] **Config file** — `~/.terminator/config.toml` for persistent settings
- [ ] **Session autosave/resume** — persist and restore conversation state
- [ ] **WebSocket reconnection** — graceful recovery on backend restart
- [ ] **Visual theme polish** — match OpenCode's color scheme and typography
- [ ] **Help overlay** — rich categorized command list with search

### TypeScript Migration (Python → TypeScript) — Deprecated

TypeScript migration plans have been deprecated. The codebase will remain Python-focused for the backend with Rust for the TUI.

- [x] **Removed TypeScript SDK** — `@sediman/sdk` was removed as it was not being used internally. The Rust TUI uses `sediman-tui-bridge` for efficient Unix socket communication.

### Missing commands (Python TUI parity)

These exist in the Python TUI but not yet in the Rust TUI:

- [ ] `/install` — Install skill from GitHub or hub
- [ ] `/search` — Search the hub for skills
- [ ] `/update` — Update installed skills
- [ ] `/outdated` — Check for skill updates
- [ ] `/skill-info` — Show skill provenance and source info
- [ ] `/checkpoint*` — Filesystem checkpoint CRUD via sediman-sandbox
- [ ] `/rewind` — Revert current directory to checkpoint
- [ ] `/branch` / `/branches` — Named checkpoint branches

### Web Tool

- [ ] **`web_extract`** — Extract web page and PDF content to markdown. Current `web_search` is a stub that delegates to the browser subagent. Need a real implementation using HTTP fetch + HTML-to-markdown conversion. Pages under 5K chars return full markdown; larger pages get LLM-summarized

---

## Planned — Tier 1: Core Agent Capabilities

### Code Execution

- [ ] **`execute_code`** — Run Python scripts that can call agent tools programmatically. Use when 3+ tool calls with processing logic between them are needed, or for filtering/reducing large outputs before they enter context. Collapses multi-step pipelines into zero-context-cost turns

### Session Search Tool

- [ ] **`session_search`** — Expose the existing FTS5 session database as a callable tool. Three modes: discovery (pass `query`), scroll (pass `session_id` + `around_message_id`), browse (no args). No LLM calls — pure DB retrieval

### Granular Browser Tools

OpenSkynet currently uses BrowserUse as a monolithic black box. Exposing individual browser operations as tools gives the LLM finer control and reduces context waste.

- [ ] **`browser_navigate`** — Go to URL
- [ ] **`browser_snapshot`** — Accessibility tree snapshot with element ref IDs
- [ ] **`browser_click`** — Click element by ref ID from snapshot
- [ ] **`browser_type`** — Type text into input field by ref ID
- [ ] **`browser_scroll`** — Scroll page in a direction
- [ ] **`browser_press`** — Press keyboard key
- [ ] **`browser_back`** — Navigate back in history
- [ ] **`browser_vision`** — Screenshot + vision AI analysis
- [ ] **`browser_console`** — Get browser console output and JS errors
- [ ] **`browser_get_images`** — List all images on current page

---

## Planned — Tier 2: Memory & Scheduling as Tools

These subsystems exist internally but are not exposed as callable tools. The agent should be able to manage memory and schedules mid-conversation.

- [ ] **`memory` tool** — Add/replace/remove entries in persistent memory via tool calls. Currently only done post-task via the memory manager. Exposing it lets the agent save important facts mid-task
- [ ] **`cronjob` tool** — Full CRUD for scheduled tasks from within a session (create, list, update, pause, resume, run, remove). Currently scheduling only happens via CLI or manager plan

---

## Planned — Tier 3: Media & Generation

- [ ] **`vision_analyze`** — Image analysis via vision-capable models. On vision models, pass raw pixels as multimodal tool result. On text-only models, fall back to auxiliary vision model
- [ ] **`image_generate`** — Text-to-image generation via FAL.ai (or pluggable backend)
- [ ] **`text_to_speech`** — TTS audio generation for voice delivery on messaging platforms
- [ ] **`video_analyze`** — Video content analysis (captions, scene breakdowns, key timestamps)
- [ ] **`video_generate`** — Text-to-video via plugin-registered backends

---

## Planned — Tier 4: Integrations & Platforms

### Messaging Gateway

- [ ] **`send_message`** — Cross-platform messaging delivery (Telegram, Discord, Slack, WhatsApp, Signal)
- [ ] Telegram adapter
- [ ] Discord adapter
- [ ] Slack adapter

### MCP Integration

- [ ] **MCP server support** — Load tools dynamically from MCP servers. Each configured server generates a `mcp-<server>` toolset at runtime. Support `command`-based and `url`-based MCP servers

### External Providers

- [ ] **`mixture_of_agents`** — Multi-model consensus via Mixture of Agents (route hard problems through multiple frontier LLMs)
- [ ] **Anthropic provider** — Native Anthropic/Claude support alongside OpenAI and Ollama
- [ ] **Google Gemini provider** — Native Gemini support

### Desktop Control

- [ ] **`computer_use`** — macOS/Linux desktop control (screenshots, click, drag, scroll, type). Does not steal cursor/focus

---

## Planned — Tier 5: Infrastructure

### Terminal Backends

The terminal tool currently runs commands locally. Add sandboxed execution environments:

- [ ] **Docker backend** — Isolated containers with persistent workspace
- [ ] **SSH backend** — Remote execution (keeps agent away from its own code)
- [ ] **Modal backend** — Serverless cloud execution
- [ ] **Daytona backend** — Persistent remote dev environments

### Background Process Management

- [ ] **`process` tool** — Manage background processes started with `terminal(background=true)`. Actions: list, poll, wait, kill, write (send stdin), log (full output with pagination)

### Web Dashboard

- [ ] Browser panel + chat panel UI
- [ ] Live viewport streaming
- [ ] Session history browser

### Advanced

- [ ] **Embedding-based skill dedup** — Replace word-overlap similarity with vector embeddings
- [ ] **Multi-user auth** — API key or OAuth-based authentication
- [ ] **Anti-captcha browser binary** — Custom Chromium build for CAPTCHA resistance
- [ ] **Toolsets system** — Named bundles of tools configurable per platform (like Hermes toolsets)
- [ ] **Plugin system** — Load third-party tool providers at runtime
- [ ] **Honcho memory provider** — Dialectic user modeling for cross-session personality

---

## Priority Order

1. ~~**File tools**~~ ✅ Done
2. ~~**Rust TUI**~~ ✅ Working — needs polish
3. ~~**Unix socket JSON-RPC**~~ ✅ Done
4. **TUI visual polish** — match OpenCode-level rendering
5. **Missing slash commands** — Python TUI parity
7. **Web extract** — unlocks research and data extraction
8. **Session search tool** — low effort, high value (DB already exists)
9. **Granular browser tools** — finer control, less context waste
10. **Code execution** — programmatic tool chaining
11. **Memory + cronjob tools** — expose existing subsystems
12. **TypeScript migration** — module by module (skills → scheduler → memory → hub → sessions → recording → agent → browser → LLM)
13. **Media tools** (vision, image gen, TTS)
14. **Messaging gateway + MCP**
15. **Terminal backends + process management**
16. **Web dashboard + SaaS platform**
