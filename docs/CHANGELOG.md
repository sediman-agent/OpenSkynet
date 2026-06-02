# Changelog

All notable changes to OpenSkynet will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.10] - 2026-06-02

### Fixed

- Replace all `.sediman` directory references with `.terminator` (docker-compose, uninstall script, worktrees, docs)
- Installer now warns about legacy `~/.sediman/` and suggests migration
- Uninstaller cleans up both `~/.terminator/` and legacy `~/.sediman/`

## [0.2.9] - 2026-06-02

### Fixed

- `sediman --version` showing stale `0.1.5` instead of actual package version. Replaced hardcoded `__version__` in `src/sediman/__init__.py` with dynamic `importlib.metadata.version("openskynet")`.

## [0.2.8] - 2026-06-02

### Added

- `/connect` redesign: picker modal with ↑/↓ navigation, Enter to connect via token prompt, d to disconnect inline
- `/doctor` fully wired: modal with categorized health checks (Browser, AI/LLM, Tools, Python, System), install execution, re-check
- Checkpoint commands restored: `/checkpoint`, `/checkpoint-create`, `/checkpoint-revert`, `/rewind`, `/branch`, `/branches`
- `IntegrationInfo` re-exported from `sediman-tui-bridge`
- Integration name parsed from backend dict key (was missing, causing empty integration list)
- 2 regression tests for integration response parsing

### Changed

- `sediman chat` CLI now launches the Rust TUI binary directly (Python TUI removed)
- `/connect` replaces `/integrations`, `/connect-discord`, `/connect-telegram` as unified hub
- `/sessions` only (removed `/session` alias)
- `/provider` no longer aliases `/connect`
- Bridge RPC: `list_integrations` → `integration.list`, `configure_integration` → `integration.configure`
- 29 registered commands (was 21)

### Removed

- Python TUI (`src/sediman/tui/` — 6 files, 2,599 lines)
- `/connect-discord`, `/connect-telegram`, `/integrations` commands
- `--disable`, `--channel`, `--chat` flags from `/connect` (now in-picker)

### Fixed

- `SessionInfo.id` type: `i64` → `String` (backend sends UUID hex strings)
- Bridge response unwrapping for `list_integrations` (server returns nested dict)
- Connect picker UI overflow (wider modal, proper height, clipped hints)

## [0.1.1] - 2026-05-30

### Added

- 200 curated skills from clawskills.sh (OpenClaw Skills Registry)
- Skills indexed with vector embeddings for semantic search (471 total skills)
- `scripts/import_clawskills.py` for importing skills from external registries
- clawskills.sh added as a source in the skill indexer
- Discord community link

### Fixed

- Install script GitHub repo reference (`sediman-agent/OpenSkynet`)
- CONTRIBUTING.md clone URL
- README.md broken issue links
- Org name consistency across all files (`sediman-agent`)

## [0.1.0] - 2026-05-15

### Added

- Initial release
- Think-act-observe-reflect agent loop
- Browser automation via Playwright + CloakBrowser stealth mode
- Self-healing skills system with LLM-based repair
- Skill learning from task execution traces
- Persistent memory with vector embeddings and SQLite FTS5
- 24/7 cron scheduling via APScheduler
- Rust TUI (sediman-tui) with GPU rendering support
- FastAPI REST/WebSocket API server
- JSON-RPC over Unix socket for IPC
- Discord and Telegram bot integrations
- Subagent parallelization with isolated browser contexts
- Context compression for long conversations
- Recording manager for screen capture and trace-to-skill conversion
- Skills Hub for community skill browsing and installation
- Coding subagent for code generation tasks
- 271 bundled skills from 11 sources
- Docker and docker-compose support
- One-line installer (`curl -fsSL https://get.sediman.ai | bash`)
