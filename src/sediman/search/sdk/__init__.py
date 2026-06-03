"""SearchSDK module for complex search orchestration.

This module provides the SearchSDK class that composes all search subsystems.
"""

from __future__ import annotations

from .retrieve import RetrievePrimitives
from .filter import FilterPrimitives
from .extract import LLMPrimitives
from .state import StatePrimitives


class SearchSDK:
    """Search SDK for orchestrating complex search pipelines.

    This SDK provides four main subsystems:

    - **retrieve**: Fetch search results from multiple sources with parallel execution
    - **filter**: Deterministically filter results by domain, regex, keywords, etc.
    - **extract**: Extract structured data from content using LLM
    - **state**: Persist and load intermediate state across turns

    Example:
        ```python
        sdk = SearchSDK()

        # Fetch multiple queries in parallel
        queries = ["python async", "golang async", "rust async"]
        hits = await sdk.retrieve.web_many(queries, concurrency=3)

        # Filter results
        filtered = sdk.filter.by_domain(hits, exclude=["spam.com"])

        # Extract structured data
        results = await sdk.extract.extract_many(
            filtered,
            schema={"language": str, "feature": str, "example": str}
        )

        # Save state
        sdk.state.save("async_comparison", results)
        ```
    """

    def __init__(self) -> None:
        """Initialize SearchSDK with all subsystems."""
        self.retrieve = RetrievePrimitives()
        self.filter = FilterPrimitives()
        self.extract = LLMPrimitives()
        self.state = StatePrimitives()


__all__ = ["SearchSDK"]
