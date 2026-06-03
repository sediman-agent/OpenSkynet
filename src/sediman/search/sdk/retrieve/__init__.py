"""Retrieve subsystem for SearchSDK.

This module provides web search retrieval with support for multiple providers
and parallel execution.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from structlog import get_logger

from sediman.web.extract import web_extract

logger = get_logger()


@dataclass
class SearchHit:
    """A single search result from web search.

    Attributes:
        url: URL of the search result
        title: Title of the page
        snippet: Snippet/summary from search results
        source: Search provider that returned this result
    """
    url: str
    title: str
    snippet: str
    source: str = "google"

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "url": self.url,
            "title": self.title,
            "snippet": self.snippet,
            "source": self.source,
        }


class RetrievePrimitives:
    """Retrieve search results from web search providers.

    Supports:
    - Single query search with web()
    - Parallel multi-query search with web_many()
    - Multiple providers: Google, AgentBAnswer
    """

    def __init__(self) -> None:
        """Initialize retrieve primitives."""
        self._timeout = 30  # Default timeout for web requests

    async def web(
        self,
        query: str,
        provider: str = "google",
        limit: int = 10,
    ) -> list[SearchHit]:
        """Search the web for a single query.

        Args:
            query: Search query string
            provider: Search provider (google, agentbanswer)
            limit: Maximum number of results to return

        Returns:
            List of SearchHit objects

        Example:
            ```python
            hits = await sdk.retrieve.web("python async await")
            for hit in hits:
                print(f"{hit.title}: {hit.url}")
            ```
        """
        if provider == "google":
            return await self._search_google(query, limit)
        elif provider == "agentbanswer":
            return await self._search_agentbanswer(query, limit)
        else:
            logger.warning("retrieve_unsupported_provider", provider=provider)
            return []

    async def _search_google(self, query: str, limit: int) -> list[SearchHit]:
        """Search using Google web search."""
        try:
            # Build Google search URL
            encoded = __import__("urllib.parse", fromlist=["quote_plus"]).quote_plus(query)
            search_url = f"https://www.google.com/search?q={encoded}&hl=en"

            # Extract content
            result = await web_extract(url=search_url, query=query)

            if result.get("stats", {}).get("method") == "failed":
                logger.warning("retrieve_google_failed", query=query)
                return []

            content = result.get("content", "")

            # Return as search hit
            return [
                SearchHit(
                    url=search_url,
                    title=f"Results for: {query}",
                    snippet=content[:500] + "..." if len(content) > 500 else content,
                    source="google",
                )
            ]

        except Exception as e:
            logger.error("retrieve_google_error", query=query, error=str(e))
            return []

    async def _search_agentbanswer(self, query: str, limit: int) -> list[SearchHit]:
        """Search using AgentBAnswer provider."""
        # TODO: Implement AgentBAnswer API integration
        logger.info("retrieve_agentbanswer_not_implemented", query=query)
        return []

    async def web_many(
        self,
        queries: list[str],
        concurrency: int = 4,
        limit: int = 8,
        provider: str = "google",
    ) -> list[list[SearchHit]]:
        """Search the web for multiple queries in parallel.

        Args:
            queries: List of search query strings
            concurrency: Maximum number of concurrent searches
            limit: Maximum results per query
            provider: Search provider to use

        Returns:
            List of SearchHit lists (one list per query)

        Example:
            ```python
            queries = ["python async", "golang async", "rust async"]
            all_hits = await sdk.retrieve.web_many(queries, concurrency=3)

            for i, hits in enumerate(all_hits):
                print(f"{queries[i]}: {len(hits)} results")
            ```
        """
        if not queries:
            return []

        # Limit concurrency to avoid overwhelming the system
        concurrency = min(max(1, concurrency), len(queries))

        async def fetch_single(query: str) -> list[SearchHit]:
            return await self.web(query=query, provider=provider, limit=limit)

        # Create semaphore for concurrency control
        semaphore = asyncio.Semaphore(concurrency)

        async def bounded_fetch(query: str) -> list[SearchHit]:
            async with semaphore:
                return await fetch_single(query)

        # Execute all searches in parallel
        results = await asyncio.gather(
            *[bounded_fetch(q) for q in queries],
            return_exceptions=True,
        )

        # Handle any exceptions
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.warning("retrieve_many_failed", query=queries[i], error=str(result))
                processed_results.append([])
            else:
                processed_results.append(result)

        return processed_results


__all__ = ["RetrievePrimitives", "SearchHit"]
