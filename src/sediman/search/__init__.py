"""Unified search module with multiple search strategies.

This module provides a unified interface for different search types:
- Skill search (using vector embeddings and keywords)
- Web search (using Google and content extraction)
- Extensible for future search types (code, documents, etc.)

Usage:
    ```python
    from sediman.search import search, register_strategy

    # Search with auto-detected strategy
    results = await search("python async await")

    # Search with specific strategy
    results = await search("query", strategy="skill")

    # Register custom strategy
    from sediman.search.base import BaseSearchStrategy

    class MyStrategy(BaseSearchStrategy):
        @staticmethod
        def name() -> str:
            return "my_strategy"

        async def search(self, query: str, **kwargs):
            return [...]

    register_strategy(MyStrategy)
    ```
"""

from __future__ import annotations

from typing import Any

from structlog import get_logger

from .base import BaseSearchStrategy, SearchError, SearchResult
from .config import SEARCH_DEFAULT_ENGINE
from .strategies import SkillSearchStrategy, WebSearchStrategy

logger = get_logger()

# Strategy registry
SEARCH_STRATEGIES: dict[str, type[BaseSearchStrategy]] = {}


def register_strategy(cls: type[BaseSearchStrategy]) -> None:
    """Register a search strategy.

    Args:
        cls: Strategy class to register

    Example:
        ```python
        @register_strategy
        class MyStrategy(BaseSearchStrategy):
            ...
        ```
    """
    name = cls.name()
    if name in SEARCH_STRATEGIES:
        logger.warning("search_strategy_already_registered", name=name)
    SEARCH_STRATEGIES[name] = cls
    logger.info("search_strategy_registered", name=name)


def get_strategy(name: str) -> BaseSearchStrategy | None:
    """Get registered strategy by name.

    Args:
        name: Strategy name

    Returns:
        Strategy instance, or None if not found
    """
    cls = SEARCH_STRATEGIES.get(name)
    if cls is None:
        return None
    return cls()


def list_strategies() -> list[str]:
    """List all registered strategy names.

    Returns:
        List of strategy names
    """
    return list(SEARCH_STRATEGIES.keys())


async def search(
    query: str,
    strategy: str | None = None,
    limit: int = 10,
    offset: int = 0,
    filters: dict[str, Any] | None = None,
    **kwargs: Any,
) -> list[SearchResult]:
    """Execute unified search.

    This is the main entry point for search functionality. It can:
    - Auto-detect the best strategy based on query
    - Use a specific strategy if provided
    - Fall back through available strategies

    Args:
        query: Search query
        strategy: Optional specific strategy name
        limit: Maximum results to return
        offset: Results offset for pagination
        filters: Optional filters specific to strategy
        **kwargs: Additional strategy-specific parameters

    Returns:
        List of search results

    Raises:
        SearchError: If all strategies fail or no strategy available

    Example:
        ```python
        # Auto-detect strategy
        results = await search("python programming")

        # Use specific strategy
        results = await search("query", strategy="web")

        # With filters
        results = await search(
            "machine learning",
            filters={"scope": "external"},
        )
        ```
    """
    if not query or not query.strip():
        return []

    # Use specific strategy if provided
    if strategy and strategy != "auto":
        instance = get_strategy(strategy)
        if instance is None:
            raise SearchError(f"Unknown search strategy: {strategy}")
        return await instance.search(
            query=query,
            limit=limit,
            offset=offset,
            filters=filters,
            **kwargs,
        )

    # Auto-detect strategy
    if strategy == "auto" or strategy is None:
        # Try strategies in order of preference
        strategy_order = ["skill", "web"]

        for strategy_name in strategy_order:
            instance = get_strategy(strategy_name)
            if instance is None:
                continue

            try:
                if await instance.can_search(query):
                    results = await instance.search(
                        query=query,
                        limit=limit,
                        offset=offset,
                        filters=filters,
                        **kwargs,
                    )
                    if results:
                        return results
            except Exception as e:
                logger.warning("search_strategy_failed", strategy=strategy_name, error=str(e))
                continue

        # If all strategies failed, return empty list
        logger.warning("search_all_strategies_failed", query=query)
        return []

    raise SearchError(f"Invalid strategy specification: {strategy}")


async def initialize_all() -> None:
    """Initialize all registered strategies.

    This should be called once at application startup to ensure
    all strategies are ready to handle searches.
    """
    for name in list_strategies():
        instance = get_strategy(name)
        if instance:
            try:
                await instance.initialize()
                logger.info("search_strategy_initialized", name=name)
            except Exception as e:
                logger.warning("search_strategy_init_failed", name=name, error=str(e))


async def cleanup_all() -> None:
    """Cleanup all registered strategies.

    This should be called once at application shutdown to ensure
    all strategies release resources properly.
    """
    for name in list_strategies():
        instance = get_strategy(name)
        if instance:
            try:
                await instance.cleanup()
                logger.info("search_strategy_cleanup", name=name)
            except Exception as e:
                logger.warning("search_strategy_cleanup_failed", name=name, error=str(e))


# Register built-in strategies
register_strategy(SkillSearchStrategy)
register_strategy(WebSearchStrategy)

__all__ = [
    "BaseSearchStrategy",
    "SearchError",
    "SearchResult",
    "register_strategy",
    "get_strategy",
    "list_strategies",
    "search",
    "initialize_all",
    "cleanup_all",
    "SEARCH_STRATEGIES",
]
