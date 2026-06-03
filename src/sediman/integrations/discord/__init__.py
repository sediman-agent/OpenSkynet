from __future__ import annotations

import asyncio
from typing import Any

import structlog

from sediman.integrations.base import Integration
from sediman.integrations.models import Channel, Message
from sediman.agent.tool_dispatch import ToolDefinition, ToolResult

logger = structlog.get_logger()

# TODO: Magic Number --> Set at the config file.
_MAX_RETRIES = 3
_RATE_LIMIT_BASE_DELAY = 1.0


class DiscordIntegration(Integration):
    name = "discord"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._http = None
        self._listener = None
        self._adapter = None

    async def _ensure_http(self):
        if self._http is None:
            import httpx
            base = "https://discord.com/api/v10"
            token = self._config.get("token", "")
            self._http = httpx.AsyncClient(
                base_url=base,
                headers={"Authorization": f"Bot {token}", "Content-Type": "application/json"},
                timeout=15.0,
            )
        return self._http

    async def _request_with_retry(self, method: str, url: str, **kwargs: Any) -> Any:
        http = await self._ensure_http()
        do_request = getattr(http, method)
        for attempt in range(_MAX_RETRIES):
            resp = await do_request(url, **kwargs)
            if resp.status_code == 429:
                retry_after = float(resp.headers.get("Retry-After", _RATE_LIMIT_BASE_DELAY * (2 ** attempt)))
                logger.warning("discord_rate_limited", retry_after=retry_after, attempt=attempt + 1)
                await asyncio.sleep(retry_after)
                continue
            if resp.status_code >= 400:
                body = resp.text[:200]
                raise RuntimeError(f"Discord API error {resp.status_code}: {body}")
            return resp.json()
        raise RuntimeError(f"Discord API rate limit exceeded after {_MAX_RETRIES} retries")

    async def send(self, target: str, content: str, **kwargs: Any) -> str:
        channel_id = self._resolve_target(target)
        payload: dict[str, Any] = {"content": content}
        if kwargs.get("embed_title") or kwargs.get("embed_desc"):
            embed: dict[str, str] = {}
            if kwargs.get("embed_title"):
                embed["title"] = kwargs["embed_title"]
            if kwargs.get("embed_desc"):
                embed["description"] = kwargs["embed_desc"]
            if kwargs.get("embed_url"):
                embed["url"] = kwargs["embed_url"]
            payload["embeds"] = [embed]
        data = await self._request_with_retry("post", f"/channels/{channel_id}/messages", json=payload)
        logger.info("discord_message_sent", channel=channel_id, message_id=data.get("id"))
        return f"Message sent to Discord channel {channel_id} (id: {data.get('id')})"

    async def read(self, target: str, limit: int = 10) -> list[dict[str, Any]]:
        channel_id = self._resolve_target(target)
        messages = await self._request_with_retry(
            "get", f"/channels/{channel_id}/messages", params={"limit": min(limit, 100)}
        )
        results = []
        for msg in messages:
            results.append({
                "id": msg["id"],
                "text": msg.get("content", ""),
                "author": msg.get("author", {}).get("username", "unknown"),
                "channel": channel_id,
                "timestamp": msg.get("timestamp", ""),
            })
        return results

    def _resolve_target(self, target: str) -> str:
        channels = self._config.get("channels", {})
        if target in channels:
            return channels[target]
        if target.isdigit():
            return target
        available = ", ".join(channels.keys()) if channels else "none"
        raise ValueError(
            f"Discord channel '{target}' is not configured. "
            f"Configured channels: {available}. "
            "Use a raw numeric channel ID or configure a named channel via "
            "'sediman integration configure discord --channel <name>:<id>'."
        )

    def get_tools(self) -> list[tuple[ToolDefinition, Any]]:
        return [
            (
                ToolDefinition(
                    name="discord.send_message",
                    description="Send a message to a Discord channel. Use a named channel key (e.g. 'alerts', 'reports') or a raw channel ID.",
                    parameters={
                        "type": "object",
                        "properties": {
                            "channel": {
                                "type": "string",
                                "description": "Named channel key (e.g. 'alerts') or raw Discord channel ID",
                            },
                            "content": {
                                "type": "string",
                                "description": "The message text to send",
                            },
                            "embed_title": {
                                "type": "string",
                                "description": "Optional embed title for rich messages",
                            },
                            "embed_desc": {
                                "type": "string",
                                "description": "Optional embed description",
                            },
                            "embed_url": {
                                "type": "string",
                                "description": "Optional embed URL",
                            },
                        },
                        "required": ["channel", "content"],
                    },
                ),
                self._handle_send,
            ),
            (
                ToolDefinition(
                    name="discord.read_messages",
                    description="Read recent messages from a Discord channel.",
                    parameters={
                        "type": "object",
                        "properties": {
                            "channel": {
                                "type": "string",
                                "description": "Named channel key or raw Discord channel ID",
                            },
                            "limit": {
                                "type": "integer",
                                "description": "Number of messages to fetch (max 100, default 10)",
                            },
                        },
                        "required": ["channel"],
                    },
                ),
                self._handle_read,
            ),
        ]

    async def _handle_send(self, channel: str, content: str, **kwargs: Any) -> ToolResult:
        try:
            result = await self.send(channel, content, **kwargs)
            return ToolResult(success=True, output=result)
        except Exception as e:
            return ToolResult(success=False, output=f"Discord send failed: {e}")

    async def _handle_read(self, channel: str, limit: int = 10, **kwargs: Any) -> ToolResult:
        try:
            messages = await self.read(channel, limit=limit)
            if not messages:
                return ToolResult(success=True, output="No messages found.", data={"messages": []})
            lines = [f"[{m['timestamp']}] {m['author']}: {m['text'][:200]}" for m in messages]
            return ToolResult(success=True, output="\n".join(lines), data={"messages": messages})
        except Exception as e:
            return ToolResult(success=False, output=f"Discord read failed: {e}")

    async def listen(self) -> None:
        """Start a background Discord bot that can process commands."""
        from sediman.integrations.discord.listener import DiscordListener
        from sediman.integrations.discord.adapter import DiscordAdapter

        token = self._config.get("token", "")
        if not token:
            return

        # Create listener
        self._listener = DiscordListener(token, self._config)

        # Create adapter and link to listener
        self._adapter = DiscordAdapter(None)  # Client will be set later
        self._listener.set_adapter(self._adapter)

        # Start listener (runs indefinitely)
        await self._listener.listen()

    async def close(self) -> None:
        """Close the HTTP client and listener."""
        if self._listener:
            try:
                await self._listener.close()
            except Exception:
                logger.debug("silent_error", _line=233)
            self._listener = None
        if self._http:
            try:
                await self._http.aclose()
            except Exception:
                logger.debug("silent_error", _line=239)
            self._http = None

    def get_adapter(self):
        """Get the Discord adapter for Gateway system."""
        return self._adapter
