"""
Evolution Chain Management for System 2 Memory.

Manages supersedes pointers and traces evolution history for changing preferences.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

from .models import MemoryRecord, MemoryLink, LinkType, MemType

logger = logging.getLogger(__name__)


class ChainBuilder:
    """Builds evolution chains for memory records.

    When a preference changes, the new record supersedes the old one,
    creating a traceable history of how and why preferences evolved.
    """

    def __init__(self):
        """Initialize the chain builder."""
        pass

    async def build_chain(
        self,
        old_record: MemoryRecord,
        new_content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> MemoryRecord:
        """Build a new record that supersedes an old one.

        Args:
            old_record: The record being superseded
            new_content: New content for the superseding record
            metadata: Additional metadata for the new record

        Returns:
            New record with supersedes pointer set
        """
        new_record = MemoryRecord.create(
            layer=old_record.layer,
            mem_type=old_record.mem_type,
            content=new_content,
            supersedes=old_record.id,  # Key: evolution chain pointer
            source_ids=old_record.source_ids[:],  # Copy source chain
            metadata={
                **(old_record.metadata or {}),
                **(metadata or {}),
                "chain_created_at": datetime.now().isoformat(),
                "chain_reason": "Preference evolution detected",
            },
            confidence=old_record.confidence,
        )

        logger.info(
            f"Built evolution chain: {old_record.id} -> {new_record.id}"
        )
        return new_record

    async def create_link(
        self,
        source_id: str,
        target_id: str,
        link_type: LinkType,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> MemoryLink:
        """Create a link between two records.

        Args:
            source_id: Source record ID
            target_id: Target record ID
            link_type: Type of link
            metadata: Additional metadata

        Returns:
            MemoryLink object
        """
        return MemoryLink(
            source_id=source_id,
            target_id=target_id,
            link_type=link_type,
            metadata=metadata or {},
        )

    def should_create_chain(
        self,
        old_record: MemoryRecord,
        new_content: str,
    ) -> bool:
        """Determine if a new evolution chain should be created.

        Args:
            old_record: Existing record
            new_content: New content

        Returns:
            True if chain should be created
        """
        # Only create chains for preferences and identity
        if old_record.mem_type not in [
            MemType.PREFERENCE,
            MemType.IDENTITY,
        ]:
            return False

        # Check if content is substantially different
        similarity = self._content_similarity(old_record.content, new_content)
        return similarity < 0.7  # Different enough to warrant chain

    def _content_similarity(self, content1: str, content2: str) -> float:
        """Calculate similarity between two contents.

        Args:
            content1: First content
            content2: Second content

        Returns:
            Similarity ratio (0-1)
        """
        from difflib import SequenceMatcher

        return SequenceMatcher(None, content1, content2).ratio()


class ChainTracer:
    """Traces evolution chains to understand how preferences changed."""

    def __init__(self):
        """Initialize the chain tracer."""
        pass

    async def trace_chain(
        self,
        record_id: str,
        get_record_fn,  # Function to fetch record by ID
        max_depth: int = 10,
    ) -> List[MemoryRecord]:
        """Trace the full evolution chain from a record.

        Args:
            record_id: Starting record ID
            get_record_fn: Async function to fetch records
            max_depth: Maximum depth to trace

        Returns:
            List of records in evolution order (oldest to newest)
        """
        chain = []
        current_id = record_id
        visited = set()

        for _ in range(max_depth):
            if current_id in visited:
                logger.warning(f"Cycle detected in chain at {current_id}")
                break

            visited.add(current_id)

            record = await get_record_fn(current_id)
            if not record:
                break

            chain.append(record)

            if record.supersedes:
                current_id = record.supersedes
            else:
                # End of chain
                break

        # Reverse to get chronological order (oldest -> newest)
        return list(reversed(chain))

    async def get_chain_summary(
        self,
        chain: List[MemoryRecord],
    ) -> Dict[str, Any]:
        """Get summary information about an evolution chain.

        Args:
            chain: List of records in chronological order

        Returns:
            Dictionary with chain statistics
        """
        if not chain:
            return {"length": 0, "has_evolution": False}

        return {
            "length": len(chain),
            "has_evolution": len(chain) > 1,
            "oldest": {
                "content": chain[0].content,
                "created_at": chain[0].created_at.isoformat(),
            },
            "newest": {
                "content": chain[-1].content,
                "created_at": chain[-1].created_at.isoformat(),
            },
            "evolution_summary": self._summarize_evolution(chain),
        }

    def _summarize_evolution(self, chain: List[MemoryRecord]) -> str:
        """Create a human-readable summary of evolution.

        Args:
            chain: List of records in chronological order

        Returns:
            Summary string
        """
        if len(chain) == 1:
            return f"Stable: {chain[0].content[:50]}..."

        if len(chain) == 2:
            return f"Changed from '{chain[0].content[:30]}...' to '{chain[1].content[:30]}...'"

        # For longer chains, summarize the progression
        parts = []
        for i, record in enumerate(chain):
            if i == 0:
                parts.append(f"Started as: {record.content[:40]}...")
            elif i == len(chain) - 1:
                parts.append(f"Now: {record.content[:40]}...")
            else:
                parts.append(f"→ {record.content[:30]}...")

        return " | ".join(parts)

    async def find_all_chains(
        self,
        layer_records: List[MemoryRecord],
    ) -> Dict[str, List[str]]:
        """Find all evolution chains in a set of records.

        Args:
            layer_records: List of records to analyze

        Returns:
            Dictionary mapping chain root IDs to chain member IDs
        """
        # Build ID to record map
        records_by_id = {r.id: r for r in layer_records}

        # Find chain roots (records with no supersedes pointing to them)
        # and build chain membership
        chains: Dict[str, List[str]] = {}
        visited = set()

        for record in layer_records:
            if record.id in visited:
                continue

            # Trace this record's chain to find root
            chain_ids = []
            current = record

            while current:
                if current.id in visited:
                    break
                visited.add(current.id)
                chain_ids.append(current.id)

                if current.supersedes and current.supersedes in records_by_id:
                    current = records_by_id[current.supersedes]
                else:
                    # This is the root (or chain broken)
                    break

            # Reverse to get root -> leaf order
            chain_ids.reverse()

            if chain_ids:
                root_id = chain_ids[0]
                if root_id not in chains:
                    chains[root_id] = []
                chains[root_id].extend(chain_ids)

        return chains


class EvolutionStats:
    """Statistics about evolution chains in the memory system."""

    def __init__(self):
        """Initialize evolution stats."""
        self.total_chains = 0
        self.total_links = 0
        self.max_chain_length = 0
        self.avg_chain_length = 0.0
        self.chains_by_type: Dict[str, int] = {}

    @classmethod
    def from_chains(cls, chains: Dict[str, List[str]]) -> "EvolutionStats":
        """Calculate stats from discovered chains.

        Args:
            chains: Dictionary of root IDs to member IDs

        Returns:
            EvolutionStats object
        """
        stats = cls()

        if not chains:
            return stats

        stats.total_chains = len(chains)
        lengths = [len(members) for members in chains.values()]

        if lengths:
            stats.max_chain_length = max(lengths)
            stats.avg_chain_length = sum(lengths) / len(lengths)

        return stats
