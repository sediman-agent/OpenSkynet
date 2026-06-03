"""
Memory Merger for System 2 Memory.

Handles deduplication, merging, and conflict resolution for memory records.
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from difflib import SequenceMatcher
from pydantic import BaseModel, Field

from .models import MemoryRecord, MemType, Layer

logger = logging.getLogger(__name__)


class MergeResult(BaseModel):
    """Result of a merge operation."""

    action: str = Field(
        description="Action taken: new, merged, superseded, skipped"
    )
    record: Optional[MemoryRecord] = Field(default=None, description="The resulting record")
    merged_with: Optional[str] = Field(default=None, description="ID of record merged into")
    superseded: Optional[str] = Field(default=None, description="ID of record superseded")
    reasoning: str = Field(default="", description="Explanation of action")


class DedupDetector:
    """Detects duplicate and subset relationships between facts."""

    def __init__(self, similarity_threshold: float = 0.85):
        """Initialize the dedup detector.

        Args:
            similarity_threshold: Minimum similarity for duplicate detection
        """
        self.similarity_threshold = similarity_threshold

    async def is_duplicate(
        self,
        new_fact: str,
        existing_facts: List[str],
    ) -> bool:
        """Check if new fact is a duplicate of existing.

        Args:
            new_fact: The new fact content
            existing_facts: List of existing fact contents

        Returns:
            True if duplicate found
        """
        for existing in existing_facts:
            similarity = SequenceMatcher(None, new_fact, existing).ratio()
            if similarity >= self.similarity_threshold:
                logger.info(f"Duplicate detected: {new_fact} ~ {existing}")
                return True
        return False

    async def is_subset(
        self,
        new_fact: str,
        existing_facts: List[str],
    ) -> Optional[Tuple[str, bool]]:
        """Check if new fact is a subset of an existing fact.

        Args:
            new_fact: The new fact content
            existing_facts: List of existing fact contents

        Returns:
            Tuple of (existing fact, is_new_subset_of_existing) or None
        """
        for existing in existing_facts:
            # Check if new is contained in existing (new is subset)
            if new_fact.lower() in existing.lower():
                logger.info(f"Subset detected: '{new_fact}' ⊂ '{existing}'")
                return (existing, True)

            # Check if existing is contained in new (existing is subset)
            if existing.lower() in new_fact.lower():
                logger.info(f"Superset detected: '{existing}' ⊂ '{new_fact}'")
                return (existing, False)

        return None

    def semantic_similarity(self, text1: str, text2: str) -> float:
        """Calculate semantic similarity between two texts.

        Args:
            text1: First text
            text2: Second text

        Returns:
            Similarity score (0-1)
        """
        return SequenceMatcher(None, text1, text2).ratio()


class FactMerger:
    """Merges duplicate and related facts."""

    def __init__(self):
        """Initialize the fact merger."""
        self.dedup = DedupDetector()

    async def merge_facts(
        self,
        new_facts: List[Dict[str, Any]],
        existing_records: List[MemoryRecord],
    ) -> List[MergeResult]:
        """Merge new facts with existing records.

        Args:
            new_facts: List of new facts to merge
            existing_records: List of existing memory records

        Returns:
            List of merge results
        """
        results = []

        # Index existing by type for efficient lookup
        by_type: Dict[MemType, List[MemoryRecord]] = {}
        for record in existing_records:
            by_type.setdefault(record.mem_type, []).append(record)

        for fact in new_facts:
            content = fact.get("content", "")
            mem_type = fact.get("mem_type", MemType.FACT)

            if isinstance(mem_type, str):
                mem_type = MemType(mem_type)

            # Get existing records of same type
            existing_of_type = by_type.get(mem_type, [])
            existing_contents = [r.content for r in existing_of_type]

            # Check for duplicates
            is_dup = await self.dedup.is_duplicate(content, existing_contents)
            if is_dup:
                results.append(
                    MergeResult(
                        action="skipped",
                        reasoning=f"Duplicate of existing {mem_type.value}",
                    )
                )
                continue

            # Check for subset relationships
            subset_result = await self.dedup.is_subset(content, existing_contents)
            if subset_result:
                existing_content, is_new_subset = subset_result
                if is_new_subset:
                    # New fact is subset, skip it
                    results.append(
                        MergeResult(
                            action="skipped",
                            reasoning=f"Subset of existing: '{existing_content[:50]}...'",
                        )
                    )
                    continue
                else:
                    # Existing is subset, find the record and update it
                    for record in existing_of_type:
                        if record.content == existing_content:
                            # Create merged record
                            merged_record = MemoryRecord.create(
                                layer=Layer.FACT,
                                mem_type=mem_type,
                                content=content,  # Use the more detailed content
                                source_ids=record.source_ids + [fact.get("source_id")],
                                metadata={**record.metadata, **fact.get("metadata", {})},
                            )
                            results.append(
                                MergeResult(
                                    action="merged",
                                    record=merged_record,
                                    merged_with=record.id,
                                    reasoning=f"Supersedes subset: '{existing_content[:50]}...'",
                                )
                            )
                            break
                    continue

            # No duplicate/subset, create new record
            record = MemoryRecord.create(
                layer=Layer.FACT,
                mem_type=mem_type,
                content=content,
                confidence=fact.get("confidence", 0.8),
                source_ids=[fact.get("source_id")] if fact.get("source_id") else [],
                metadata=fact.get("metadata", {}),
            )
            results.append(
                MergeResult(
                    action="new",
                    record=record,
                    reasoning="New fact, no conflicts",
                )
            )

        return results


class ConflictResolver:
    """Detects and resolves contradictory facts."""

    def __init__(self, llm_provider: Optional[Any] = None):
        """Initialize the conflict resolver.

        Args:
            llm_provider: LLM provider for conflict detection
        """
        self.llm_provider = llm_provider

    async def detect_contradiction(
        self,
        new_fact: Dict[str, Any],
        existing_record: MemoryRecord,
    ) -> bool:
        """Detect if new fact contradicts existing record.

        Args:
            new_fact: The new fact to check
            existing_record: The existing record to compare against

        Returns:
            True if contradiction detected
        """
        # Only check same-type preferences
        if existing_record.mem_type != MemType.PREFERENCE:
            return False

        if new_fact.get("mem_type") != MemType.PREFERENCE:
            return False

        # Use LLM for semantic contradiction detection
        if not self.llm_provider:
            # Fallback: keyword-based detection
            return self._keyword_contradiction(
                new_fact.get("content", ""), existing_record.content
            )

        return await self._llm_contradiction_check(
            new_fact.get("content", ""), existing_record.content
        )

    def _keyword_contradiction(self, new_content: str, existing_content: str) -> bool:
        """Simple keyword-based contradiction detection.

        Args:
            new_content: New fact content
            existing_content: Existing fact content

        Returns:
            True if likely contradiction
        """
        # Opposite preference keywords
        opposites = [
            ("甜", "清淡"),
            ("甜", "苦"),
            ("辣", "清淡"),
            ("hot", "mild"),
            ("sweet", "salty"),
            ("喜欢", "不喜欢"),
            ("love", "hate"),
            ("prefer", "avoid"),
        ]

        for word1, word2 in opposites:
            if word1 in existing_content and word2 in new_content:
                return True
            if word2 in existing_content and word1 in new_content:
                return True

        return False

    async def _llm_contradiction_check(
        self, new_content: str, existing_content: str
    ) -> bool:
        """Use LLM to detect contradictions.

        Args:
            new_content: New fact content
            existing_content: Existing fact content

        Returns:
            True if contradiction detected
        """
        try:
            prompt = f"""Check if these two statements contradict each other:

Statement A: "{existing_content}"
Statement B: "{new_content}"

Respond with JSON:
{{
    "contradicts": true/false,
    "reasoning": "brief explanation"
}}

Contradiction means they express opposite preferences or facts."""

            response = await self.llm_provider(
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.1,
                max_tokens=150,
            )

            import json

            data = json.loads(response.content.strip())
            return data.get("contradicts", False)

        except Exception as e:
            logger.warning(f"LLM contradiction check failed: {e}")
            return False

    async def resolve_with_supersede(
        self,
        old_record: MemoryRecord,
        new_content: str,
        metadata: Dict[str, Any],
    ) -> MemoryRecord:
        """Resolve contradiction by superseding old record.

        Args:
            old_record: The record being superseded
            new_content: New content (superseding)
            metadata: Additional metadata

        Returns:
            New record with supersedes pointer
        """
        return MemoryRecord.create(
            layer=old_record.layer,
            mem_type=old_record.mem_type,
            content=new_content,
            supersedes=old_record.id,  # Evolution chain!
            source_ids=old_record.source_ids,
            metadata={
                **metadata,
                "superseded_reason": "Contradiction detected, created evolution chain",
                "superseded_at": metadata.get("extracted_at"),
            },
        )
