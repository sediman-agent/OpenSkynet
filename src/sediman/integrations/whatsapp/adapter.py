"""Enhanced WhatsApp adapter with production-ready features.

Enhanced with:
- Media handling (images, videos, audio, documents)
- Typing indicators
- WhatsApp-specific markdown formatting
- Message deduplication
- Retry logic for API calls
"""
from __future__ import annotations

import os
import re
import tempfile
from pathlib import Path
from typing import Any, Optional

import structlog

from sediman.gateway.base import BaseAdapter, SendResult
from sediman.gateway.helpers import MessageDeduplicator

logger = structlog.get_logger()

# WhatsApp markdown formatting
# WhatsApp supports: *bold*, _italic_, ~strikethrough~, ```monospace``


def format_whatsapp_markdown(text: str) -> str:
    """Convert standard markdown to WhatsApp format.

    WhatsApp uses:
    - *bold* for bold
    - _italic_ for italic
    - ~strikethrough~ for strikethrough
    - ```monospace``` for monospace
    """
    if not text:
        return text

    # Convert **bold** to *bold*
    text = re.sub(r"\*\*(.+?)\*\*", r"*\1*", text)

    # Convert __bold__ to *bold* (alternative markdown)
    text = re.sub(r"__(.+?)__", r"*\1*", text)

    # Convert *italic* (when not part of ** already converted) to _italic_
    # Need to be careful not to convert the * from bold
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"_\1_", text)

    # Convert ~~strikethrough~~ to ~strikethrough~
    text = re.sub(r"~~(.+?)~~", r"~\1~", text)

    # Convert ```code``` (standard markdown) to ```code``` (same for WhatsApp)

    return text


