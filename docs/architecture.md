# OpenSkynet Agent Architecture

A self-improving browser automation AI agent. Teach it once — it repeats forever.

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                              OPENSKYNET AGENT ARCHITECTURE                           │
└────────────────────────────────────────────────────────────────────────────────────┘

                                ┌──────────────────────┐
                                │     USER INPUT        │
                                │  (Natural Language)   │
                                └──────────┬───────────┘
        ┌──────────────┬──────────┬────────┼────────┬──────────┬──────────────┐
        ▼              ▼          ▼        │        ▼          ▼              ▼
   ┌─────────┐   ┌─────────┐ ┌─────────┐  │  ┌─────────┐ ┌─────────┐   ┌─────────┐
   │Rust TUI │   │FastAPI   │ │Discord  │  │  │Telegram │ │WhatsApp │   │Slack/   │
   │(Ratatui)│   │HTTP/WS   │ │Bot      │  │  │Bot      │ │Bot      │   │Lark/WC  │
   └────┬─────┘   └────┬─────┘ └────┬─────┘  │  └────┬─────┘ └────┬─────┘   └────┬─────┘
        │              │          │         │       │          │              │
        │ Unix Socket   │          │         │       │          │              │
        │  JSON-RPC     ▼          └─────────┴───────┴──────────┴──────────────┘
        │         ┌──────────┐                │
        └────────▶│ Gateway  │◀───────────────┘
                  │ Runner   │  (routes messages from all platforms)
                  └────┬─────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                            CORE AGENT LOOP (agent/loop.py)                           │
