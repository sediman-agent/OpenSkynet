"""SQLite vector storage for embeddings and search indexes.

This module provides a SQLite-based storage backend for vector embeddings,
used primarily for internal skill caching with automatic mtime-based invalidation.
"""

from __future__ import annotations

import json
import sqlite3
import struct
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from structlog import get_logger

logger = get_logger()


@dataclass
class VectorEntry:
    """A single vector entry in the storage.

    Attributes:
        name: Unique identifier for the entry
        description: Text description
        source: Source of the entry
        category: Category for grouping
        path: File path or URL
        keywords: List of keywords for matching
        vector: Normalized embedding vector
        mtime: Modification time for cache invalidation
    """
    name: str
    description: str
    source: str = "local"
    category: str = "general"
    path: str = ""
    keywords: list[str] | None = None
    vector: list[float] | None = None
    mtime: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "name": self.name,
            "description": self.description,
            "source": self.source,
            "category": self.category,
            "path": self.path,
            "keywords": self.keywords or [],
            "vector": self.vector,
            "mtime": self.mtime,
        }


class SQLiteVectorStorage:
    """SQLite-based vector storage with automatic schema management.

    This storage backend is designed for storing embeddings with metadata,
    supporting efficient retrieval and mtime-based cache invalidation.

    Example:
        ```python
        storage = SQLiteVectorStorage(db_path="/path/to/vectors.db")
        storage.initialize()

        # Store an entry
        entry = VectorEntry(
            name="skill1",
            description="A helpful skill",
            vector=[0.1, 0.2, 0.3],
        )
        await storage.store(entry)

        # Retrieve entries
        entries = await storage.load_all()
        ```
    """

    def __init__(self, db_path: Path) -> None:
        """Initialize storage with database path.

        Args:
            db_path: Path to SQLite database file (created if not exists)
        """
        self.db_path = db_path
        self._initialized = False

    def initialize(self) -> None:
        """Initialize database schema if not exists."""
        if self._initialized:
            return

        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        conn = sqlite3.connect(str(self.db_path))
        try:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS skill_vectors (
                    name TEXT PRIMARY KEY,
                    description TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'local',
                    category TEXT NOT NULL DEFAULT 'general',
                    path TEXT NOT NULL DEFAULT '',
                    keywords TEXT NOT NULL DEFAULT '[]',
                    vector BLOB NOT NULL,
                    mtime REAL NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL DEFAULT 0
                );

                CREATE INDEX IF NOT EXISTS idx_source ON skill_vectors(source);
                CREATE INDEX IF NOT EXISTS idx_category ON skill_vectors(category);
                CREATE INDEX IF NOT EXISTS idx_mtime ON skill_vectors(mtime);
            """)
            conn.commit()
            self._initialized = True
            logger.info("sqlite_vector_storage_initialized", path=str(self.db_path))
        finally:
            conn.close()

    async def load_all(self) -> list[VectorEntry]:
        """Load all entries from storage.

        Returns:
            List of all vector entries
        """
        if not self._initialized:
            self.initialize()

        conn = sqlite3.connect(str(self.db_path))
        try:
            rows = conn.execute(
                "SELECT name, description, source, category, path, keywords, vector, mtime "
                "FROM skill_vectors"
            ).fetchall()
        finally:
            conn.close()

        entries = []
        for row in rows:
            name, desc, source, category, path, kw_json, blob, mtime = row
            # Unpack vector from binary blob
            n = len(blob) // 4
            vec = list(struct.unpack(f"{n}f", blob))
            keywords = json.loads(kw_json) if kw_json else []

            entries.append(VectorEntry(
                name=name,
                description=desc,
                source=source,
                category=category,
                path=path,
                keywords=keywords,
                vector=vec,
                mtime=mtime,
            ))

        logger.debug("sqlite_vector_storage_loaded", count=len(entries))
        return entries

    async def load_mtime_cache(self) -> dict[str, float]:
        """Load only mtime cache for efficient change detection.

        Returns:
            Dictionary mapping entry names to modification times
        """
        if not self._initialized:
            self.initialize()

        conn = sqlite3.connect(str(self.db_path))
        try:
            rows = conn.execute("SELECT name, mtime FROM skill_vectors").fetchall()
        finally:
            conn.close()

        return {name: mtime for name, mtime in rows}

    async def store(self, entry: VectorEntry) -> None:
        """Store a single entry.

        Args:
            entry: Vector entry to store
        """
        await self.store_many([entry])

    async def store_many(self, entries: list[VectorEntry]) -> None:
        """Store multiple entries efficiently.

        Args:
            entries: List of vector entries to store
        """
        if not entries:
            return

        if not self._initialized:
            self.initialize()

        # Normalize vectors before storage
        from ..utils.scoring import normalize_vector
        for entry in entries:
            if entry.vector:
                entry.vector = normalize_vector(entry.vector)

        conn = sqlite3.connect(str(self.db_path))
        try:
            for entry in entries:
                keywords = json.dumps(entry.keywords or [])
                vec = entry.vector or []
                blob = struct.pack(f"{len(vec)}f", *vec)

                conn.execute(
                    "INSERT OR REPLACE INTO skill_vectors "
                    "(name, description, source, category, path, keywords, vector, mtime, created_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        entry.name,
                        entry.description,
                        entry.source,
                        entry.category,
                        entry.path,
                        keywords,
                        blob,
                        entry.mtime,
                        time.time(),
                    ),
                )
            conn.commit()
            logger.debug("sqlite_vector_storage_stored", count=len(entries))
        finally:
            conn.close()

    async def delete(self, name: str) -> None:
        """Delete an entry by name.

        Args:
            name: Name of entry to delete
        """
        if not self._initialized:
            self.initialize()

        conn = sqlite3.connect(str(self.db_path))
        try:
            conn.execute("DELETE FROM skill_vectors WHERE name = ?", (name,))
            conn.commit()
            logger.debug("sqlite_vector_storage_deleted", name=name)
        finally:
            conn.close()

    async def clear(self) -> None:
        """Clear all entries from storage."""
        if not self._initialized:
            self.initialize()

        conn = sqlite3.connect(str(self.db_path))
        try:
            conn.execute("DELETE FROM skill_vectors")
            conn.commit()
            logger.info("sqlite_vector_storage_cleared")
        finally:
            conn.close()

    def get_entry_count(self) -> int:
        """Get total number of entries.

        Returns:
            Number of entries in storage
        """
        if not self._initialized:
            self.initialize()

        conn = sqlite3.connect(str(self.db_path))
        try:
            result = conn.execute("SELECT COUNT(*) FROM skill_vectors").fetchone()
            return result[0] if result else 0
        finally:
            conn.close()


__all__ = ["SQLiteVectorStorage", "VectorEntry"]
