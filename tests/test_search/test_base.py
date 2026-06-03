"""Tests for search base module."""

import pytest

from sediman.search.base import BaseSearchStrategy, SearchError, SearchResult


class MockSearchStrategy(BaseSearchStrategy):
    """Mock strategy for testing."""

    @staticmethod
    def name() -> str:
        return "mock"

    async def search(self, query: str, **kwargs):
        return [
            SearchResult(
                title=f"Result for {query}",
                content=f"Content for {query}",
                score=0.9,
            )
        ]

    async def can_search(self, query: str) -> bool:
        return len(query) > 0


class TestSearchResult:
    def test_search_result_creation(self):
        result = SearchResult(
            title="Test",
            content="Content",
            url="https://example.com",
            score=0.8,
        )
        assert result.title == "Test"
        assert result.content == "Content"
        assert result.url == "https://example.com"
        assert result.score == 0.8
        assert result.metadata == {}

    def test_search_result_with_metadata(self):
        result = SearchResult(
            title="Test",
            content="Content",
            metadata={"key": "value"},
        )
        assert result.metadata == {"key": "value"}

    def test_search_result_to_dict(self):
        result = SearchResult(
            title="Test",
            content="Content",
            score=0.8567,
            url="https://example.com",
            metadata={"key": "value"},
        )
        data = result.to_dict()
        assert data["title"] == "Test"
        assert data["content"] == "Content"
        assert data["score"] == 0.8567  # Rounded
        assert data["url"] == "https://example.com"
        assert data["metadata"] == {"key": "value"}


class TestSearchError:
    def test_search_error_creation(self):
        error = SearchError("Test error")
        assert str(error) == "Test error"
        assert isinstance(error, Exception)


class TestBaseSearchStrategy:
    @pytest.mark.asyncio
    async def test_mock_strategy_name(self):
        strategy = MockSearchStrategy()
        assert strategy.name() == "mock"

    @pytest.mark.asyncio
    async def test_mock_strategy_search(self):
        strategy = MockSearchStrategy()
        results = await strategy.search("test query")
        assert len(results) == 1
        assert results[0].title == "Result for test query"
        assert results[0].score == 0.9

    @pytest.mark.asyncio
    async def test_mock_strategy_can_search(self):
        strategy = MockSearchStrategy()
        assert await strategy.can_search("query") is True
        assert await strategy.can_search("") is False

    @pytest.mark.asyncio
    async def test_initialize_default(self):
        strategy = MockSearchStrategy()
        await strategy.initialize()  # Should not raise
        # Default implementation does nothing

    @pytest.mark.asyncio
    async def test_cleanup_default(self):
        strategy = MockSearchStrategy()
        await strategy.cleanup()  # Should not raise
        # Default implementation does nothing

    def test_get_schema_default(self):
        strategy = MockSearchStrategy()
        schema = strategy.get_schema()
        assert schema["type"] == "object"
        assert "properties" in schema
        assert "limit" in schema["properties"]
        assert "offset" in schema["properties"]
