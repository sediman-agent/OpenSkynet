"""Result parsers and formatters for search results.

This module provides utilities for parsing and formatting search results
from different sources into a consistent structure.
"""

from __future__ import annotations

import re
from typing import Any

from ..base import SearchResult


def parse_web_result(data: dict[str, Any]) -> SearchResult:
    """Parse web search result into SearchResult.

    Args:
        data: Raw web search result data

    Returns:
        SearchResult instance
    """
    title = data.get("title", "")
    content = data.get("content", "")
    url = data.get("url", "")
    score = data.get("score", 0.0)

    return SearchResult(
        title=title,
        content=content,
        url=url,
        score=score,
        metadata={"source": "web"},
    )


def parse_skill_result(data: dict[str, Any]) -> SearchResult:
    """Parse skill search result into SearchResult.

    Args:
        data: Raw skill search result data

    Returns:
        SearchResult instance
    """
    name = data.get("name", "")
    description = data.get("description", "")
    path = data.get("path", "")
    score = data.get("score", 0.0)
    source = data.get("source", "unknown")
    category = data.get("category", "general")
    keywords = data.get("keywords", [])

    return SearchResult(
        title=name,
        content=description,
        url=f"skill:{path}" if path else "",
        score=score,
        metadata={
            "source": source,
            "category": category,
            "keywords": keywords,
        },
    )


def parse_code_result(data: dict[str, Any]) -> SearchResult:
    """Parse code search result into SearchResult.

    Args:
        data: Raw code search result data

    Returns:
        SearchResult instance
    """
    file_path = data.get("path", "")
    content = data.get("content", "")
    line_number = data.get("line", 0)
    score = data.get("score", 0.0)
    language = data.get("language", "")

    title = f"{file_path}:{line_number}"
    if language:
        title = f"[{language}] {title}"

    return SearchResult(
        title=title,
        content=content,
        url=f"file:{file_path}:{line_number}",
        score=score,
        metadata={
            "language": language,
            "line": line_number,
        },
    )


def format_result_summary(results: list[SearchResult], max_length: int = 200) -> str:
    """Format search results into a human-readable summary.

    Args:
        results: List of search results
        max_length: Maximum content length per result

    Returns:
        Formatted summary string
    """
    if not results:
        return "No results found."

    lines = [f"Found {len(results)} result(s):\n"]

    for i, result in enumerate(results, 1):
        # Truncate content if too long
        content = result.content[:max_length]
        if len(result.content) > max_length:
            content += "..."

        lines.append(f"{i}. {result.title} (score: {result.score:.2f})")
        if result.url:
            lines.append(f"   URL: {result.url}")
        lines.append(f"   {content}")
        lines.append("")

    return "\n".join(lines)


def extract_query_terms(query: str) -> list[str]:
    """Extract meaningful terms from a search query.

    Args:
        query: Search query string

    Returns:
        List of query terms
    """
    # Remove special characters and split
    terms = re.findall(r"\w+", query.lower())
    # Filter out short terms
    return [t for t in terms if len(t) >= 2]


def highlight_matches(content: str, query: str, max_highlights: int = 3) -> str:
    """Highlight query terms in content.

    Args:
        content: Content string
        query: Query string with terms to highlight
        max_highlights: Maximum number of highlights

    Returns:
        Content with highlighted terms
    """
    terms = extract_query_terms(query)[:max_highlights]
    if not terms:
        return content

    # Create pattern for any term
    pattern = re.compile(rf"\b({'|'.join(re.escape(t) for t in terms)})\b", re.IGNORECASE)

    # Highlight matches
    def replace_match(match):
        return f"**{match.group(0)}**"

    return pattern.sub(replace_match, content)


__all__ = [
    "parse_web_result",
    "parse_skill_result",
    "parse_code_result",
    "format_result_summary",
    "extract_query_terms",
    "highlight_matches",
]
