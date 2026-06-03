"""Tests for retrieve subsystem."""

import pytest

from sediman.search.sdk.retrieve import SearchHit


class TestSearchHit:
    def test_search_hit_creation(self):
        hit = SearchHit(
            url="https://example.com",
            title="Example Title",
            snippet="Example snippet content",
            source="google"
        )
        assert hit.url == "https://example.com"
        assert hit.title == "Example Title"
        assert hit.snippet == "Example snippet content"
        assert hit.source == "google"

    def test_search_hit_to_dict(self):
        hit = SearchHit(
            url="https://example.com",
            title="Example",
            snippet="Content",
            source="google"
        )
        data = hit.to_dict()
        assert data["url"] == "https://example.com"
        assert data["title"] == "Example"
        assert data["snippet"] == "Content"
        assert data["source"] == "google"

    def test_search_hit_defaults(self):
        hit = SearchHit(
            url="https://example.com",
            title="Example",
            snippet="Content"
        )
        assert hit.source == "google"  # Default source


class TestRetrievePrimitives:
    @pytest.mark.asyncio
    async def test_retrieve_init(self):
        from sediman.search.sdk.retrieve import RetrievePrimitives

        retrieve = RetrievePrimitives()
        assert retrieve is not None

    @pytest.mark.asyncio
    async def test_web_empty_query(self):
        from sediman.search.sdk.retrieve import RetrievePrimitives

        retrieve = RetrievePrimitives()
        # Empty query should return empty results
        result = await retrieve.web("", limit=10)
        assert result == []

    @pytest.mark.asyncio
    async def test_web_unsupported_provider(self):
        from sediman.search.sdk.retrieve import RetrievePrimitives

        retrieve = RetrievePrimitives()
        # Unsupported provider should return empty results
        result = await retrieve.web("test", provider="unsupported", limit=10)
        assert result == []

    @pytest.mark.asyncio
    async def test_web_many_empty_list(self):
        from sediman.search.sdk.retrieve import RetrievePrimitives

        retrieve = RetrievePrimitives()
        result = await retrieve.web_many([], concurrency=4)
        assert result == []

    @pytest.mark.asyncio
    async def test_web_many_concurrency_limit(self):
        from sediman.search.sdk.retrieve import RetrievePrimitives

        retrieve = RetrievePrimitives()
        # With 2 queries and concurrency of 1, should still work
        result = await retrieve.web_many(["q1", "q2"], concurrency=1)
        assert len(result) == 2  # Two empty lists
