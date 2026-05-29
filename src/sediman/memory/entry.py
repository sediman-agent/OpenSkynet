"""Memory entry metadata tracking.

Stores and retrieves metadata for memory entries including timestamps,
access counts, entry types, and target indices.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sediman.memory.prompt import MemoryType

_META_DIR = Path.home() / ".sediman" / "memory-meta"
_META_DIR.mkdir(parents=True, exist_ok=True)


@dataclass
class MemoryEntryMeta:
    id: str = ""
    content: str = ""
    target: str = "memory"
    type: str = "fact"
    source: str = "agent"
    created_at: float = field(default_factory=time.time)
    accessed_at: float = field(default_factory=time.time)
    access_count: int = 0

    @property
    def age_hours(self) -> float:
        return (time.time() - self.created_at) / 3600

    @staticmethod
    def make_id(content: str) -> str:
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "content": self.content,
            "target": self.target,
            "type": self.type,
            "source": self.source,
            "created_at": self.created_at,
            "accessed_at": self.accessed_at,
            "access_count": self.access_count,
        }

    @staticmethod
    def from_dict(d: dict[str, Any]) -> MemoryEntryMeta:
        return MemoryEntryMeta(
            id=d.get("id", ""),
            content=d.get("content", ""),
            target=d.get("target", "memory"),
            type=d.get("type", "fact"),
            source=d.get("source", "agent"),
            created_at=d.get("created_at", time.time()),
            accessed_at=d.get("accessed_at", time.time()),
            access_count=d.get("access_count", 0),
        )


def _meta_path(entry_id: str) -> Path:
    return _META_DIR / f"{entry_id}.json"


def load_entry_meta(entry_id: str) -> MemoryEntryMeta | None:
    path = _meta_path(entry_id)
    if not path.exists():
        return None
    try:
        return MemoryEntryMeta.from_dict(json.loads(path.read_text()))
    except Exception:
        return None


def save_entry_meta(meta: MemoryEntryMeta) -> None:
    path = _meta_path(meta.id)
    path.write_text(json.dumps(meta.to_dict(), indent=2))


def delete_entry_meta(entry_id: str) -> None:
    path = _meta_path(entry_id)
    if path.exists():
        path.unlink()


def classify_entry_type(content: str) -> str:
    """Classify memory content into a type string."""
    if not content or len(content) < 20:
        return "fact"
    content_lower = content.lower()
    how_words = {"how to", "steps", "procedure", "method", "workflow", "guide", "tutorial"}
    epi_words = {"i ", "my ", "we ", "our ", "felt", "experienced", "happened", "noticed"}
    if any(w in content_lower for w in how_words):
        return "procedure"
    if any(w in content_lower for w in epi_words):
        return "episodic"
    return "fact"


def ensure_meta_for_entry(
    content: str,
    target: str,
    type: str = "fact",
    source: str = "agent",
) -> MemoryEntryMeta:
    entry_id = MemoryEntryMeta.make_id(content)
    existing = load_entry_meta(entry_id)
    if existing:
        existing.accessed_at = time.time()
        existing.access_count += 1
        save_entry_meta(existing)
        return existing
    meta = MemoryEntryMeta(
        id=entry_id,
        content=content[:200],
        target=target,
        type=type,
        source=source,
    )
    save_entry_meta(meta)
    _add_to_target_index(target, entry_id)
    return meta


def get_meta_map_for_target(target: str) -> dict[str, MemoryEntryMeta]:
    idx = _load_target_index(target)
    result: dict[str, MemoryEntryMeta] = {}
    for entry_id in idx:
        meta = load_entry_meta(entry_id)
        if meta:
            result[meta.content] = meta
    return result


def get_all_meta_for_target(target: str) -> list[MemoryEntryMeta]:
    idx = _load_target_index(target)
    result: list[MemoryEntryMeta] = []
    for entry_id in idx:
        meta = load_entry_meta(entry_id)
        if meta:
            result.append(meta)
    return result


def record_access_by_content(content: str) -> None:
    entry_id = MemoryEntryMeta.make_id(content)
    meta = load_entry_meta(entry_id)
    if meta:
        meta.accessed_at = time.time()
        meta.access_count += 1
        save_entry_meta(meta)


def _index_path(target: str) -> Path:
    return _META_DIR / f"idx-{target}.json"


def _load_target_index(target: str) -> list[str]:
    path = _index_path(target)
    if not path.exists():
        return []
    try:
        return json.loads(path.read_text())
    except Exception:
        return []


def _save_target_index(target: str, ids: list[str]) -> None:
    _index_path(target).write_text(json.dumps(ids))


def _add_to_target_index(target: str, entry_id: str) -> None:
    idx = _load_target_index(target)
    if entry_id not in idx:
        idx.append(entry_id)
        _save_target_index(target, idx)


def _remove_from_target_index(target: str, entry_id: str) -> None:
    idx = _load_target_index(target)
    if entry_id in idx:
        idx.remove(entry_id)
        _save_target_index(target, idx)
