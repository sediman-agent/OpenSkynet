"""Shared helper classes for gateway platform adapters.

Provides message deduplication, text batch aggregation, markdown stripping,
phone number redaction, and thread participation tracking.

Adapted from Hermes Agent's gateway/platforms/helpers.py
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import tempfile
import time
from pathlib import Path
from typing import TYPE_CHECKING, Any, Union

import structlog

if TYPE_CHECKING:
    from sediman.gateway.events import MessageEvent

logger = structlog.get_logger()


# ─── Message Deduplication ────────────────────────────────────────────────────


class MessageDeduplicator:
    """TTL-based message deduplication cache.

    Prevents duplicate message processing by tracking message IDs within a TTL window.
    Replaces identical patterns previously duplicated across multiple platform adapters.

    Usage::

        self._dedup = MessageDeduplicator()

        # In message handler:
        if self._dedup.is_duplicate(msg_id):
            return
    """

    def __init__(self, max_size: int = 2000, ttl_seconds: float = 300):
        self._seen: dict[str, float] = {}
        self._max_size = max_size
        self._ttl = ttl_seconds

    def is_duplicate(self, msg_id: str) -> bool:
        """Return True if *msg_id* was already seen within the TTL window."""
        if not msg_id:
            return False
        now = time.time()
        if msg_id in self._seen:
            if now - self._seen[msg_id] < self._ttl:
                return True
            # Entry has expired — remove it and treat as new
            del self._seen[msg_id]
        self._seen[msg_id] = now
        if len(self._seen) > self._max_size:
            cutoff = now - self._ttl
            self._seen = {k: v for k, v in self._seen.items() if v > cutoff}
            if len(self._seen) > self._max_size:
                # TTL pruning alone does not cap the cache when every entry is
                # still fresh. Keep the newest entries so the helper's
                # max_size bound is enforced under sustained traffic.
                newest = sorted(
                    self._seen.items(),
                    key=lambda item: item[1],
                )[-self._max_size:]
                self._seen = dict(newest)
        return False

    def clear(self):
        """Clear all tracked messages."""
        self._seen.clear()


# ─── Text Batch Aggregation ──────────────────────────────────────────────────


class TextBatchAggregator:
    """Aggregates rapid-fire text events into single messages.

    Prevents spam agent invocations by batching rapid text events.
    Replaces identical patterns previously duplicated in telegram, discord, etc.

    Usage::

        self._text_batcher = TextBatchAggregator(
            handler=self._message_handler,
            batch_delay=0.6,
            split_threshold=1900,
        )

        # In message dispatch:
        if msg_type == MessageType.TEXT and self._text_batcher.is_enabled():
            self._text_batcher.enqueue(event, session_key)
            return
    """

    def __init__(
        self,
        handler,
        *,
        batch_delay: float = 0.6,
        split_delay: float = 2.0,
        split_threshold: int = 4000,
    ):
        self._handler = handler
        self._batch_delay = batch_delay
        self._split_delay = split_delay
        self._split_threshold = split_threshold
        self._pending: dict[str, MessageEvent] = {}
        self._pending_tasks: dict[str, asyncio.Task] = {}

    def is_enabled(self) -> bool:
        """Return True if batching is active (delay > 0)."""
        return self._batch_delay > 0

    def enqueue(self, event: MessageEvent, key: str) -> None:
        """Add *event* to the pending batch for *key*."""
        chunk_len = len(event.text or "")
        existing = self._pending.get(key)
        if not existing:
            event._last_chunk_len = chunk_len  # type: ignore[attr-defined]
            self._pending[key] = event
        else:
            existing.text = f"{existing.text}\n{event.text}"
            existing._last_chunk_len = chunk_len  # type: ignore[attr-defined]

        # Cancel prior flush timer, start a new one
        prior = self._pending_tasks.get(key)
        if prior and not prior.done():
            prior.cancel()
        self._pending_tasks[key] = asyncio.create_task(self._flush(key))

    async def _flush(self, key: str) -> None:
        """Wait then dispatch the batched event for *key*."""
        current_task = self._pending_tasks.get(key)
        pending = self._pending.get(key)
        last_len = getattr(pending, "_last_chunk_len", 0) if pending else 0

        # Use longer delay when the last chunk looks like a split message
        delay = self._split_delay if last_len >= self._split_threshold else self._batch_delay
        await asyncio.sleep(delay)

        event = self._pending.pop(key, None)
        if event:
            try:
                await self._handler(event)
            except Exception:
                logger.exception("text_batch_aggregator_dispatch_failed", key=key)

        if self._pending_tasks.get(key) is current_task:
            self._pending_tasks.pop(key, None)

    def cancel_all(self) -> None:
        """Cancel all pending flush tasks."""
        for task in self._pending_tasks.values():
            if not task.done():
                task.cancel()
        self._pending_tasks.clear()
        self._pending.clear()


# ─── Markdown Stripping ──────────────────────────────────────────────────────

# Pre-compiled regexes for performance
_RE_BOLD = re.compile(r"\*\*(.+?)\*\*", re.DOTALL)
_RE_ITALIC_STAR = re.compile(r"\*(.+?)\*", re.DOTALL)
_RE_BOLD_UNDER = re.compile(r"\b__(?![\s_])(.+?)(?<![\s_])__\b", re.DOTALL)
_RE_ITALIC_UNDER = re.compile(r"\b_(?![\s_])(.+?)(?<![\s_])_\b", re.DOTALL)
_RE_CODE_BLOCK = re.compile(r"```[a-zA-Z0-9_+-]*\n?")
_RE_INLINE_CODE = re.compile(r"`(.+?)`")
_RE_HEADING = re.compile(r"^#{1,6}\s+", re.MULTILINE)
_RE_LINK = re.compile(r"\[([^\]]+)\]\([^\)]+\)")
_RE_MULTI_NEWLINE = re.compile(r"\n{3,}")


def strip_markdown(text: str) -> str:
    """Strip markdown formatting for plain-text platforms.

    Removes markdown formatting for platforms that don't support it.
    Used by SMS, iMessage, and similar plain-text platforms.
    """
    text = _RE_BOLD.sub(r"\1", text)
    text = _RE_ITALIC_STAR.sub(r"\1", text)
    text = _RE_BOLD_UNDER.sub(r"\1", text)
    text = _RE_ITALIC_UNDER.sub(r"\1", text)
    text = _RE_CODE_BLOCK.sub("", text)
    text = _RE_INLINE_CODE.sub(r"\1", text)
    text = _RE_HEADING.sub("", text)
    text = _RE_LINK.sub(r"\1", text)
    text = _RE_MULTI_NEWLINE.sub("\n\n", text)
    return text.strip()


# ─── Thread Participation Tracking ───────────────────────────────────────────


class ThreadParticipationTracker:
    """Persistent tracking of threads the bot has participated in.

    Tracks which threads the bot has replied to, persisted to disk.
    Used by Slack and similar platforms with thread support.

    Usage::

        self._threads = ThreadParticipationTracker("slack")

        # Check membership:
        if thread_id in self._threads:
            ...

        # Mark participation:
        self._threads.mark(thread_id)
    """

    _MAX_TRACKED = 500

    def __init__(self, platform_name: str, max_tracked: int = 500):
        self._platform = platform_name
        self._max_tracked = max_tracked
        self._threads: dict[str, None] = {
            str(thread_id): None for thread_id in self._load()
        }

    def _state_path(self) -> Path:
        """Get the path to the thread state file."""
        from sediman.config import DATA_DIR
        return DATA_DIR / f"{self._platform}_threads.json"

    def _load(self) -> list[str]:
        """Load tracked threads from disk."""
        path = self._state_path()
        if path.exists():
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(data, list):
                    return [str(thread_id) for thread_id in data]
            except Exception:
                pass
        return []

    def _save(self) -> None:
        """Save tracked threads to disk atomically."""
        path = self._state_path()
        thread_list = list(self._threads)
        if len(thread_list) > self._max_tracked:
            thread_list = thread_list[-self._max_tracked:]
            self._threads = dict.fromkeys(thread_list)
        atomic_json_write(path, thread_list, indent=None)

    def mark(self, thread_id: str) -> None:
        """Mark *thread_id* as participated and persist."""
        if thread_id not in self._threads:
            self._threads[thread_id] = None
            self._save()

    def __contains__(self, thread_id: str) -> bool:
        return thread_id in self._threads

    def clear(self) -> None:
        self._threads.clear()


# ─── Phone Number Redaction ──────────────────────────────────────────────────


def redact_phone(phone: str) -> str:
    """Redact a phone number for logging, preserving country code and last 4.

    Used for secure logging of phone numbers in WhatsApp, Signal, etc.
    """
    if not phone:
        return "<none>"
    if len(phone) <= 8:
        return phone[:2] + "****" + phone[-2:] if len(phone) > 4 else "****"
    return phone[:4] + "****" + phone[-4:]


# ─── Atomic JSON Write ───────────────────────────────────────────────────────


def atomic_json_write(
    path: Union[str, Path],
    data: Any,
    *,
    indent: int | None = 2,
    mode: int | None = None,
    **dump_kwargs: Any,
) -> None:
    """Write JSON data to a file atomically.

    Uses temp file + fsync + os.replace to ensure the target file is never
    left in a partially-written state. If the process crashes mid-write,
    the previous version of the file remains intact.

    Args:
        path: Target file path (will be created or overwritten).
        data: JSON-serializable data to write.
        indent: JSON indentation (default 2).
        mode: Optional final permission mode (e.g., 0o600 for secrets).
        **dump_kwargs: Additional keyword args forwarded to json.dump().
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(
        dir=str(path.parent),
        prefix=f".{path.stem}_",
        suffix=".tmp",
    )
    try:
        if mode is not None and hasattr(os, "fchmod"):
            os.fchmod(fd, mode)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(
                data,
                f,
                indent=indent,
                **dump_kwargs,
            )
            f.flush()
            os.fsync(f.fileno())
    except Exception:
        try:
            os.close(fd)
        except Exception:
            pass
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        raise
    else:
        os.replace(tmp_path, str(path))


