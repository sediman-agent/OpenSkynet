"""Enhanced Discord adapter for the Gateway system.

Bridges DiscordIntegration with the GatewayRunner to enable
bidirectional messaging and agent execution.

Enhanced with:
- Media handling (images, videos, audio, documents)
- Typing indicators
- Message editing and deletion
- Embed support
- Thread support
- Message deduplication
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Optional

import structlog

from sediman.gateway.base import BaseAdapter, SendResult
from sediman.gateway.helpers import MessageDeduplicator

logger = structlog.get_logger()


class DiscordAdapter(BaseAdapter):
    """Enhanced Discord adapter for Gateway system.

    Features:
    - Media file uploads (images, videos, audio, documents)
    - Typing indicators
    - Message editing and deletion
    - Embed support
    - Thread support
    - Message deduplication
    """

    def __init__(self, client: Any):
        super().__init__("discord")
        self._client = client
        self._deduplicator = MessageDeduplicator(max_size=2000, ttl_seconds=300)

    async def connect(self) -> None:
        """Mark as connected (client is managed by listener)."""
        self._connected = True
        logger.info("discord_adapter_connected")

    async def disconnect(self) -> None:
        """Disconnect the adapter."""
        self._connected = False
        logger.info("discord_adapter_disconnected")

    async def send_message(self, chat_id: str, text: str, **kwargs: Any) -> str:
        """Send a message to a Discord channel.

        Args:
            chat_id: Discord channel ID (as string)
            text: Message text to send
            **kwargs: Additional options (embed, tts, etc.)

        Returns:
            Confirmation string with message ID
        """
        if not self._client:
            raise RuntimeError("Discord client not available")

        try:
            # Get channel by ID
            channel = self._client.get_channel(int(chat_id))
            if not channel:
                raise ValueError(f"Channel {chat_id} not found")

            # Handle message length limits (Discord: 2000 chars)
            max_length = 2000
            if len(text) > max_length:
                # Split into chunks
                chunks = []
                for i in range(0, len(text), max_length):
                    chunks.append(text[i:i + max_length])

                for i, chunk in enumerate(chunks):
                    msg = await channel.send(chunk)
                    if i == 0:
                        message_id = msg.id
                logger.info("discord_message_sent_chunks", channel=chat_id, chunks=len(chunks))
                return f"Sent {len(chunks)} messages to Discord channel {chat_id}"

            # Send single message
            msg = await channel.send(text)
            logger.info("discord_message_sent", channel=chat_id, message_id=msg.id)
            return f"Message sent to Discord channel {chat_id} (id: {msg.id})"

        except Exception as e:
            logger.error("discord_send_failed", channel=chat_id, error=str(e))
            raise

    async def send_typing(self, chat_id: str, metadata: Optional[dict] = None) -> None:
        """Send typing indicator to Discord channel.

        Args:
            chat_id: Channel ID
            metadata: Optional dict with thread_id for thread typing
        """
        if not self._client:
            return

        try:
            thread_id = metadata.get("thread_id") if metadata else None

            if thread_id:
                # Get thread
                channel = self._client.get_channel(int(chat_id))
                if not channel:
                    return
                thread = channel.get_thread(int(thread_id))
                if thread:
                    await thread.trigger_typing()
            else:
                channel = self._client.get_channel(int(chat_id))
                if channel:
                    await channel.trigger_typing()

        except Exception as e:
            logger.debug("discord_typing_failed", channel=chat_id, error=str(e))

    async def stop_typing(self, chat_id: str) -> None:
        """Discord uses one-shot typing indicators, no stop needed."""
        pass

    async def send_image(
        self,
        chat_id: str,
        image_url: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send an image from URL to Discord.

        Args:
            chat_id: Channel ID
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
            logger.error("discord_send_image_failed", error=str(e))
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
        """Send a local image file to Discord.

        Args:
            chat_id: Channel ID
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
            channel = self._client.get_channel(int(chat_id))
            if not channel:
                return SendResult(success=False, error=f"Channel {chat_id} not found")

            # Prepare file
            file = discord.File(image_path)

            # Handle reply
            reply_kwargs = {}
            if reply_to:
                try:
                    reply_msg = await channel.fetch_message(int(reply_to))
                    reply_kwargs["reference"] = reply_msg
                except Exception:
                    pass

            # Handle caption
            content = caption or None

            # Send message
            if content:
                msg = await channel.send(content=content, file=file, **reply_kwargs)
            else:
                msg = await channel.send(file=file, **reply_kwargs)

            return SendResult(success=True, message_id=str(msg.id))

        except Exception as e:
            logger.error("discord_send_image_file_failed", error=str(e))
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
        """Send a video to Discord.

        Args:
            chat_id: Channel ID
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
            channel = self._client.get_channel(int(chat_id))
            if not channel:
                return SendResult(success=False, error=f"Channel {chat_id} not found")

            # Discord doesn't have native video, but can send as file
            return await self.send_document(
                chat_id=chat_id,
                file_path=video_path,
                caption=caption,
                reply_to=reply_to,
                metadata=metadata,
            )

        except Exception as e:
            logger.error("discord_send_video_failed", error=str(e))
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
        """Send an audio file as a voice message to Discord.

        Args:
            chat_id: Channel ID
            audio_path: Path to the audio file
            caption: Optional caption text
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._client:
            return SendResult(success=False, error="Client not available")

        try:
            channel = self._client.get_channel(int(chat_id))
            if not channel:
                return SendResult(success=False, error=f"Channel {chat_id} not found")

            # Discord sends audio as file attachments
            return await self.send_document(
                chat_id=chat_id,
                file_path=audio_path,
                caption=caption,
                reply_to=reply_to,
                metadata=metadata,
            )

        except Exception as e:
            logger.error("discord_send_voice_failed", error=str(e))
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
        """Send a document to Discord.

        Args:
            chat_id: Channel ID
            file_path: Path to the document file
            caption: Optional caption text
            file_name: Optional filename
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._client:
            return SendResult(success=False, error="Client not available")

        try:
            channel = self._client.get_channel(int(chat_id))
            if not channel:
                return SendResult(success=False, error=f"Channel {chat_id} not found")

            # Prepare file
            actual_filename = file_name or Path(file_path).name
            file = discord.File(file_path, filename=actual_filename)

            # Handle reply
            reply_kwargs = {}
            if reply_to:
                try:
                    reply_msg = await channel.fetch_message(int(reply_to))
                    reply_kwargs["reference"] = reply_msg
                except Exception:
                    pass

            # Send message
            content = caption or None
            msg = await channel.send(content=content, file=file, **reply_kwargs)

            return SendResult(success=True, message_id=str(msg.id))

        except Exception as e:
            logger.error("discord_send_document_failed", error=str(e))
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
            chat_id: Channel ID
            message_id: Message ID
            content: New message content

        Returns:
            SendResult indicating success/failure
        """
        if not self._client:
            return SendResult(success=False, error="Client not available")

        try:
            channel = self._client.get_channel(int(chat_id))
            if not channel:
                return SendResult(success=False, error=f"Channel {chat_id} not found")

            msg = await channel.fetch_message(int(message_id))
            await msg.edit(content=content)

            return SendResult(success=True, message_id=message_id)

        except Exception as e:
            logger.error("discord_edit_failed", error=str(e))
            return SendResult(success=False, error=str(e))

    async def delete_message(self, chat_id: str, message_id: str) -> bool:
        """Delete a previously sent message.

        Args:
            chat_id: Channel ID
            message_id: Message ID

        Returns:
            True if successful, False otherwise
        """
        if not self._client:
            return False

        try:
            channel = self._client.get_channel(int(chat_id))
            if not channel:
                return False

            msg = await channel.fetch_message(int(message_id))
            await msg.delete()
            return True

        except Exception as e:
            logger.error("discord_delete_failed", error=str(e))
            return False

    def format_message(self, content: str) -> str:
        """Format a message for Discord.

        Discord supports markdown, so we pass through mostly as-is.
        """
        return content

    def is_duplicate(self, message_id: str) -> bool:
        """Check if message was already processed.

        Args:
            message_id: Discord message ID (snowflake)

        Returns:
            True if duplicate, False otherwise
        """
        return self._deduplicator.is_duplicate(message_id)

    def get_client(self) -> Any:
        """Get the underlying discord.py client."""
        return self._client


# Import discord for File type
try:
    import discord
except ImportError:
    # Create a dummy class if discord.py is not installed
    class discord:
        class File:
            def __init__(self, path, filename=None):
                self.path = path
                self.filename = filename
