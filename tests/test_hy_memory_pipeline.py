"""Tests for System 1 Memory pipeline (attention gate, extraction, merging)."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from sediman.memory.hy.gate import AttentionGate, ContentClassification
from sediman.memory.hy.extractor import FactExtractor, ExtractedFact
from sediman.memory.hy.merger import (
    DedupDetector,
    FactMerger,
    ConflictResolver,
    MergeResult,
)
from sediman.memory.hy.chain import ChainBuilder, ChainTracer
from sediman.memory.hy.models import Layer, MemType, MemoryRecord


@pytest.fixture
def mock_llm():
    """Create a mock LLM provider."""
    llm = AsyncMock()
    return llm


class TestAttentionGate:
    """Tests for the attention gate."""

    def test_heuristic_gate_trivial_messages(self):
        """Test that trivial messages are filtered out."""
        gate = AttentionGate(llm_provider=None)

        # Trivial messages should return False
        assert gate._heuristic_gate("ok") is False
        assert gate._heuristic_gate("thanks") is False
        assert gate._heuristic_gate("hello") is False
        assert gate._heuristic_gate("yes") is False

    def test_heuristic_gate_substantive_messages(self):
        """Test that substantive messages pass through."""
        gate = AttentionGate(llm_provider=None)

        # Substantive messages should return True
        assert gate._heuristic_gate("去过东京，喜欢吃寿司") is True
        assert gate._heuristic_gate("I prefer sweet food") is True
        assert gate._heuristic_gate("decided to change careers") is True

    def test_heuristic_gate_keyword_detection(self):
        """Test keyword-based detection."""
        gate = AttentionGate(llm_provider=None)

        # Messages with preference keywords should pass
        assert gate._heuristic_gate("我喜欢甜的") is True
        assert gate._heuristic_gate("饮食偏好：清淡") is True

    @pytest.mark.asyncio
    async def test_should_process_without_llm(self):
        """Test gate fallback without LLM."""
        gate = AttentionGate(llm_provider=None)

        result = await gate.should_process("去过东京")
        assert result is True


class TestFactExtractor:
    """Tests for fact extraction."""

    def test_fact_to_mem_type_mapping(self):
        """Test mapping fact types to memory types."""
        extractor = FactExtractor(llm_provider=None)

        assert extractor.fact_to_mem_type("fact") == MemType.FACT
        assert extractor.fact_to_mem_type("preference") == MemType.PREFERENCE
        assert extractor.fact_to_mem_type("identity") == MemType.IDENTITY

    @pytest.mark.asyncio
    async def test_extract_facts_without_llm(self):
        """Test extraction fallback without LLM."""
        extractor = FactExtractor(llm_provider=None)

        facts = await extractor.extract_facts("去过东京")
        assert len(facts) >= 1
        assert facts[0].content == "去过东京"


class TestDedupDetector:
    """Tests for duplicate detection."""

    @pytest.mark.asyncio
    async def test_is_duplicate_exact_match(self):
        """Test exact duplicate detection."""
        detector = DedupDetector(similarity_threshold=0.9)

        result = await detector.is_duplicate(
            "去过东京",
            ["去过东京"],
        )
        assert result is True

    @pytest.mark.asyncio
    async def test_is_duplicate_no_match(self):
        """Test no duplicate found."""
        detector = DedupDetector(similarity_threshold=0.9)

        result = await detector.is_duplicate(
            "去过东京",
            ["喜欢吃寿司"],
        )
        assert result is False

    @pytest.mark.asyncio
    async def test_is_subset_new_is_subset(self):
        """Test when new fact is subset of existing."""
        detector = DedupDetector()

        result = await detector.is_subset(
            "喜欢寿司",  # New (shorter)
            ["喜欢寿司和拉面"],  # Existing (longer, contains new)
        )

        assert result is not None
        existing, is_new_subset = result
        assert is_new_subset is True

    @pytest.mark.asyncio
    async def test_is_subset_existing_is_subset(self):
        """Test when existing is subset of new."""
        detector = DedupDetector()

        result = await detector.is_subset(
            "喜欢寿司和拉面",  # New (longer, contains existing)
            ["喜欢寿司"],  # Existing (shorter, contained in new)
        )

        assert result is not None
        existing, is_new_subset = result
        assert is_new_subset is False


class TestFactMerger:
    """Tests for fact merging."""

    @pytest.mark.asyncio
    async def test_merge_new_fact(self):
        """Test merging a completely new fact."""
        merger = FactMerger()

        new_fact = {
            "content": "New fact",
            "mem_type": MemType.FACT,
            "confidence": 0.8,
        }

        results = await merger.merge_facts([new_fact], [])

        assert len(results) == 1
        assert results[0].action == "new"
        assert results[0].record is not None
        assert results[0].record.content == "New fact"

    @pytest.mark.asyncio
    async def test_merge_duplicate_fact(self):
        """Test that duplicate facts are skipped."""
        merger = FactMerger()

        existing = MemoryRecord.create(
            layer=Layer.FACT,
            mem_type=MemType.FACT,
            content="Existing fact",
        )

        duplicate_fact = {
            "content": "Existing fact",  # Exact duplicate
            "mem_type": MemType.FACT,
            "confidence": 0.8,
        }

        results = await merger.merge_facts([duplicate_fact], [existing])

        assert len(results) == 1
        assert results[0].action == "skipped"

    @pytest.mark.asyncio
    async def test_merge_subset_fact(self):
        """Test that subset facts are skipped."""
        merger = FactMerger()

        existing = MemoryRecord.create(
            layer=Layer.FACT,
            mem_type=MemType.FACT,
            content="Long detailed fact about something",
        )

        subset_fact = {
            "content": "fact about",  # Subset
            "mem_type": MemType.FACT,
            "confidence": 0.8,
        }

        results = await merger.merge_facts([subset_fact], [existing])

        assert len(results) == 1
        assert results[0].action == "skipped"


class TestConflictResolver:
    """Tests for conflict resolution."""

    def test_keyword_contradiction_detection(self):
        """Test keyword-based contradiction detection."""
        resolver = ConflictResolver(llm_provider=None)

        result = resolver._keyword_contradiction(
            "偏清淡",
            "偏甜口",
        )
        assert result is True

    def test_keyword_no_contradiction(self):
        """Test no contradiction detected."""
        resolver = ConflictResolver(llm_provider=None)

        result = resolver._keyword_contradiction(
            "喜欢寿司",
            "喜欢拉面",
        )
        assert result is False


class TestChainBuilder:
    """Tests for evolution chain building."""

    @pytest.mark.asyncio
    async def test_build_chain(self):
        """Test building an evolution chain."""
        builder = ChainBuilder()

        old_record = MemoryRecord.create(
            layer=Layer.IDENTITY,
            mem_type=MemType.PREFERENCE,
            content="Old preference",
        )

        new_record = await builder.build_chain(
            old_record,
            "New preference",
            {"reason": "preference changed"},
        )

        assert new_record.supersedes == old_record.id
        # Check that chain metadata was added
        assert "chain_reason" in new_record.metadata

    def test_should_create_chain_for_preferences(self):
        """Test that chains should be created for preferences."""
        builder = ChainBuilder()

        preference_record = MemoryRecord.create(
            layer=Layer.IDENTITY,
            mem_type=MemType.PREFERENCE,
            content="喜欢甜食",
        )

        result = builder.should_create_chain(
            preference_record,
            "喜欢清淡食物",  # Very different from original
        )

        # Should create chain for different preference content
        assert result is True

    def test_should_not_create_chain_for_facts(self):
        """Test that chains should NOT be created for regular facts."""
        builder = ChainBuilder()

        fact_record = MemoryRecord.create(
            layer=Layer.FACT,
            mem_type=MemType.FACT,
            content="A fact",
        )

        result = builder.should_create_chain(
            fact_record,
            "Updated fact",
        )

        # Should not create chain for non-preference types
        assert result is False


class TestChainTracer:
    """Tests for chain tracing."""

    @pytest.mark.asyncio
    async def test_trace_chain(self):
        """Test tracing an evolution chain."""
        tracer = ChainTracer()

        # Mock record fetch function
        records = {
            "c": MemoryRecord(
                id="c",
                layer=Layer.IDENTITY,
                mem_type=MemType.PREFERENCE,
                content="C",
                supersedes="b",
            ),
            "b": MemoryRecord(
                id="b",
                layer=Layer.IDENTITY,
                mem_type=MemType.PREFERENCE,
                content="B",
                supersedes="a",
            ),
            "a": MemoryRecord(
                id="a",
                layer=Layer.IDENTITY,
                mem_type=MemType.PREFERENCE,
                content="A",
                supersedes=None,
            ),
        }

        async def mock_get(record_id):
            return records.get(record_id)

        # Trace from "c" (should get a -> b -> c)
        chain = await tracer.trace_chain("c", mock_get)

        assert len(chain) == 3
        assert chain[0].id == "a"
        assert chain[1].id == "b"
        assert chain[2].id == "c"

    @pytest.mark.asyncio
    async def test_get_chain_summary(self):
        """Test getting chain summary."""
        tracer = ChainTracer()

        records = [
            MemoryRecord(
                id="a",
                layer=Layer.IDENTITY,
                mem_type=MemType.PREFERENCE,
                content="First",
                supersedes=None,
            ),
            MemoryRecord(
                id="b",
                layer=Layer.IDENTITY,
                mem_type=MemType.PREFERENCE,
                content="Second",
                supersedes="a",
            ),
        ]

        summary = await tracer.get_chain_summary(records)

        assert summary["length"] == 2
        assert summary["has_evolution"] is True
        assert "First" in summary["oldest"]["content"]
        assert "Second" in summary["newest"]["content"]
