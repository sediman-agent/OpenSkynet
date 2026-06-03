from __future__ import annotations

import asyncio
from typing import Any

import structlog

from sediman.integrations.base import Integration
from sediman.agent.tool_dispatch import ToolDefinition, ToolResult

logger = structlog.get_logger()

_MAX_RETRIES = 3
_RATE_LIMIT_BASE_DELAY = 1.0


class WhatsAppIntegration(Integration):
    name = "whatsapp"

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

    async def send(self, target: str, content: str, **kwargs: Any) -> str:
        """Send a message to a WhatsApp user.

        Args:
            target: Phone number or named contact from config
            content: Message content
            **kwargs: Additional options

        Returns:
            Success message
        """
        from pywa import WhatsApp

        phone_id = self._config.get("phone_id", "")
        token = self._config.get("token", "")
        target_number = self._resolve_target(target)

        wa = WhatsApp(phone_id=phone_id, token=token)
        await wa.send_message(
            to=target_number,
            text=content[:4096],  # WhatsApp limit
        )
        return "Message sent"

    async def read(self, target: str, limit: int = 10) -> list[dict[str, Any]]:
        """Read recent messages from WhatsApp conversation.

        Note: WhatsApp API doesn't provide message history retrieval.
        This method returns empty list.

        Args:
            target: Phone number or named contact from config
            limit: Number of messages to retrieve (not supported)

        Returns:
            Empty list (message history not available via API)
        """
        logger.warning("whatsapp_read_not_supported")
        return []

    async def listen(self) -> None:
        """Start listening for WhatsApp events via webhooks.

        Note: WhatsApp uses webhooks, not persistent connections.
        The webhook handler should be registered with the HTTP server.
        This method initializes the listener but doesn't block.
        """
        from sediman.integrations.whatsapp.listener import WhatsAppListener
        from sediman.integrations.whatsapp.adapter import WhatsAppAdapter

        phone_id = self._config.get("phone_id", "")
        token = self._config.get("token", "")
        verify_token = self._config.get("verify_token", "")

        if not phone_id or not token:
            logger.warning("whatsapp_listener_missing_credentials")
            return

        if not self._adapter:
            self._adapter = WhatsAppAdapter()

        # Set message handler if gateway runner is available
        from sediman.integrations import get_gateway_runner
        gateway_runner = get_gateway_runner()
        if gateway_runner and hasattr(self._adapter, "set_message_handler"):
            self._adapter.set_message_handler(gateway_runner.handle_message)

        if not self._listener:
            self._listener = WhatsAppListener(
                phone_id=phone_id,
                token=token,
                verify_token=verify_token,
                adapter=self._adapter,
            )

        # Set client on adapter
        if hasattr(self._listener, "client") and self._listener.client:
            self._adapter.set_client(self._listener.client)

        logger.info("whatsapp_webhook_ready", webhook_url=self._config.get("webhook_url", ""))

    async def close(self) -> None:
        """Close the WhatsApp integration.

        Closes HTTP client and listener.
        """
        if self._http:
            await self._http.aclose()
        if self._listener:
            await self._listener.close()

    def get_adapter(self) -> Any:
        """Get the WhatsApp adapter for Gateway system.

        Returns:
            WhatsAppAdapter instance or None
        """
        return self._adapter

    def get_tools(self) -> list[tuple[ToolDefinition, Any]]:
        """Get WhatsApp integration tools.

        Returns:
            List of (tool_definition, handler) tuples
        """
        from sediman.integrations.whatsapp.tools import get_whatsapp_tools
        return get_whatsapp_tools()

    def _resolve_target(self, target: str) -> str:
        """Resolve a named target to its phone number.

        Args:
            target: Phone number or named contact from config

        Returns:
            Phone number
        """
        contacts = self._config.get("contacts", {})
        if target in contacts:
            return contacts[target]
        # Ensure phone number has proper format
        if not target.startswith("+"):
            return "+" + target
        return target
