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
        chat_type = "group" if channel.startswith("C") or channel.startswith("G") else "private"
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

    @classmethod
    def from_whatsapp(cls, entry: dict[str, Any]) -> MessageEvent:
        """Create MessageEvent from WhatsApp webhook payload."""
        # WhatsApp webhooks have nested structure
        entries = entry.get("entry", [])
        if not entries:
            return cls(platform="whatsapp", chat_id="", text="", raw=entry)

        changes = entries[0].get("changes", [])
        if not changes:
            return cls(platform="whatsapp", chat_id="", text="", raw=entry)

        value = changes[0].get("value", {})
        messages = value.get("messages", [])
        if not messages:
            return cls(platform="whatsapp", chat_id="", text="", raw=entry)

        message = messages[0]
        text = message.get("text", {}).get("body", "")
        user_id = message.get("from")  # Phone number
        chat_id = user_id  # WhatsApp is 1:1
        phone_id = value.get("metadata", {}).get("phone_number_id", "")

        # WhatsApp doesn't have commands - all messages go to agent
        return cls(
            platform="whatsapp",
            chat_id=chat_id,
            chat_type="private",
            user_id=user_id,
            text=text,
            raw={"phone_id": phone_id, "entry": entry},
            is_command=False,
            command=None,
            command_args=None,
        )

    @classmethod
    def from_lark(cls, event: dict[str, Any]) -> MessageEvent:
        """Create MessageEvent from Lark webhook payload."""
        # Lark events are nested
        event_json = event.get("event", {})
        text = event_json.get("text", "")

        # Extract plain text from rich text if needed
        if isinstance(text, str):
            pass  # Already plain text
        elif isinstance(text, list):
            # Rich text structure - extract text content
            text = "".join([t.get("text", "") for t in text if t.get("type") == "text"])
        else:
            text = str(text)

        sender = event_json.get("sender", {})
        user_id = sender.get("sender_id", {}).get("open_id", "")
        user_name = sender.get("sender_name", "")

        root_id = event_json.get("root_id", "")
        chat_id = event_json.get("chat_id", "")
        chat_type = "group" if root_id else "private"

        is_command = text.startswith("/")
        command = None
        command_args = None
        if is_command:
            parts = text.split(None, 1)
            command = parts[0].lower()
            command_args = parts[1] if len(parts) > 1 else None

        return cls(
            platform="lark",
            chat_id=chat_id,
            chat_type=chat_type,
            user_id=user_id,
            user_name=user_name,
            text=text,
            raw=event,
            is_command=is_command,
            command=command,
            command_args=command_args,
        )

    @classmethod
    def from_wechat(cls, event: dict[str, Any]) -> MessageEvent:
        """Create MessageEvent from WeChat iLink Bot API payload."""
        text = event.get("text", "")
        from_user_id = event.get("from_user_id", "")
        to_user_id = event.get("to_user_id", "")
        room_id = event.get("room_id", "")
        chat_room_id = event.get("chat_room_id", "")

        # Determine chat type
        is_group = bool(room_id or chat_room_id)
        chat_type = "group" if is_group else "private"

        # Set chat_id
        if is_group:
            chat_id = room_id or chat_room_id or to_user_id
        else:
            chat_id = from_user_id

        # WeChat doesn't use slash commands in the same way
        # Commands would be detected by the agent, not the platform
        is_command = False
        command = None
        command_args = None

        return cls(
            platform="wechat",
            chat_id=chat_id,
            chat_type=chat_type,
            user_id=from_user_id,
            user_name="",  # WeChat user name would need to be fetched separately
            text=text,
            raw=event,
            is_command=is_command,
            command=command,
            command_args=command_args,
        )
