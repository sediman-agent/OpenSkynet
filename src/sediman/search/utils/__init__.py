"""Utilities for search module.

This package provides utility functions for scoring, embeddings,
and result parsing.
"""

from .embeddings import EmbeddingProvider, batch_embed
from .parsers import (
    extract_query_terms,
    format_result_summary,
    highlight_matches,
    parse_code_result,
    parse_skill_result,
    parse_web_result,
)
from .scoring import (
    combined_score,
    cosine_similarity,
    keyword_score,
    normalize_vector,
    rank_results,
)

__all__ = [
    "EmbeddingProvider",
    "batch_embed",
    "extract_query_terms",
    "format_result_summary",
    "highlight_matches",
    "parse_code_result",
    "parse_skill_result",
    "parse_web_result",
    "combined_score",
    "cosine_similarity",
    "keyword_score",
    "normalize_vector",
    "rank_results",
]
