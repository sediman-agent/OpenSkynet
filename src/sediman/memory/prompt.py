"""Backward-compat shim — redirects old imports to new MemoryStore."""
from __future__ import annotations

from enum import Enum
from pathlib import Path
from typing import Any

import structlog

from sediman.memory.store import MEMORY_LIMIT
from sediman.memory.store import MemoryStore

logger = structlog.get_logger()

_store = MemoryStore()

DATA_DIR = Path.home() / ".sediman"
MEMORY_FILE = DATA_DIR / "MEMORY.md"
USER_FILE = DATA_DIR / "USER.md"
MEMORY_DB = DATA_DIR / "memory.json"
CONTEXT_FILE = DATA_DIR / "CONTEXT.md"

MAX_MEMORY_BYTES = MEMORY_LIMIT
MAX_STRUCTURED_BYTES = 50000
MAX_ENTRIES_PER_TYPE = 50


class MemoryType(str, Enum):
    EPISODIC = "episodic"
    SEMANTIC = "semantic"
    PROCEDURAL = "procedural"


def load_memory() -> str:
    mem_entries = _store.get_all_entries().get("memory", [])
    user_entries = _store.get_all_entries().get("user", [])
    parts = []
    if mem_entries:
        parts.append("\n".join(mem_entries))
    if user_entries:
        parts.append("\n".join(user_entries))
    return "\n\n".join(parts)


def save_memory(content: str) -> None:
    result = _store.add("memory", content)
    if not result.success:
        logger.warning("save_memory_failed", message=result.message)


def get_memory_size() -> int:
    return _store.get_usage("memory").chars


def save_structured_memory(
    content: str,
    memory_type: MemoryType = MemoryType.SEMANTIC,
    source: str = "agent",
    metadata: dict[str, Any] | None = None,
) -> None:
    result = _store.add("memory", content)
    if result.success:
        logger.info("structured_memory_saved", type=memory_type.value, content_length=len(content))


def save_episodic(task: str, result: str, success: bool) -> None:
    entry = f"Task '{task[:60]}': {'Success' if success else 'Failed'} — {result[:100]}"
    _store.add("memory", entry)


def save_procedural(skill_name: str, steps: list[str]) -> None:
    entry = f"Procedure '{skill_name}': {'; '.join(s[:60] for s in steps[:5])}"
    _store.add("memory", entry)


def get_relevant_context(query: str, limit: int = 5) -> list[str]:
    all_entries = _store.get_all_entries()
    entries = all_entries.get("memory", [])
    query_lower = query.lower()
    scored = []
    for entry in entries:
        content_lower = entry.lower()
        score = sum(1 for word in query_lower.split() if word in content_lower)
        if score > 0:
            scored.append((score, entry))
    scored.sort(key=lambda x: -x[0])
    return [s[1] for s in scored[:limit]]
