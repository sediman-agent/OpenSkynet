"""Enhanced Telegram adapter for the Gateway system.

Bridges TelegramIntegration with the GatewayRunner to enable
bidirectional messaging and agent execution.

Enhanced with:
- Media handling (images, videos, audio, documents)
- Typing indicators
- Message editing and deletion
- Markdown formatting
- Message deduplication
- Reply support
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

import structlog

from sediman.gateway.base import BaseAdapter, SendResult
from sediman.gateway.helpers import MessageDeduplicator

logger = structlog.get_logger()


class TelegramAdapter(BaseAdapter):
    """Enhanced Telegram adapter for Gateway system.

    Features:
    - Media file uploads (photos, videos, audio, voice, documents)
    - Typing indicators (send_chat_action)
    - Message editing and deletion
    - Markdown/HTML formatting support
    - Message deduplication
    - Reply support
    """

    def __init__(self, bot: Any):
        super().__init__("telegram")
        self._bot = bot
        self._deduplicator = MessageDeduplicator(max_size=2000, ttl_seconds=300)

    async def connect(self) -> None:
        """Mark as connected (bot is managed by listener)."""
        self._connected = True
        logger.info("telegram_adapter_connected")

    async def disconnect(self) -> None:
        """Disconnect the adapter."""
        self._connected = False
        logger.info("telegram_adapter_disconnected")

    async def send_message(self, chat_id: str, text: str, **kwargs: Any) -> str:
        """Send a message to a Telegram chat.

        Args:
            chat_id: Telegram chat ID (as string or int)
            text: Message text to send
            **kwargs: Additional options like parse_mode, reply_to

        Returns:
            Confirmation string with message ID
        """
        if not self._bot:
            raise RuntimeError("Telegram bot not available")

        try:
            # Handle message length limits (Telegram: 4096 chars)
            max_length = 4096
            parse_mode = kwargs.get("parse_mode")
            reply_to = kwargs.get("reply_to")

            if len(text) > max_length:
                # Split into chunks
                chunks = []
                for i in range(0, len(text), max_length):
                    chunks.append(text[i:i + max_length])

                message_id = None
                for i, chunk in enumerate(chunks):
                    msg = await self._bot.send_message(
                        chat_id=chat_id,
                        text=chunk,
                        parse_mode=parse_mode
                    )
                    if message_id is None:
                        message_id = msg.message_id

                logger.info("telegram_message_sent_chunks", chat_id=chat_id, chunks=len(chunks))
                return f"Sent {len(chunks)} messages to Telegram chat {chat_id}"

            # Send single message
            msg = await self._bot.send_message(
                chat_id=chat_id,
                text=text,
                parse_mode=parse_mode
            )
            logger.info("telegram_message_sent", chat_id=chat_id, message_id=msg.message_id)
            return f"Message sent to Telegram chat {chat_id} (message_id: {msg.message_id})"

        except Exception as e:
            logger.error("telegram_send_failed", chat_id=chat_id, error=str(e))
            raise

    async def send_typing(self, chat_id: str, metadata: Optional[dict] = None) -> None:
        """Send typing indicator to Telegram chat.

        Args:
            chat_id: Chat ID
            metadata: Optional metadata
        """
        if not self._bot:
            return

        try:
            await self._bot.send_chat_action(
                chat_id=chat_id,
                action="typing"
            )
        except Exception as e:
            logger.debug("telegram_typing_failed", chat_id=chat_id, error=str(e))

    async def stop_typing(self, chat_id: str) -> None:
        """Telegram uses one-shot typing indicators, no stop needed."""
        pass

    async def send_image(
        self,
        chat_id: str,
        image_url: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send an image from URL to Telegram.

        Args:
            chat_id: Chat ID
            image_url: URL of the image
            caption: Optional caption text
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._bot:
            return SendResult(success=False, error="Bot not available")

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
            import tempfile
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
            logger.error("telegram_send_image_failed", error=str(e))
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
        """Send a local image file to Telegram.

        Args:
            chat_id: Chat ID
            image_path: Path to the image file
            caption: Optional caption text
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._bot:
            return SendResult(success=False, error="Bot not available")

        try:
            # Telegram uses send_photo for images
            with open(image_path, "rb") as photo_file:
                reply_kwargs = {}
                if reply_to:
                    reply_kwargs["reply_to_message_id"] = int(reply_to)

                msg = await self._bot.send_photo(
                    chat_id=chat_id,
                    photo=photo_file,
                    caption=caption,
                    **reply_kwargs
                )

            return SendResult(success=True, message_id=str(msg.message_id))

        except Exception as e:
            logger.error("telegram_send_image_file_failed", error=str(e))
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
        """Send a video to Telegram.

        Args:
            chat_id: Chat ID
            video_path: Path to the video file
            caption: Optional caption text
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._bot:
            return SendResult(success=False, error="Bot not available")

        try:
            with open(video_path, "rb") as video_file:
                reply_kwargs = {}
                if reply_to:
                    reply_kwargs["reply_to_message_id"] = int(reply_to)

                msg = await self._bot.send_video(
                    chat_id=chat_id,
                    video=video_file,
                    caption=caption,
                    **reply_kwargs
                )

            return SendResult(success=True, message_id=str(msg.message_id))

        except Exception as e:
            logger.error("telegram_send_video_failed", error=str(e))
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
        """Send an audio file as a voice message to Telegram.

        Note: Telegram treats voice messages as audio files sent
        with the send_voice method (typically OGG/Opus format).

        Args:
            chat_id: Chat ID
            audio_path: Path to the audio file
            caption: Optional caption text
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._bot:
            return SendResult(success=False, error="Bot not available")

        try:
            with open(audio_path, "rb") as audio_file:
                reply_kwargs = {}
                if reply_to:
                    reply_kwargs["reply_to_message_id"] = int(reply_to)

                msg = await self._bot.send_voice(
                    chat_id=chat_id,
                    voice=audio_file,
                    caption=caption,
                    **reply_kwargs
                )

            return SendResult(success=True, message_id=str(msg.message_id))

        except Exception as e:
            logger.error("telegram_send_voice_failed", error=str(e))
            # Fallback - send as audio document
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
        """Send a document to Telegram.

        Args:
            chat_id: Chat ID
            file_path: Path to the document file
            caption: Optional caption text
            file_name: Optional filename
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._bot:
            return SendResult(success=False, error="Bot not available")

        try:
            with open(file_path, "rb") as doc_file:
                reply_kwargs = {}
                if reply_to:
                    reply_kwargs["reply_to_message_id"] = int(reply_to)

                send_kwargs = {
                    "chat_id": chat_id,
                    "document": doc_file,
                    "caption": caption,
                    **reply_kwargs
                }

                # Set filename if provided
                if file_name:
                    send_kwargs["filename"] = file_name

                msg = await self._bot.send_document(**send_kwargs)

            return SendResult(success=True, message_id=str(msg.message_id))

        except Exception as e:
            logger.error("telegram_send_document_failed", error=str(e))
            # Fallback
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

        Args:
            chat_id: Chat ID
            message_id: Message ID
            content: New message content

        Returns:
            SendResult indicating success/failure
        """
        if not self._bot:
            return SendResult(success=False, error="Bot not available")

        try:
            await self._bot.edit_message_text(
                chat_id=chat_id,
                message_id=int(message_id),
                text=content
            )
            return SendResult(success=True, message_id=message_id)

        except Exception as e:
            logger.error("telegram_edit_failed", error=str(e))
            return SendResult(success=False, error=str(e))

    async def delete_message(self, chat_id: str, message_id: str) -> bool:
        """Delete a previously sent message.

        Args:
            chat_id: Chat ID
            message_id: Message ID

        Returns:
            True if successful, False otherwise
        """
        if not self._bot:
            return False

        try:
            await self._bot.delete_message(
                chat_id=chat_id,
                message_id=int(message_id)
            )
            return True

        except Exception as e:
            logger.error("telegram_delete_failed", error=str(e))
            return False

    def format_message(self, content: str) -> str:
        """Format a message for Telegram.

        Telegram supports MarkdownV2 and HTML.
        For simplicity, we return content as-is and let
        the parse_mode parameter handle formatting.
        """
        return content

    def is_duplicate(self, message_id: str) -> bool:
        """Check if message was already processed.

        Args:
            message_id: Telegram message ID

        Returns:
            True if duplicate, False otherwise
        """
        return self._deduplicator.is_duplicate(message_id)

    def get_bot(self) -> Any:
        """Get the underlying telegram Bot."""
        return self._bot