│                                                                                     │
│  AgentLoop.run(task)                                                                │
│       │                                                                             │
│       ├──▶ PHASE 0: FAST-PATH OPTIMIZATION ──────────────────┐                      │
│       │    ┌──────────────────┐ ┌────────────────┐ ┌──────────────────┐             │
│       │    │ Turbo Handler    │ │ URL Handler    │ │ Schedule Handler │             │
│       │    │ (direct browser  │ │ (direct nav    │ │ (cron detection  │             │
│       │    │  no LLM needed)  │ │  no planning)  │ │  immediate job)  │             │
│       │    └──────────────────┘ └────────────────┘ └──────────────────┘             │
│       │                                                                             │
│       ├──▶ PHASE 1: PLANNING ───────────────────────────────────────┐               │
│       │    ┌──────────────────┐    ┌──────────────────────────┐     │               │
│       │    │ TaskPlanner      │───▶│ ManagerAgent              │     │               │
│       │    │ (regex parsing:  │    │ (LLM classification +     │     │               │
│       │    │  cron, URLs,     │    │  strategy selection)      │     │               │
│       │    │  multi-lang)     │    │                           │     │               │
│       │    └──────────────────┘    │ Output: ManagerPlan       │     │               │
│       │                            │  • strategy (DIRECT/      │     │               │
│       │                            │    DELEGATE/USE_SKILL/    │     │               │
│       │                            │    DECOMPOSE/CONVERSATIONAL)│    │               │
│       │                            │  • browser_task           │     │               │
│       │                            │  • subagent_type          │     │               │
│       │                            │  • skill_to_use           │     │               │
│       │                            │  • milestones             │     │               │
│       │                            │  • schedule               │     │               │
│       │                            └──────────────────────────┘     │               │
│       │                                                                             │
│       │        ┌─────────────────────────────────────────────┐                      │
│       ├──▶ PHASE 2: ITERATIVE EXECUTION LOOP ◀───────────────┤                      │
│       │    ┌──┴──────────────────────────────────────────┐   │                      │
│       │    │           STEP EXECUTION (by strategy)       │   │                      │
│       │    │                                              │   │                      │
│       │    │  ┌───────────────────────────────────────┐   │   │                      │
│       │    │  │           DirectExecutor              │   │   │                      │
│       │    │  │  ┌──────────────┐ ┌────────────────┐  │   │   │                      │
│       │    │  │  │ ToolLoop     │ │ BrowserSubagent│  │   │   │                      │
│       │    │  │  │ (LLM + fn    │ │ (Playwright +  │  │   │   │                      │
│       │    │  │  │  calling:    │ │  browser-use   │  │   │   │                      │
│       │    │  │  │  navigate,   │ │  framework)    │  │   │   │                      │
│       │    │  │  │  click,type, │ │                │  │   │   │                      │
│       │    │  │  │  snapshot)   │ │                │  │   │   │                      │
│       │    │  │  └──────────────┘ └────────────────┘  │   │   │                      │
│       │    │  └───────────────────────────────────────┘   │   │                      │
│       │    │                                              │   │                      │
│       │    │  ┌───────────────────────────────────────┐   │   │                      │
│       │    │  │         DelegateExecutor              │   │   │                      │
│       │    │  │  ┌────────────────────────────────┐   │   │   │                      │
│       │    │  │  │ SubagentFactory                 │   │   │   │                      │
│       │    │  │  │  (spawn isolated subagents)     │   │   │   │                      │
│       │    │  │  │                                 │   │   │   │                      │
│       │    │  │  │  ┌──────┐ ┌──────┐ ┌────────┐  │   │   │   │                      │
│       │    │  │  │  │browser│ │ code │ │ debug  │  │   │   │   │                      │
│       │    │  │  │  └──────┘ └──────┘ └────────┘  │   │   │   │                      │
│       │    │  │  │  ┌──────┐ ┌──────┐ ┌────────┐  │   │   │   │                      │
│       │    │  │  │  │explore│ │review│ │redteam │  │   │   │   │                      │
│       │    │  │  │  └──────┘ └──────┘ └────────┘  │   │   │   │                      │
│       │    │  │  └────────────────────────────────┘   │   │   │                      │
│       │    │  │  delegate_parallel() ← semaphore pool │   │   │                      │
│       │    │  └───────────────────────────────────────┘   │   │                      │
│       │    │                                              │   │                      │
│       │    │  ┌───────────────────────────────────────┐   │   │                      │
│       │    │  │           SkillExecutor               │   │   │                      │
│       │    │  │  Loads YAML skill → replays steps     │   │   │                      │
│       │    │  │  SkillHealer ← auto-repair on failure │   │   │                      │
│       │    │  │  Falls back to DirectExecutor         │   │   │                      │
│       │    │  └───────────────────────────────────────┘   │   │                      │
│       │    └──────────────────────────────────────────────┘   │                      │
│       │                                                        │                      │
│       │              ┌────────────────────┐                    │                      │
│       │              │    OBSERVATION     │◀───────────────────┘                      │
│       │              │  (URL, page text,  │                                          │
│       │              │   screenshot, data)│                                          │
│       │              └────────┬───────────┘                                          │
│       │                       │                                                      │
│       │              ┌────────▼───────────┐                                          │
│       │              │  PROGRESS TRACKER  │                                          │
│       │              │  • Loop detection  │                                          │
│       │              │  • Milestone check │                                          │
│       │              │  • Stall detection │                                          │
│       │              └────────┬───────────┘                                          │
│       │                       │                                                      │
│       │              ┌────────▼───────────┐                                          │
│       │              │    REFLECTION      │                                          │
│       │              │  Reflector:        │                                          │
│       │              │  • task_complete?  │                                          │
│       │              │  • confidence 0-1  │                                          │
│       │              │  • issues found    │                                          │
│       │              │  • should_retry?   │                                          │
│       │              │  • should_replan?  │                                          │
│       │              └────────┬───────────┘                                          │
│       │                       │                                                      │
│       │              ┌────────▼───────────┐                                          │
│       │              │  RECOVERY STRATEGY │                                          │
│       │              │  • Retry (max N)   │                                          │
│       │              │  • Replan          │                                          │
│       │              │  • Fallback strategy                                          │
│       │              │  • HTTP recovery   │                                          │
│       │              └────────┬───────────┘                                          │
│       │                       │                                                      │
│       │              [loop back if not complete]                                     │
│       │                                                                             │
│       ├──▶ PHASE 3: FINAL ASSEMBLY                                                  │
│       │    Compile results, handle scheduling, create cron jobs                     │
│       │                                                                             │
│       └──▶ PHASE 4: POST-TASK ORCHESTRATION ────────────────────────┐               │
│            ┌────────────────────────────────────────────────────┐   │               │
│            │  PostTaskHandler (async, non-blocking)             │   │               │
│            │                                                    │   │               │
│            │  ┌──────────┐ ┌──────────────┐ ┌───────────────┐   │   │               │
│            │  │ Memory   │ │ Skill        │ │ Skill         │   │   │               │
│            │  │ Update   │ │ LearnerAgent │ │ Auditor       │   │   │               │
│            │  │ (facts,  │ │ (evaluate:   │ │ (stale check, │   │   │               │
│            │  │  prefs)  │ │  generalize?  │ │  auto-archive)│   │   │               │
│            │  └──────────┘ │  non-trivial? │ └───────────────┘   │   │               │
│            │               │  reusable?)   │                     │   │               │
│            │               └──────────────┘                     │   │               │
│            │                                                    │   │               │
│            │  ┌──────────┐ ┌──────────────┐ ┌───────────────┐   │   │               │
│            │  │ Session  │ │ Trajectory   │ │ Subagent      │   │   │               │
│            │  │ Storage  │ │ Storage      │ │ Summaries     │   │   │               │
│            │  │ (SQLite  │ │ (action      │ │ (update       │   │   │               │
│            │  │  FTS5)   │ │  traces DB)  │ │  registry)    │   │   │               │
│            │  └──────────┘ └──────────────┘ └───────────────┘   │   │               │
│            └────────────────────────────────────────────────────┘   │               │
└─────────────────────────────────────────────────────────────────────┘               │
                                                                                      │
