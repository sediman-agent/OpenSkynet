"""Discord bot client - handles incoming messages via WebSocket Gateway.

This module contains the Discord bot listener that receives messages
and forwards them to the adapter for processing.
"""

from __future__ import annotations

import asyncio
from typing import Any, Callable

import structlog

from sediman.gateway.events import MessageEvent

logger = structlog.get_logger()


class DiscordListener:
    """Discord bot client that listens for messages and forwards to adapter."""

    def __init__(self, token: str, config: dict[str, Any]):
        self._token = token
        self._config = config
        self._client = None
        self._adapter = None
        self._max_retries = 5

    def set_adapter(self, adapter: Any) -> None:
        """Set the adapter to receive message events."""
        self._adapter = adapter

    async def listen(self) -> None:
        """Start the Discord bot listener (runs indefinitely)."""
        if not self._token:
            logger.warning("discord_token_not_configured")
            return

        try:
            import discord
        except ImportError:
            logger.warning("discord.py not installed, listener unavailable")
            return

        intents = discord.Intents.default()
        intents.message_content = True

        for attempt in range(self._max_retries):
            try:
                self._client = discord.Client(intents=intents)

                @self._client.event
                async def on_ready():
                    logger.info("discord_bot_ready", user=str(self._client.user))

                @self._client.event
                async def on_message(message):
                    await self._handle_message(message)

                await self._client.start(self._token)

            except discord.ConnectionClosed as e:
                logger.warning("discord_connection_closed", code=e.code, attempt=attempt + 1)
                if self._client:
                    try:
                        await self._client.close()
                    except Exception:
                        logger.debug("silent_error", _line=210)
                    self._client = None
                if attempt + 1 < self._max_retries:
                    delay = min(2 ** attempt, 60)
                    logger.info("discord_reconnecting", delay=delay)
                    await asyncio.sleep(delay)
                    continue
                logger.error("discord_max_retries_reached")

            except Exception as e:
                logger.error("discord_listener_error", error=str(e))
                if self._client:
                    try:
                        await self._client.close()
                    except Exception:
                        logger.debug("silent_error", _line=224)
                    self._client = None
            break

    async def _handle_message(self, message: Any) -> None:
        """Process incoming Discord message."""
        # Ignore bot messages
        if message.author.bot:
            return

        # Create MessageEvent from Discord message
        event = MessageEvent.from_discord(message)

        # Forward to adapter if available
        if self._adapter:
            try:
                response = await self._adapter.on_message(event)
                if response:
                    await message.channel.send(response)
            except Exception as e:
                logger.error("discord_message_handling_failed", error=str(e))
        else:
            # Log if no adapter (fallback behavior)
            if event.is_command:
                logger.info(
                    "discord_command_received",
                    command=event.command,
                    author=str(message.author),
                    channel=message.channel.id
                )
            else:
                logger.info(
                    "discord_message_received",
                    text=event.text[:100],
                    author=str(message.author),
                    channel=message.channel.id
                )

    async def close(self) -> None:
        """Close the Discord client connection."""
        if self._client:
            try:
                await self._client.close()
            except Exception:
                logger.debug("silent_error", _line=233)
            self._client = None

    @property
    def client(self) -> Any:
        """Get the underlying discord.py client (for adapter use)."""
        return self._client
