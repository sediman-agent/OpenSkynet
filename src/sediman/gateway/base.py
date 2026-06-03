from __future__ import annotations

import asyncio
import os
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Awaitable, Optional, List, Tuple

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


class MessageType(Enum):
    """Types of incoming messages."""
    TEXT = "text"
    LOCATION = "location"
    PHOTO = "photo"
    VIDEO = "video"
    AUDIO = "audio"
    VOICE = "voice"
    DOCUMENT = "document"
    STICKER = "sticker"
    COMMAND = "command"


class ProcessingOutcome(Enum):
    """Result classification for message-processing lifecycle hooks."""
    SUCCESS = "success"
    FAILURE = "failure"
    CANCELLED = "cancelled"


@dataclass
class CachedMedia:
    """Result of caching one attachment's bytes.

    Attributes:
        path: Absolute cache path, agent-visible
        media_type: MIME type recorded on the MessageEvent
        kind: Media kind - "image" | "video" | "audio" | "document"
        display_name: Human-readable name for transcript notes
    """

    path: str
    media_type: str
    kind: str
    display_name: str

    def context_note(self) -> str:
        """One-line transcript annotation pointing the agent at the file.

        Returns:
            Annotation string
        """
        return f"[{self.kind} '{self.display_name}' saved at: {self.path}]"


class EphemeralReply(str):
    """System-notice reply that auto-deletes after a TTL.

    Slash-command handlers can return this wrapper instead of a plain string
    to request that the reply message be deleted after ttl_seconds.

    Subclassing str keeps the wrapper transparent to anything that treats
    handler return values as text. isinstance(r, EphemeralReply) still
    distinguishes ephemeral replies.

    Attributes:
        ttl_seconds: Optional TTL in seconds (None = use configured default)
    """

    ttl_seconds: Optional[int] = None

    def __new__(cls, text: str, ttl_seconds: Optional[int] = None):
        instance = super().__new__(cls, text)
        instance.ttl_seconds = ttl_seconds
        return instance

    @property
    def text(self) -> str:
        """Return the underlying text."""
        return str.__str__(self)


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

    # ─── Optional Enhanced Methods ───────────────────────────────────────

    async def send_animation(
        self,
        chat_id: str,
        animation_url: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send an animated GIF natively via the platform API.

        Override in subclasses to send GIFs as proper animations
        (e.g., Telegram send_animation) so they auto-play inline.
        Default falls back to send_image.

        Args:
            chat_id: Chat ID
            animation_url: URL of the animated GIF
            caption: Optional caption text
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        return await self.send_image(
            chat_id=chat_id,
            image_url=animation_url,
            caption=caption,
            reply_to=reply_to,
            metadata=metadata,
        )

    async def send_multiple_images(
        self,
        chat_id: str,
        images: List[Tuple[str, str]],
        metadata: Optional[dict] = None,
        human_delay: float = 0.0,
    ) -> None:
        """Send a batch of images.

        Args:
            chat_id: Chat ID
            images: List of (url, alt_text) tuples
            metadata: Optional metadata
            human_delay: Delay between sends for natural feel
        """
        from urllib.parse import unquote

        for image_url, alt_text in images:
            if human_delay > 0:
                await asyncio.sleep(human_delay)
            try:
                logger.info(
                    "sending_image",
                    platform=self.platform_name,
                    url=image_url[:80],
                    alt=alt_text[:30] if alt_text else "",
                )

                if image_url.startswith("file://"):
                    await self.send_image_file(
                        chat_id=chat_id,
                        image_path=unquote(image_url[7:]),
                        caption=alt_text if alt_text else None,
                        metadata=metadata,
                    )
                elif self._is_animation_url(image_url):
                    await self.send_animation(
                        chat_id=chat_id,
                        animation_url=image_url,
                        caption=alt_text if alt_text else None,
                        metadata=metadata,
                    )
                else:
                    await self.send_image(
                        chat_id=chat_id,
                        image_url=image_url,
                        caption=alt_text if alt_text else None,
                        metadata=metadata,
                    )
            except Exception as e:
                logger.error("send_image_failed", error=str(e))

    @staticmethod
    def _is_animation_url(url: str) -> bool:
        """Check if a URL points to an animated GIF.

        Args:
            url: URL to check

        Returns:
            True if URL appears to be an animated GIF
        """
        lower = url.lower().split("?")[0]  # Strip query params
        return lower.endswith(".gif")

    async def create_handoff_thread(
        self,
        parent_chat_id: str,
        name: str,
    ) -> Optional[str]:
        """Create a fresh thread under parent_chat_id for a session handoff.

        Used by the gateway's handoff watcher when transferring a CLI
        session to a thread-capable platform.

        Args:
            parent_chat_id: Parent channel/chat ID
            name: Thread name

        Returns:
            New thread/topic ID, or None if platform doesn't support threading
        """
        return None  # Default: not supported

    async def play_tts(
        self,
        chat_id: str,
        audio_path: str,
        **kwargs: Any,
    ) -> SendResult:
        """Play auto-TTS audio for voice replies.

        Override in subclasses for invisible playback (e.g. Web UI).
        Default falls back to send_voice.

        Args:
            chat_id: Chat ID
            audio_path: Path to audio file
            **kwargs: Additional arguments

        Returns:
            SendResult
        """
        return await self.send_voice(chat_id=chat_id, audio_path=audio_path)

    def prepare_tts_text(self, text: str) -> str:
        """Prepare text for TTS.

        Override to filter tool output, code, etc.
        Default strips markdown and truncates to 4000 chars.

        Args:
            text: Text to prepare

        Returns:
            Prepared text
        """
        return re.sub(r"[*_`#\[\]()]", "", text)[:4000].strip()

    # Flag for platforms that require explicit edit finalization
    REQUIRES_EDIT_FINALIZE: bool = False

    def supports_draft_streaming(
        self,
        chat_type: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> bool:
        """Whether this adapter supports native streaming-draft updates.

        Args:
            chat_type: Optional chat type for platform-specific checks
            metadata: Optional metadata

        Returns:
            True if platform supports draft streaming, False otherwise
        """
        return False  # Default: not supported

    async def send_draft(
        self,
        chat_id: str,
        draft_id: int,
        content: str,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send or update an animated streaming-draft preview.

        Override in platforms that support draft streaming (e.g. Telegram).

        Args:
            chat_id: Chat ID
            draft_id: Unique draft ID for this response
            content: Draft content
            metadata: Optional metadata

        Returns:
            SendResult
        """
        raise NotImplementedError(f"{type(self).__name__} does not implement send_draft")
