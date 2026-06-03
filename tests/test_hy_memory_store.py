"""Tests for HyMemoryStore - SQLite storage backend."""

import pytest
import asyncio
import tempfile
from datetime import datetime
from pathlib import Path

from sediman.memory.hy.store import HyMemoryStore
from sediman.memory.hy.models import (
    MemoryRecord,
    Layer,
    MemType,
    SessionRaw,
    MemoryLink,
    LinkType,
)


@pytest.fixture
async def temp_store():
    """Create a temporary file-based store for testing."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name

    store = HyMemoryStore(db_path=Path(db_path))
    await store.initialize()
    yield store

    # Cleanup
    import os
    try:
        os.unlink(db_path)
    except:
        pass


@pytest.mark.asyncio
async def test_create_schema(temp_store):
    """Test that database schema is created."""
    # Get stats to verify tables exist
    stats = await temp_store.get_stats()
    assert "total_records" in stats
    assert stats["total_records"] == 0


@pytest.mark.asyncio
async def test_add_record(temp_store):
    """Test adding a memory record."""
    record = MemoryRecord.create(
        layer=Layer.FACT,
        mem_type=MemType.FACT,
        content="Test fact",
        confidence=0.9,
    )

    result = await temp_store.add_record(record)
    assert result is True

    # Verify it was added
    stats = await temp_store.get_stats()
    assert stats["total_records"] == 1


@pytest.mark.asyncio
async def test_get_record(temp_store):
    """Test retrieving a record by ID."""
    record = MemoryRecord.create(
        layer=Layer.FACT,
        mem_type=MemType.FACT,
        content="Test fact",
    )

    await temp_store.add_record(record)

    retrieved = await temp_store.get_record(record.id)
    assert retrieved is not None
    assert retrieved.content == "Test fact"
    assert retrieved.layer == Layer.FACT


@pytest.mark.asyncio
async def test_update_record(temp_store):
    """Test updating a record."""
    record = MemoryRecord.create(
        layer=Layer.FACT,
        mem_type=MemType.FACT,
        content="Original content",
    )

    await temp_store.add_record(record)

    # Update
    record.content = "Updated content"
    record.access_count = 5

    result = await temp_store.update_record(record)
    assert result is True

    # Verify update
    retrieved = await temp_store.get_record(record.id)
    assert retrieved.content == "Updated content"
    assert retrieved.access_count == 5


@pytest.mark.asyncio
async def test_delete_record(temp_store):
    """Test deleting a record."""
    record = MemoryRecord.create(
        layer=Layer.FACT,
        mem_type=MemType.FACT,
        content="To be deleted",
    )

    await temp_store.add_record(record)

    # Delete
    result = await temp_store.delete_record(record.id)
    assert result is True

    # Verify deletion
    retrieved = await temp_store.get_record(record.id)
    assert retrieved is None


@pytest.mark.asyncio
async def test_query_by_layer(temp_store):
    """Test querying records by layer."""
    # Add records to different layers
    fact1 = MemoryRecord.create(
        layer=Layer.FACT,
        mem_type=MemType.FACT,
        content="Fact 1",
    )
    identity1 = MemoryRecord.create(
        layer=Layer.IDENTITY,
        mem_type=MemType.IDENTITY,
        content="Identity 1",
    )

    await temp_store.add_record(fact1)
    await temp_store.add_record(identity1)

    # Query FACT layer
    facts = await temp_store.query_by_layer(Layer.FACT)
    assert len(facts) == 1
    assert facts[0].content == "Fact 1"

    # Query IDENTITY layer
    identities = await temp_store.query_by_layer(Layer.IDENTITY)
    assert len(identities) == 1
    assert identities[0].content == "Identity 1"


@pytest.mark.asyncio
async def test_query_by_type(temp_store):
    """Test querying records by type."""
    # Add different types
    fact = MemoryRecord.create(
        layer=Layer.FACT,
        mem_type=MemType.FACT,
        content="A fact",
    )
    preference = MemoryRecord.create(
        layer=Layer.FACT,
        mem_type=MemType.PREFERENCE,
        content="A preference",
    )

    await temp_store.add_record(fact)
    await temp_store.add_record(preference)

    # Query FACT type
    facts = await temp_store.query_by_type(MemType.FACT)
    assert len(facts) == 1

    # Query PREFERENCE type
    preferences = await temp_store.query_by_type(MemType.PREFERENCE)
    assert len(preferences) == 1


@pytest.mark.asyncio
async def test_supersedes_chain(temp_store):
    """Test evolution chain tracing."""
    # Create chain: A -> B -> C
    record_a = MemoryRecord.create(
        layer=Layer.IDENTITY,
        mem_type=MemType.PREFERENCE,
        content="Preference A",
    )
    await temp_store.add_record(record_a)

    record_b = MemoryRecord.create(
        layer=Layer.IDENTITY,
        mem_type=MemType.PREFERENCE,
        content="Preference B",
        supersedes=record_a.id,
    )
    await temp_store.add_record(record_b)

    record_c = MemoryRecord.create(
        layer=Layer.IDENTITY,
        mem_type=MemType.PREFERENCE,
        content="Preference C",
        supersedes=record_b.id,
    )
    await temp_store.add_record(record_c)

    # Trace chain from C
    chain = await temp_store.get_supersedes_chain(record_c.id)

    # Should get A -> B -> C (oldest to newest)
    assert len(chain) == 3
    assert chain[0].id == record_a.id
    assert chain[1].id == record_b.id
    assert chain[2].id == record_c.id


@pytest.mark.asyncio
async def test_add_link(temp_store):
    """Test adding links between records."""
    record_a = MemoryRecord.create(
        layer=Layer.FACT,
        mem_type=MemType.FACT,
        content="Fact A",
    )
    record_b = MemoryRecord.create(
        layer=Layer.FACT,
        mem_type=MemType.FACT,
        content="Fact B",
    )

    await temp_store.add_record(record_a)
    await temp_store.add_record(record_b)

    link = MemoryLink(
        source_id=record_a.id,
        target_id=record_b.id,
        link_type="spawned_from",
    )

    result = await temp_store.add_link(link)
    assert result is True

    # Retrieve links
    links = await temp_store.get_links(record_a.id)
    assert len(links) == 1
    assert links[0].target_id == record_b.id


@pytest.mark.asyncio
async def test_add_raw_trace(temp_store):
    """Test adding raw session traces."""
    trace = SessionRaw.create(
        session_id="test-session",
        role="user",
        content="Test message",
        turn_number=1,
    )

    result = await temp_store.add_raw_trace(trace)
    assert result is True

    # Retrieve traces
    traces = await temp_store.get_session_traces("test-session")
    assert len(traces) == 1
    assert traces[0].content == "Test message"


@pytest.mark.asyncio
async def test_get_stats(temp_store):
    """Test getting store statistics."""
    # Add some records
    for i in range(3):
        record = MemoryRecord.create(
            layer=Layer.FACT,
            mem_type=MemType.FACT,
            content=f"Fact {i}",
        )
        await temp_store.add_record(record)

    stats = await temp_store.get_stats()
    assert stats["total_records"] == 3
    assert "by_layer" in stats
    assert stats["by_layer"]["L2"] == 3


@pytest.mark.asyncio
async def test_search_by_content(temp_store):
    """Test content-based search."""
    record = MemoryRecord.create(
        layer=Layer.FACT,
        mem_type=MemType.FACT,
        content="The user likes sushi",
    )

    await temp_store.add_record(record)

    # Search for matching content
    results = await temp_store.search_by_content("sushi")
    assert len(results) == 1
    assert results[0][0].content == "The user likes sushi"

    # Search for non-matching content
    results = await temp_store.search_by_content("pizza")
    assert len(results) == 0
