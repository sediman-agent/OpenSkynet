"""Storage layer for search module.

This package provides storage backends for embeddings, indexes, and cache.
"""

from .cache import CacheManager, CacheEntry, cache_key, cached
from .numpy import ExternalEmbeddingMetadata, ExternalEmbeddingStorage
from .sqlite import SQLiteVectorStorage, VectorEntry

__all__ = [
    "CacheManager",
    "CacheEntry",
    "cache_key",
    "cached",
    "ExternalEmbeddingMetadata",
    "ExternalEmbeddingStorage",
    "SQLiteVectorStorage",
    "VectorEntry",
]