┌─────────────────┐  ┌─────────────────┐  ┌─────────────┐  ┌──────────────────────┐   │
│   LLM LAYER     │  │  BROWSER LAYER  │  │  SANDBOX    │  │  MEMORY SYSTEM       │   │
│                 │  │                 │  │             │  │                      │   │
│  LLMProvider    │  │ BrowserSession  │  │Go sandbox   │  │ ┌──────────────────┐ │   │
│  ├─ OpenAI      │  │ ├─ Playwright   │  │(isolated    │  │ │ FileMemory       │ │◀──┘
│  ├─ Anthropic   │  │ ├─ Openbrowser  │  │ command     │  │ │ (System 1: fast, │ │
│  ├─ DeepSeek    │  │ ├─ AgentBrowser │  │ execution)  │  │ │  bounded files)  │ │
│  ├─ Ollama      │  │ └─ CloakBrowser │  │             │  │ └──────────────────┘ │
│  ├─ Groq        │  │   (anti-detect) │  │             │  │ ┌──────────────────┐ │
│  └─ ...20+ more │  │                 │  │             │  │ │ HyMemory         │ │
│                 │  │                 │  │             │  │ │ (System 2: LLM    │ │
│  ToolRegistry   │  │                 │  │             │  │ │  fact extraction, │ │
│  ├─ fileops     │  │                 │  │             │  │ │  semantic search, │ │
│  ├─ terminal    │  │                 │  │             │  │ │  embeddings)     │ │
│  ├─ browser_*   │  │                 │  │             │  │ └──────────────────┘ │
│  ├─ web_search  │  │                 │  │             │  │                      │
│  ├─ vision      │  │                 │  │             │  │ Skills Engine        │
│  ├─ cronjob     │  │                 │  │             │  │ ├─ CRUD + versioning │
│  └─ ...18+ tools│  │                 │  │             │  │ ├─ SkillHealer      │
└─────────────────┘  └─────────────────┘  └─────────────┘  │ ├─ Skills Hub       │
                                                            │ ├─ Validator        │
┌──────────────────────────────────────────────────┐       │ └─ Semantic Search  │
│                DATA STORE (~/.terminator/)        │       └──────────────────────┘
│                                                   │
│  SOUL.md  MEMORY.md  skills/  sessions/  cron/   │       ┌──────────────────────┐
│  trajectories/  memories/  agents/  hy_memory.db │       │  SCHEDULER           │
│  integrations.json  auth.json  recordings/       │       │                      │
└──────────────────────────────────────────────────┘       │ CronScheduler        │
                                                            │ (APScheduler)        │
                                                            │ + CronManager        │
                                                            └──────────────────────┘
