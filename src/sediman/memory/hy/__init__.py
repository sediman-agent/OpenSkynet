"""
System 2 Memory — 6-layer structured memory with evolution chains.

Inspired by the Hy-Memory framework from Tencent, this module implements
a sophisticated memory system with:

- 6-layer memory hierarchy (L1-L6: RAW, FACT, IDENTITY, SUMMARY, SCHEMA, INTENTION)
- Evolution chains with supersedes pointers for tracking preference changes
- Auto-extraction every turn without agent tool calls
- Dual-path processing (System1 sync + System2 async background)

Usage:
    from sediman.memory.hy.strategy import HyMemoryStrategy

    strategy = HyMemoryStrategy()
    await strategy.initialize()

    # Write happens automatically via on_turn_start hook
    # No need for explicit memory tool calls

    # Search retrieves with chain tracing
    results = strategy.search("user preferences")
    for result in results:
        print(f"Current: {result.record.content}")
        if result.has_evolution_history():
            print(f"History: {[r.content for r in result.chain]}")
"""

from sediman.memory.hy.models import (
    Layer,
    MemType,
    MemoryRecord,
    MemoryLink,
    SessionRaw,
    RetrievalResult,
    LinkType,
)

from sediman.memory.hy.store import HyMemoryStore
from sediman.memory.hy.strategy import HyMemoryStrategy

__all__ = [
    # Enums
    "Layer",
    "MemType",
    "LinkType",
    # Models
    "MemoryRecord",
    "MemoryLink",
    "SessionRaw",
    "RetrievalResult",
    # Storage and strategy
    "HyMemoryStore",
    "HyMemoryStrategy",
]
