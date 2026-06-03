from __future__ import annotations

import asyncio
from typing import Any

import structlog

from sediman.integrations.base import Integration
from sediman.agent.tool_dispatch import ToolDefinition, ToolResult

logger = structlog.get_logger()

_MAX_RETRIES = 3
_RATE_LIMIT_BASE_DELAY = 1.0


class LarkIntegration(Integration):
    name = "lark"

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

    async def _get_access_token(self) -> str:
        """Get tenant access token for API requests.

        Returns:
            Tenant access token
        """
        http = await self._ensure_http()
        app_id = self._config.get("app_id", "")
        app_secret = self._config.get("app_secret", "")

        response = await http.post(
            "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
            json={
                "app_id": app_id,
                "app_secret": app_secret,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data.get("tenant_access_token", "")

    async def send(self, target: str, content: str, **kwargs: Any) -> str:
        """Send a message to a Lark chat.

        Args:
            target: Chat ID or named chat from config
            content: Message content
            **kwargs: Additional options

        Returns:
            Success message
        """
        http = await self._ensure_http()
        chat_id = self._resolve_target(target)
        token = await self._get_access_token()

        response = await http.post(
            "https://open.larksuite.com/open-apis/im/v1/messages",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            json={
                "msg_type": "text",
                "content": f'{{"text":"{content[:4096]}"}}',
                "receive_id": chat_id,
            },
        )
        response.raise_for_status()
        return "Message sent"

    async def read(self, target: str, limit: int = 10) -> list[dict[str, Any]]:
        """Read recent messages from a Lark chat.

        Note: This is a simplified implementation.
        Full implementation would require message list API.

        Args:
            target: Chat ID or named chat from config
            limit: Number of messages to retrieve

        Returns:
            Empty list (message history requires additional setup)
        """
        logger.warning("lark_read_not_implemented")
        return []

    async def listen(self) -> None:
        """Start listening for Lark events via webhooks.

        Note: Lark uses webhooks, not persistent connections.
        The webhook handler should be registered with the HTTP server.
        This method initializes the listener but doesn't block.
        """
        from sediman.integrations.lark.listener import LarkListener
        from sediman.integrations.lark.adapter import LarkAdapter

        verify_token = self._config.get("verify_token", "")
        encrypt_key = self._config.get("encrypt_key", "")

        if not verify_token:
            logger.warning("lark_listener_missing_verify_token")
            return

        if not self._adapter:
            self._adapter = LarkAdapter()

        # Set message handler if gateway runner is available
        from sediman.integrations import get_gateway_runner
        gateway_runner = get_gateway_runner()
        if gateway_runner and hasattr(self._adapter, "set_message_handler"):
            self._adapter.set_message_handler(gateway_runner.handle_message)

        if not self._listener:
            self._listener = LarkListener(
                verify_token=verify_token,
                encrypt_key=encrypt_key,
                adapter=self._adapter,
            )

        # Set credentials on adapter
        http = await self._ensure_http()
        app_id = self._config.get("app_id", "")
        app_secret = self._config.get("app_secret", "")
        if hasattr(self._adapter, "set_credentials"):
            self._adapter.set_credentials(http, app_id, app_secret)

        logger.info("lark_webhook_ready", webhook_url=self._config.get("webhook_url", ""))

    async def close(self) -> None:
        """Close the Lark integration.

        Closes HTTP client and listener.
        """
        if self._http:
            await self._http.aclose()
        if self._listener:
            await self._listener.close()

    def get_adapter(self) -> Any:
        """Get the Lark adapter for Gateway system.

        Returns:
            LarkAdapter instance or None
        """
        return self._adapter

    def get_tools(self) -> list[tuple[ToolDefinition, Any]]:
        """Get Lark integration tools.

        Returns:
            List of (tool_definition, handler) tuples
        """
        from sediman.integrations.lark.tools import get_lark_tools
        return get_lark_tools()

    def _resolve_target(self, target: str) -> str:
        """Resolve a named target to its chat ID.

        Args:
            target: Chat ID or named chat from config

        Returns:
            Chat ID
        """
        chats = self._config.get("chats", {})
        if target in chats:
            return chats[target]
        return target