```

## Key Flow Summary

| Phase | Component | What Happens |
|-------|-----------|-------------|
| **0. Fast-Path** | `turbo_handler`, `url_handler`, `schedule_handler` | Skip LLM for simple tasks (direct browser action, URL nav, cron scheduling) |
| **1. Planning** | `TaskPlanner` → `ManagerAgent` | Regex parsing first, then LLM classification → picks strategy (DIRECT/DELEGATE/USE_SKILL/etc.) |
| **2. Execute** | `DirectExecutor` / `DelegateExecutor` / `SkillExecutor` | Run step via LLM+tool calling, subagent delegation, or learned skill replay |
| **3. Observe** | `Observation` | Capture browser state, page text, screenshots |
| **4. Reflect** | `Reflector` → `RecoveryStrategy` | Analyze success/failure → retry, replan, or advance |
| **5. Post-Task** | `PostTaskHandler` | Update memory, learn new skills, audit stale skills, store session/trajectory data |

## Component Descriptions

### Agent Loop (`agent/loop.py`)

The central orchestrator that runs tasks through a think-act-observe-reflect cycle. Accepts natural language input and drives the full lifecycle from planning to post-task cleanup.

### Planners

- **TaskPlanner** — Regex-based fast path. Detects cron schedules, URLs, code keywords, and multi-language scheduling patterns without LLM calls.
- **ManagerAgent** — LLM-driven classification and strategy selection. Determines whether a task is browser, code, or conversational, then picks the execution strategy (DIRECT, DELEGATE, USE_SKILL, DECOMPOSE).

### Executors

- **DirectExecutor** — Executes browser tasks using either the ToolLoop (LLM with function-calling tools) or BrowserSubagent (Playwright + browser-use framework).
- **DelegateExecutor** — Spawns isolated subagents (browser, code, debug, explore, review, integrate, redteam) via SubagentFactory. Supports parallel execution with semaphore-based concurrency.
- **SkillExecutor** — Replays previously learned workflows from YAML skills. Falls back to DirectExecutor if the skill is missing or irreparable.

### Subagents (`agent/subagents/`)

Isolated workers spawned by the DelegateExecutor, each with their own context window, toolset, and permissions. Built-in templates are defined as Markdown files with YAML frontmatter:

| Subagent | Purpose |
|----------|---------|
| `browser` | Browser automation tasks |
| `code` | Code generation |
| `debug` | Bug investigation and fixing |
| `explore` | Codebase exploration and search |
| `review` | Diff review and critique |
| `integrate` | Branch merging |
| `redteam` | Adversarial testing |

### Tools (`agent/tools/`)

Function-calling tool registry with 18+ categories registered as OpenAI-compatible tools:

| Category | Tools |
|----------|-------|
| `fileops` | read_file, write_file, patch, search_files, list_files |
| `terminal` | Shell command execution |
| `browser` | navigate, click, type, snapshot, extract, scroll |
| `web` | web_search, web_extract |
| `misc` | cronjob, memory, clarify, todo |
| `media` | vision_analyze, image_generate, text_to_speech |
| `code` | execute_code (Python sandbox) |

Composite toolsets: `debugging` (file + terminal + web), `safe` (read-only tools).

### Browser Layer

Three swappable backends accessed through a common `BrowserSession` abstraction:

- **Playwright (browser-use)** — Default. LLM-driven browser automation framework.
- **Openbrowser** — Rust-based browser via CDP protocol.
- **Agent-Browser** — TypeScript-based browser with agent tools.
- **CloakBrowser** — Anti-detection stealth patches applied to any backend.

### LLM Layer (`llm/`)

Provider-agnostic abstraction supporting 20+ providers via YAML configs. Any OpenAI-compatible API works. Supports a separate planning provider (cheaper/faster model) and streaming token callbacks.

### Memory System

Two implementations selectable via `SEDIMAN_MEMORY_SYSTEM`:

- **File (System 1)** — Fast. Bounded files (MEMORY.md, USER.md) with LLM consolidation when limits are reached.
- **Hy (System 2)** — Advanced. Fact extraction, semantic search, temporal decay, procedural memory, and embeddings.

Both track access recency for LRU eviction via `MemoryConsolidator`.

### Skills Engine (`skills/`)

Learned workflows stored as YAML. Full lifecycle:

1. **Recording** — `SkillRecorder` captures browser actions
2. **Learning** — `SkillLearnerAgent` evaluates if actions generalize (3-question test)
3. **Execution** — Replay steps with CSS selectors
4. **Healing** — `SkillHealer` auto-repairs when page structure changes
5. **Auditing** — `SkillAuditor` archives stale skills (>30 days unused)
6. **Sharing** — `Skills Hub` at github.com/sediman/skills-hub

### Gateway (`gateway/`)

Multi-platform message router. The `GatewayRunner` receives messages from all chat integrations (Discord, Telegram, Slack, WhatsApp, Lark, WeChat) and routes them through the agent loop, returning responses to the originating platform.

### Sandbox (`sandbox/`)

Go binary (`sediman-sandbox`) providing isolated command execution with platform-specific engines (Linux user namespaces, macOS file isolation) and checkpoint/rollback support.

### Scheduler (`scheduler/`)

APScheduler-based cron system. Jobs stored as JSON in `~/.terminator/cron/`, results logged to `results.jsonl`. Regex parsing detects natural-language schedules like "every 5 minutes" or "daily at 9" across multiple languages.

### Data Store

All persistent state lives in `~/.terminator/` (or `$SEDIMAN_DATA_DIR`):

| Path | Contents |
|------|----------|
| `SOUL.md` | Agent personality definition |
| `MEMORY.md` | Persistent context and memories |
| `skills/` | Learned skill YAML files |
| `sessions/` | SQLite FTS5 session database |
| `cron/` | Scheduled job JSONs + results |
| `trajectories/` | Action trajectory database |
| `memories/` | File-based memory storage |
| `agents/` | User-defined subagent templates |
| `hy_memory.db` | Hy memory SQLite database |
| `recordings/` | Screen recordings |
| `integrations.json` | Integration configurations |
| `auth.json` | Authentication data |
