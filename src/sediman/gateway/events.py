from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class MessageEvent:
    platform: str
    chat_id: str
    chat_type: str = "private"
    user_id: str = ""
    user_name: str = ""
    text: str = ""
    thread_id: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)
    is_command: bool = False
    command: str | None = None
    command_args: str | None = None

    @property
    def session_key(self) -> str:
        parts = ["agent", "main", self.platform, self.chat_type, self.chat_id]
        if self.thread_id:
            parts.append(self.thread_id)
        return ":".join(parts)

    @classmethod
    def from_telegram(cls, update: dict[str, Any]) -> MessageEvent:
        message = update.get("message", update.get("edited_message", {}))
        chat = message.get("chat", {})
        user = message.get("from", {})
        chat_type = chat.get("type", "private")
        chat_id = str(chat.get("id", ""))
        text = message.get("text", "")
        is_command = text.startswith("/")
        command = None
        command_args = None
        if is_command:
            parts = text.split(None, 1)
            command = parts[0].lower()
            command_args = parts[1] if len(parts) > 1 else None
        return cls(
            platform="telegram",
            chat_id=chat_id,
            chat_type=chat_type,
            user_id=str(user.get("id", "")),
            user_name=user.get("first_name", user.get("username", "")),
            text=text,
            raw=update,
            is_command=is_command,
            command=command,
            command_args=command_args,
        )

    @classmethod
    def from_discord(cls, message: Any) -> MessageEvent:
        channel = message.channel
        chat_type = "group" if hasattr(channel, 'guild') and channel.guild else "private"
        text = message.content or ""
        is_command = text.startswith("/") or text.startswith("!")
        command = None
        command_args = None
        if is_command:
            parts = text.split(None, 1)
            command = parts[0].lower()
            command_args = parts[1] if len(parts) > 1 else None

        # Extract server/guild ID for whitelist support
        server_id = None
        if hasattr(channel, 'guild') and channel.guild:
            server_id = str(channel.guild.id)

        return cls(
            platform="discord",
            chat_id=str(channel.id),
            chat_type=chat_type,
            user_id=str(message.author.id),
            user_name=message.author.name,
            text=text,
            thread_id=str(channel.id) if hasattr(channel, 'thread') else None,
            raw={
                "content": text,
                "author": str(message.author),
                "channel": str(channel),
                "server_id": server_id,
            },
            is_command=is_command,
            command=command,
            command_args=command_args,
        )

    @classmethod
    def from_slack(cls, event: dict[str, Any]) -> MessageEvent:
        text = event.get("text", "")
        channel = event.get("channel", "")
        user = event.get("user", "")
        is_command = text.startswith("/")
        command = None
        command_args = None
        if is_command:
            parts = text.split(None, 1)
            command = parts[0].lower()
            command_args = parts[1] if len(parts) > 1 else None
        chat_type = "group" if channel.startswith("C") else "private"
        return cls(
            platform="slack",
            chat_id=channel,
            chat_type=chat_type,
            user_id=user,
            text=text,
            raw=event,
            is_command=is_command,
            command=command,
            command_args=command_args,
        )
