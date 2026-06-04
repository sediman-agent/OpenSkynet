"""Tests for WebSearchStrategy ensuring parameter compatibility."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from sediman.search.strategies.web_search import WebSearchStrategy
from sediman.search.base import SearchError


class TestWebSearchStrategyInit:
    """Test WebSearchStrategy initialization."""

    def test_initialization(self):
        """Test that WebSearchStrategy can be initialized."""
        strategy = WebSearchStrategy()
        assert strategy is not None

    @pytest.mark.asyncio
    async def test_can_search(self):
        """Test can_search method."""
        strategy = WebSearchStrategy()
        assert await strategy.can_search("test query") is True
        assert await strategy.can_search("") is False
        assert await strategy.can_search("   ") is False


class TestWebSearchStrategySearch:
    """Test WebSearchStrategy.search() method."""

    @pytest.fixture
    def strategy(self):
        """Create a WebSearchStrategy instance."""
        return WebSearchStrategy()

    @pytest.mark.asyncio
    async def test_search_with_valid_query(self, strategy):
        """Test search with a valid query."""
        with patch('sediman.web.extract.web_extract') as mock_extract:
            mock_extract.return_value = {
                "content": "Test search results",
                "stats": {"method": "http", "title": "Test Title"},
            }

            results = await strategy.search(query="test query")

            assert len(results) == 1
            assert results[0].content == "Test search results"
            assert results[0].title == "Web Search: test query"

    @pytest.mark.asyncio
    async def test_search_without_unsupported_parameters(self, strategy):
        """Test that search doesn't pass timeout/max_length to web_extract."""
        with patch('sediman.web.extract.web_extract') as mock_extract:
            mock_extract.return_value = {
                "content": "Test results",
                "stats": {"method": "http"},
            }

            # Call search with various parameters
            await strategy.search(
                query="test",
                limit=5,
                offset=0,
                timeout=30,  # Should not be passed to web_extract
                max_length=10000,  # Should not be passed to web_extract
                extra_param="value",  # Should not be passed to web_extract
            )

            # Verify web_extract was called with only supported parameters
            call_args = mock_extract.call_args
            assert call_args is not None

            # Check that only url and query were passed
            kwargs = call_args.kwargs
            assert 'url' in kwargs
            assert 'query' in kwargs
            # These should NOT be in kwargs
            assert 'timeout' not in kwargs
            assert 'max_length' not in kwargs
            assert 'max_chars' not in kwargs

    @pytest.mark.asyncio
    async def test_search_with_empty_query(self, strategy):
        """Test search with an empty query raises SearchError."""
        with pytest.raises(SearchError, match="query is required"):
            await strategy.search(query="")

    @pytest.mark.asyncio
    async def test_search_with_whitespace_query(self, strategy):
        """Test search with whitespace query raises SearchError."""
        with pytest.raises(SearchError, match="query is required"):
            await strategy.search(query="   ")

    @pytest.mark.asyncio
    async def test_search_handles_web_extract_failure(self, strategy):
        """Test search handles web_extract failure gracefully."""
        with patch('sediman.web.extract.web_extract') as mock_extract:
            mock_extract.return_value = {
                "content": "",
                "stats": {"method": "failed"},
            }

            with pytest.raises(SearchError, match="Web search failed"):
                await strategy.search(query="test query")

    @pytest.mark.asyncio
    async def test_search_handles_exception(self, strategy):
        """Test search handles exceptions from web_extract."""
        with patch('sediman.web.extract.web_extract') as mock_extract:
            mock_extract.side_effect = Exception("Network error")

            with pytest.raises(SearchError, match="Web search error"):
                await strategy.search(query="test query")


class TestWebSearchStrategySchema:
    """Test WebSearchStrategy schema."""

    def test_get_schema(self):
        """Test that schema only includes supported parameters."""
        strategy = WebSearchStrategy()
        schema = strategy.get_schema()

        # Should have query parameter
        assert 'query' in schema['properties']
        assert schema['properties']['query']['type'] == 'string'

        # Should NOT have unsupported parameters
        assert 'timeout' not in schema['properties']
        assert 'max_length' not in schema['properties']

        # Should require query
        assert 'query' in schema['required']


class TestWebSearchStrategyIntegration:
    """Integration tests for WebSearchStrategy."""

    @pytest.fixture
    def strategy(self):
        """Create a WebSearchStrategy instance."""
        return WebSearchStrategy()

    @pytest.mark.asyncio
    async def test_search_url_encoding(self, strategy):
        """Test that search query is properly URL encoded."""
        with patch('sediman.web.extract.web_extract') as mock_extract:
            mock_extract.return_value = {
                "content": "Results",
                "stats": {"method": "http"},
            }

            await strategy.search(query="test with spaces & symbols")

            # Verify the URL was encoded properly
            call_args = mock_extract.call_args
            url = call_args.kwargs['url']
            assert 'test+with+spaces' in url or 'test%20with%20spaces' in url

    @pytest.mark.asyncio
    async def test_search_result_structure(self, strategy):
        """Test that search returns properly structured results."""
        with patch('sediman.web.extract.web_extract') as mock_extract:
            mock_extract.return_value = {
                "content": "Search results content",
                "stats": {
                    "method": "http",
                    "title": "Test Page",
                    "chars": 100,
                },
            }

            results = await strategy.search(query="test")

            assert len(results) == 1
            result = results[0]
            assert result.title == "Web Search: test"
            assert result.content == "Search results content"
            assert result.url.startswith("https://www.google.com/search")
            assert result.metadata['source'] == 'web'
            assert result.metadata['query'] == 'test'
            # Check that chars is a number (actual content length may vary)
            assert isinstance(result.metadata['chars'], int)
            assert result.metadata['chars'] > 0
