"""Caching layer for search results and computations.

This module provides a generic caching interface with TTL and mtime-based
invalidation, used across all search strategies.
"""

from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from functools import wraps
from pathlib import Path
from typing import Any, Callable, TypeVar

from structlog import get_logger

from ..config import SEARCH_CACHE_ENABLED, SEARCH_CACHE_TTL

logger = get_logger()

T = TypeVar("T")


@dataclass
class CacheEntry:
    """A single cache entry.

    Attributes:
        key: Cache key
        value: Cached value
        timestamp: When the entry was created
        ttl: Time-to-live in seconds
        mtime: File modification time for invalidation
    """
    key: str
    value: Any
    timestamp: float
    ttl: int
    mtime: float | None = None

    def is_valid(self) -> bool:
        """Check if cache entry is still valid.

        Returns:
            True if entry is valid, False otherwise
        """
        # Check TTL
        if time.time() - self.timestamp > self.ttl:
            return False

        # Check mtime if available
        if self.mtime is not None:
            # mtime check is handled by the cache manager
            pass

        return True

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "key": self.key,
            "value": self.value,
            "timestamp": self.timestamp,
            "ttl": self.ttl,
            "mtime": self.mtime,
        }


class CacheManager:
    """Generic cache manager with TTL and mtime-based invalidation.

    This cache manager supports:
    - Time-based expiration (TTL)
    - mtime-based invalidation for file-backed data
    - Memory-based storage
    - Configurable enable/disable

    Example:
        ```python
        cache = CacheManager(ttl=3600)
        cache.put("my_key", {"data": "value"}, mtime=file_mtime)

        value = cache.get("my_key")
        if cache.is_mtime_invalid("my_key", current_mtime):
            cache.invalidate("my_key")
        ```
    """

    def __init__(self, ttl: int | None = None, enabled: bool | None = None) -> None:
        """Initialize cache manager.

        Args:
            ttl: Time-to-live in seconds (default from config)
            enabled: Whether caching is enabled (default from config)
        """
        self.ttl = ttl if ttl is not None else SEARCH_CACHE_TTL
        self.enabled = enabled if enabled is not None else SEARCH_CACHE_ENABLED
        self._cache: dict[str, CacheEntry] = {}

    def put(
        self,
        key: str,
        value: Any,
        ttl: int | None = None,
        mtime: float | None = None,
    ) -> None:
        """Store a value in cache.

        Args:
            key: Cache key
            value: Value to cache
            ttl: Optional override of default TTL
            mtime: Optional modification time for invalidation
        """
        if not self.enabled:
            return

        entry = CacheEntry(
            key=key,
            value=value,
            timestamp=time.time(),
            ttl=ttl if ttl is not None else self.ttl,
            mtime=mtime,
        )
        self._cache[key] = entry
        logger.debug("cache_put", key=key, ttl=entry.ttl)

    def get(self, key: str) -> Any | None:
        """Get a value from cache.

        Args:
            key: Cache key

        Returns:
            Cached value, or None if not found or invalid
        """
        if not self.enabled:
            return None

        entry = self._cache.get(key)
        if entry is None:
            return None

        if not entry.is_valid():
            self.invalidate(key)
            return None

        logger.debug("cache_hit", key=key)
        return entry.value

    def invalidate(self, key: str) -> None:
        """Invalidate a cache entry.

        Args:
            key: Cache key to invalidate
        """
        if key in self._cache:
            del self._cache[key]
            logger.debug("cache_invalidated", key=key)

    def clear(self) -> None:
        """Clear all cache entries."""
        count = len(self._cache)
        self._cache.clear()
        logger.debug("cache_cleared", count=count)

    def is_mtime_invalid(self, key: str, current_mtime: float) -> bool:
        """Check if cache entry is invalid due to mtime change.

        Args:
            key: Cache key
            current_mtime: Current file modification time

        Returns:
            True if entry should be invalidated, False otherwise
        """
        entry = self._cache.get(key)
        if entry is None:
            return True

        if entry.mtime is not None:
            if current_mtime > entry.mtime:
                logger.debug("cache_mtime_invalid", key=key, old=entry.mtime, new=current_mtime)
                return True

        return False

    def cleanup_expired(self) -> int:
        """Remove all expired entries.

        Returns:
            Number of entries removed
        """
        removed = 0
        expired_keys = []

        for key, entry in self._cache.items():
            if not entry.is_valid():
                expired_keys.append(key)

        for key in expired_keys:
            del self._cache[key]
            removed += 1

        if removed > 0:
            logger.debug("cache_cleanup_expired", count=removed)

        return removed

    def get_stats(self) -> dict[str, Any]:
        """Get cache statistics.

        Returns:
            Dictionary with cache stats
        """
        return {
            "enabled": self.enabled,
            "ttl": self.ttl,
            "entries": len(self._cache),
            "expired": sum(1 for e in self._cache.values() if not e.is_valid()),
        }


def cache_key(*args: Any, **kwargs: Any) -> str:
    """Generate a cache key from function arguments.

    Args:
        *args: Positional arguments
        **kwargs: Keyword arguments

    Returns:
        Cache key string
    """
    key_parts = []

    # Add positional args
    for arg in args:
        if isinstance(arg, (str, int, float, bool)):
            key_parts.append(str(arg))
        elif isinstance(arg, Path):
            key_parts.append(str(arg))
        else:
            # For complex objects, use hash
            key_parts.append(hashlib.md5(str(arg).encode()).hexdigest()[:8])

    # Add keyword args (sorted for consistency)
    for k in sorted(kwargs.keys()):
        v = kwargs[k]
        if isinstance(v, (str, int, float, bool)):
            key_parts.append(f"{k}={v}")
        else:
            key_parts.append(f"{k}={hashlib.md5(str(v).encode()).hexdigest()[:8]}")

    return ":".join(key_parts)


def cached(
    ttl: int | None = None,
    key_func: Callable[..., str] | None = None,
) -> Callable[..., Callable[..., T]]:
    """Decorator for caching function results.

    Args:
        ttl: Time-to-live in seconds
        key_func: Optional function to generate cache key

    Returns:
        Decorated function

    Example:
        ```python
        @cached(ttl=300)
        async def expensive_operation(param):
            # ... expensive computation
            return result
        ```
    """
    cache = CacheManager(ttl=ttl)

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args: Any, **kwargs: Any) -> T:
            # Generate cache key
            if key_func:
                key = key_func(*args, **kwargs)
            else:
                key = f"{func.__name__}:{cache_key(*args, **kwargs)}"

            # Try cache
            cached_value = cache.get(key)
            if cached_value is not None:
                return cached_value

            # Call function and cache result
            result = await func(*args, **kwargs)
            cache.put(key, result)

            return result

        return wrapper

    return decorator


__all__ = ["CacheManager", "CacheEntry", "cache_key", "cached"]
