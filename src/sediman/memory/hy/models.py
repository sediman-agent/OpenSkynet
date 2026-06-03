"""
Core data models for System 2 Memory (Hy-Memory architecture).

Defines the 6-layer memory hierarchy and evolution chain structures.
"""

from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime
import uuid


class Layer(Enum):
    """6-layer memory hierarchy inspired by Hy-Memory framework.

    L1 RAW -> L2 FACT -> L3 IDENTITY -> L4 SUMMARY -> L5 SCHEMA -> L6 INTENTION
    """

    RAW = "L1"  # Original conversation traces (every turn)
    FACT = "L2"  # Atomic facts, deduplicated and merged
    IDENTITY = "L3"  # Stable user profile, long-term preferences
    SUMMARY = "L4"  # Per-session condensed summary
    SCHEMA = "L5"  # Cognitive models from behavior patterns (async)
    INTENTION = "L6"  # Forward-looking intent prediction (async)


class MemType(Enum):
    """Memory type classification for semantic organization."""

    RAW = "raw"  # Raw conversation traces
    FACT = "fact"  # Atomic factual information
    PREFERENCE = "preference"  # User preferences and tastes
    IDENTITY = "identity"  # Stable user traits and identity
    SUMMARY = "summary"  # Session summaries
    SCHEMA = "schema"  # Cognitive models and patterns
    INTENTION = "intention"  # Predicted future intents


class LinkType(Enum):
    """Types of relationships between memory records."""

    SPAWNED_FROM = "spawned_from"  # New memory derived from this
    MERGED_INTO = "merged_into"  # This memory was merged into another
    SUPERSEDES = "supersedes"  # Evolution chain: this supersedes old
    CONTRADICTS = "contradicts"  # Contradictory information


@dataclass
class MemoryLink:
    """Represents a relationship between two memory records."""

    source_id: str
    target_id: str
    link_type: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)

    def __post_init__(self):
        if isinstance(self.link_type, LinkType):
            self.link_type = self.link_type.value


@dataclass
class MemoryRecord:
    """A single memory record in the 6-layer hierarchy.

    Attributes:
        id: Unique identifier for this record
        layer: Which layer (L1-L6) this record belongs to
        mem_type: Semantic type of this memory
        content: The actual content/text
        supersedes: ID of record this supersedes (evolution chain)
        confidence: Confidence score (0.0-1.0)
        source_ids: List of source memory IDs that spawned this
        metadata: Additional metadata (JSON serializable)
        access_count: How many times this has been retrieved
        created_at: When this record was created
        updated_at: When this record was last updated
    """

    id: str
    layer: Layer
    mem_type: MemType
    content: str
    supersedes: Optional[str] = None
    confidence: float = 0.5
    source_ids: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    access_count: int = 0
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)

    def __post_init__(self):
        """Normalize enums and validate confidence."""
        if isinstance(self.layer, str):
            self.layer = Layer(self.layer)
        if isinstance(self.mem_type, str):
            self.mem_type = MemType(self.mem_type)
        self.confidence = max(0.0, min(1.0, self.confidence))

    @classmethod
    def create(
        cls,
        layer: Layer,
        mem_type: MemType,
        content: str,
        **kwargs
    ) -> "MemoryRecord":
        """Factory method to create a new record with generated ID."""
        return cls(
            id=f"mem-{uuid.uuid4().hex[:16]}",
            layer=layer,
            mem_type=mem_type,
            content=content,
            **kwargs
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        return {
            "id": self.id,
            "layer": self.layer.value,
            "mem_type": self.mem_type.value,
            "content": self.content,
            "supersedes": self.supersedes,
            "confidence": self.confidence,
            "source_ids": self.source_ids,
            "metadata": self.metadata,
            "access_count": self.access_count,
            "created_at": self.created_at.timestamp(),
            "updated_at": self.updated_at.timestamp(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MemoryRecord":
        """Create from dictionary retrieved from storage."""
        return cls(
            id=data["id"],
            layer=Layer(data["layer"]),
            mem_type=MemType(data["mem_type"]),
            content=data["content"],
            supersedes=data.get("supersedes"),
            confidence=data.get("confidence", 0.5),
            source_ids=data.get("source_ids", []),
            metadata=data.get("metadata", {}),
            access_count=data.get("access_count", 0),
            created_at=datetime.fromtimestamp(data["created_at"]),
            updated_at=datetime.fromtimestamp(data["updated_at"]),
        )

    def is_higher_layer_than(self, other: "MemoryRecord") -> bool:
        """Check if this record is in a higher layer than another."""
        layer_order = {
            Layer.RAW: 1,
            Layer.FACT: 2,
            Layer.IDENTITY: 3,
            Layer.SUMMARY: 4,
            Layer.SCHEMA: 5,
            Layer.INTENTION: 6,
        }
        return layer_order.get(self.layer, 0) > layer_order.get(other.layer, 0)

    def touches(self) -> "MemoryRecord":
        """Increment access count and update timestamp."""
        self.access_count += 1
        self.updated_at = datetime.now()
        return self


@dataclass
class RetrievalResult:
    """Result from a memory retrieval operation.

    Includes the matched record, similarity score, and optional evolution chain.
    """

    record: MemoryRecord
    score: float
    chain: List[MemoryRecord] = field(default_factory=list)

    def has_evolution_history(self) -> bool:
        """Check if this result has an evolution chain."""
        return len(self.chain) > 0

    def full_history(self) -> List[MemoryRecord]:
        """Get full history including current record and chain."""
        return [self.record] + self.chain


@dataclass
class SessionRaw:
    """Raw conversation trace for L1 storage.

    Stores verbatim conversation turns for L1 RAW layer.
    """

    id: str
    session_id: str
    role: str  # "user" or "assistant"
    content: str
    turn_number: int
    created_at: datetime = field(default_factory=datetime.now)

    @classmethod
    def create(
        cls,
        session_id: str,
        role: str,
        content: str,
        turn_number: int,
    ) -> "SessionRaw":
        """Factory method to create a new raw trace."""
        return cls(
            id=f"raw-{uuid.uuid4().hex[:16]}",
            session_id=session_id,
            role=role,
            content=content,
            turn_number=turn_number,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for storage."""
        return {
            "id": self.id,
            "session_id": self.session_id,
            "role": self.role,
            "content": self.content,
            "turn_number": self.turn_number,
            "created_at": self.created_at.timestamp(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SessionRaw":
        """Create from dictionary retrieved from storage."""
        return cls(
            id=data["id"],
            session_id=data["session_id"],
            role=data["role"],
            content=data["content"],
            turn_number=data["turn_number"],
            created_at=datetime.fromtimestamp(data["created_at"]),
        )
