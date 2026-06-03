"""Discord adapter for the Gateway system.

Bridges DiscordIntegration with the GatewayRunner to enable
bidirectional messaging and agent execution.
"""

from __future__ import annotations

from typing import Any

import structlog

from sediman.gateway.base import BaseAdapter
from sediman.gateway.events import MessageEvent

logger = structlog.get_logger()


class DiscordAdapter(BaseAdapter):
    """Discord adapter that bridges Discord bot to Gateway system."""

    def __init__(self, client: Any):
        super().__init__("discord")
        self._client = client

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
            **kwargs: Additional options (not yet implemented)

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

    def get_client(self) -> Any:
        """Get the underlying discord.py client."""
        return self._client
