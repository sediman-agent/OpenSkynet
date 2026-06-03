"""Tests for unified search module and registry."""

import pytest

from sediman.search import (
    BaseSearchStrategy,
    SearchError,
    SearchResult,
    cleanup_all,
    get_strategy,
    initialize_all,
    list_strategies,
    register_strategy,
    search,
)


class MockStrategy(BaseSearchStrategy):
    """Mock strategy for testing."""

    @staticmethod
    def name() -> str:
        return "mock_test"

    async def search(self, query: str, limit=10, offset=0, filters=None, **kwargs):
        return [
            SearchResult(
                title=f"Mock Result {i}",
                content=f"Content for {query}",
                score=0.9 - i * 0.1,
            )
            for i in range(min(limit, 3))
        ]

    async def can_search(self, query: str) -> bool:
        return "mock" in query.lower()


class TestStrategyRegistry:
    def test_register_strategy(self):
        initial_count = len(list_strategies())
        register_strategy(MockStrategy)
        assert len(list_strategies()) == initial_count + 1
        assert "mock_test" in list_strategies()

    def test_get_strategy(self):
        register_strategy(MockStrategy)
        strategy = get_strategy("mock_test")
        assert strategy is not None
        assert isinstance(strategy, BaseSearchStrategy)

    def test_get_unknown_strategy(self):
        strategy = get_strategy("unknown_strategy_xyz")
        assert strategy is None

    def test_list_strategies(self):
        strategies = list_strategies()
        assert isinstance(strategies, list)
        assert len(strategies) > 0  # At least skill and web
        assert "skill" in strategies
        assert "web" in strategies


class TestUnifiedSearch:
    @pytest.mark.asyncio
    async def test_search_with_specific_strategy(self):
        register_strategy(MockStrategy)
        results = await search("mock query", strategy="mock_test")
        assert len(results) > 0
        assert all(isinstance(r, SearchResult) for r in results)

    @pytest.mark.asyncio
    async def test_search_with_unknown_strategy(self):
        with pytest.raises(SearchError):
            await search("test", strategy="unknown_xyz")

    @pytest.mark.asyncio
    async def test_search_with_empty_query(self):
        results = await search("")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_with_whitespace_query(self):
        results = await search("   ")
        assert results == []

    @pytest.mark.asyncio
    async def test_search_auto_detect(self):
        # Test auto-detection with skill strategy
        results = await search("python", strategy="auto")
        # Should return results from skill or web search
        assert isinstance(results, list)

    @pytest.mark.asyncio
    async def test_search_with_limit(self):
        register_strategy(MockStrategy)
        results = await search("mock query", strategy="mock_test", limit=2)
        assert len(results) <= 2

    @pytest.mark.asyncio
    async def test_search_with_offset(self):
        register_strategy(MockStrategy)
        results = await search("mock query", strategy="mock_test", limit=5, offset=1)
        # Offset should skip first result
        assert isinstance(results, list)


class TestStrategyLifecycle:
    @pytest.mark.asyncio
    async def test_initialize_all(self):
        await initialize_all()
        # Should not raise any errors

    @pytest.mark.asyncio
    async def test_cleanup_all(self):
        await cleanup_all()
        # Should not raise any errors

    @pytest.mark.asyncio
    async def test_strategy_initialize_cleanup(self):
        strategy = MockStrategy()
        await strategy.initialize()
        await strategy.cleanup()
        # Should not raise any errors


class TestSearchError:
    def test_search_error_creation(self):
        error = SearchError("Test error")
        assert str(error) == "Test error"
        assert isinstance(error, Exception)

    def test_search_error_raised(self):
        with pytest.raises(SearchError, match="Test error"):
            raise SearchError("Test error")
