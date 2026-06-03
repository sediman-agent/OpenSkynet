"""WeChat integration using Tencent's iLink Bot API.

Supports personal WeChat accounts via QR code login and long-poll messaging.
"""
from __future__ import annotations

import asyncio
import json
import secrets
from typing import Any

import structlog

from sediman.integrations.base import Integration
from sediman.agent.tool_dispatch import ToolDefinition, ToolResult

logger = structlog.get_logger()

_MAX_RETRIES = 3
_RATE_LIMIT_BASE_DELAY = 1.0


class WeChatIntegration(Integration):
    name = "wechat"

    def __init__(self, config: dict[str, Any]) -> None:
        super().__init__(config)
        self._http = None
        self._listener = None
        self._adapter = None
        self._account_id = config.get("account_id", "")

    async def _ensure_http(self):
        if self._http is None:
            import httpx
            self._http = httpx.AsyncClient(timeout=15.0)
        return self._http

    async def send(self, target: str, content: str, **kwargs: Any) -> str:
        """Send a message to a WeChat user.

        Args:
            target: WeChat user ID or named contact from config
            content: Message content
            **kwargs: Additional options

        Returns:
            Success message
        """
        # If adapter is available (running listener), use it
        if self._adapter and hasattr(self._adapter, "send_message"):
            try:
                return await self._adapter.send_message(target, content)
            except RuntimeError:
                # Adapter not connected, fall through to direct send
                pass

        # Direct send via HTTP (for one-off messages without running listener)
        token = self._config.get("token", "")
        account_id = self._config.get("account_id", "")
        base_url = self._config.get("base_url", "https://ilinkai.weixin.qq.com")

        if not token or not account_id:
            raise RuntimeError("WeChat token and account_id are required")

        # Use aiohttp for iLink API (matches listener implementation)
        import aiohttp

        target_id = self._resolve_target(target)

        # Simple text message send
        client_id = f"openskynet-wechat-{secrets.token_hex(8)}"
        payload = {
            "msg": {
                "from_user_id": "",
                "to_user_id": target_id,
                "client_id": client_id,
                "message_type": 2,  # MSG_TYPE_BOT
                "message_state": 2,  # MSG_STATE_FINISH
                "item_list": [{"type": 1, "text_item": {"text": content[:2000]}}],
            },
            "base_info": {"channel_version": "2.2.0"},
        }

        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        url = f"{base_url.rstrip('/')}/ilink/bot/sendmessage"

        headers = {
            "Content-Type": "application/json",
            "AuthorizationType": "ilink_bot_token",
            "Authorization": f"Bearer {token}",
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(url, data=body, headers=headers) as response:
                raw = await response.text()
                if not response.ok:
                    raise RuntimeError(f"WeChat send error HTTP {response.status}: {raw[:200]}")
                result = json.loads(raw)
                ret = result.get("ret", 0)
                if ret != 0:
                    raise RuntimeError(f"WeChat send error ret={ret}: {result.get('errmsg', '')}")
                return "Message sent"

    async def read(self, target: str, limit: int = 10) -> list[dict[str, Any]]:
        """Read recent messages from WeChat conversation.

        Note: WeChat API doesn't provide message history retrieval via iLink.
        This method returns empty list.

        Args:
            target: WeChat user ID or named contact from config
            limit: Number of messages to retrieve (not supported)

        Returns:
            Empty list (message history not available via iLink API)
        """
        logger.warning("wechat_read_not_supported")
        return []

    async def listen(self) -> None:
        """Start listening for WeChat events via long-poll getupdates.

        This method blocks indefinitely and should be run as a background task.
        """
        from sediman.integrations.wechat.listener import WeChatListener
        from sediman.integrations.wechat.adapter import WeChatAdapter

        token = self._config.get("token", "")
        account_id = self._config.get("account_id", "")
        base_url = self._config.get("base_url", "")

        if not token or not account_id:
            logger.warning("wechat_listener_missing_credentials")
            return

        if not self._adapter:
            self._adapter = WeChatAdapter()

        # Set message handler if gateway runner is available
        from sediman.integrations import get_gateway_runner
        gateway_runner = get_gateway_runner()
        if gateway_runner and hasattr(self._adapter, "set_message_handler"):
            self._adapter.set_message_handler(gateway_runner.handle_message)

        if not self._listener:
            self._listener = WeChatListener(
                account_id=account_id,
                token=token,
                adapter=self._adapter,
                base_url=base_url,
            )

        await self._listener.listen()

    async def close(self) -> None:
        """Close the WeChat integration.

        Closes HTTP client and stops the listener.
        """
        if self._http:
            await self._http.aclose()
        if self._listener:
            await self._listener.close()

    def get_adapter(self) -> Any:
        """Get the WeChat adapter for Gateway system.

        Returns:
            WeChatAdapter instance or None
        """
        return self._adapter

    def get_tools(self) -> list[tuple[ToolDefinition, Any]]:
        """Get WeChat integration tools.

        Returns:
            List of (tool_definition, handler) tuples
        """
        from sediman.integrations.wechat.tools import get_wechat_tools
        return get_wechat_tools()

    def _resolve_target(self, target: str) -> str:
        """Resolve a named target to its WeChat ID.

        Args:
            target: WeChat user ID or named contact from config

        Returns:
            WeChat user ID
        """
        contacts = self._config.get("contacts", {})
        if target in contacts:
            return contacts[target]
        return target
