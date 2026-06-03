from __future__ import annotations

from typing import Any
import json
import base64
import hashlib
import structlog

from sediman.gateway.events import MessageEvent

logger = structlog.get_logger()


class LarkListener:
    """Listener for Lark events via webhooks."""

    def __init__(self, verify_token: str, encrypt_key: str | None, adapter: Any) -> None:
        """Initialize the Lark listener.

        Args:
            verify_token: Webhook verification token
            encrypt_key: Optional AES encryption key for encrypted payloads
            adapter: LarkAdapter instance for message handling
        """
        self._verify_token = verify_token
        self._encrypt_key = encrypt_key
        self._adapter = adapter

    def verify_webhook(self, challenge: str, token: str) -> str | None:
        """Verify webhook during setup.

        Args:
            challenge: Challenge string from Lark
            token: Verification token from request

        Returns:
            Challenge string if verified, None otherwise
        """
        if token == self._verify_token:
            return challenge
        logger.warning("lark_webhook_verification_failed")
        return None

    async def process_webhook(self, event: dict) -> None:
        """Process incoming Lark event.

        Args:
            event: Lark event payload
        """
        try:
            # Decrypt if encrypt_key is provided
            if self._encrypt_key and event.get("encrypt"):
                event = self._decrypt_event(event)

            # Handle message events
            if event.get("type") == "im.message.receive_v1":
                message_event = MessageEvent.from_lark(event)
                await self._adapter.on_message(message_event)
        except Exception as e:
            logger.error("lark_webhook_processing_failed", error=str(e))

    def _decrypt_event(self, event: dict) -> dict:
        """Decrypt encrypted Lark event payload.

        Args:
            event: Encrypted event payload

        Returns:
            Decrypted event as dictionary
        """
        from Crypto.Cipher import AES

        encrypt_data = event.get("encrypt", "")
        if not encrypt_data:
            return event

        # Decode base64
        cipher_text = base64.b64decode(encrypt_data)

        # Create cipher
        key = self._encrypt_key.encode("utf-8")[:32].ljust(32, b"\0")
        cipher = AES.new(key, AES.MODE_ECB)

        # Decrypt
        decrypted = cipher.decrypt(cipher_text)

        # Remove padding
        padding = decrypted[-1]
        if isinstance(padding, str):
            padding = ord(padding)
        decrypted = decrypted[:-padding]

        # Parse JSON
        return json.loads(decrypted.decode("utf-8"))

    async def close(self) -> None:
        """Close the Lark listener."""
        pass

    def set_adapter(self, adapter: Any) -> None:
        """Set the adapter.

        Args:
            adapter: LarkAdapter instance
        """
        self._adapter = adapter
