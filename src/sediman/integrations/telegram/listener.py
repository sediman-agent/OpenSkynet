"""Telegram bot client - handles incoming messages via long polling.

This module contains the Telegram bot listener that receives messages
and forwards them to the adapter for processing.
"""

from __future__ import annotations

import asyncio
from typing import Any

import structlog

from sediman.gateway.events import MessageEvent

logger = structlog.get_logger()


class TelegramListener:
    """Telegram bot client that listens for messages and forwards to adapter."""

    def __init__(self, token: str, config: dict[str, Any]):
        self._token = token
        self._config = config
        self._application = None
        self._bot = None
        self._adapter = None

    def set_adapter(self, adapter: Any) -> None:
        """Set the adapter to receive message events."""
        self._adapter = adapter

    async def listen(self) -> None:
        """Start the Telegram bot listener (runs indefinitely)."""
        if not self._token:
            logger.warning("telegram_token_not_configured")
            return

        try:
            from telegram import Bot, Update
            from telegram.ext import Application, MessageHandler, filters
        except ImportError:
            logger.warning("python-telegram-bot not installed, listener unavailable")
            return

        try:
            # Build application
            self._application = Application.builder().token(self._token).build()
            self._bot = self._application.bot

            # Add message handler
            async def handle_message(update: Update, context):
                await self._handle_message(update, context)

            self._application.add_handler(
                MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message)
            )

            logger.info("telegram_bot_starting")

            # Start the application
            await self._application.initialize()
            await self._application.start()
            await self._application.updater.start_polling()

            logger.info("telegram_bot_started")

            # Keep running indefinitely
            while True:
                await asyncio.sleep(1)

        except asyncio.CancelledError:
            logger.info("telegram_listener_cancelled")
            raise
        except Exception as e:
            logger.error("telegram_listener_error", error=str(e))

    async def _handle_message(self, update: Any, context: Any) -> None:
        """Process incoming Telegram message."""
        message = update.message
        if not message or not message.text:
            return

        # Ignore bot messages
        user = message.from_user
        if user and user.is_bot:
            return

        # Create MessageEvent from Telegram update
        event = MessageEvent.from_telegram(update)

        # Forward to adapter if available
        if self._adapter:
            try:
                response = await self._adapter.on_message(event)
                if response and message.chat_id:
                    # Send response back to the chat
                    await self._bot.send_message(
                        chat_id=message.chat_id,
                        text=response,
                        parse_mode="HTML"
                    )
            except Exception as e:
                logger.error("telegram_message_handling_failed", error=str(e))
        else:
            # Log if no adapter (fallback behavior)
            if event.is_command:
                logger.info(
                    "telegram_command_received",
                    command=event.command,
                    chat_id=message.chat_id,
                    user=str(user)
                )
            else:
                logger.info(
                    "telegram_message_received",
                    text=event.text[:100],
                    chat_id=message.chat_id,
                    user=str(user)
                )

    async def close(self) -> None:
        """Close the Telegram application connection."""
        if self._application:
            try:
                await self._application.updater.stop()
                await self._application.stop()
                await self._application.shutdown()
            except Exception:
                logger.debug("silent_error", _line=193)
            self._application = None
            self._bot = None

    @property
    def bot(self) -> Any:
        """Get the underlying telegram Bot (for adapter use)."""
        return self._bot
