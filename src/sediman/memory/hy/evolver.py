"""
Layer Evolution for System 2 Memory.

Handles promotion of facts between layers (L2 FACT -> L3 IDENTITY).
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

from .models import MemoryRecord, Layer, MemType

logger = logging.getLogger(__name__)


class LayerPromoter:
    """Promotes facts from lower layers to higher layers.

    L2 FACT -> L3 IDENTITY for stable preferences and traits.
    """

    def __init__(self, llm_provider: Optional[Any] = None):
        """Initialize the layer promoter.

        Args:
            llm_provider: LLM provider for classification
        """
        self.llm_provider = llm_provider

    async def should_promote_to_identity(
        self,
        fact: MemoryRecord,
    ) -> bool:
        """Determine if a fact should be promoted to L3 IDENTITY.

        Args:
            fact: The fact to evaluate

        Returns:
            True if should promote
        """
        # Preferences and identity facts are candidates
        if fact.mem_type in [MemType.PREFERENCE, MemType.IDENTITY]:
            # Check for stability indicators
            return self._is_stable_preference(fact)

        return False

    def _is_stable_preference(self, fact: MemoryRecord) -> bool:
        """Check if preference appears stable.

        Args:
            fact: The fact to check

        Returns:
            True if appears stable
        """
        # High confidence suggests stability
        if fact.confidence >= 0.8:
            return True

        # Check metadata for stability indicators
        metadata = fact.metadata or {}
        access_count = fact.access_count

        # Frequently accessed facts are stable
        if access_count >= 3:
            return True

        # Explicitly marked as stable
        if metadata.get("stable") is True:
            return True

        return False

    async def promote_to_identity(
        self,
        fact: MemoryRecord,
        store,  # HyMemoryStore instance
    ) -> Optional[MemoryRecord]:
        """Promote a fact to L3 IDENTITY layer.

        Args:
            fact: The fact to promote
            store: Memory store for checking existing identities

        Returns:
            New identity record, or None if shouldn't promote
        """
        if not await self.should_promote_to_identity(fact):
            return None

        # Check for conflicting existing identities
        existing_identities = await store.query_by_type(MemType.IDENTITY, limit=20)

        for existing in existing_identities:
            if await self._is_same_identity(fact, existing):
                # Same identity, update existing instead of creating new
                existing.content = fact.content
                existing.updated_at = datetime.now()
                existing.access_count += 1
                existing.metadata = {
                    **(existing.metadata or {}),
                    **(fact.metadata or {}),
                    "promoted_from": fact.id,
                    "promoted_at": datetime.now().isoformat(),
                }
                await store.update_record(existing)
                logger.info(f"Updated existing identity: {existing.id}")
                return existing

        # Create new identity record
        identity = MemoryRecord.create(
            layer=Layer.IDENTITY,
            mem_type=MemType.IDENTITY,
            content=fact.content,
            supersedes=fact.supersedes,
            confidence=fact.confidence,
            source_ids=[fact.id] if fact.id else [],
            metadata={
                **(fact.metadata or {}),
                "promoted_from_fact": True,
                "promoted_at": datetime.now().isoformat(),
                "original_layer": fact.layer.value,
            },
        )

        await store.add_record(identity)
        logger.info(f"Promoted to identity: {identity.id}")

        return identity

    async def _is_same_identity(
        self,
        fact: MemoryRecord,
        existing: MemoryRecord,
    ) -> bool:
        """Check if fact represents same identity as existing.

        Args:
            fact: The fact to check
            existing: Existing identity record

        Returns:
            True if same identity
        """
        # Simple keyword matching for same domain
        fact_keywords = set(fact.content.lower().split())
        existing_keywords = set(existing.content.lower().split())

        # If 50%+ overlap, consider same identity
        if not fact_keywords or not existing_keywords:
            return False

        intersection = fact_keywords & existing_keywords
        union = fact_keywords | existing_keywords

        similarity = len(intersection) / len(union) if union else 0

        return similarity >= 0.5

    async def batch_promote(
        self,
        facts: List[MemoryRecord],
        store,
    ) -> List[MemoryRecord]:
        """Batch promote multiple facts to identity.

        Args:
            facts: List of facts to evaluate
            store: Memory store

        Returns:
            List of newly created/updated identity records
        """
        promoted = []

        for fact in facts:
            if fact.layer != Layer.FACT:
                continue

            identity = await self.promote_to_identity(fact, store)
            if identity:
                promoted.append(identity)

        logger.info(f"Promoted {len(promoted)} facts to identity")
        return promoted

    async def consolidate_identities(
        self,
        store,
        max_age_days: int = 90,
    ) -> int:
        """Consolidate stale identity records.

        Args:
            store: Memory store
            max_age_days: Maximum age before consolidation

        Returns:
            Number of identities consolidated
        """
        from datetime import timedelta

        cutoff = datetime.now() - timedelta(days=max_age_days)

        # Get old identities
        identities = await store.query_by_type(MemType.IDENTITY, limit=100)

        consolidated = 0
        for identity in identities:
            if identity.updated_at < cutoff:
                # Check if still relevant
                if identity.access_count < 2:
                    # Low access and old, consider archiving
                    # For now, just mark as archived
                    identity.metadata = identity.metadata or {}
                    identity.metadata["archived"] = True
                    identity.metadata["archived_at"] = datetime.now().isoformat()
                    identity.metadata["archived_reason"] = "Low access and old"
                    await store.update_record(identity)
                    consolidated += 1

        logger.info(f"Consolidated {consolidated} identities")
        return consolidated


class PreferenceEvolver:
    """Specialized handler for evolving preferences."""

    def __init__(self, llm_provider: Optional[Any] = None):
        """Initialize the preference evolver.

        Args:
            llm_provider: LLM provider
        """
        self.llm_provider = llm_provider
        self.promoter = LayerPromoter(llm_provider)

    async def handle_preference_change(
        self,
        old_preference: MemoryRecord,
        new_content: str,
        metadata: Dict[str, Any],
        store,
    ) -> MemoryRecord:
        """Handle a preference change with evolution chain.

        Args:
            old_preference: The preference being changed
            new_content: New preference content
            metadata: Additional metadata
            store: Memory store

        Returns:
            New preference record with evolution chain
        """
        # Create chain link
        from .chain import ChainBuilder

        builder = ChainBuilder()
        new_preference = await builder.build_chain(
            old_preference, new_content, metadata
        )

        # Store new preference
        await store.add_record(new_preference)

        # Promote to identity if stable
        identity = await self.promoter.promote_to_identity(new_preference, store)

        logger.info(
            f"Preference evolved: {old_preference.id} -> {new_preference.id}"
        )

        return new_preference

    async def detect_preference_category(
        self,
        preference: str,
    ) -> str:
        """Detect the category of a preference.

        Args:
            preference: Preference content

        Returns:
            Category string (food, entertainment, work, etc.)
        """
        # Simple keyword-based categorization
        categories = {
            "food": ["吃", "喝", "饮食", "菜", "food", "eat", "drink", "cuisine"],
            "entertainment": ["电影", "音乐", "游戏", "movie", "music", "game"],
            "work": ["工作", "职业", "work", "job", "career"],
            "lifestyle": ["运动", "健身", "exercise", "fitness", "sport"],
            "social": ["社交", "朋友", "social", "friend"],
        }

        preference_lower = preference.lower()

        for category, keywords in categories.items():
            if any(keyword in preference_lower for keyword in keywords):
                return category

        return "general"
