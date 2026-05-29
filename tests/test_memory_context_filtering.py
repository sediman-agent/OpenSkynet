"""Tests for Memory Context Filtering — format_for_system_prompt_filtered."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from sediman.memory.store import MemoryStore


class TestFormatForSystemPromptFiltered:
    def test_returns_tagged_output_when_no_entries(self, tmp_sediman_dir):
        store = MemoryStore()
        result = store.format_for_system_prompt_filtered("test query", max_chars=800)
        assert "<memory-context>" in result or result == ""

    def test_returns_filtered_context(self, tmp_sediman_dir):
        mem_dir = tmp_sediman_dir / "memories"
        mem_dir.mkdir(parents=True, exist_ok=True)
        (mem_dir / "MEMORY.md").write_text(
            "User prefers dark mode\n"
            "User likes Python\n"
            "User has a cat named Whiskers\n"
        )
        store = MemoryStore()
        store.load_snapshot()
        result = store.format_for_system_prompt_filtered("what is the user's preference", max_chars=500)
        assert "<memory-context>" in result

    def test_respects_max_chars(self, tmp_sediman_dir):
        mem_dir = tmp_sediman_dir / "memories"
        mem_dir.mkdir(parents=True, exist_ok=True)
        entries = [f"Memory entry {i}: " + "x" * 50 for i in range(20)]
        (mem_dir / "MEMORY.md").write_text("\n".join(entries) + "\n")
        store = MemoryStore()
        store.load_snapshot()
        result = store.format_for_system_prompt_filtered("memory", max_chars=200)
        assert "<memory-context>" in result
        content_between = result.split("<memory-context>")[-1].split("</memory-context>")[0].strip()
        entry_lines = [l for l in content_between.split("\n") if l.startswith("Memory entry")]
        assert len(entry_lines) <= 5

    def test_falls_back_to_unfiltered_when_no_scored_entries(self, tmp_sediman_dir):
        store = MemoryStore()
        store._snapshot = "some snapshot content"
        store._snapshot_loaded = True
        with patch.object(store, "get_all_entries", return_value={}):
            result = store.format_for_system_prompt_filtered("query", max_chars=800)
        assert "<memory-context>" in result

    def test_includes_memory_guidance(self, tmp_sediman_dir):
        mem_dir = tmp_sediman_dir / "memories"
        mem_dir.mkdir(parents=True, exist_ok=True)
        (mem_dir / "MEMORY.md").write_text("User prefers dark mode\n")
        store = MemoryStore()
        store.load_snapshot()
        result = store.format_for_system_prompt_filtered("preference", max_chars=800)
        assert "<memory-context>" in result
        assert "guidance" in result.lower() or "GUIDANCE" in result
