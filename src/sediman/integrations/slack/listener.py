"""Enhanced Slack listener with production-ready features.

Features:
- Thread detection and routing
- Message deduplication
- Bot mention detection in threads
- Channel vs DM detection
- Message context extraction
"""
from __future__ import annotations

import asyncio
from typing import Any, Optional

from slack_sdk.socket_mode import SocketModeClient
from slack_sdk.socket_mode.requests import SocketModeRequest
from slack_sdk.socket_mode.response import SocketModeResponse
from slack_sdk.web.async_client import AsyncWebClient

import structlog

from sediman.gateway.events import MessageEvent

logger = structlog.get_logger()


class SlackListener:
    """Enhanced listener for Slack events via Socket Mode."""

    def __init__(self, bot_token: str, app_level_token: str, adapter: Any) -> None:
        """Initialize the Slack listener.

        Args:
            bot_token: Slack bot user OAuth token (xoxb-)
            app_level_token: Slack app-level token for Socket Mode (xapp-)
            adapter: SlackAdapter instance for message handling
        """
        self._bot_token = bot_token
        self._app_level_token = app_level_token
        self._adapter = adapter
        self._client: Optional[SocketModeClient] = None
        self._web_client: Optional[AsyncWebClient] = None

    async def listen(self) -> None:
        """Start listening for Slack events via Socket Mode.

        This method blocks indefinitely.
        """
        self._web_client = AsyncWebClient(token=self._bot_token)

        self._client = SocketModeClient(
            app_level_token=self._app_level_token,
            web_client=self._web_client,
        )
        self._client.socket_mode_request_handler = self._handle_event

        # Set web client on adapter
        if hasattr(self._adapter, "set_web_client"):
            self._adapter.set_web_client(self._web_client)

        await self._client.connect()
        # Keep running - this blocks indefinitely

    async def _handle_event(self, request: SocketModeRequest) -> None:
        """Handle incoming Slack event with thread support and deduplication.

        Args:
            request: Socket mode request
        """
        if request.type == "events_api" and request.payload.get("event"):
            event = request.payload["event"]

            # Handle different event types
            event_type = event.get("type")

            if event_type == "message":
                await self._handle_message_event(event, request)
            elif event_type == "app_mention":
                await self._handle_mention_event(event, request)

        # Acknowledge receipt
        if self._client:
            await self._client.send_socket_mode_response(
                SocketModeResponse(envelope_id=request.envelope_id)
            )

    async def _handle_message_event(self, event: dict, request: SocketModeRequest) -> None:
        """Handle a message event.

        Args:
            event: Slack message event
            request: Socket mode request
        """
        # Skip bot messages and messages without text
        if event.get("bot_id") or event.get("subtype"):
            return

        # Skip messages in threads where bot hasn't been mentioned
        # (unless bot has already participated in the thread)
        thread_ts = event.get("thread_ts")
        if thread_ts and thread_ts != event.get("ts"):
            # This is a thread reply
            # Check if bot has participated in this thread
            if hasattr(self._adapter, "is_thread_participated"):
                if not self._adapter.is_thread_participated(thread_ts):
                    # Bot hasn't participated, skip this message
                    logger.debug("slack_thread_skipped", thread_ts=thread_ts)
                    return

        # Check for duplicate message
        message_ts = event.get("ts")
        if message_ts and hasattr(self._adapter, "is_duplicate"):
            if self._adapter.is_duplicate(message_ts):
                logger.debug("slack_duplicate_message", ts=message_ts)
                return

        # Create MessageEvent
        message_event = MessageEvent.from_slack(event)

        # Add thread info to metadata
        if thread_ts:
            message_event.thread_id = thread_ts

        # Forward to adapter
        if self._adapter:
            await self._adapter.on_message(message_event)

    async def _handle_mention_event(self, event: dict, request: SocketModeRequest) -> None:
        """Handle an app_mention event (bot was mentioned).

        Args:
            event: Slack mention event
            request: Socket mode request
        """
        # Treat mentions similarly to messages, but ensure we process them
        text = event.get("text", "")

        # Remove the mention markup to get clean text
        # Slack mentions look like <@U12345|botname> or <@U12345>
        import re
        clean_text = re.sub(r"<@[A-Z0-9]+[^>]*>", "", text).strip()

        # Create a modified event
        modified_event = event.copy()
        modified_event["text"] = clean_text

        # Check for duplicate
        message_ts = event.get("ts")
        if message_ts and hasattr(self._adapter, "is_duplicate"):
            if self._adapter.is_duplicate(message_ts):
                return

        # Create MessageEvent
        message_event = MessageEvent.from_slack(modified_event)

        # Add thread info if present
        thread_ts = event.get("thread_ts")
        if thread_ts:
            message_event.thread_id = thread_ts

        # Forward to adapter
        if self._adapter:
            await self._adapter.on_message(message_event)

    async def close(self) -> None:
        """Close the Slack listener."""
        if self._client:
            await self._client.close()
        if self._web_client:
            await self._web_client.close()

    def set_adapter(self, adapter: Any) -> None:
        """Set the adapter.

        Args:
            adapter: SlackAdapter instance
        """
        self._adapter = adapter

    @property
    def client(self) -> Optional[SocketModeClient]:
        """Get the Socket Mode client."""
        return self._client

    @property
    def web_client(self) -> Optional[AsyncWebClient]:
        """Get the web client."""
        return self._web_client
