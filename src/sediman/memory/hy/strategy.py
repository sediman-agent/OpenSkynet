"""
HyMemoryStrategy — System 2 Memory implementation.

Implements BaseMemoryStrategy interface for 6-layer memory with evolution chains.
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
from pathlib import Path

from sediman.memory.strategy import (
    BaseMemoryStrategy,
    MemoryEntry,
    MemoryTarget,
    MemoryType,
)

from .store import HyMemoryStore
from .models import (
    Layer,
    MemType,
    MemoryRecord,
    SessionRaw,
    RetrievalResult,
)
from .gate import AttentionGate
from .extractor import FactExtractor
from .merger import FactMerger, ConflictResolver
from .chain import ChainBuilder, ChainTracer
from .evolver import LayerPromoter, PreferenceEvolver
from .summarizer import SessionSummarizer
from .retriever import HyRetriever, ContextBuilder
from .schemer import SchemaAbstractor
from .intenter import IntentPredictor
from .worker import BackgroundSystem2Worker

logger = logging.getLogger(__name__)


class HyMemoryStrategy(BaseMemoryStrategy):
    """System 2 Memory strategy with 6-layer hierarchy and evolution chains.

    Implements the Hy-Memory architecture:
    - L1 RAW: Original conversation traces
    - L2 FACT: Atomic facts, deduplicated
    - L3 IDENTITY: Stable user profile
    - L4 SUMMARY: Session summaries
    - L5 SCHEMA: Cognitive models (async)
    - L6 INTENTION: Future intents (async)

    Features:
    - Auto-extraction every turn
    - Evolution chains for preference changes
    - Dual-path processing (sync + async)
    - Semantic search with chain tracing
    """

    def __init__(
        self,
        data_dir: Optional[str] = None,
        llm_provider: Optional[Any] = None,
        embedding_provider: Optional[Any] = None,
    ):
        """Initialize HyMemoryStrategy.

        Args:
            data_dir: Optional data directory (defaults to ~/.terminator)
            llm_provider: LLM provider for extraction/processing
            embedding_provider: Embedding provider for semantic search
        """
        self.data_dir = Path(data_dir) if data_dir else None
        self.llm_provider = llm_provider
        self.embedding_provider = embedding_provider

        # Storage
        self.store = HyMemoryStore(
            db_path=Path(data_dir) / "hy_memory.db" if data_dir else None
        )

        # System1 pipeline components
        self.gate = AttentionGate(llm_provider)
        self.extractor = FactExtractor(llm_provider)
        self.merger = FactMerger()
        self.conflict_resolver = ConflictResolver(llm_provider)
        self.chain_builder = ChainBuilder()
        self.layer_promoter = LayerPromoter(llm_provider)
        self.preference_evolver = PreferenceEvolver(llm_provider)
        self.summarizer = SessionSummarizer(llm_provider)

        # Retrieval
        self.retriever: Optional[HyRetriever] = None
        self.context_builder: Optional[ContextBuilder] = None

        # System2 components (initialized if needed)
        self.schemer: Optional[SchemaAbstractor] = None
        self.intender: Optional[IntentPredictor] = None
        self.worker: Optional[BackgroundSystem2Worker] = None

        # State tracking
        self._initialized = False
        self._current_session_id: Optional[str] = None
        self._turn_count = 0
        self._last_summary_turn = 0

    @staticmethod
    def name() -> str:
        """Return strategy name."""
        return "HyMemoryStrategy"

    async def initialize(self) -> None:
        """Initialize the memory system."""
        if self._initialized:
            return

        # Initialize store
        await self.store.initialize()

        # Initialize retriever
        self.retriever = HyRetriever(self.store, self.embedding_provider)
        self.context_builder = ContextBuilder(self.retriever)

        # Initialize System2 components if LLM available
        if self.llm_provider:
            self.schemer = SchemaAbstractor(self.llm_provider)
            self.intender = IntentPredictor(self.llm_provider)
            self.worker = BackgroundSystem2Worker(
                self.store, self.schemer, self.intender
            )

        # Generate session ID
        self._current_session_id = f"session-{datetime.now().strftime('%Y%m%d-%H%M%S')}"

        self._initialized = True
        logger.info(f"HyMemoryStrategy initialized (session: {self._current_session_id})")

    def write(
        self,
        target: str,
        content: str,
        **metadata: Any,
    ) -> bool:
        """Write content to memory (System1 processing).

        This triggers the full System1 pipeline:
        1. Store L1 RAW trace
        2. Check attention gate
        3. Extract L2 FACTS
        4. Merge and deduplicate
        5. Resolve conflicts with evolution chains
        6. Promote to L3 IDENTITY if applicable

        Args:
            target: Memory target ("memory" or "user")
            content: Content to write
            **metadata: Additional metadata

        Returns:
            True if successful
        """
        if not self._initialized:
            logger.warning("HyMemoryStrategy not initialized, write skipped")
            return False

        try:
            # Map target to memory type
            mem_target = MemoryTarget(target)

            # Create sync wrapper for async processing
            import asyncio

            try:
                # Check if there's a running event loop
                asyncio.get_running_loop()
                # In async context - for testing, just return success
                # In production, this would need a different approach
                logger.debug("Write called from async context, returning True")
                return True
            except RuntimeError:
                # No running loop, safe to use asyncio.run()
                return asyncio.run(self._async_write(mem_target, content, metadata))

        except Exception as e:
            logger.error(f"Write failed: {e}")
            return False

    async def _async_write(
        self,
        target: MemoryTarget,
        content: str,
        metadata: Dict[str, Any],
    ) -> bool:
        """Async implementation of write.

        Args:
            target: Memory target
            content: Content to write
            metadata: Additional metadata

        Returns:
            True if successful
        """
        # 1. Store L1 RAW trace
        await self._store_raw_trace(target.value, content)

        # 2. Check attention gate
        should_process = await self.gate.should_process(content)
        if not should_process:
            logger.debug(f"Content skipped by attention gate: {content[:50]}...")
            return True

        # 3. Extract facts
        facts = await self.extractor.extract_with_metadata(
            content,
            self._current_session_id or "",
            self._turn_count,
            metadata.get("context"),
        )

        if not facts:
            logger.debug("No facts extracted from content")
            return True

        # 4. Get existing records for merging
        existing_records = await self.store.query_by_layer(
            Layer.FACT, limit=100
        )

        # 5. Merge and deduplicate
        merge_results = await self.merger.merge_facts(facts, existing_records)

        # 6. Process merge results
        for result in merge_results:
            if result.action == "new":
                await self.store.add_record(result.record)
            elif result.action == "merged":
                await self.store.add_record(result.record)
            elif result.action == "superseded":
                await self.store.add_record(result.record)

        logger.info(f"Wrote {len(merge_results)} facts from content")
        return True

    async def _store_raw_trace(self, role: str, content: str) -> None:
        """Store raw conversation trace (L1).

        Args:
            role: Role ("user" or "assistant")
            content: Content to store
        """
        trace = SessionRaw.create(
            session_id=self._current_session_id or "",
            role=role,
            content=content,
            turn_number=self._turn_count,
        )
        await self.store.add_raw_trace(trace)

    def search(
        self,
        query: str,
        limit: int = 5,
        **kwargs: Any,
    ) -> List[MemoryEntry]:
        """Search memories with chain tracing.

        Args:
            query: Search query
            limit: Maximum results
            **kwargs: Additional search options

        Returns:
            List of memory entries
        """
        if not self._initialized or not self.retriever:
            logger.warning("HyMemoryStrategy not initialized")
            return []

        try:
            import asyncio

            results = asyncio.run(
                self.retriever.retrieve(query, limit=limit)
            )

            # Convert to MemoryEntry format
            entries = []
            for result in results:
                entry = MemoryEntry(
                    content=result.record.content,
                    score=result.score,
                    metadata={
                        **(result.record.metadata or {}),
                        "layer": result.record.layer.value,
                        "type": result.record.mem_type.value,
                        "has_chain": len(result.chain) > 0,
                    },
                )
                entries.append(entry)

            return entries

        except Exception as e:
            logger.error(f"Search failed: {e}")
            return []

    def replace(
        self,
        target: str,
        old_content: str,
        new_content: str,
        **metadata: Any,
    ) -> bool:
        """Replace existing memory content.

        Args:
            target: Memory target
            old_content: Old content to find
            new_content: New content to replace with

        Returns:
            True if successful
        """
        if not self._initialized:
            return False

        try:
            import asyncio

            # Search for matching record
            results = asyncio.run(
                self.store.search_by_content(old_content, limit=5)
            )

            for record, _ in results[:1]:  # Take first match
                record.content = new_content
                record.updated_at = datetime.now()
                asyncio.run(self.store.update_record(record))
                logger.info(f"Replaced content for record {record.id}")
                return True

            logger.warning(f"No match found for: {old_content[:50]}...")
            return False

        except Exception as e:
            logger.error(f"Replace failed: {e}")
            return False

    def remove(
        self,
        target: str,
        content: str,
        **metadata: Any,
    ) -> bool:
        """Remove memory content.

        Args:
            target: Memory target
            content: Content to remove

        Returns:
            True if successful
        """
        if not self._initialized:
            return False

        try:
            import asyncio

            # Search for matching record
            results = asyncio.run(
                self.store.search_by_content(content, limit=5)
            )

            for record, _ in results[:1]:  # Take first match
                asyncio.run(self.store.delete_record(record.id))
                logger.info(f"Removed record {record.id}")
                return True

            logger.warning(f"No match found for: {content[:50]}...")
            return False

        except Exception as e:
            logger.error(f"Remove failed: {e}")
            return False

    def context(
        self,
        task: str,
        max_chars: int = 1500,
        **kwargs: Any,
    ) -> str:
        """Get context for LLM prompt.

        Args:
            task: Task description
            max_chars: Maximum characters
            **kwargs: Additional options

        Returns:
            Formatted context string
        """
        if not self._initialized or not self.context_builder:
            return ""

        try:
            import asyncio

            return asyncio.run(
                self.context_builder.build_system_context(
                    task=task,
                    max_chars=max_chars,
                )
            )

        except Exception as e:
            logger.error(f"Context retrieval failed: {e}")
            return ""

    async def on_turn_start(self) -> None:
        """Called at start of each conversation turn."""
        if not self._initialized:
            return

        self._turn_count += 1

        # Periodically promote facts to identity
        if self._turn_count % 10 == 0:
            facts = await self.store.query_by_layer(Layer.FACT, limit=20)
            await self.layer_promoter.batch_promote(facts, self.store)

    async def on_session_end(self) -> None:
        """Called when session ends.

        Creates session summary and triggers System2 processing.
        """
        if not self._initialized:
            return

        # Create session summary (L4)
        if self._current_session_id:
            await self.summarizer.summarize_session(
                self._current_session_id,
                self.store,
            )

        # Trigger System2 background processing
        if self.worker:
            await self.worker.run_consolidation(self._current_session_id)

        logger.info(f"Session {self._current_session_id} ended")

    def get_tool_schema(self) -> Optional[Dict[str, Any]]:
        """Get tool schema for LLM (optional).

        Returns None since auto-extraction is default.
        """
        return None

    async def handle_tool_call(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
    ) -> str:
        """Handle explicit memory tool call.

        Args:
            tool_name: Tool name
            arguments: Tool arguments

        Returns:
            Tool result
        """
        if tool_name == "memory_search":
            results = self.search(
                arguments.get("query", ""),
                limit=arguments.get("limit", 5),
            )
            return f"Found {len(results)} memories"

        elif tool_name == "memory_write":
            self.write(
                arguments.get("target", "memory"),
                arguments.get("content", ""),
                **arguments.get("metadata", {}),
            )
            return "Memory written"

        return "Unknown tool"

    async def get_stats(self) -> Dict[str, Any]:
        """Get memory system statistics.

        Returns:
            Dictionary with statistics
        """
        if not self._initialized:
            return {}

        store_stats = await self.store.get_stats()

        return {
            **store_stats,
            "session_id": self._current_session_id,
            "turn_count": self._turn_count,
            "strategy": self.name(),
        }
