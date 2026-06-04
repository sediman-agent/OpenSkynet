"""Web search strategy implementation.

This strategy provides web search functionality using Google search
and content extraction.
"""

from __future__ import annotations

from typing import Any

from structlog import get_logger

from ..base import BaseSearchStrategy, SearchResult, SearchError
from ..utils.parsers import parse_web_result

logger = get_logger()


class WebSearchStrategy(BaseSearchStrategy):
    """Search strategy for web search using Google.

    This strategy:
    - Uses Google search for finding results
    - Extracts content from web pages
    - Returns formatted search results
    """

    def __init__(self) -> None:
        """Initialize web search strategy."""
        self._initialized = False

    @staticmethod
    def name() -> str:
        """Return strategy name."""
        return "web"

    async def initialize(self) -> None:
        """Initialize the strategy."""
        self._initialized = True

    async def search(
        self,
        query: str,
        limit: int = 10,
        offset: int = 0,
        filters: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> list[SearchResult]:
        """Execute web search.

        Args:
            query: Search query
            limit: Maximum results (not used, returns single result)
            offset: Results offset (not used)
            filters: Optional filters
            **kwargs: Additional parameters

        Returns:
            List of search results (typically one aggregated result)
        """
        if not query or not query.strip():
            raise SearchError("query is required")

        try:
            from sediman.web.extract import web_extract

            # Build search URL
            encoded = __import__("urllib.parse", fromlist=["quote_plus"]).quote_plus(query.strip())
            search_url = f"https://www.google.com/search?q={encoded}&hl=en"

            # Extract content
            result = await web_extract(
                url=search_url,
                query=query,
            )

            content = result.get("content", "")
            stats = result.get("stats", {})

            if stats.get("method") == "failed" or not content.strip():
                raise SearchError(f"Web search failed for: {query}")

            # Return as single aggregated result
            return [
                SearchResult(
                    title=f"Web Search: {query}",
                    content=content,
                    url=search_url,
                    score=1.0,
                    metadata={
                        "source": "web",
                        "query": query,
                        "chars": len(content),
                        "method": stats.get("method", "unknown"),
                    },
                )
            ]

        except Exception as e:
            logger.warning("web_search_failed", error=str(e))
            raise SearchError(f"Web search error: {e}") from e

    async def can_search(self, query: str) -> bool:
        """Check if this strategy can handle the query.

        Args:
            query: Search query

        Returns:
            True for most queries (web search is very general)
        """
        # Web search can handle most queries
        return len(query.strip()) > 0

    def get_schema(self) -> dict[str, Any]:
        """Get JSON schema for parameters."""
        return {
            "type": "object",
            "properties": {
                "query": {"type": "string", "minLength": 1},
            },
            "required": ["query"],
        }


__all__ = ["WebSearchStrategy"]
