"""Base search interface and data structures for unified search module.

This module provides the abstract base class that all search strategies must implement,
ensuring a consistent interface across different search types (skills, web, code, documents, etc.).
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class SearchResult:
    """Unified search result across all search types.

    This dataclass provides a consistent structure for search results
    regardless of the underlying search strategy.

    Attributes:
        title: Title or name of the result
        content: Main content or description
        url: Optional URL for web results or file paths
        score: Relevance score (0.0 to 1.0, higher is better)
        metadata: Optional metadata specific to the search type
    """
    title: str
    content: str
    url: str = ""
    score: float = 0.0
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert result to dictionary for serialization."""
        return {
            "title": self.title,
            "content": self.content,
            "url": self.url,
            "score": round(self.score, 4),
            "metadata": self.metadata,
        }


class SearchError(Exception):
    """Base exception for search-related errors.

    All search-specific exceptions should inherit from this class
    for consistent error handling across search strategies.
    """
    pass


class BaseSearchStrategy(ABC):
    """Abstract base class for all search strategies.

    All search strategies must inherit from this class and implement
    the required methods. This provides a unified interface for different
    search types (skill, web, code, document, etc.).

    The strategy pattern allows for:
    - Easy addition of new search types
    - Consistent API across all search implementations
    - Automatic strategy selection based on query analysis
    - Resource management via initialize/cleanup hooks

    Example implementation:
        ```python
        class MySearchStrategy(BaseSearchStrategy):
            @staticmethod
            def name() -> str:
                return "my_search"

            async def search(self, query: str, **kwargs) -> list[SearchResult]:
                # Implementation
                return results

            async def can_search(self, query: str) -> bool:
                # Check if we can handle this query
                return True
        ```
    """

    @staticmethod
    @abstractmethod
    def name() -> str:
        """Return unique name for this search strategy.

        This name is used for strategy registration and lookup.
        Must be unique across all registered strategies.

        Returns:
            Unique strategy name (e.g., "skill", "web", "code")
        """

    @abstractmethod
    async def search(
        self,
        query: str,
        limit: int = 10,
        offset: int = 0,
        filters: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> list[SearchResult]:
        """Execute search and return results.

        This is the main search method that all strategies must implement.

        Args:
            query: Search query string
            limit: Maximum number of results to return (default: 10)
            offset: Number of results to skip for pagination (default: 0)
            filters: Optional filters specific to the strategy
            **kwargs: Additional strategy-specific parameters

        Returns:
            List of SearchResult objects sorted by relevance (score descending)

        Raises:
            SearchError: If search fails catastrophically
        """

    @abstractmethod
    async def can_search(self, query: str) -> bool:
        """Check if this strategy can handle the given query.

        This is used for automatic strategy selection. A strategy
        should return True if it can meaningfully process the query.

        Examples:
            - Web search: True for most queries
            - Code search: True for queries with code patterns
            - Skill search: True for skill-related queries

        Args:
            query: Search query to evaluate

        Returns:
            True if this strategy can handle the query, False otherwise
        """

    async def initialize(self) -> None:
        """Initialize the strategy (optional).

        Called once when the strategy is first registered. Override this
        to set up resources like database connections, API clients, etc.

        Default implementation does nothing. Strategies that need
        initialization should override this method.
        """
        pass

    async def cleanup(self) -> None:
        """Cleanup resources (optional).

        Called when shutting down. Override this to release resources
        like database connections, file handles, etc.

        Default implementation does nothing. Strategies that allocate
        resources should override this method.
        """
        pass

    def get_schema(self) -> dict[str, Any]:
        """Return JSON schema for strategy parameters (optional).

        This can be used for validation, UI generation, or documentation.

        Returns:
            JSON schema describing accepted parameters
        """
        return {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "default": 10,
                    "minimum": 1,
                    "maximum": 100,
                },
                "offset": {
                    "type": "integer",
                    "default": 0,
                    "minimum": 0,
                },
            },
        }


__all__ = ["BaseSearchStrategy", "SearchResult", "SearchError"]
