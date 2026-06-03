"""Filter subsystem for SearchSDK.

This module provides deterministic filtering operations for search results.
"""

from __future__ import annotations

import re
from typing import Any, Callable

from ..retrieve import SearchHit


class FilterPrimitives:
    """Deterministic filtering operations for search results.

    All filter methods operate on lists of SearchHit objects.
    This enables precise, token-efficient filtering compared to probabilistic
    LLM-based filtering.
    """

    @staticmethod
    def dedupe(hits: list[SearchHit], key: str | Callable[[SearchHit], str] = "url") -> list[SearchHit]:
        """Remove duplicate search results.

        Args:
            hits: List of search results
            key: Field name or function to extract key for deduplication

        Returns:
            Deduplicated list of search results

        Example:
            ```python
            hits = await sdk.retrieve.web(["query"])
            unique = sdk.filter.dedupe(hits)

            # Or with custom key function
            unique = sdk.filter.dedupe(hits, key=lambda h: h.title.lower())
            ```
        """
        if not hits:
            return []

        seen = set()
        unique = []

        for hit in hits:
            # Extract key value
            if isinstance(key, str):
                if key == "url":
                    value = hit.url
                elif key == "title":
                    value = hit.title
                elif key == "snippet":
                    value = hit.snippet
                else:
                    value = hit.url  # Default to URL
            elif callable(key):
                value = key(hit)
            else:
                value = hit.url

            if value not in seen:
                seen.add(value)
                unique.append(hit)

        return unique

    @staticmethod
    def by_domain(
        hits: list[SearchHit],
        include: list[str] | None = None,
        exclude: list[str] | None = None,
    ) -> list[SearchHit]:
        """Filter search results by domain.

        Args:
            hits: List of search results
            include: Only include results from these domains
            exclude: Exclude results from these domains

        Returns:
            Filtered list of search results

        Example:
            ```python
            # Only include results from official sources
            filtered = sdk.filter.by_domain(
                hits,
                include=["google.com", "chromium.org"]
            )

            # Exclude low-quality sources
            filtered = sdk.filter.by_domain(
                hits,
                exclude=["spam.com", "ads.com"]
            )
            ```
        """
        if not hits:
            return []

        result = []

        for hit in hits:
            from urllib.parse import urlparse

            try:
                domain = urlparse(hit.url).netloc.lower()
            except Exception:
                # Invalid URL, skip
                continue

            # Check include list
            if include:
                include_lower = [d.lower() for d in include]
                if not any(domain == d or domain.endswith("." + d) for d in include_lower):
                    continue

            # Check exclude list
            if exclude:
                exclude_lower = [d.lower() for d in exclude]
                if any(domain == d or domain.endswith("." + d) for d in exclude_lower):
                    continue

            result.append(hit)

        return result

    @staticmethod
    def by_regex(
        hits: list[SearchHit],
        field: str = "snippet",
        pattern: str = ".*",
    ) -> list[SearchHit]:
        """Filter search results by regex pattern.

        Args:
            hits: List of search results
            field: Field to apply regex on (title, snippet, url)
            pattern: Regex pattern to match

        Returns:
            Filtered list of search results

        Example:
            ```python
            # Only include results with CVE numbers
            filtered = sdk.filter.by_regex(
                hits,
                field="snippet",
                pattern=r"CVE-\\d{4}-\\d+"
            )
            ```
        """
        if not hits:
            return []

        try:
            regex = re.compile(pattern, re.IGNORECASE)
        except re.error:
            # Invalid regex, return all hits
            return hits

        result = []

        for hit in hits:
            # Get the field value
            if field == "title":
                value = hit.title
            elif field == "snippet":
                value = hit.snippet
            elif field == "url":
                value = hit.url
            else:
                value = hit.snippet  # Default to snippet

            if regex.search(value):
                result.append(hit)

        return result

    @staticmethod
    def by_keyword(
        hits: list[SearchHit],
        field: str = "snippet",
        words: list[str] | None = None,
        mode: str = "include",
    ) -> list[SearchHit]:
        """Filter search results by keyword matching.

        Args:
            hits: List of search results
            field: Field to search in (title, snippet, url)
            words: List of keywords to match
            mode: "include" to keep matches, "exclude" to remove matches

        Returns:
            Filtered list of search results

        Example:
            ```python
            # Only include results mentioning "security"
            filtered = sdk.filter.by_keyword(
                hits,
                field="snippet",
                words=["security", "vulnerability"],
                mode="include"
            )

            # Exclude results with ads
            filtered = sdk.filter.by_keyword(
                hits,
                field="title",
                words=["sponsored", "ad"],
                mode="exclude"
            )
            ```
        """
        if not hits or not words:
            return hits if mode == "exclude" else []

        words_lower = [w.lower() for w in words]
        result = []

        for hit in hits:
            # Get the field value
            if field == "title":
                value = hit.title
            elif field == "snippet":
                value = hit.snippet
            elif field == "url":
                value = hit.url
            else:
                value = hit.snippet  # Default to snippet

            value_lower = value.lower()

            # Check if any keyword matches
            matches = any(word in value_lower for word in words_lower)

            if mode == "include" and matches:
                result.append(hit)
            elif mode == "exclude" and not matches:
                result.append(hit)

        return result


__all__ = ["FilterPrimitives"]