# ─── Message Truncation ─────────────────────────────────────────────────────


def truncate_message(
    content: str,
    max_length: int,
    len_fn: Callable[[str], int] | None = None,
) -> list[str]:
    """Smart message chunking with code block boundary preservation.

    Splits long messages into chunks, respecting code block boundaries.

    Args:
        content: Message content to truncate
        max_length: Maximum length per chunk
        len_fn: Optional length function (e.g., for counting unicode codepoints)

    Returns:
        List of message chunks
    """
    if len_fn is None:
        len_fn = len

    if len_fn(content) <= max_length:
        return [content]

    chunks = []
    current_chunk = []
    current_length = 0
    in_code_block = False
    code_block_language = ""

    lines = content.split("\n")
    for line in lines:
        line_len = len_fn(line) + 1  # +1 for newline

        # Check for code block fence
        if line.strip().startswith("```"):
            in_code_block = not in_code_block
            if in_code_block:
                code_block_language = line.strip()[3:].strip()
            else:
                code_block_language = ""
            current_chunk.append(line)
            current_length += line_len
            continue

        # If adding this line would exceed max_length
        if current_chunk and current_length + line_len > max_length:
            # If we're in a code block, we need to close it first
            if in_code_block:
                current_chunk.append("```")
                chunks.append("\n".join(current_chunk))
                current_chunk = [f"```{code_block_language}", line]
                current_length = len_fn(current_chunk[0]) + 1 + line_len
            else:
                chunks.append("\n".join(current_chunk))
                current_chunk = [line]
                current_length = line_len
        else:
            current_chunk.append(line)
            current_length += line_len

    # Add remaining content
    if current_chunk:
        chunks.append("\n".join(current_chunk))

    return chunks


from typing import Callable
