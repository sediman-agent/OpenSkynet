from __future__ import annotations

import asyncio
from typing import Any

import structlog

from sediman.integrations.base import Integration
from sediman.agent.tool_dispatch import ToolDefinition, ToolResult

logger = structlog.get_logger()

# TODO: Magic Number --> Set at the config file.
_MAX_RETRIES = 3
_RATE_LIMIT_BASE_DELAY = 1.0


class SlackIntegration(Integration):
    name = "slack"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._http = None
        self._listener = None
        self._adapter = None

    async def _ensure_http(self):
        if self._http is None:
            import httpx
            self._http = httpx.AsyncClient(timeout=15.0)
        return self._http

    async def _request_with_retry(self, method: str, url: str, **kwargs: Any) -> Any:
        http = await self._ensure_http()
        do_request = getattr(http, method)
        for attempt in range(_MAX_RETRIES):
            resp = await do_request(url, **kwargs)
            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", _RATE_LIMIT_BASE_DELAY * (2 ** attempt)))
                logger.warning("slack_rate_limited", retry_after=retry_after, attempt=attempt + 1)
                await asyncio.sleep(retry_after)
                continue
            if resp.status_code >= 400:
                body = resp.text[:200]
                raise RuntimeError(f"Slack API error {resp.status_code}: {body}")
            return resp.json()
        raise RuntimeError(f"Slack API rate limit exceeded after {_MAX_RETRIES} retries")

    async def send(self, target: str, content: str, **kwargs: Any) -> str:
        """Send a message to a Slack channel.

        Args:
            target: Channel ID or named channel from config
            content: Message content
            **kwargs: Additional options

        Returns:
            Message timestamp
        """
        from slack_sdk.web.async_client import AsyncWebClient

        channel_id = self._resolve_target(target)
        token = self._config.get("token", "")

        client = AsyncWebClient(token=token)
        response = await client.chat_postMessage(
            channel=channel_id,
            text=content[:40000],  # Slack limit
        )
        return response.get("ts", "")

    async def read(self, target: str, limit: int = 10) -> list[dict[str, Any]]:
        """Read recent messages from a Slack channel.

        Args:
            target: Channel ID or named channel from config
            limit: Number of messages to retrieve

        Returns:
            List of message dictionaries
        """
        from slack_sdk.web.async_client import AsyncWebClient

        channel_id = self._resolve_target(target)
        token = self._config.get("token", "")

        client = AsyncWebClient(token=token)
        response = await client.conversations_history(
            channel=channel_id,
            limit=limit,
        )
        messages = response.get("messages", [])
        return [
            {
                "id": m.get("ts"),
                "text": m.get("text"),
                "author": m.get("user"),
                "channel": channel_id,
                "timestamp": m.get("ts"),
            }
            for m in messages
        ]

    async def listen(self) -> None:
        """Start listening for Slack events via Socket Mode.

        This method blocks indefinitely and should be run as a background task.
        """
        from sediman.integrations.slack.listener import SlackListener
        from sediman.integrations.slack.adapter import SlackAdapter

        token = self._config.get("token", "")
        app_level_token = self._config.get("app_level_token", "")

        if not token or not app_level_token:
            logger.warning("slack_listener_missing_tokens")
            return

        if not self._adapter:
            self._adapter = SlackAdapter()

        # Set message handler if gateway runner is available
        from sediman.integrations import get_gateway_runner
        gateway_runner = get_gateway_runner()
        if gateway_runner and hasattr(self._adapter, "set_message_handler"):
            self._adapter.set_message_handler(gateway_runner.handle_message)

        if not self._listener:
            self._listener = SlackListener(
                bot_token=token,
                app_level_token=app_level_token,
                adapter=self._adapter,
            )

        await self._listener.listen()

    async def close(self) -> None:
        """Close the Slack integration.

        Closes HTTP client and stops the listener.
        """
        if self._http:
            await self._http.aclose()
        if self._listener:
            await self._listener.close()

    def get_adapter(self) -> Any:
        """Get the Slack adapter for Gateway system.

        Returns:
            SlackAdapter instance or None
        """
        return self._adapter

    def get_tools(self) -> list[tuple[ToolDefinition, Any]]:
        """Get Slack integration tools.

        Returns:
            List of (tool_definition, handler) tuples
        """
        from sediman.integrations.slack.tools import get_slack_tools
        return get_slack_tools()

    def _resolve_target(self, target: str) -> str:
        """Resolve a named target to its ID.

        Args:
            target: Channel ID or named channel from config

        Returns:
            Channel ID
        """
        channels = self._config.get("channels", {})
        if target in channels:
            return channels[target]
        return target
