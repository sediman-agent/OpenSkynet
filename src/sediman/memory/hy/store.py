"""
SQLite-based storage for System 2 Memory.

Implements the 6-layer memory hierarchy with evolution chains.
"""

import aiosqlite
import json
import logging
from pathlib import Path
from typing import Optional, List, Tuple, Dict, Any
from datetime import datetime

from .models import (
    MemoryRecord,
    MemoryLink,
    SessionRaw,
    RetrievalResult,
    Layer,
    MemType,
    LinkType,
)

logger = logging.getLogger(__name__)


class HyMemoryStore:
    """SQLite storage backend for System 2 Memory.

    Implements 6-layer memory hierarchy with evolution chains.
    """

    def __init__(self, db_path: Optional[Path | str] = None):
        """Initialize the memory store.

        Args:
            db_path: Path to SQLite database. Defaults to ~/.terminator/hy_memory.db
        """
        if db_path is None:
            from sediman.config import DATA_DIR
            self.db_path = DATA_DIR / "hy_memory.db"
        else:
            self.db_path = Path(db_path) if isinstance(db_path, str) else db_path

        self._initialized = False

    async def initialize(self) -> None:
        """Initialize database and create schema."""
        if self._initialized:
            return

        # Create parent directory if not using :memory:
        if str(self.db_path) != ":memory:":
            self.db_path.parent.mkdir(parents=True, exist_ok=True)

        await self._create_schema()
        self._initialized = True
        logger.info(f"HyMemoryStore initialized at {self.db_path}")

    async def _create_schema(self) -> None:
        """Create database schema if it doesn't exist."""
        async with aiosqlite.connect(self.db_path) as conn:
            # Enable WAL mode for better concurrency
            await conn.execute("PRAGMA journal_mode=WAL")
            await conn.execute("PRAGMA synchronous=NORMAL")
            await conn.execute("PRAGMA cache_size=32000")

            # Main memories table
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY,
                    layer TEXT NOT NULL,
                    mem_type TEXT NOT NULL,
                    content TEXT NOT NULL,
                    supersedes TEXT,
                    confidence REAL DEFAULT 0.5,
                    source_ids TEXT DEFAULT '[]',
                    metadata TEXT DEFAULT '{}',
                    access_count INTEGER DEFAULT 0,
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    FOREIGN KEY (supersedes) REFERENCES memories(id)
                )
                """
            )

            # Indexes for efficient queries
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer)"
            )
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(mem_type)"
            )
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_memories_supersedes ON memories(supersedes)"
            )
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at)"
            )

            # Memory links table
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS memory_links (
                    source_id TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    link_type TEXT NOT NULL,
                    metadata TEXT DEFAULT '{}',
                    created_at REAL NOT NULL,
                    PRIMARY KEY (source_id, target_id, link_type),
                    FOREIGN KEY (source_id) REFERENCES memories(id),
                    FOREIGN KEY (target_id) REFERENCES memories(id)
                )
                """
            )

            # Embeddings table
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS memory_embeddings (
                    memory_id TEXT PRIMARY KEY,
                    vector BLOB NOT NULL,
                    provider TEXT NOT NULL,
                    created_at REAL NOT NULL,
                    FOREIGN KEY (memory_id) REFERENCES memories(id)
                )
                """
            )

            # Raw session traces table
            await conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions_raw (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    turn_number INTEGER NOT NULL,
                    created_at REAL NOT NULL
                )
                """
            )

            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_raw_session ON sessions_raw(session_id)"
            )
            await conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_sessions_raw_turn ON sessions_raw(turn_number)"
            )

            await conn.commit()

    async def add_record(self, record: MemoryRecord) -> bool:
        """Add a new memory record to storage.

        Args:
            record: The memory record to add

        Returns:
            True if successful, False otherwise
        """
        try:
            async with aiosqlite.connect(self.db_path) as conn:
                data = record.to_dict()
                await conn.execute(
                    """
                    INSERT INTO memories (
                        id, layer, mem_type, content, supersedes,
                        confidence, source_ids, metadata, access_count,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        data["id"],
                        data["layer"],
                        data["mem_type"],
                        data["content"],
                        data["supersedes"],
                        data["confidence"],
                        json.dumps(data["source_ids"]),
                        json.dumps(data["metadata"]),
                        data["access_count"],
                        data["created_at"],
                        data["updated_at"],
                    ),
                )
                await conn.commit()
                return True
        except aiosqlite.Error as e:
            logger.error(f"Failed to add record {record.id}: {e}")
            return False

    async def get_record(self, record_id: str) -> Optional[MemoryRecord]:
        """Retrieve a specific memory record by ID.

        Args:
            record_id: The ID of the record to retrieve

        Returns:
            The memory record if found, None otherwise
        """
        try:
            async with aiosqlite.connect(self.db_path) as conn:
                async with conn.execute(
                    "SELECT * FROM memories WHERE id = ?", (record_id,)
                ) as cursor:
                    row = await cursor.fetchone()
                    if row:
                        return self._row_to_record(row)
        except aiosqlite.Error as e:
            logger.error(f"Failed to get record {record_id}: {e}")
        return None

    async def update_record(self, record: MemoryRecord) -> bool:
        """Update an existing memory record.

        Args:
            record: The record to update (must have existing ID)

        Returns:
            True if successful, False otherwise
        """
        try:
            async with aiosqlite.connect(self.db_path) as conn:
                data = record.to_dict()
                await conn.execute(
                    """
                    UPDATE memories SET
                        layer = ?, mem_type = ?, content = ?, supersedes = ?,
                        confidence = ?, source_ids = ?, metadata = ?,
                        access_count = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (
                        data["layer"],
                        data["mem_type"],
                        data["content"],
                        data["supersedes"],
                        data["confidence"],
                        json.dumps(data["source_ids"]),
                        json.dumps(data["metadata"]),
                        data["access_count"],
                        data["updated_at"],
                        data["id"],
                    ),
                )
                await conn.commit()
                return True
        except aiosqlite.Error as e:
            logger.error(f"Failed to update record {record.id}: {e}")
            return False

    async def delete_record(self, record_id: str) -> bool:
        """Delete a memory record from storage.

        Args:
            record_id: The ID of the record to delete

        Returns:
            True if successful, False otherwise
        """
        try:
            async with aiosqlite.connect(self.db_path) as conn:
                await conn.execute("DELETE FROM memories WHERE id = ?", (record_id,))
                await conn.execute("DELETE FROM memory_links WHERE source_id = ? OR target_id = ?", (record_id, record_id))
                await conn.execute("DELETE FROM memory_embeddings WHERE memory_id = ?", (record_id,))
                await conn.commit()
                return True
        except aiosqlite.Error as e:
            logger.error(f"Failed to delete record {record_id}: {e}")
            return False

    async def query_by_layer(
        self, layer: Layer, limit: int = 100, offset: int = 0
    ) -> List[MemoryRecord]:
        """Query all records in a specific layer.

        Args:
            layer: The layer to query
            limit: Maximum number of records to return
            offset: Number of records to skip

        Returns:
            List of memory records in the specified layer
        """
        try:
            async with aiosqlite.connect(self.db_path) as conn:
                async with conn.execute(
                    """
                    SELECT * FROM memories
                    WHERE layer = ?
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (layer.value, limit, offset),
                ) as cursor:
                    rows = await cursor.fetchall()
                    return [self._row_to_record(row) for row in rows]
        except aiosqlite.Error as e:
            logger.error(f"Failed to query layer {layer}: {e}")
            return []

    async def query_by_type(
        self, mem_type: MemType, limit: int = 100, offset: int = 0
    ) -> List[MemoryRecord]:
        """Query all records of a specific type.

        Args:
            mem_type: The memory type to query
            limit: Maximum number of records to return
            offset: Number of records to skip

        Returns:
            List of memory records of the specified type
        """
        try:
            async with aiosqlite.connect(self.db_path) as conn:
                async with conn.execute(
                    """
                    SELECT * FROM memories
                    WHERE mem_type = ?
                    ORDER BY created_at DESC
                    LIMIT ? OFFSET ?
                    """,
                    (mem_type.value, limit, offset),
                ) as cursor:
                    rows = await cursor.fetchall()
                    return [self._row_to_record(row) for row in rows]
        except aiosqlite.Error as e:
            logger.error(f"Failed to query type {mem_type}: {e}")
            return []

    async def query_recent(
        self, limit: int = 50, layer: Optional[Layer] = None
    ) -> List[MemoryRecord]:
        """Query most recent records.

        Args:
            limit: Maximum number of records to return
            layer: Optional layer filter

        Returns:
            List of recent memory records
        """
        try:
            async with aiosqlite.connect(self.db_path) as conn:
                if layer:
                    async with conn.execute(
                        """
                        SELECT * FROM memories
                        WHERE layer = ?
                        ORDER BY updated_at DESC
                        LIMIT ?
                        """,
                        (layer.value, limit),
                    ) as cursor:
                        rows = await cursor.fetchall()
                        return [self._row_to_record(row) for row in rows]
                else:
                    async with conn.execute(
                        """
                        SELECT * FROM memories
                        ORDER BY updated_at DESC
                        LIMIT ?
                        """,
                        (limit,),
                    ) as cursor:
                        rows = await cursor.fetchall()
                        return [self._row_to_record(row) for row in rows]
        except aiosqlite.Error as e:
            logger.error(f"Failed to query recent records: {e}")
            return []

    async def search_by_content(
        self, query: str, limit: int = 10, layer: Optional[Layer] = None
    ) -> List[Tuple[MemoryRecord, float]]:
        """Full-text search through memory content.

        Args:
            query: Search query string
            limit: Maximum number of results
            layer: Optional layer filter

        Returns:
            List of (record, score) tuples
        """
        try:
            async with aiosqlite.connect(self.db_path) as conn:
                if layer:
                    async with conn.execute(
                        """
                        SELECT * FROM memories
                        WHERE layer = ? AND content LIKE ?
                        ORDER BY access_count DESC, created_at DESC
                        LIMIT ?
                        """,
                        (layer.value, f"%{query}%", limit),
                    ) as cursor:
                        rows = await cursor.fetchall()
                        return [(self._row_to_record(row), 1.0) for row in rows]
                else:
                    async with conn.execute(
                        """
                        SELECT * FROM memories
                        WHERE content LIKE ?
                        ORDER BY access_count DESC, created_at DESC
                        LIMIT ?
                        """,
                        (f"%{query}%", limit),
                    ) as cursor:
                        rows = await cursor.fetchall()
                        return [(self._row_to_record(row), 1.0) for row in rows]
        except aiosqlite.Error as e:
            logger.error(f"Failed to search content: {e}")
            return []

    async def get_supersedes_chain(
        self, record_id: str, max_depth: int = 10
    ) -> List[MemoryRecord]:
        """Trace the evolution chain from a record.

        Follows supersedes pointers to build full evolution history.

        Args:
            record_id: Starting record ID
            max_depth: Maximum chain depth to follow

        Returns:
            List of records in the chain (oldest to newest)
        """
        chain = []
        current_id = record_id
        visited = set()

        for _ in range(max_depth):
            if current_id in visited:
                break
            visited.add(current_id)

            record = await self.get_record(current_id)
            if not record:
                break

            chain.append(record)
            if record.supersedes:
                current_id = record.supersedes
            else:
                break

        # Reverse to get oldest -> newest
        return list(reversed(chain))

    async def add_link(self, link: MemoryLink) -> bool:
        """Add a relationship link between two records.

        Args:
            link: The link to add

        Returns:
            True if successful, False otherwise
        """
        try:
            async with aiosqlite.connect(self.db_path) as conn:
                await conn.execute(
                    """
                    INSERT OR REPLACE INTO memory_links
                    (source_id, target_id, link_type, metadata, created_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        link.source_id,
                        link.target_id,
                        link.link_type,
                        json.dumps(link.metadata),
                        link.created_at.timestamp(),
                    ),
                )
                await conn.commit()
                return True
        except aiosqlite.Error as e:
            logger.error(f"Failed to add link: {e}")
            return False

    async def get_links(
        self, record_id: str, link_type: Optional[str] = None
    ) -> List[MemoryLink]:
        """Get all links for a record.

        Args:
            record_id: The record ID
            link_type: Optional link type filter

        Returns:
            List of links
        """
        try:
            async with aiosqlite.connect(self.db_path) as conn:
                if link_type:
                    async with conn.execute(
                        """
                        SELECT * FROM memory_links
                        WHERE source_id = ? AND link_type = ?
                        ORDER BY created_at DESC
                        """,
                        (record_id, link_type),
                    ) as cursor:
                        rows = await cursor.fetchall()
                        return [self._row_to_link(row) for row in rows]
                else:
                    async with conn.execute(
                        """
                        SELECT * FROM memory_links
                        WHERE source_id = ?
                        ORDER BY created_at DESC
                        """,
                        (record_id,),
                    ) as cursor:
                        rows = await cursor.fetchall()
                        return [self._row_to_link(row) for row in rows]
        except aiosqlite.Error as e:
            logger.error(f"Failed to get links for {record_id}: {e}")
            return []

    async def add_raw_trace(self, trace: SessionRaw) -> bool:
        """Add a raw conversation trace.

        Args:
            trace: The raw trace to add

        Returns:
            True if successful, False otherwise
        """
        try:
            async with aiosqlite.connect(self.db_path) as conn:
                data = trace.to_dict()
                await conn.execute(
                    """
                    INSERT INTO sessions_raw
                    (id, session_id, role, content, turn_number, created_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        data["id"],
                        data["session_id"],
                        data["role"],
                        data["content"],
                        data["turn_number"],
                        data["created_at"],
                    ),
                )
                await conn.commit()
                return True
        except aiosqlite.Error as e:
            logger.error(f"Failed to add raw trace: {e}")
            return False

    async def get_session_traces(
        self, session_id: str, limit: int = 100
    ) -> List[SessionRaw]:
        """Get all raw traces for a session.

        Args:
            session_id: The session ID
            limit: Maximum number of traces to return

        Returns:
            List of raw traces in turn order
        """
        try:
            async with aiosqlite.connect(self.db_path) as conn:
                async with conn.execute(
                    """
                    SELECT * FROM sessions_raw
                    WHERE session_id = ?
                    ORDER BY turn_number ASC
                    LIMIT ?
                    """,
                    (session_id, limit),
                ) as cursor:
                    rows = await cursor.fetchall()
                    return [self._row_to_raw_trace(row) for row in rows]
        except aiosqlite.Error as e:
            logger.error(f"Failed to get session traces: {e}")
            return []

    async def get_stats(self) -> Dict[str, Any]:
        """Get statistics about the memory store.

        Returns:
            Dictionary with statistics
        """
        try:
            async with aiosqlite.connect(self.db_path) as conn:
                # Total records
                async with conn.execute("SELECT COUNT(*) FROM memories") as cursor:
                    total_count = (await cursor.fetchone())[0]

                # Records by layer
                layer_counts = {}
                for layer in Layer:
                    async with conn.execute(
                        "SELECT COUNT(*) FROM memories WHERE layer = ?",
                        (layer.value,),
                    ) as cursor:
                        layer_counts[layer.value] = (await cursor.fetchone())[0]

                # Records by type
                type_counts = {}
                for mem_type in MemType:
                    async with conn.execute(
                        "SELECT COUNT(*) FROM memories WHERE mem_type = ?",
                        (mem_type.value,),
                    ) as cursor:
                        type_counts[mem_type.value] = (await cursor.fetchone())[0]

                # Chain stats
                async with conn.execute(
                    "SELECT COUNT(DISTINCT supersedes) FROM memories WHERE supersedes IS NOT NULL"
                ) as cursor:
                    chain_links = (await cursor.fetchone())[0]

                # Links stats
                async with conn.execute("SELECT COUNT(*) FROM memory_links") as cursor:
                    total_links = (await cursor.fetchone())[0]

                return {
                    "total_records": total_count,
                    "by_layer": layer_counts,
                    "by_type": type_counts,
                    "chain_links": chain_links,
                    "total_links": total_links,
                }
        except aiosqlite.Error as e:
            logger.error(f"Failed to get stats: {e}")
            return {}

    def _row_to_record(self, row) -> MemoryRecord:
        """Convert database row to MemoryRecord."""
        return MemoryRecord(
            id=row[0],
            layer=Layer(row[1]),
            mem_type=MemType(row[2]),
            content=row[3],
            supersedes=row[4],
            confidence=row[5],
            source_ids=json.loads(row[6]) if row[6] else [],
            metadata=json.loads(row[7]) if row[7] else {},
            access_count=row[8],
            created_at=datetime.fromtimestamp(row[9]),
            updated_at=datetime.fromtimestamp(row[10]),
        )

    def _row_to_link(self, row) -> MemoryLink:
        """Convert database row to MemoryLink."""
        return MemoryLink(
            source_id=row[0],
            target_id=row[1],
            link_type=row[2],
            metadata=json.loads(row[3]) if row[3] else {},
            created_at=datetime.fromtimestamp(row[4]),
        )

    def _row_to_raw_trace(self, row) -> SessionRaw:
        """Convert database row to SessionRaw."""
        return SessionRaw(
            id=row[0],
            session_id=row[1],
            role=row[2],
            content=row[3],
            turn_number=row[4],
            created_at=datetime.fromtimestamp(row[5]),
        )
