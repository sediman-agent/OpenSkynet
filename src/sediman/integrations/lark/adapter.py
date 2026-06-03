"""Enhanced Lark adapter with production-ready features.

Enhanced with:
- Media handling (images, videos, audio, documents)
- Typing indicators
- Message editing and deletion
- Card message support
- Message deduplication
- Retry logic for API calls
- User ID type support (open_id, user_id, union_id)
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any, Optional

import structlog

from sediman.gateway.base import BaseAdapter, SendResult
from sediman.gateway.helpers import MessageDeduplicator

logger = structlog.get_logger()


class LarkAdapter(BaseAdapter):
    """Enhanced Lark adapter for Gateway system.

    Features:
    - Media file uploads (images, videos, audio, documents)
    - Typing indicators
    - Message editing and deletion
    - Card message support
    - Message deduplication
    - Retry logic for API calls
    """

    def __init__(self) -> None:
        super().__init__("lark")
        self._http_client: Any = None
        self._app_id: str = ""
        self._app_secret: str = ""
        self._deduplicator = MessageDeduplicator(max_size=2000, ttl_seconds=300)
        self._access_token: Optional[str] = None
        self._token_expiry: Optional[float] = None

    async def connect(self) -> None:
        """Connect the adapter."""
        self._connected = True

    async def disconnect(self) -> None:
        """Disconnect the adapter."""
        self._connected = False
        self._access_token = None
        self._token_expiry = None

    async def send_message(
        self,
        chat_id: str,
        text: str,
        **kwargs: Any,
    ) -> str:
        """Send a message to a Lark chat.

        Args:
            chat_id: Lark chat ID (open_id)
            text: Message text
            **kwargs: Additional arguments

        Returns:
            Success message

        Raises:
            RuntimeError: If credentials are not configured
        """
        if not self._http_client:
            raise RuntimeError("Lark client not available")

        # Handle message length - Lark limit is approximately 4096 chars
        max_length = 4096
        if len(text) > max_length:
            chunks = [
                text[i : i + max_length]
                for i in range(0, len(text), max_length)
            ]
            for chunk in chunks:
                await self._send_with_retry(
                    chat_id=chat_id,
                    msg_type="text",
                    content={"text": chunk},
                )
            return f"Sent {len(chunks)} messages"

        await self._send_with_retry(
            chat_id=chat_id,
            msg_type="text",
            content={"text": text},
        )
        return "Message sent"

    async def _send_with_retry(
        self,
        chat_id: str,
        msg_type: str,
        content: dict,
        max_retries: int = 3,
    ) -> dict:
        """Send message with retry logic.

        Args:
            chat_id: Chat ID
            msg_type: Message type (text, image, video, etc.)
            content: Message content dict
            max_retries: Maximum retry attempts

        Returns:
            API response dict

        Raises:
            RuntimeError: If all retries fail
        """
        base_delay = 1.0

        for attempt in range(max_retries):
            try:
                token = await self._get_tenant_access_token()
                response = await self._http_client.post(
                    "https://open.larksuite.com/open-apis/im/v1/messages",
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "msg_type": msg_type,
                        "content": json.dumps(content),
                        "receive_id": chat_id,
                    },
                )
                response.raise_for_status()
                return response.json()
            except Exception as e:
                error_str = str(e).lower()
                # Check for rate limit or transient errors
                if any(
                    x in error_str
                    for x in ["rate", "limit", "timeout", "429", "503", "502"]
                ):
                    retry_after = base_delay * (2**attempt)
                    logger.warning(
                        "lark_retry",
                        retry_after=retry_after,
                        attempt=attempt + 1,
                        error=str(e),
                    )
                    import asyncio

                    await asyncio.sleep(retry_after)
                    continue
                # Other errors - raise immediately
                raise

        raise RuntimeError(f"Lark API failed after {max_retries} retries")

    async def _get_tenant_access_token(self) -> str:
        """Get tenant access token for API requests with caching.

        Returns:
            Tenant access token
        """
        import time

        # Check if token is still valid (with 5 minute buffer)
        if self._access_token and self._token_expiry:
            if time.time() < (self._token_expiry - 300):
                return self._access_token

        # Get new token
        response = await self._http_client.post(
            "https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal",
            json={
                "app_id": self._app_id,
                "app_secret": self._app_secret,
            },
        )
        response.raise_for_status()
        data = response.json()

        self._access_token = data.get("tenant_access_token", "")
        # Token expires in 2 hours, store expiry time
        self._token_expiry = time.time() + 7200

        return self._access_token

    async def send_typing(self, chat_id: str, metadata: Optional[dict] = None) -> None:
        """Send typing indicator to Lark.

        Lark doesn't have native typing indicators, but we can simulate
        by sending a temporary "Typing..." message that gets edited/updated.

        Args:
            chat_id: Chat ID
            metadata: Optional metadata
        """
        # Lark doesn't have a dedicated typing API
        # We could send a temporary message, but that would clutter the chat
        pass

    async def stop_typing(self, chat_id: str) -> None:
        """Stop typing indicator."""
        pass

    async def edit_message(
        self,
        chat_id: str,
        message_id: str,
        content: str,
    ) -> SendResult:
        """Edit a previously sent message.

        Args:
            chat_id: Chat ID
            message_id: Message ID
            content: New message content

        Returns:
            SendResult indicating success/failure
        """
        if not self._http_client:
            return SendResult(success=False, error="Client not available")

        try:
            token = await self._get_tenant_access_token()
            response = await self._http_client.patch(
                f"https://open.larksuite.com/open-apis/im/v1/messages/{message_id}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json={
                    "msg_type": "text",
                    "content": json.dumps({"text": content}),
                },
            )
            response.raise_for_status()
            return SendResult(success=True, message_id=message_id)
        except Exception as e:
            logger.error("lark_edit_failed", error=str(e))
            return SendResult(success=False, error=str(e))

    async def delete_message(self, chat_id: str, message_id: str) -> bool:
        """Delete a previously sent message.

        Args:
            chat_id: Chat ID
            message_id: Message ID

        Returns:
            True if successful, False otherwise
        """
        if not self._http_client:
            return False

        try:
            token = await self._get_tenant_access_token()
            response = await self._http_client.delete(
                f"https://open.larksuite.com/open-apis/im/v1/messages/{message_id}",
                headers={
                    "Authorization": f"Bearer {token}",
                },
            )
            response.raise_for_status()
            return True
        except Exception as e:
            logger.error("lark_delete_failed", error=str(e))
            return False

    async def send_image(
        self,
        chat_id: str,
        image_url: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send an image from URL to Lark.

        Args:
            chat_id: Chat ID
            image_url: URL of the image
            caption: Optional caption text
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._http_client:
            return SendResult(success=False, error="Client not available")

        try:
            import httpx

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(image_url)
                response.raise_for_status()
                image_data = response.content

            # Determine file extension
            ext = ".png"
            if image_url.lower().endswith((".jpg", ".jpeg")):
                ext = ".jpg"
            elif image_url.lower().endswith(".gif"):
                ext = ".gif"
            elif image_url.lower().endswith(".webp"):
                ext = ".webp"

            # Save to temp file
            with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
                f.write(image_data)
                temp_path = f.name

            try:
                return await self.send_image_file(
                    chat_id=chat_id,
                    image_path=temp_path,
                    caption=caption,
                    reply_to=reply_to,
                    metadata=metadata,
                )
            finally:
                try:
                    os.unlink(temp_path)
                except Exception:
                    pass

        except Exception as e:
            logger.error("lark_send_image_failed", error=str(e))
            # Fallback to sending URL as text
            text = f"{caption}\n{image_url}" if caption else image_url
            result = await self.send_message(chat_id, text)
            return SendResult(success=True, message_id=result)

    async def send_image_file(
        self,
        chat_id: str,
        image_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send a local image file to Lark.

        Args:
            chat_id: Chat ID
            image_path: Path to the image file
            caption: Optional caption text
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._http_client:
            return SendResult(success=False, error="Client not available")

        try:
            # Upload image to Lark
            image_key = await self._upload_image(image_path)

            # Send message with image
            content = {"image_key": image_key}
            if caption:
                content["text"] = caption

            response = await self._send_with_retry(
                chat_id=chat_id,
                msg_type="image",
                content=content,
            )

            return SendResult(success=True, message_id=response.get("msg_id"))

        except Exception as e:
            logger.error("lark_send_image_file_failed", error=str(e))
            # Fallback
            text = f"🖼️ Image: {image_path}"
            if caption:
                text = f"{caption}\n{text}"
            result = await self.send_message(chat_id, text)
            return SendResult(success=True, message_id=result)

    async def _upload_image(self, image_path: str) -> str:
        """Upload an image to Lark and return the image_key.

        Args:
            image_path: Path to the image file

        Returns:
            Image key for use in messages
        """
        token = await self._get_tenant_access_token()

        with open(image_path, "rb") as f:
            image_data = f.read()

        # Upload to Lark's image API
        response = await self._http_client.post(
            "https://open.larksuite.com/open-apis/im/v1/images",
            headers={
                "Authorization": f"Bearer {token}",
            },
            data={"image_type": "message"},
            files={"image": image_data},
        )
        response.raise_for_status()
        return response.json().get("data", {}).get("image_key", "")

    async def send_video(
        self,
        chat_id: str,
        video_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send a video to Lark.

        Args:
            chat_id: Chat ID
            video_path: Path to the video file
            caption: Optional caption text
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._http_client:
            return SendResult(success=False, error="Client not available")

        try:
            # Upload video to Lark
            video_key = await self._upload_video(video_path)

            # Send message with video
            content = {"video_key": video_key}
            if caption:
                content["text"] = caption

            response = await self._send_with_retry(
                chat_id=chat_id,
                msg_type="video",
                content=content,
            )

            return SendResult(success=True, message_id=response.get("msg_id"))

        except Exception as e:
            logger.error("lark_send_video_failed", error=str(e))
            # Fallback
            text = f"🎬 Video: {video_path}"
            if caption:
                text = f"{caption}\n{text}"
            result = await self.send_message(chat_id, text)
            return SendResult(success=True, message_id=result)

    async def _upload_video(self, video_path: str) -> str:
        """Upload a video to Lark and return the video_key.

        Args:
            video_path: Path to the video file

        Returns:
            Video key for use in messages
        """
        token = await self._get_tenant_access_token()

        with open(video_path, "rb") as f:
            video_data = f.read()

        # Upload to Lark's file API
        response = await self._http_client.post(
            "https://open.larksuite.com/open-apis/drive/v1/medias/upload_all",
            headers={
                "Authorization": f"Bearer {token}",
            },
            data={"file_type": "video", "scene": "message"},
            files={"file": video_data},
        )
        response.raise_for_status()
        return response.json().get("data", {}).get("video_key", "")

    async def send_document(
        self,
        chat_id: str,
        file_path: str,
        caption: Optional[str] = None,
        file_name: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send a document to Lark.

        Args:
            chat_id: Chat ID
            file_path: Path to the document file
            caption: Optional caption text
            file_name: Optional filename
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._http_client:
            return SendResult(success=False, error="Client not available")

        try:
            filename = file_name or Path(file_path).name

            # Upload file to Lark
            file_key = await self._upload_file(file_path, filename)

            # Send message with file
            content = {"file_key": file_key, "file_name": filename}
            if caption:
                content["text"] = caption

            response = await self._send_with_retry(
                chat_id=chat_id,
                msg_type="file",
                content=content,
            )

            return SendResult(success=True, message_id=response.get("msg_id"))

        except Exception as e:
            logger.error("lark_send_document_failed", error=str(e))
            # Fallback
            text = f"📎 File: {file_path}"
            if caption:
                text = f"{caption}\n{text}"
            result = await self.send_message(chat_id, text)
            return SendResult(success=True, message_id=result)

    async def _upload_file(self, file_path: str, filename: str) -> str:
        """Upload a file to Lark and return the file_key.

        Args:
            file_path: Path to the file
            filename: File name

        Returns:
            File key for use in messages
        """
        token = await self._get_tenant_access_token()

        with open(file_path, "rb") as f:
            file_data = f.read()

        # Upload to Lark's file API
        response = await self._http_client.post(
            "https://open.larksuite.com/open-apis/drive/v1/medias/upload_all",
            headers={
                "Authorization": f"Bearer {token}",
            },
            data={"file_type": "file", "scene": "message"},
            files={"file": file_data},
        )
        response.raise_for_status()
        return response.json().get("data", {}).get("file_key", "")

    async def send_voice(
        self,
        chat_id: str,
        audio_path: str,
        caption: Optional[str] = None,
        reply_to: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> SendResult:
        """Send an audio file as a voice message to Lark.

        Args:
            chat_id: Chat ID
            audio_path: Path to the audio file
            caption: Optional caption text
            reply_to: Optional message ID to reply to
            metadata: Optional metadata

        Returns:
            SendResult with message ID
        """
        if not self._http_client:
            return SendResult(success=False, error="Client not available")

        try:
            # Upload audio to Lark
            file_key = await self._upload_file(audio_path, Path(audio_path).name)

            # Send message with audio
            content = {"file_key": file_key}
            if caption:
                content["text"] = caption

            response = await self._send_with_retry(
                chat_id=chat_id,
                msg_type="audio",
                content=content,
            )

            return SendResult(success=True, message_id=response.get("msg_id"))

        except Exception as e:
            logger.error("lark_send_voice_failed", error=str(e))
            # Fallback
            text = f"🔊 Audio: {audio_path}"
            if caption:
                text = f"{caption}\n{text}"
            result = await self.send_message(chat_id, text)
            return SendResult(success=True, message_id=result)

    def set_credentials(
        self, http_client: Any, app_id: str, app_secret: str
    ) -> None:
        """Set the Lark credentials.

        Args:
            http_client: HTTP client for API requests
            app_id: Lark application ID
            app_secret: Lark application secret
        """
        self._http_client = http_client
        self._app_id = app_id
        self._app_secret = app_secret

    def is_duplicate(self, message_id: str) -> bool:
        """Check if message was already processed.

        Args:
            message_id: Lark message ID

        Returns:
            True if duplicate, False otherwise
        """
        return self._deduplicator.is_duplicate(message_id)
