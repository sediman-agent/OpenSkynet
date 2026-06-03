"""Skill search tool using unified search module."""

from __future__ import annotations

from typing import Any

import structlog

from sediman.agent.tool_dispatch import ToolResult
from sediman.search import search

logger = structlog.get_logger()


async def _handle_skill_search(
    query: str,
    scope: str = "all",
    k: int = 5,
    **kwargs: Any,
) -> ToolResult:
    """Handle skill search requests.

    Args:
        query: Search query
        scope: Search scope (all, external, internal)
        k: Number of results to return
        **kwargs: Additional parameters

    Returns:
        ToolResult with search results
    """
    try:
        # Use unified search module
        filters = {"scope": scope} if scope != "all" else None
        results = await search(query=query, limit=k, filters=filters, **kwargs)

        if not results:
            return ToolResult(
                success=True,
                output=f"No skills found matching '{query}'.",
                data={"results": [], "query": query, "scope": scope},
            )

        lines = [f"Found {len(results)} skill(s) for '{query}':\n"]
        for i, r in enumerate(results, 1):
            # Extract metadata
            metadata = r.metadata or {}
            source = metadata.get("source", "unknown")
            scope_tag = "[internal]" if source == "local" else "[external]"

            lines.append(
                f"  {i}. {scope_tag} {r.title} "
                f"(score: {r.score:.2f}, source: {source})"
            )
            lines.append(f"     {r.content[:200]}")
            lines.append("")

        return ToolResult(
            success=True,
            output="\n".join(lines),
            data={
                "results": [r.to_dict() for r in results],
                "query": query,
                "scope": scope,
            },
        )

    except Exception as e:
        logger.error("skill_search_failed", error=str(e))
        return ToolResult(
            success=False,
            output=f"Skill search failed: {e}",
        )