class WhatsAppAdapter(BaseAdapter):
    """Enhanced WhatsApp adapter for Gateway system.

    Features:
    - Media file uploads (images, videos, audio, documents)
    - Typing indicators
    - WhatsApp-specific markdown formatting
    - Message deduplication
    - Retry logic for API calls
    """

    def __init__(self) -> None:
        super().__init__("whatsapp")
        self._client: Any = None
        self._deduplicator = MessageDeduplicator(max_size=2000, ttl_seconds=300)

    async def connect(self) -> None:
        """Connect the adapter."""
        self._connected = True

    async def disconnect(self) -> None:
        """Disconnect the adapter."""
        self._connected = False

    async def send_message(
        self,
        chat_id: str,
        text: str,
        **kwargs: Any,
    ) -> str:
        """Send a message to a WhatsApp user.

        Args:
            chat_id: WhatsApp phone number
            text: Message text (may contain markdown)
            **kwargs: Additional arguments

        Returns:
            Success message

        Raises:
            RuntimeError: If client is not available
        """
        if not self._client:
            raise RuntimeError("WhatsApp client not available")

        # Format markdown for WhatsApp
        formatted_text = format_whatsapp_markdown(text)

        # Handle message length - WhatsApp limit is 4096 chars
        max_length = 4096
        if len(formatted_text) > max_length:
            chunks = [
                formatted_text[i : i + max_length]
                for i in range(0, len(formatted_text), max_length)
            ]
            for chunk in chunks:
                await self._send_with_retry(chat_id, chunk)
            return f"Sent {len(chunks)} messages"

        await self._send_with_retry(chat_id, formatted_text)
        return "Message sent"

    async def _send_with_retry(
        self,
        to: str,
        text: str,
        max_retries: int = 3,
    ) -> Any:
        """Send message with retry logic.

        Args:
            to: Phone number
            text: Message text
            max_retries: Maximum retry attempts

        Returns:
            API response

        Raises:
            RuntimeError: If all retries fail
        """
        base_delay = 1.0

        for attempt in range(max_retries):
            try:
                response = await self._client.send_message(to=to, text=text)
                return response
            except Exception as e:
                error_str = str(e).lower()
                # Check for rate limit or transient errors
                if any(
                    x in error_str
                    for x in ["rate", "limit", "timeout", "429", "503", "502"]
                ):
                    retry_after = base_delay * (2**attempt)
                    logger.warning(
                        "whatsapp_retry",
                        retry_after=retry_after,
                        attempt=attempt + 1,
                        error=str(e),
                    )
                    import asyncio

                    await asyncio.sleep(retry_after)
                    continue
                # Other errors - raise immediately
                raise

        raise RuntimeError(f"WhatsApp API failed after {max_retries} retries")

    async def send_typing(self, chat_id: str, metadata: Optional[dict] = None) -> None:
        """Send typing indicator to WhatsApp.

        WhatsApp uses the /messages endpoint with typing status.

        Args:
            chat_id: Phone number
            metadata: Optional metadata (not used for WhatsApp)
        """
        if not self._client:
            return

        try:
            # pywa supports typing indicators
            # This sends a typing indicator that lasts for a few seconds
            await self._client.send_action(to=chat_id, action="typing_on")
        except Exception as e:
            logger.debug("whatsapp_typing_failed", error=str(e))

    async def stop_typing(self, chat_id: str) -> None:
        """Stop typing indicator."""
        if not self._client:
            return

        try:
            await self._client.send_action(to=chat_id, action="typing_off")
        except Exception as e:
            logger.debug("whatsapp_stop_typing_failed", error=str(e))

    async def send_image(
        self,
        chat_id: str,
        image_url: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send an image from URL to WhatsApp.

        Args:
            chat_id: Phone number
            image_url: URL of the image
            caption: Optional caption text
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._client:
            return SendResult(success=False, error="Client not available")

        try:
            import httpx

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(image_url)
                response.raise_for_status()
                image_data = response.content

            # Determine file extension
            ext = ".png"
            if image_url.lower().endswith((".jpg", ".jpeg")):
                ext = ".jpg"
            elif image_url.lower().endswith(".gif"):
                ext = ".gif"
            elif image_url.lower().endswith(".webp"):
                ext = ".webp"

            # Save to temp file
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
                f.write(image_data)
                temp_path = f.name

            try:
                return await self.send_image_file(
                    chat_id=chat_id,
                    image_path=temp_path,
                    caption=caption,
                    reply_to=reply_to,
                    metadata=metadata,
                )
            finally:
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass

        except Exception as e:
            logger.error("whatsapp_send_image_failed", error=str(e))
            # Fallback to sending URL as text
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
        """Send a local image file to WhatsApp.

        Args:
            chat_id: Phone number
            image_path: Path to the image file
            caption: Optional caption text
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._client:
            return SendResult(success=False, error="Client not available")

        try:
            response = await self._client.send_image(
                to=chat_id,
                file=image_path,
                caption=caption or "",
            )
            return SendResult(success=True, message_id=str(response))
        except Exception as e:
            logger.error("whatsapp_send_image_file_failed", error=str(e))
            # Fallback
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
        """Send a video to WhatsApp.

        Args:
            chat_id: Phone number
            video_path: Path to the video file
            caption: Optional caption text
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._client:
            return SendResult(success=False, error="Client not available")

        try:
            response = await self._client.send_video(
                to=chat_id,
                file=video_path,
                caption=caption or "",
            )
            return SendResult(success=True, message_id=str(response))
        except Exception as e:
            logger.error("whatsapp_send_video_failed", error=str(e))
            # Fallback
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
        """Send an audio file as a voice message to WhatsApp.

        Args:
            chat_id: Phone number
            audio_path: Path to the audio file
            caption: Optional caption text (WhatsApp doesn't show caption for voice)
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._client:
            return SendResult(success=False, error="Client not available")

        try:
            response = await self._client.send_audio(
                to=chat_id,
                file=audio_path,
            )
            return SendResult(success=True, message_id=str(response))
        except Exception as e:
            logger.error("whatsapp_send_voice_failed", error=str(e))
            # Fallback
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
        """Send a document to WhatsApp.

        Args:
            chat_id: Phone number
            file_path: Path to the document file
            caption: Optional caption text
            file_name: Optional filename (defaults to actual filename)
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._client:
            return SendResult(success=False, error="Client not available")

        try:
            filename = file_name or Path(file_path).name
            response = await self._client.send_document(
                to=chat_id,
                file=file_path,
                filename=filename,
                caption=caption or "",
            )
            return SendResult(success=True, message_id=str(response))
        except Exception as e:
            logger.error("whatsapp_send_document_failed", error=str(e))
            # Fallback
            text = f"📎 File: {file_path}"
            if caption:
                text = f"{caption}\n{text}"
            result = await self.send_message(chat_id, text)
            return SendResult(success=True, message_id=result)

    def format_message(self, content: str) -> str:
        """Format message content for WhatsApp.

        Converts standard markdown to WhatsApp format.
        """
        return format_whatsapp_markdown(content)

    def set_client(self, client: Any) -> None:
        """Set the WhatsApp client.

        Args:
            client: pywa WhatsApp client instance
        """
        self._client = client

    def is_duplicate(self, message_id: str) -> bool:
        """Check if message was already processed.

        Args:
            message_id: WhatsApp message ID

        Returns:
            True if duplicate, False otherwise
        """
        return self._deduplicator.is_duplicate(message_id)
