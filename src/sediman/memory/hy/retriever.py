"""
Memory Retriever for System 2 Memory.

Implements semantic search with evolution chain tracing.
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from .models import (
    MemoryRecord,
    RetrievalResult,
    Layer,
    MemType,
    LinkType,
)
from .chain import ChainTracer

logger = logging.getLogger(__name__)


class HyRetriever:
    """Retrieves memories with semantic search and chain tracing."""

    def __init__(self, store, embedding_provider: Optional[Any] = None):
        """Initialize the retriever.

        Args:
            store: HyMemoryStore instance
            embedding_provider: Embedding provider for semantic search
        """
        self.store = store
        self.embedding_provider = embedding_provider
        self.chain_tracer = ChainTracer()

    async def retrieve(
        self,
        query: str,
        limit: int = 5,
        layer: Optional[Layer] = None,
        mem_type: Optional[MemType] = None,
    ) -> List[RetrievalResult]:
        """Retrieve memories matching a query.

        Args:
            query: Search query
            limit: Maximum results to return
            layer: Optional layer filter
            mem_type: Optional memory type filter

        Returns:
            List of retrieval results with chains
        """
        # First, get candidate records
        if self.embedding_provider:
            # Use semantic search
            candidates = await self._semantic_search(query, limit * 2)
        else:
            # Fallback to content search
            candidates = await self.store.search_by_content(query, limit * 2, layer)

        # Apply filters if specified
        if layer:
            candidates = [(r, s) for r, s in candidates if r.layer == layer]
        if mem_type:
            candidates = [(r, s) for r, s in candidates if r.mem_type == mem_type]

        # Build results with chain tracing
        results = []
        for record, score in candidates[:limit]:
            # Trace evolution chain if applicable
            chain = []
            if record.supersedes:
                chain = await self.chain_tracer.trace_chain(
                    record.id,
                    self.store.get_record,
                    max_depth=5,
                )
                # Exclude the record itself from chain (it's already the main result)
                chain = [c for c in chain if c.id != record.id]

            results.append(
                RetrievalResult(
                    record=record,
                    score=score,
                    chain=chain,
                )
            )

        # Update access counts
        for result in results:
            result.record.touches()
            await self.store.update_record(result.record)

        return results

    async def retrieve_by_layer(
        self,
        layer: Layer,
        limit: int = 10,
    ) -> List[RetrievalResult]:
        """Retrieve all memories from a specific layer.

        Args:
            layer: Layer to retrieve from
            limit: Maximum results

        Returns:
            List of retrieval results
        """
        records = await self.store.query_by_layer(layer, limit=limit)

        return [
            RetrievalResult(
                record=record,
                score=1.0,  # No relevance scoring for layer queries
                chain=[],
            )
            for record in records
        ]

    async def retrieve_recent(
        self,
        limit: int = 20,
        layer: Optional[Layer] = None,
    ) -> List[RetrievalResult]:
        """Retrieve recent memories.

        Args:
            limit: Maximum results
            layer: Optional layer filter

        Returns:
            List of retrieval results
        """
        records = await self.store.query_recent(limit=limit, layer=layer)

        return [
            RetrievalResult(
                record=record,
                score=1.0,
                chain=[],
            )
            for record in records
        ]

    async def retrieve_with_context(
        self,
        query: str,
        task: Optional[str] = None,
        max_chars: int = 1500,
        layer: Optional[Layer] = None,
    ) -> str:
        """Retrieve memories and format as context for LLM.

        Args:
            query: Search query
            task: Optional task description for relevance filtering
            max_chars: Maximum characters in output
            layer: Optional layer filter

        Returns:
            Formatted context string
        """
        results = await self.retrieve(query, limit=10, layer=layer)

        # Format results
        context_parts = []

        for result in results:
            # Main record
            part = f"[{result.record.layer.value}] {result.record.content}"

            # Add evolution chain if present
            if result.has_evolution_history():
                chain_summary = self._format_chain_summary(result.chain)
                part += f"\n  Evolution: {chain_summary}"

            context_parts.append(part)

        # Join and truncate
        context = "\n\n".join(context_parts)

        if len(context) > max_chars:
            context = context[: max_chars - 3] + "..."

        return context

    async def trace_evolution(
        self,
        record_id: str,
    ) -> List[MemoryRecord]:
        """Trace full evolution chain from a record.

        Args:
            record_id: Starting record ID

        Returns:
            Evolution chain (oldest to newest)
        """
        return await self.chain_tracer.trace_chain(
            record_id,
            self.store.get_record,
            max_depth=10,
        )

    async def get_evolution_summary(
        self,
        record_id: str,
    ) -> Dict[str, Any]:
        """Get summary of evolution chain.

        Args:
            record_id: Starting record ID

        Returns:
            Dictionary with evolution summary
        """
        chain = await self.trace_evolution(record_id)
        return await self.chain_tracer.get_chain_summary(chain)

    async def _semantic_search(
        self,
        query: str,
        limit: int = 10,
    ) -> List[Tuple[MemoryRecord, float]]:
        """Perform semantic search using embeddings.

        Args:
            query: Search query
            limit: Maximum results

        Returns:
            List of (record, score) tuples
        """
        if not self.embedding_provider:
            # Fallback to content search
            return await self.store.search_by_content(query, limit)

        try:
            # Get query embedding
            query_embedding = await self.embedding_provider.embed(query)

            # In production, would query vector store here
            # For now, fallback to content search
            results = await self.store.search_by_content(query, limit)

            # Add mock similarity scores
            return [(r, min(1.0, 0.5 + (i * 0.1))) for i, r in enumerate(results)]

        except Exception as e:
            logger.error(f"Semantic search failed: {e}")
            return await self.store.search_by_content(query, limit)

    def _format_chain_summary(self, chain: List[MemoryRecord]) -> str:
        """Format evolution chain for display.

        Args:
            chain: List of records in chain

        Returns:
            Formatted summary string
        """
        if not chain:
            return ""

        if len(chain) == 1:
            return f"Previously: {chain[0].content[:50]}..."

        # For multi-step chains, show progression
        parts = []
        for record in reversed(chain):  # Newest first
            parts.append(record.content[:40])

        return " → ".join(parts) + "..."

    async def find_related(
        self,
        record_id: str,
        limit: int = 5,
    ) -> List[RetrievalResult]:
        """Find memories related to a given record.

        Args:
            record_id: Record to find relations for
            limit: Maximum results

        Returns:
            List of related records
        """
        record = await self.store.get_record(record_id)
        if not record:
            return []

        # Get links
        links = await self.store.get_links(record_id)

        results = []
        for link in links[:limit]:
            related = await self.store.get_record(link.target_id)
            if related:
                results.append(
                    RetrievalResult(
                        record=related,
                        score=0.8,  # Fixed score for linked records
                        chain=[],
                    )
                )

        return results

    async def search_by_type(
        self,
        query: str,
        mem_type: MemType,
        limit: int = 5,
    ) -> List[RetrievalResult]:
        """Search memories of a specific type.

        Args:
            query: Search query
            mem_type: Memory type to search
            limit: Maximum results

        Returns:
            List of retrieval results
        """
        candidates = await self.store.query_by_type(mem_type, limit=limit * 2)

        # Simple relevance scoring based on query match
        query_lower = query.lower()
        scored = []

        for record in candidates:
            if query_lower in record.content.lower():
                scored.append((record, 0.9))
            else:
                # Lower score for type matches without content match
                scored.append((record, 0.5))

        # Sort by score
        scored.sort(key=lambda x: x[1], reverse=True)

        # Build results
        results = []
        for record, score in scored[:limit]:
            results.append(
                RetrievalResult(
                    record=record,
                    score=score,
                    chain=[],
                )
            )

        return results

    async def get_stats(self) -> Dict[str, Any]:
        """Get retrieval statistics.

        Returns:
            Dictionary with stats
        """
        store_stats = await self.store.get_stats()

        return {
            **store_stats,
            "has_embedding_provider": self.embedding_provider is not None,
        }


class ContextBuilder:
    """Builds context strings for LLM prompts from retrieved memories."""

    def __init__(
        self,
        retriever: HyRetriever,
    ):
        """Initialize the context builder.

        Args:
            retriever: HyRetriever instance
        """
        self.retriever = retriever

    async def build_system_context(
        self,
        task: Optional[str] = None,
        max_chars: int = 1500,
        include_layers: Optional[List[Layer]] = None,
    ) -> str:
        """Build system prompt context from memories.

        Args:
            task: Optional task for relevance filtering
            max_chars: Maximum characters
            include_layers: Layers to include (default: IDENTITY, PREFERENCE)

        Returns:
            Formatted context string
        """
        if include_layers is None:
            include_layers = [Layer.IDENTITY, Layer.PREFERENCE]

        context_parts = []

        for layer in include_layers:
            query = task or "relevant information"
            layer_context = await self.retriever.retrieve_with_context(
                query,
                max_chars=max_chars // len(include_layers),
                layer=layer,
            )

            if layer_context:
                context_parts.append(f"## {layer.value} Memories\n{layer_context}")

        return "\n\n".join(context_parts)

    async def build_identity_profile(
        self,
        max_chars: int = 800,
    ) -> str:
        """Build user identity profile from L3 memories.

        Args:
            max_chars: Maximum characters

        Returns:
            Formatted identity profile
        """
        identities = await self.retriever.retrieve_by_layer(
            Layer.IDENTITY, limit=20
        )

        if not identities:
            return "No identity information available."

        parts = []

        for result in identities:
            record = result.record
            part = f"- {record.content}"

            if result.has_evolution_history():
                part += f" (evolved from: {result.chain[0].content[:30]}...)"

            parts.append(part)

        profile = "User Profile:\n" + "\n".join(parts)

        if len(profile) > max_chars:
            profile = profile[: max_chars - 3] + "..."

        return profile

    async def build_preference_summary(
        self,
        max_chars: int = 600,
    ) -> str:
        """Build preference summary from L2/L3 memories.

        Args:
            max_chars: Maximum characters

        Returns:
            Formatted preference summary
        """
        # Get preferences from both L2 and L3
        l2_prefs = await self.retriever.retrieve_by_layer(
            Layer.FACT, limit=10
        )
        l3_prefs = await self.retriever.retrieve_by_layer(
            Layer.IDENTITY, limit=10
        )

        # Filter for preference type
        all_prefs = []

        for result in l2_prefs + l3_prefs:
            if result.record.mem_type == MemType.PREFERENCE:
                all_prefs.append(result)

        if not all_prefs:
            return "No preferences recorded."

        parts = []

        for result in all_prefs[:15]:  # Limit to 15 preferences
            record = result.record
            part = f"- {record.content}"

            if result.has_evolution_history():
                part += f" (changed from: {result.chain[0].content[:30]}...)"

            parts.append(part)

        summary = "User Preferences:\n" + "\n".join(parts)

        if len(summary) > max_chars:
            summary = summary[: max_chars - 3] + "..."

        return summary
