"""Telegram adapter for the Gateway system.

Bridges TelegramIntegration with the GatewayRunner to enable
bidirectional messaging and agent execution.
"""

from __future__ import annotations

from typing import Any

import structlog

from sediman.gateway.base import BaseAdapter
from sediman.gateway.events import MessageEvent

logger = structlog.get_logger()


class TelegramAdapter(BaseAdapter):
    """Telegram adapter that bridges Telegram bot to Gateway system."""

    def __init__(self, bot: Any):
        super().__init__("telegram")
        self._bot = bot

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
            chat_id: Telegram chat ID (as string)
            text: Message text to send
            **kwargs: Additional options like parse_mode

        Returns:
            Confirmation string with message ID
        """
        if not self._bot:
            raise RuntimeError("Telegram bot not available")

        try:
            # Handle message length limits (Telegram: 4096 chars)
            max_length = 4096
            parse_mode = kwargs.get("parse_mode")

            if len(text) > max_length:
                # Split into chunks
                chunks = []
                for i in range(0, len(text), max_length):
                    chunks.append(text[i:i + max_length])

                message_id = None
                for chunk in chunks:
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

    def get_bot(self) -> Any:
        """Get the underlying telegram Bot."""
        return self._bot
