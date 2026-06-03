from __future__ import annotations

from typing import Any

from pywa import WhatsApp

from sediman.gateway.events import MessageEvent


class WhatsAppListener:
    """Listener for WhatsApp events via webhooks."""

    def __init__(self, phone_id: str, token: str, verify_token: str, adapter: Any) -> None:
        """Initialize the WhatsApp listener.

        Args:
            phone_id: WhatsApp phone number ID
            token: WhatsApp access token
            verify_token: Webhook verification token
            adapter: WhatsAppAdapter instance for message handling
        """
        self._phone_id = phone_id
        self._token = token
        self._verify_token = verify_token
        self._adapter = adapter
        self._client: WhatsApp | None = None
        self._setup_client()

    def _setup_client(self) -> None:
        """Set up the WhatsApp client with message handlers."""
        self._client = WhatsApp(phone_id=self._phone_id, token=self._token)

        @self._client.on_message()
        async def handle_message(message: Any) -> None:
            """Handle incoming WhatsApp message."""
            # Create MessageEvent from raw payload
            event = MessageEvent.from_whatsapp(message.raw)
            # Forward to adapter
            await self._adapter.on_message(event)

    def verify_webhook(self, mode: str, token: str, challenge: str) -> str | None:
        """Verify webhook during setup.

        Args:
            mode: Webhook mode (usually "subscribe")
            token: Verification token from request
            challenge: Challenge string to return if verified

        Returns:
            Challenge string if verified, None otherwise
        """
        if mode == "subscribe" and token == self._verify_token:
            return challenge
        return None

    async def process_webhook(self, payload: dict) -> None:
        """Process incoming webhook payload.

        Args:
            payload: Webhook payload from WhatsApp
        """
        if self._client:
            await self._client.process_webhook(payload)

    async def close(self) -> None:
        """Close the WhatsApp listener."""
        # pywa client doesn't need explicit closing
        pass

    def set_adapter(self, adapter: Any) -> None:
        """Set the adapter.

        Args:
            adapter: WhatsAppAdapter instance
        """
        self._adapter = adapter

    @property
    def client(self) -> WhatsApp | None:
        """Get the WhatsApp client."""
        return self._client
