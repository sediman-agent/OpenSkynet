"""WeChat listener using Tencent's iLink Bot API.

Implements long-poll getupdates for incoming WeChat messages.
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any
from pathlib import Path

import aiohttp

from sediman.gateway.events import MessageEvent

# iLink API constants
ILINK_BASE_URL = "https://ilinkai.weixin.qq.com"
ILINK_APP_ID = "bot"
CHANNEL_VERSION = "2.2.0"
ILINK_APP_CLIENT_VERSION = (2 << 16) | (2 << 8) | 0

# API endpoints
EP_GET_UPDATES = "ilink/bot/getupdates"

# Timeout settings
LONG_POLL_TIMEOUT_MS = 35_000
API_TIMEOUT_MS = 15_000

# Error codes
SESSION_EXPIRED_ERRCODE = -14
RATE_LIMIT_ERRCODE = -2

MAX_CONSECUTIVE_FAILURES = 3
RETRY_DELAY_SECONDS = 2
BACKOFF_DELAY_SECONDS = 30


def _random_wechat_uin() -> str:
    """Generate a random WeChat UIN header value."""
    import base64
    import secrets
    import struct
    value = struct.unpack(">I", secrets.token_bytes(4))[0]
    return base64.b64encode(str(value).encode("utf-8")).decode("ascii")


def _json_dumps(payload: dict[str, Any]) -> str:
    """Serialize JSON with minimal whitespace."""
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _base_info() -> dict[str, Any]:
    """Return base info required for all iLink API requests."""
    return {"channel_version": CHANNEL_VERSION}


def _headers(token: str, body: str) -> dict[str, str]:
    """Generate HTTP headers for iLink API requests."""
    return {
        "Content-Type": "application/json",
        "AuthorizationType": "ilink_bot_token",
        "Content-Length": str(len(body.encode("utf-8"))),
        "X-WECHAT-UIN": _random_wechat_uin(),
        "iLink-App-Id": ILINK_APP_ID,
        "iLink-App-ClientVersion": str(ILINK_APP_CLIENT_VERSION),
        "Authorization": f"Bearer {token}",
    }


class WeChatListener:
    """Listener for WeChat events via iLink long-poll getupdates."""

    def __init__(self, account_id: str, token: str, adapter: Any, base_url: str = "") -> None:
        """Initialize the WeChat listener.

        Args:
            account_id: WeChat account ID
            token: iLink bot token
            adapter: WeChatAdapter instance for message handling
            base_url: Optional custom base URL
        """
        self._account_id = account_id
        self._token = token
        self._adapter = adapter
        self._base_url = (base_url or ILINK_BASE_URL).rstrip("/")
        self._http_session: aiohttp.ClientSession | None = None
        self._poll_task: asyncio.Task | None = None
        self._running = False
        self._sync_buf: str = ""

        # Sync buffer persistence
        self._sync_buf_path = self._get_sync_buf_path()

    def _get_sync_buf_path(self) -> Path:
        """Get the path to the sync buffer file."""
        home = Path.home() / ".terminator"
        path = home / "wechat" / f"{self._account_id}.sync.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        return path

    def _load_sync_buf(self) -> str:
        """Load sync buffer from disk."""
        if self._sync_buf_path.exists():
            try:
                data = json.loads(self._sync_buf_path.read_text(encoding="utf-8"))
                return data.get("get_updates_buf", "")
            except Exception:
                pass
        return ""

    def _save_sync_buf(self, sync_buf: str) -> None:
        """Save sync buffer to disk."""
        try:
            self._sync_buf_path.write_text(
                json.dumps({"get_updates_buf": sync_buf}),
                encoding="utf-8"
            )
            self._sync_buf_path.chmod(0o600)
        except Exception:
            pass

    async def listen(self) -> None:
        """Start listening for WeChat events via long-poll getupdates.

        This method blocks indefinitely.
        """
        if not self._token or not self._account_id:
            raise RuntimeError("WeChat token and account_id are required")

        self._running = True
        self._http_session = aiohttp.ClientSession()
        self._sync_buf = self._load_sync_buf()

        # Set credentials on adapter
        if hasattr(self._adapter, "set_credentials"):
            self._adapter.set_credentials(self._account_id, self._token, self._base_url)
        if hasattr(self._adapter, "set_sync_buf"):
            self._adapter.set_sync_buf(self._sync_buf)

        self._poll_task = asyncio.create_task(self._poll_loop(), name="wechat-poll")

        # Wait for the poll task to complete
        try:
            await self._poll_task
        except asyncio.CancelledError:
            pass

    async def _poll_loop(self) -> None:
        """Main polling loop for incoming messages."""
        if not self._http_session:
            return

        timeout_ms = LONG_POLL_TIMEOUT_MS
        consecutive_failures = 0

        while self._running:
            try:
                response = await self._get_updates(timeout_ms)
                suggested_timeout = response.get("longpolling_timeout_ms")
                if isinstance(suggested_timeout, int) and suggested_timeout > 0:
                    timeout_ms = suggested_timeout

                ret = response.get("ret", 0)
                errcode = response.get("errcode", 0)

                if ret not in {0, None} or errcode not in {0, None}:
                    if ret == SESSION_EXPIRED_ERRCODE or errcode == SESSION_EXPIRED_ERRCODE:
                        print("WeChat session expired; pausing for 10 minutes")
                        await asyncio.sleep(600)
                        consecutive_failures = 0
                        continue

                    consecutive_failures += 1
                    print(f"getUpdates failed ret={ret} errcode={errcode} ({consecutive_failures}/{MAX_CONSECUTIVE_FAILURES})")
                    await asyncio.sleep(
                        BACKOFF_DELAY_SECONDS if consecutive_failures >= MAX_CONSECUTIVE_FAILURES else RETRY_DELAY_SECONDS
                    )
                    if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                        consecutive_failures = 0
                    continue

                consecutive_failures = 0
                new_sync_buf = response.get("get_updates_buf", "")
                if new_sync_buf:
                    self._sync_buf = new_sync_buf
                    self._save_sync_buf(self._sync_buf)
                    if hasattr(self._adapter, "set_sync_buf"):
                        self._adapter.set_sync_buf(self._sync_buf)

                for message in response.get("msgs", []):
                    asyncio.create_task(self._process_message_safe(message))

            except asyncio.CancelledError:
                break
            except Exception as exc:
                consecutive_failures += 1
                print(f"WeChat poll error ({consecutive_failures}/{MAX_CONSECUTIVE_FAILURES}): {exc}")
                await asyncio.sleep(
                    BACKOFF_DELAY_SECONDS if consecutive_failures >= MAX_CONSECUTIVE_FAILURES else RETRY_DELAY_SECONDS
                )
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    consecutive_failures = 0

    async def _get_updates(self, timeout_ms: int) -> dict[str, Any]:
        """Call iLink getupdates API."""
        if not self._http_session:
            raise RuntimeError("HTTP session not available")

        payload = {"get_updates_buf": self._sync_buf, "base_info": _base_info()}
        body = _json_dumps(payload)
        url = f"{self._base_url}/{EP_GET_UPDATES}"

        async def _do_request() -> dict[str, Any]:
            async with self._http_session.post(url, data=body, headers=_headers(self._token, body)) as response:
                raw = await response.text()
                if not response.ok:
                    raise RuntimeError(f"iLink getupdates HTTP {response.status}: {raw[:200]}")
                return json.loads(raw)

        try:
            return await asyncio.wait_for(_do_request(), timeout=timeout_ms / 1000)
        except asyncio.TimeoutError:
            # Timeout is expected for long-poll; return empty response
            return {"ret": 0, "msgs": [], "get_updates_buf": self._sync_buf}

    async def _process_message_safe(self, message: dict) -> None:
        """Process a message with error handling."""
        try:
            await self._process_message(message)
        except Exception as exc:
            print(f"WeChat message processing error: {exc}")

    async def _process_message(self, message: dict) -> None:
        """Process incoming WeChat message."""
        from_user_id = message.get("from_user_id", "").strip()
        if not from_user_id:
            return
        if from_user_id == self._account_id:
            return

        # Extract text from message
        text = ""
        item_list = message.get("item_list", [])
        for item in item_list:
            if item.get("type") == 1:  # ITEM_TEXT
                text = str((item.get("text_item") or {}).get("text") or "")
                break

        # Store context token for replies
        context_token = message.get("context_token", "").strip()
        if context_token and hasattr(self._adapter, "set_context_token"):
            self._adapter.set_context_token(from_user_id, context_token)

        # Determine chat type
        room_id = message.get("room_id", "").strip()
        chat_room_id = message.get("chat_room_id", "").strip()
        to_user_id = message.get("to_user_id", "").strip()
        is_group = bool(room_id or chat_room_id)

        if is_group:
            chat_id = room_id or chat_room_id or to_user_id
            chat_type = "group"
        else:
            chat_id = from_user_id
            chat_type = "private"

        # Create MessageEvent
        event = MessageEvent.from_wechat({
            "text": text,
            "from_user_id": from_user_id,
            "to_user_id": to_user_id,
            "room_id": room_id,
            "chat_room_id": chat_room_id,
            "context_token": context_token,
            "message": message,
        })

        # Forward to adapter
        await self._adapter.on_message(event)

    async def close(self) -> None:
        """Close the WeChat listener."""
        self._running = False
        if self._poll_task and not self._poll_task.done():
            self._poll_task.cancel()
            try:
                await self._poll_task
            except asyncio.CancelledError:
                pass
        if self._http_session and not self._http_session.closed:
            await self._http_session.close()

    def set_adapter(self, adapter: Any) -> None:
        """Set the adapter.

        Args:
            adapter: WeChatAdapter instance
        """
        self._adapter = adapter

    @property
    def client(self) -> aiohttp.ClientSession | None:
        """Get the HTTP session."""
        return self._http_session
