from __future__ import annotations

import asyncio
import os
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Awaitable, Optional

import structlog

from sediman.gateway.events import MessageEvent
from sediman.gateway.helpers import truncate_message

logger = structlog.get_logger()

MessageHandler = Callable[[MessageEvent], Awaitable[str | None]]


@dataclass
class SendResult:
    """Result of sending a message."""
    success: bool
    message_id: Optional[str] = None
    error: Optional[str] = None
    raw_response: Any = None
    retryable: bool = False
    continuation_message_ids: tuple = ()


class BaseAdapter(ABC):
    def __init__(self, platform_name: str):
        self.platform_name = platform_name
        self._message_handler: MessageHandler | None = None
        self._active_sessions: dict[str, bool] = {}
        self._pending_messages: dict[str, list[MessageEvent]] = {}
        self._interrupt_events: dict[str, asyncio.Event] = {}
        self._connected = False
        self._circuit_open = False
        self._failure_count = 0
        self._max_failures = 5

    @property
    def is_connected(self) -> bool:
        return self._connected

    @property
    def is_circuit_open(self) -> bool:
        return self._circuit_open

    def set_message_handler(self, handler: MessageHandler) -> None:
        self._message_handler = handler

    @abstractmethod
    async def connect(self) -> None:
        ...

    @abstractmethod
    async def disconnect(self) -> None:
        ...

    @abstractmethod
    async def send_message(self, chat_id: str, text: str, **kwargs: Any) -> str:
        ...

    async def on_message(self, event: MessageEvent) -> str | None:
        if self._circuit_open:
            logger.warning("adapter_circuit_open", platform=self.platform_name)
            return None

        if event.session_key in self._active_sessions:
            if event.is_command and event.command in ("/stop", "/new", "/approve", "/deny"):
                return await self._dispatch_message(event)
            if event.session_key not in self._pending_messages:
                self._pending_messages[event.session_key] = []
            self._pending_messages[event.session_key].append(event)
            interrupt_evt = self._interrupt_events.get(event.session_key)
            if interrupt_evt:
                interrupt_evt.set()
            return None

        return await self._dispatch_message(event)

    async def _dispatch_message(self, event: MessageEvent) -> str | None:
        if not self._message_handler:
            return None
        try:
            result = await self._message_handler(event)
            self._failure_count = 0
            return result
        except Exception as e:
            self._failure_count += 1
            logger.warning("adapter_dispatch_failed", platform=self.platform_name, error=str(e))
            if self._failure_count >= self._max_failures:
                self._circuit_open = True
                logger.error("adapter_circuit_tripped", platform=self.platform_name)
            return None

    def mark_session_active(self, session_key: str) -> None:
        self._active_sessions[session_key] = True

    def mark_session_inactive(self, session_key: str) -> None:
        self._active_sessions.pop(session_key, None)

    def get_pending_messages(self, session_key: str) -> list[MessageEvent]:
        return self._pending_messages.pop(session_key, [])

    def get_interrupt_event(self, session_key: str) -> asyncio.Event:
        if session_key not in self._interrupt_events:
            self._interrupt_events[session_key] = asyncio.Event()
        return self._interrupt_events[session_key]

    def reset_circuit(self) -> None:
        self._circuit_open = False
        self._failure_count = 0

    # ─── Media Methods (Optional overrides) ───────────────────────────────

    async def send_typing(self, chat_id: str, metadata: Optional[dict] = None) -> None:
        """Send a typing indicator.

        Override in subclasses if the platform supports it.
        metadata: optional dict with platform-specific context (e.g. thread_id for Slack).
        """
        pass

    async def stop_typing(self, chat_id: str) -> None:
        """Stop a persistent typing indicator (if the platform uses one).

        Override in subclasses that start background typing loops.
        Default is a no-op for platforms with one-shot typing indicators.
        """
        pass

    async def send_image(
        self,
        chat_id: str,
        image_url: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send an image natively via the platform API.

        Override in subclasses to send images as proper attachments
        instead of plain-text URLs. Default falls back to sending the
        URL as a text message.
        """
        text = f"{caption}\n{image_url}" if caption else image_url
        result = await self.send_message(chat_id, text)
        return SendResult(success=True, message_id=result)

    async def send_image_file(
        self,
        chat_id: str,
        image_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send a local image file natively via the platform API.

        Unlike send_image() which takes a URL, this takes a local file path.
        Override in subclasses for native photo attachments.
        Default falls back to sending the file path as text.
        """
        text = f"🖼️ Image: {image_path}"
        if caption:
            text = f"{caption}\n{text}"
        result = await self.send_message(chat_id, text)
        return SendResult(success=True, message_id=result)

    async def send_video(
        self,
        chat_id: str,
        video_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send a video natively via the platform API.

        Override in subclasses to send videos as inline playable media.
        Default falls back to sending the file path as text.
        """
        text = f"🎬 Video: {video_path}"
        if caption:
            text = f"{caption}\n{text}"
        result = await self.send_message(chat_id, text)
        return SendResult(success=True, message_id=result)

    async def send_voice(
        self,
        chat_id: str,
        audio_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send an audio file as a native voice message via the platform API.

        Override in subclasses to send audio as voice bubbles (Telegram)
        or file attachments (Discord). Default falls back to sending the
        file path as text.
        """
        text = f"🔊 Audio: {audio_path}"
        if caption:
            text = f"{caption}\n{text}"
        result = await self.send_message(chat_id, text)
        return SendResult(success=True, message_id=result)

    async def send_document(
        self,
        chat_id: str,
        file_path: str,
        caption: Optional[str] = None,
        file_name: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send a document/file natively via the platform API.

        Override in subclasses to send files as downloadable attachments.
        Default falls back to sending the file path as text.
        """
        text = f"📎 File: {file_path}"
        if caption:
            text = f"{caption}\n{text}"
        result = await self.send_message(chat_id, text)
        return SendResult(success=True, message_id=result)

    async def edit_message(
        self,
        chat_id: str,
        message_id: str,
        content: str,
    ) -> SendResult:
        """Edit a previously sent message.

        Optional — platforms that don't support editing return success=False.
        Override in subclasses for platforms with edit support (Slack, Discord, etc.).
        """
        return SendResult(success=False, error="Not supported")

    async def delete_message(
        self,
        chat_id: str,
        message_id: str,
    ) -> bool:
        """Delete a previously sent message.

        Optional — platforms that don't support deletion return False.
        Override in subclasses for platforms with delete support.
        """
        return False

    def format_message(self, content: str) -> str:
        """Format a message for this platform.

        Override in subclasses to handle platform-specific formatting
        (e.g., Telegram MarkdownV2, Discord markdown).

        Default implementation returns content as-is.
        """
        return content

    @staticmethod
    def truncate_message(
        content: str,
        max_length: int = 4096,
        len_fn: Optional[Callable[[str], int]] = None,
    ) -> list[str]:
        """Split a long message into chunks, preserving code block boundaries.

        Uses the shared truncate_message helper from gateway.helpers.
        """
        return truncate_message(content, max_length, len_fn)
