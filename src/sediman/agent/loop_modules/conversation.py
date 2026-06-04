"""Conversation management for AgentLoop.

Handles conversation storage, retrieval, and compression.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:
    from sediman.agent.compressor import ContextCompressor
    from sediman.memory.strategy import BaseMemoryStrategy


class ConversationManager:
    """Manages conversation state and context compression."""

    def __init__(
        self,
        conversation_list: list[dict[str, str]] | None = None,
        conversation_getter: Callable[[], list[dict[str, str]]] | None = None,
        max_conversation: int = 40,
        context_window: int = 10,
        compressor: ContextCompressor | None = None,
        memory: BaseMemoryStrategy | None = None,
    ):
        self.max_conversation = max_conversation
        self.context_window = context_window
        self._compressor = compressor
        self._memory = memory
        # Store reference to external list
        self._conversation_ref = conversation_list
        # Store callable to get current conversation (for cases where reference might be replaced)
        self._conversation_getter = conversation_getter

    def _get_conversation(self) -> list[dict[str, str]]:
        """Get the current conversation list."""
        if self._conversation_getter:
            return self._conversation_getter()
        return self._conversation_ref if self._conversation_ref is not None else []

    def get_conversation(self) -> list[dict[str, str]]:
        """Get the current conversation history."""
        return list(self._get_conversation())

    def set_conversation(self, messages: list[dict[str, str]]) -> None:
        """Set the conversation history."""
        conv = self._get_conversation()
        conv.clear()
        conv.extend(messages)

    def clear_conversation(self) -> None:
        """Clear the conversation history."""
        self._get_conversation().clear()

    def append_user_message(self, content: str) -> None:
        """Append a user message to the conversation."""
        self._get_conversation().append({"role": "user", "content": content})
        self._trim_conversation()

    def append_assistant_message(self, content: str) -> None:
        """Append an assistant message to the conversation."""
        self._get_conversation().append({"role": "assistant", "content": content})
        self._trim_conversation()

    def append_messages(self, user_content: str, assistant_content: str) -> None:
        """Append both user and assistant messages."""
        conv = self._get_conversation()
        conv.append({"role": "user", "content": user_content})
        conv.append({"role": "assistant", "content": assistant_content})
        self._trim_conversation()

    def _trim_conversation(self) -> None:
        """Trim conversation to max_conversation size."""
        conv = self._get_conversation()
        if len(conv) > self.max_conversation:
            # Modify the list in place to maintain reference
            del conv[:-self.max_conversation]

    def get_recent_messages(self, count: int = 6) -> list[dict[str, str]]:
        """Get the most recent messages."""
        return self._get_conversation()[-count:]

    def has_conversation(self) -> bool:
        """Check if there is any conversation history."""
        return bool(self._get_conversation())

    def is_fresh_session(self) -> bool:
        """Check if this is a fresh session (empty conversation)."""
        return len(self._get_conversation()) == 0

    async def compress_context(self) -> int:
        """Compress conversation context if needed.

        Returns the number of messages removed.
        """
        conv = self._get_conversation()
        if not self._compressor:
            return 0

        if not self._compressor.should_compress(conv):
            return 0

        await self._memory.on_pre_compress() if self._memory else None
        before = len(conv)
        compressed = await self._compressor.compress(conv)
        # Update the list in place to maintain reference
        conv.clear()
        conv.extend(compressed)
        return before - len(compressed)

    def build_task_with_context(self, task: str) -> str:
        """Build a task string with conversation context.

        If there's conversation history, this adds context about previous
        discussions to help the agent continue from where it left off.
        """
        conv = self._get_conversation()
        if not conv:
            return task

        from sediman.utils import format_conversation_context
        context = format_conversation_context(conv, limit=self.context_window)

        return f"""Previous conversation context:
{context}

Current task: {task}

Note: Continue from where we left off. Remember what was discussed above."""
