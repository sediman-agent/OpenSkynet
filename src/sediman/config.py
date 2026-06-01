from __future__ import annotations

import os
import re
from pathlib import Path


def _get_data_dir() -> Path:
    env = os.environ.get("SEDIMAN_DATA_DIR")
    if env:
        return Path(env)
    return Path.home() / ".terminator"


DATA_DIR = _get_data_dir()

SKILLS_DIR = DATA_DIR / "skills"
MEMORY_DIR = DATA_DIR / "memories"
SESSIONS_DIR = DATA_DIR / "sessions"
CRON_DIR = DATA_DIR / "cron"
RECORDINGS_DIR = DATA_DIR / "recordings"
AGENTS_DIR = DATA_DIR / "agents"
BROWSER_PROFILE_DIR = DATA_DIR / "browser-profile-cron"

SOUL_FILE = DATA_DIR / "SOUL.md"
CONTEXT_FILE = DATA_DIR / "CONTEXT.md"
AGENT_STATE_FILE = DATA_DIR / "agent_state.json"
HISTORY_FILE = DATA_DIR / "history"
SCREENSHOT_FILE = DATA_DIR / "last_screenshot.png"
TRAJECTORIES_DIR = DATA_DIR / "trajectories"

OLD_MEMORY_FILE = DATA_DIR / "MEMORY.md"
OLD_USER_FILE = DATA_DIR / "USER.md"
OLD_MEMORY_DB = DATA_DIR / "memory.json"

MEMORY_LIMIT = int(os.environ.get("SEDIMAN_MEMORY_LIMIT", "2200"))
USER_LIMIT = int(os.environ.get("SEDIMAN_USER_LIMIT", "1375"))
MAX_STRUCTURED_BYTES = int(os.environ.get("SEDIMAN_MAX_STRUCTURED_BYTES", "50000"))
MAX_ENTRIES_PER_TYPE = int(os.environ.get("SEDIMAN_MAX_ENTRIES_PER_TYPE", "50"))

MAX_TASK_LENGTH = 10000
MAX_NAME_LENGTH = 64
MAX_CRON_FIELDS = 5
SAFE_NAME_RE = re.compile(r"^[a-z][a-z0-9]*(-[a-z0-9]+)*$")
CRON_FIELD_RE = re.compile(r"^\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)")
FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
MAX_RESULT_CHARS = int(os.environ.get("SEDIMAN_MAX_RESULT_CHARS", "2000"))
MAX_RESULTS_PER_JOB = int(os.environ.get("SEDIMAN_MAX_RESULTS_PER_JOB", "100"))
MAX_RECORDING_SECONDS = int(os.environ.get("SEDIMAN_MAX_RECORDING_SECONDS", "300"))

COMPRESS_THRESHOLD = int(os.environ.get("SEDIMAN_COMPRESS_THRESHOLD", "20"))
SKILL_STALE_DAYS = int(os.environ.get("SEDIMAN_SKILL_STALE_DAYS", "30"))
MAX_NESTED_DEPTH = int(os.environ.get("SEDIMAN_MAX_NESTED_DEPTH", "2"))

DEFAULT_HTTP_TIMEOUT = float(os.environ.get("SEDIMAN_HTTP_TIMEOUT", "15.0"))
DEFAULT_WEB_MAX_CHARS = int(os.environ.get("SEDIMAN_WEB_MAX_CHARS", "5000"))

CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "SEDIMAN_CORS_ORIGINS",
        "http://localhost:3000,http://localhost:5173",
    ).split(",")
    if o.strip()
]

OPENBROWSER_HOST = os.environ.get("SEDIMAN_OPENBROWSER_HOST", "127.0.0.1")
OPENBROWSER_PORT = int(os.environ.get("SEDIMAN_OPENBROWSER_PORT", "7788"))
OPENBROWSER_JS = os.environ.get("SEDIMAN_OPENBROWSER_JS", "true").lower() in (
    "true",
    "1",
    "yes",
)

STEALTH_ENABLED = os.environ.get("SEDIMAN_STEALTH", "true").lower() in (
    "true",
    "1",
    "yes",
)
STEALTH_PROXY = os.environ.get("SEDIMAN_STEALTH_PROXY", "")
STEALTH_FINGERPRINT_SEED = os.environ.get("SEDIMAN_STEALTH_FINGERPRINT_SEED", "")
STEALTH_BINARY_PATH = os.environ.get("SEDIMAN_STEALTH_BINARY_PATH", "")

INTEGRATIONS_CONFIG_PATH = DATA_DIR / "integrations.json"
DISCORD_BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")

AGENTBROWSER_BINARY = os.environ.get("SEDIMAN_AGENTBROWSER_BINARY", "")

AUTH_FILE = DATA_DIR / "auth.json"
