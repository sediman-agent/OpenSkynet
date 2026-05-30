from __future__ import annotations

from typing import Any

import structlog

from sediman.agent.tool_dispatch import ToolResult

logger = structlog.get_logger()


async def _handle_skill_search(
    query: str,
    scope: str = "all",
    k: int = 5,
    **kwargs: Any,
) -> ToolResult:
    try:
        from sediman.skills.search import SkillSearchEngine

        engine = SkillSearchEngine()
        results = await engine.search(query=query, scope=scope, k=k)

        if not results:
            return ToolResult(
                success=True,
                output=f"No skills found matching '{query}'.",
                data={"results": [], "query": query, "scope": scope},
            )

        lines = [f"Found {len(results)} skill(s) for '{query}':\n"]
        for i, r in enumerate(results, 1):
            scope_tag = "[internal]" if r.scope == "internal" else "[external]"
            lines.append(
                f"  {i}. {scope_tag} {r.name} "
                f"(score: {r.score:.2f}, source: {r.source})"
            )
            lines.append(f"     {r.description[:200]}")
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
