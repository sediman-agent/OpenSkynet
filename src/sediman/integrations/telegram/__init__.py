from __future__ import annotations

from typing import Any

import structlog

from sediman.integrations.base import Integration
from sediman.agent.tool_dispatch import ToolDefinition, ToolResult

logger = structlog.get_logger()


class TelegramIntegration(Integration):
    name = "telegram"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._http = None
        self._listener = None
        self._adapter = None

    async def _ensure_http(self):
        if self._http is None:
            import httpx
            token = self._config.get("token", "")
            base = f"https://api.telegram.org/bot{token}"
            self._http = httpx.AsyncClient(base_url=base, timeout=15.0)
        return self._http

    async def send(self, target: str, content: str, **kwargs: Any) -> str:
        http = await self._ensure_http()
        chat_id = self._resolve_target(target)
        payload: dict[str, Any] = {
            "chat_id": chat_id,
            "text": content,
        }
        if kwargs.get("parse_mode"):
            payload["parse_mode"] = kwargs["parse_mode"]
        if kwargs.get("disable_web_page_preview"):
            payload["disable_web_page_preview"] = True
        resp = await http.post("/sendMessage", json=payload)
        if resp.status_code >= 400:
            body = resp.text[:200]
            raise RuntimeError(f"Telegram API error {resp.status_code}: {body}")
        data = resp.json()
        if not data.get("ok"):
            raise RuntimeError(f"Telegram API error: {data.get('description', 'unknown')}")
        msg_id = data.get("result", {}).get("message_id", "?")
        logger.info("telegram_message_sent", chat=chat_id, message_id=msg_id)
        return f"Message sent to Telegram chat {chat_id} (message_id: {msg_id})"

    async def read(self, target: str, limit: int = 10) -> list[dict[str, Any]]:
        http = await self._ensure_http()
        chat_id = self._resolve_target(target)
        resp = await http.post("/getUpdates", json={
            "offset": -limit,
            "limit": min(limit, 100),
            "allowed_updates": ["message"],
        })
        if resp.status_code >= 400:
            body = resp.text[:200]
            raise RuntimeError(f"Telegram API error {resp.status_code}: {body}")
        data = resp.json()
        if not data.get("ok"):
            raise RuntimeError(f"Telegram API error: {data.get('description', 'unknown')}")
        messages = []
        for update in data.get("result", []):
            msg = update.get("message", {})
            messages.append({
                "id": str(update.get("update_id", "")),
                "text": msg.get("text", ""),
                "author": msg.get("from", {}).get("username") or msg.get("from", {}).get("first_name", "unknown"),
                "chat_id": str(chat_id),
                "timestamp": str(msg.get("date", "")),
            })
        return messages

    def _resolve_target(self, target: str) -> int | str:
        chats = self._config.get("chats", {})
        named = chats.get(target)
        if named is not None:
            return named
        try:
            return int(target)
        except ValueError:
            return target

    def get_tools(self) -> list[tuple[ToolDefinition, Any]]:
        return [
            (
                ToolDefinition(
                    name="telegram.send_message",
                    description="Send a message to a Telegram chat. Use a named chat key (e.g. 'admin', 'general') or a raw chat ID.",
                    parameters={
                        "type": "object",
                        "properties": {
                            "chat": {
                                "type": "string",
                                "description": "Named chat key (e.g. 'admin') or raw Telegram chat ID (numeric)",
                            },
                            "text": {
                                "type": "string",
                                "description": "The message text to send",
                            },
                            "parse_mode": {
                                "type": "string",
                                "enum": ["HTML", "Markdown"],
                                "description": "Parse mode for formatting (HTML or Markdown)",
                            },
                            "disable_web_page_preview": {
                                "type": "boolean",
                                "description": "Disable link previews in the message",
                            },
                        },
                        "required": ["chat", "text"],
                    },
                ),
                self._handle_send,
            ),
            (
                ToolDefinition(
                    name="telegram.read_messages",
                    description="Read recent messages from a Telegram chat.",
                    parameters={
                        "type": "object",
                        "properties": {
                            "chat": {
                                "type": "string",
                                "description": "Named chat key or raw Telegram chat ID (numeric)",
                            },
                            "limit": {
                                "type": "integer",
                                "description": "Number of messages to fetch (default 10)",
                            },
                        },
                        "required": ["chat"],
                    },
                ),
                self._handle_read,
            ),
        ]

    async def _handle_send(self, chat: str, text: str, **kwargs: Any) -> ToolResult:
        try:
            result = await self.send(chat, text, **kwargs)
            return ToolResult(success=True, output=result)
        except Exception as e:
            return ToolResult(success=False, output=f"Telegram send failed: {e}")

    async def _handle_read(self, chat: str, limit: int = 10, **kwargs: Any) -> ToolResult:
        try:
            messages = await self.read(chat, limit=limit)
            if not messages:
                return ToolResult(success=True, output="No messages found.", data={"messages": []})
            lines = [f"[{m['timestamp']}] {m['author']}: {m['text'][:200]}" for m in messages]
            return ToolResult(success=True, output="\n".join(lines), data={"messages": messages})
        except Exception as e:
            return ToolResult(success=False, output=f"Telegram read failed: {e}")

    async def listen(self) -> None:
        """Start a background Telegram bot that can process commands."""
        from sediman.integrations.telegram.listener import TelegramListener
        from sediman.integrations.telegram.adapter import TelegramAdapter

        token = self._config.get("token", "")
        if not token:
            return

        # Create listener
        self._listener = TelegramListener(token, self._config)

        # Create adapter and link to listener
        self._adapter = TelegramAdapter(None)  # Bot will be set later
        self._listener.set_adapter(self._adapter)

        # Start listener (runs indefinitely)
        await self._listener.listen()

    async def close(self) -> None:
        """Close the HTTP client and listener."""
        if self._listener:
            try:
                await self._listener.close()
            except Exception:
                logger.debug("silent_error", _line=193)
            self._listener = None
        if self._http:
            try:
                await self._http.aclose()
            except Exception:
                logger.debug("silent_error", _line=199)
            self._http = None

    def get_adapter(self):
        """Get the Telegram adapter for Gateway system."""
        return self._adapter
