"""Scoring algorithms for search relevance.

This module provides scoring algorithms including cosine similarity,
normalization, and keyword matching for search results.
"""

from __future__ import annotations

import math
from typing import Any


def normalize_vector(vec: list[float]) -> list[float]:
    """Normalize a vector to unit length.

    Args:
        vec: Vector to normalize

    Returns:
        Normalized vector
    """
    norm = math.sqrt(sum(v * v for v in vec))
    if norm == 0:
        return vec
    return [v / norm for v in vec]


def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    """Calculate cosine similarity between two vectors.

    Args:
        vec1: First vector
        vec2: Second vector

    Returns:
        Cosine similarity score (0.0 to 1.0)
    """
    if len(vec1) != len(vec2):
        return 0.0

    dot = sum(a * b for a, b in zip(vec1, vec2))
    norm_a = math.sqrt(sum(a * a for a in vec1))
    norm_b = math.sqrt(sum(b * b for b in vec2))

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return dot / (norm_a * norm_b)


def keyword_score(query: str, document: dict[str, Any]) -> float:
    """Calculate keyword matching score.

    This function calculates a score based on word overlap between
    the query and document fields (name, description, keywords, category).

    Args:
        query: Search query string
        document: Document with name, description, keywords, category fields

    Returns:
        Keyword score (0.0 to 1.0)
    """
    query_words = set(query.lower().split())
    if not query_words:
        return 0.0

    # Build haystack from document fields
    parts = [
        document.get("name", ""),
        document.get("description", ""),
        document.get("category", ""),
    ]

    # Include keywords array
    kw = document.get("keywords")
    if kw and isinstance(kw, list):
        parts.extend(kw)

    haystack = " ".join(parts).lower()
    hay_words = set(haystack.split())

    overlap = len(query_words & hay_words)
    if overlap == 0:
        return 0.0

    return overlap / max(len(query_words), 1)


def combined_score(
    vector_score: float,
    keyword_score: float,
    vector_weight: float = 0.7,
) -> float:
    """Combine vector and keyword scores with weighting.

    Args:
        vector_score: Cosine similarity score
        keyword_score: Keyword matching score
        vector_weight: Weight for vector score (0.0 to 1.0)

    Returns:
        Combined weighted score
    """
    keyword_weight = 1.0 - vector_weight
    return (vector_score * vector_weight) + (keyword_score * keyword_weight)


def rank_results(
    results: list[tuple[float, dict[str, Any]]],
    max_results: int = 10,
    min_score: float = 0.0,
) -> list[tuple[float, dict[str, Any]]]:
    """Rank and filter results by score.

    Args:
        results: List of (score, document) tuples
        max_results: Maximum number of results to return
        min_score: Minimum score threshold

    Returns:
        Ranked and filtered list of (score, document) tuples
    """
    # Filter by minimum score
    filtered = [(s, d) for s, d in results if s >= min_score]

    # Sort by score descending
    filtered.sort(key=lambda x: -x[0])

    # Limit results
    return filtered[:max_results]


__all__ = [
    "normalize_vector",
    "cosine_similarity",
    "keyword_score",
    "combined_score",
    "rank_results",
]
