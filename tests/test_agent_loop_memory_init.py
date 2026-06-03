"""Test AgentLoop memory initialization to ensure _memory is always set."""

from unittest.mock import MagicMock
import pytest

from sediman.agent.loop import AgentLoop
from sediman.memory.strategy import BaseMemoryStrategy


class FakeMemoryStrategy(BaseMemoryStrategy):
    """Fake memory strategy for testing."""

    def __init__(self):
        self.initialized = False
        self.entries = []

    @staticmethod
    def name() -> str:
        return "fake_memory"

    async def initialize(self):
        self.initialized = True

    async def write(self, target: str, content: str, **metadata):
        self.entries.append({"target": target, "content": content})
        return True

    async def search(self, query: str, limit=5):
        return []

    async def replace(self, target: str, old_content: str, new_content: str):
        return True

    async def remove(self, target: str, content: str):
        return True

    def context(self, task: str, max_chars: int = 1500):
        return ""

    async def review(self, conversation):
        return []

    async def on_turn_start(self):
        pass

    async def on_session_end(self):
        pass

    async def on_pre_compress(self):
        pass

    def should_review(self, turn_count: int):
        return False

    def get_tool_schema(self):
        return None

    def get_tool_schemas(self):
        return []

    async def handle_tool_call(self, tool_name: str, arguments: dict):
        return ""

    def version(self):
        return "1.0.0"

    def to_dict(self):
        return {"name": self.name()}


def test_agent_loop_with_custom_memory():
    """Test that AgentLoop properly sets _memory when custom memory is provided."""
    llm = MagicMock()
    browser = MagicMock()
    custom_memory = FakeMemoryStrategy()

    # This should not raise AttributeError for _memory
    loop = AgentLoop(
        llm_provider=llm,
        browser_session=browser,
        memory=custom_memory,
        max_steps=5
    )

    # Verify _memory is set
    assert loop._memory is not None
    assert loop._memory is custom_memory


def test_agent_loop_without_memory():
    """Test that AgentLoop creates default memory when none is provided."""
    llm = MagicMock()
    browser = MagicMock()

    # This should create default memory
    loop = AgentLoop(
        llm_provider=llm,
        browser_session=browser,
        memory=None,
        max_steps=5
    )

    # Verify _memory is set
    assert loop._memory is not None
    assert hasattr(loop, '_memory_initialized')
    assert loop._memory_initialized is False


def test_agent_loop_memory_attributes():
    """Test that AgentLoop has all required memory-related attributes."""
    llm = MagicMock()
    browser = MagicMock()

    loop = AgentLoop(
        llm_provider=llm,
        browser_session=browser,
        max_steps=5
    )

    # These should all exist and not raise AttributeError
    assert hasattr(loop, '_memory')
    assert hasattr(loop, '_memory_initialized')
    assert hasattr(loop, '_cached_memory_context')

    # _memory should be a BaseMemoryStrategy instance
    from sediman.memory.strategy import BaseMemoryStrategy
    assert isinstance(loop._memory, BaseMemoryStrategy)
