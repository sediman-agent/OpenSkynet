from __future__ import annotations

from unittest.mock import patch

from sediman.agent.prompts import build_system_prompt, load_memory


class TestBuildSystemPrompt:
    def test_includes_identity(self, tmp_sediman_dir):
        prompt = build_system_prompt()
        assert "Sediman" in prompt
        assert "browser" in prompt.lower()

    def test_includes_memory_when_present(self, tmp_sediman_dir):
        prompt = build_system_prompt(
            memory_context="<memory-context>\nuser prefers dark mode\n</memory-context>"
        )
        assert "user prefers dark mode" in prompt

    def test_no_skills_section_in_prompt(self, tmp_sediman_dir):
        prompt = build_system_prompt()
        assert "<available_skills>\n" not in prompt

    def test_no_memory_section_when_empty(self, tmp_sediman_dir):
        prompt = build_system_prompt()
        assert "<memory-context>" not in prompt

    def test_includes_completion_rules(self, tmp_sediman_dir):
        prompt = build_system_prompt()
        assert "<verification_and_completion>" in prompt

    def test_includes_error_recovery(self, tmp_sediman_dir):
        prompt = build_system_prompt()
        assert "<error_recovery>" in prompt

    def test_includes_critical_reminders(self, tmp_sediman_dir):
        prompt = build_system_prompt()
        assert "<identity>" in prompt or "Sediman" in prompt

    def test_includes_verification_rules(self, tmp_sediman_dir):
        prompt = build_system_prompt()
        assert "verify" in prompt.lower()

    def test_includes_action_format(self, tmp_sediman_dir):
        prompt = build_system_prompt()
        assert "<action_format>" in prompt

    def test_no_scheduling_references(self, tmp_sediman_dir):
        prompt = build_system_prompt().lower()
        assert "schedule" not in prompt
        assert "cron" not in prompt

    def test_flash_mode_uses_shorter_prompt(self, tmp_sediman_dir):
        from sediman.agent.prompts.builder import PromptBuilder
        builder_full = PromptBuilder(flash_mode=False)
        builder_flash = PromptBuilder(flash_mode=True)
        full = builder_full.build_system_prompt()
        flash = builder_flash.build_system_prompt()
        assert len(flash) < len(full)
        assert "<completion_rules>" in flash
        assert "<verification_rules>" in flash
        assert "<action_format>" in flash

    def test_includes_project_context(self, tmp_sediman_dir):
        ctx_file = tmp_sediman_dir / "CONTEXT.md"
        ctx_file.write_text("Always use CSV format for data exports")
        prompt = build_system_prompt()
        assert "<project_context>" in prompt
        assert "CSV format" in prompt


class TestLoadMemoryPrompts:
    def test_returns_empty_when_no_files(self, tmp_sediman_dir):
        assert load_memory() == ""

    def test_returns_memory_content(self, tmp_sediman_dir):
        mem_dir = tmp_sediman_dir / "memories"
        mem_dir.mkdir(parents=True, exist_ok=True)
        (mem_dir / "MEMORY.md").write_text("saved context")
        assert "saved context" in load_memory()
