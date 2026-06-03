"""Search module configuration.

This module provides configuration options for the search system,
using environment variables with sensible defaults.
"""

from __future__ import annotations

import os
from pathlib import Path

from sediman.config import SKILLS_DIR


# Default search engine
SEARCH_DEFAULT_ENGINE = os.environ.get("SEDIMAN_SEARCH_ENGINE", "auto")

# Maximum results to return by default
SEARCH_MAX_RESULTS = int(os.environ.get("SEDIMAN_SEARCH_MAX_RESULTS", "10"))

# Maximum results allowed (to prevent excessive queries)
SEARCH_MAX_RESULTS_LIMIT = int(os.environ.get("SEDIMAN_SEARCH_MAX_RESULTS_LIMIT", "100"))

# Enable/disable caching
SEARCH_CACHE_ENABLED = os.environ.get("SEDIMAN_SEARCH_CACHE_ENABLED", "true").lower() == "true"

# Cache TTL in seconds
SEARCH_CACHE_TTL = int(os.environ.get("SEDIMAN_SEARCH_CACHE_TTL", "3600"))

# Vector database path for skill embeddings
VECTOR_DB_PATH = SKILLS_DIR / "skill_vectors.db"

# External embeddings path
EXTERNAL_EMBEDDINGS_PATH = Path(__file__).parent.parent.parent.parent / "skills" / "data" / "skill_embeddings.npz"

# External index path
EXTERNAL_INDEX_PATH = Path(__file__).parent.parent.parent.parent / "skills" / "data" / "index.json"

# External embeddings metadata path
EXTERNAL_EMBEDDINGS_META_PATH = Path(__file__).parent.parent.parent.parent / "skills" / "data" / "skill_embeddings_meta.json"

# Embedding provider settings
EMBEDDING_PROVIDER = os.environ.get("SEDIMAN_EMBEDDING_PROVIDER", "auto")
EMBEDDING_MODEL = os.environ.get("SEDIMAN_EMBEDDING_MODEL", "auto")
EMBEDDING_DIMENSION = int(os.environ.get("SEDIMAN_EMBEDDING_DIMENSION", "384"))

# Web search settings
WEB_SEARCH_TIMEOUT = int(os.environ.get("SEDIMAN_WEB_SEARCH_TIMEOUT", "30"))
WEB_SEARCH_MAX_CONTENT_LENGTH = int(os.environ.get("SEDIMAN_WEB_SEARCH_MAX_CONTENT_LENGTH", "50000"))

# Minimum similarity score for vector search
MIN_SIMILARITY_SCORE = float(os.environ.get("SEDIMAN_MIN_SIMILARITY_SCORE", "0.1"))

# Enable/disable keyword fallback when vector search fails
KEYWORD_FALLBACK_ENABLED = os.environ.get("SEDIMAN_KEYWORD_FALLBACK_ENABLED", "true").lower() == "true"

# Logging
SEARCH_LOG_LEVEL = os.environ.get("SEDIMAN_SEARCH_LOG_LEVEL", "INFO")

# Development/debugging
SEARCH_DEBUG = os.environ.get("SEDIMAN_SEARCH_DEBUG", "false").lower() == "true"


def get_config_dict() -> dict[str, str | int | bool | Path]:
    """Return all configuration values as a dictionary.

    Useful for debugging and configuration display.
    """
    return {
        "SEARCH_DEFAULT_ENGINE": SEARCH_DEFAULT_ENGINE,
        "SEARCH_MAX_RESULTS": SEARCH_MAX_RESULTS,
        "SEARCH_MAX_RESULTS_LIMIT": SEARCH_MAX_RESULTS_LIMIT,
        "SEARCH_CACHE_ENABLED": SEARCH_CACHE_ENABLED,
        "SEARCH_CACHE_TTL": SEARCH_CACHE_TTL,
        "VECTOR_DB_PATH": str(VECTOR_DB_PATH),
        "EXTERNAL_EMBEDDINGS_PATH": str(EXTERNAL_EMBEDDINGS_PATH),
        "EXTERNAL_INDEX_PATH": str(EXTERNAL_INDEX_PATH),
        "EMBEDDING_PROVIDER": EMBEDDING_PROVIDER,
        "EMBEDDING_MODEL": EMBEDDING_MODEL,
        "EMBEDDING_DIMENSION": EMBEDDING_DIMENSION,
        "WEB_SEARCH_TIMEOUT": WEB_SEARCH_TIMEOUT,
        "WEB_SEARCH_MAX_CONTENT_LENGTH": WEB_SEARCH_MAX_CONTENT_LENGTH,
        "MIN_SIMILARITY_SCORE": MIN_SIMILARITY_SCORE,
        "KEYWORD_FALLBACK_ENABLED": KEYWORD_FALLBACK_ENABLED,
        "SEARCH_LOG_LEVEL": SEARCH_LOG_LEVEL,
        "SEARCH_DEBUG": SEARCH_DEBUG,
    }


__all__ = [
    "SEARCH_DEFAULT_ENGINE",
    "SEARCH_MAX_RESULTS",
    "SEARCH_MAX_RESULTS_LIMIT",
    "SEARCH_CACHE_ENABLED",
    "SEARCH_CACHE_TTL",
    "VECTOR_DB_PATH",
    "EXTERNAL_EMBEDDINGS_PATH",
    "EXTERNAL_INDEX_PATH",
    "EXTERNAL_EMBEDDINGS_META_PATH",
    "EMBEDDING_PROVIDER",
    "EMBEDDING_MODEL",
    "EMBEDDING_DIMENSION",
    "WEB_SEARCH_TIMEOUT",
    "WEB_SEARCH_MAX_CONTENT_LENGTH",
    "MIN_SIMILARITY_SCORE",
    "KEYWORD_FALLBACK_ENABLED",
    "SEARCH_LOG_LEVEL",
    "SEARCH_DEBUG",
    "get_config_dict",
]
