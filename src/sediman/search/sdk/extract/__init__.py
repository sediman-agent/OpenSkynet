"""Extract subsystem for SearchSDK.

This module provides LLM-based structured extraction from web content.
"""

from __future__ import annotations

from typing import Any

from structlog import get_logger

from sediman.web.extract import web_extract

logger = get_logger()


class LLMPrimitives:
    """LLM-based extraction primitives for SearchSDK.

    Provides structured data extraction from web content using LLM.
    """

    def __init__(self) -> None:
        """Initialize LLM primitives."""
        self._llm_provider = None

    async def extract_many(
        self,
        hits: list[Any],
        schema: dict,
        instruction: str = "",
    ) -> list[dict]:
        """Extract structured data from multiple search hits.

        Args:
            hits: List of SearchHit objects
            schema: JSON schema for the output format
            instruction: Optional instruction for the LLM

        Returns:
            List of extracted dictionaries

        Example:
            ```python
            results = await sdk.extract.extract_many(
                hits,
                schema={"cve": str, "fix_version": str, "severity": str},
                instruction="Extract CVE information"
            )
            ```
        """
        if not hits:
            return []

        results = []

        for hit in hits:
            extracted = await self.extract_one(hit, schema, instruction)
            results.append(extracted)

        return results

    async def extract_one(
        self,
        hit: Any,
        schema: dict,
        instruction: str = "",
    ) -> dict:
        """Extract structured data from a single search hit.

        Args:
            hit: SearchHit object
            schema: JSON schema for the output format
            instruction: Optional instruction for the LLM

        Returns:
            Extracted dictionary

        Example:
            ```python
            result = await sdk.extract.extract_one(
                hit,
                schema={"title": str, "author": str, "date": str}
            )
            ```
        """
        try:
            # Fetch content from the URL
            result = await web_extract(url=hit.url, query=hit.title)

            if result.get("stats", {}).get("method") == "failed":
                logger.warning("extract_failed", url=hit.url)
                return {"error": "Failed to fetch content"}

            content = result.get("content", "")

            # TODO: Call LLM with structured output schema
            # For now, return a simple extraction
            return {
                "url": hit.url,
                "title": hit.title,
                "content_preview": content[:500] + "..." if len(content) > 500 else content,
            }

        except Exception as e:
            logger.error("extract_error", url=hit.url, error=str(e))
            return {"error": str(e)}

    async def plan(self, prompt: str) -> str:
        """Ask LLM to suggest search strategy/queries.

        Args:
            prompt: Prompt describing the research task

        Returns:
            Suggested strategy or queries

        Example:
            ```python
            strategy = await sdk.extract.plan(
                "Research Chrome CVEs from 2023-2025"
            )
            ```
        """
        # TODO: Implement LLM-based planning
        logger.info("extract_plan_not_implemented", prompt=prompt)
        return "Planning not yet implemented"


__all__ = ["LLMPrimitives"]
