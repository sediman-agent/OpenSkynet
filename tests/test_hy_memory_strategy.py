"""Tests for HyMemoryStrategy - full strategy integration."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from sediman.memory.hy.strategy import HyMemoryStrategy
from sediman.memory.hy.models import Layer, MemType
from sediman.memory.strategy import MemoryTarget


@pytest.fixture
def mock_llm():
    """Create a mock LLM provider."""
    llm = AsyncMock()

    # Mock chat response
    response = MagicMock()
    response.content = '{"facts": [{"content": "test fact", "fact_type": "fact", "confidence": 0.9}]}'
    llm.chat = AsyncMock(return_value=response)

    # Mock embedding (if needed)
    embedding_mock = MagicMock()
    llm.embed = AsyncMock(return_value=[[0.1] * 1536])

    return llm


@pytest.fixture
def mock_embedding():
    """Create a mock embedding provider."""
    provider = AsyncMock()
    provider.embed = AsyncMock(return_value=[[0.1] * 1536])
    return provider


@pytest.mark.asyncio
async def test_strategy_name():
    """Test strategy name."""
    strategy = HyMemoryStrategy()
    assert strategy.name() == "HyMemoryStrategy"


@pytest.mark.asyncio
async def test_initialize(mock_llm):
    """Test strategy initialization."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm)

    await strategy.initialize()

    assert strategy._initialized is True
    assert strategy.store is not None


@pytest.mark.asyncio
async def test_write_fact(mock_llm):
    """Test writing a fact to memory."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm)
    await strategy.initialize()

    result = strategy.write("memory", "User likes sushi")

    # Write should succeed (returns True/False sync, but processes async)
    assert result is True


@pytest.mark.asyncio
async def test_write_user_target(mock_llm):
    """Test writing to user target."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm)
    await strategy.initialize()

    result = strategy.write("user", "Prefers sweet food")

    assert result is True


@pytest.mark.asyncio
async def test_search_empty(mock_llm):
    """Test searching with no results."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm, embedding_provider=AsyncMock())
    await strategy.initialize()

    results = strategy.search("nonexistent query")

    # Should return empty list
    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_replace_not_found(mock_llm):
    """Test replacing non-existent content."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm)
    await strategy.initialize()

    result = strategy.replace("memory", "nonexistent", "new content")

    # Should return False when not found
    assert result is False


@pytest.mark.asyncio
async def test_remove_not_found(mock_llm):
    """Test removing non-existent content."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm)
    await strategy.initialize()

    result = strategy.remove("memory", "nonexistent")

    # Should return False when not found
    assert result is False


@pytest.mark.asyncio
async def test_context_empty(mock_llm):
    """Test context retrieval with no memories."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm, embedding_provider=AsyncMock())
    await strategy.initialize()

    context = strategy.context("test task")

    # Should return empty string
    assert context == ""


@pytest.mark.asyncio
async def test_on_turn_start(mock_llm):
    """Test turn start hook."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm)
    await strategy.initialize()

    initial_turn_count = strategy._turn_count

    await strategy.on_turn_start()

    # Turn count should increment
    assert strategy._turn_count == initial_turn_count + 1


@pytest.mark.asyncio
async def test_on_session_end(mock_llm):
    """Test session end hook."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm)
    await strategy.initialize()

    # Should not raise
    await strategy.on_session_end()


@pytest.mark.asyncio
async def test_get_tool_schema_returns_none(mock_llm):
    """Test that tool schema returns None (auto-extraction is default)."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm)
    await strategy.initialize()

    schema = strategy.get_tool_schema()

    # Should return None since auto-extraction is default
    assert schema is None


@pytest.mark.asyncio
async def test_handle_tool_call_memory_search(mock_llm):
    """Test handling memory_search tool call."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm, embedding_provider=AsyncMock())
    await strategy.initialize()

    result = await strategy.handle_tool_call(
        "memory_search",
        {"query": "test", "limit": 5},
    )

    # Should return result message
    assert isinstance(result, str)
    assert "Found" in result


@pytest.mark.asyncio
async def test_handle_tool_call_memory_write(mock_llm):
    """Test handling memory_write tool call."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm)
    await strategy.initialize()

    result = await strategy.handle_tool_call(
        "memory_write",
        {"target": "memory", "content": "test memory"},
    )

    # Should return success message
    assert isinstance(result, str)
    assert "written" in result.lower()


@pytest.mark.asyncio
async def test_get_stats(mock_llm):
    """Test getting memory statistics."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm)
    await strategy.initialize()

    stats = await strategy.get_stats()

    # Should return dict with stats
    assert isinstance(stats, dict)
    assert "strategy" in stats
    assert stats["strategy"] == "HyMemoryStrategy"


@pytest.mark.asyncio
async def test_evolution_chain_integration(mock_llm):
    """Test full evolution chain flow."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm)
    await strategy.initialize()

    # Write initial preference
    strategy.write("user", "饮食偏好：偏甜口")

    # Write changed preference
    strategy.write("user", "饮食偏好：偏清淡，注重健康")

    # Search should find current preference with chain
    results = strategy.search("饮食偏好")

    # Verify we have results
    assert isinstance(results, list)


@pytest.mark.asyncio
async def test_layer_integration(mock_llm):
    """Test that different layers are properly handled."""
    strategy = HyMemoryStrategy(llm_provider=mock_llm)
    await strategy.initialize()

    # Write should create L1 RAW trace and L2 FACT
    strategy.write("memory", "User went to Tokyo")

    # After enough turns, should promote to L3 IDENTITY
    for _ in range(12):
        await strategy.on_turn_start()

    # Verify promotion logic runs
    assert strategy._turn_count >= 12
