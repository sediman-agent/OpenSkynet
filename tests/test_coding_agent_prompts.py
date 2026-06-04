from __future__ import annotations

import pytest

from sediman.agent.coding_agent.prompts import (
    build_system_prompt,
    build_classification_prompt,
    _CORE_PROMPT,
    _TOOL_REFERENCE,
)
from sediman.agent.coding_agent.types import ProjectInfo


class TestSystemPrompt:
    def test_core_prompt_is_substantial(self):
        assert len(_CORE_PROMPT) > 500

    def test_core_prompt_contains_rules(self):
        assert "ALWAYS read files before editing" in _CORE_PROMPT
        assert "patch" in _CORE_PROMPT
        assert "Batch independent" in _CORE_PROMPT

    def test_core_prompt_contains_key_guidance(self):
        assert "minimal changes" in _CORE_PROMPT.lower()
        assert "verify" in _CORE_PROMPT.lower()
        assert "Never commit secrets" in _CORE_PROMPT

    def test_tool_reference_contains_all_tools(self):
        assert "read_file" in _TOOL_REFERENCE
        assert "write_file" in _TOOL_REFERENCE
        assert "patch" in _TOOL_REFERENCE
        assert "list_files" in _TOOL_REFERENCE
        assert "search_files" in _TOOL_REFERENCE
        assert "glob" in _TOOL_REFERENCE
        assert "terminal" in _TOOL_REFERENCE
        assert "git_status" in _TOOL_REFERENCE
        assert "git_diff" in _TOOL_REFERENCE
        assert "git_log" in _TOOL_REFERENCE
        assert "git_commit" in _TOOL_REFERENCE
        assert "git_branch" in _TOOL_REFERENCE
        assert "web_search" in _TOOL_REFERENCE
        assert "web_fetch" in _TOOL_REFERENCE
        assert "clarify" in _TOOL_REFERENCE
        assert "todo" in _TOOL_REFERENCE


class TestBuildSystemPrompt:
    def test_no_project_info(self):
        prompt = build_system_prompt(project_info=None, task="")
        assert "Project" not in prompt or "Project" in prompt

    def test_with_project_info(self):
        info = ProjectInfo(
            project_type="Python",
            language="Python",
            lint_commands=["ruff check ."],
            test_commands=["pytest"],
        )
        prompt = build_system_prompt(project_info=info, task="")
        assert "Python" in prompt
        assert "ruff check" in prompt
        assert "pytest" in prompt

    def test_with_task(self):
        prompt = build_system_prompt(project_info=None, task="fix the bug")
        assert "Task" in prompt
        assert "fix the bug" in prompt

    def test_with_conventions(self):
        info = ProjectInfo(
            project_type="Python",
            language="Python",
            conventions={"line_length": "120", "indent_size": "4"},
        )
        prompt = build_system_prompt(project_info=info, task="")
        assert "line_length" in prompt
        assert "120" in prompt

    def test_with_project_instructions(self):
        info = ProjectInfo(
            project_type="Python",
            language="Python",
            project_instructions="Use async/await for all I/O",
        )
        prompt = build_system_prompt(project_info=info, task="")
        assert "Instructions" in prompt
        assert "async/await" in prompt

    def test_prompt_includes_tool_reference(self):
        prompt = build_system_prompt(project_info=None, task="")
        assert "read_file" in prompt
        assert "terminal" in prompt


class TestClassificationPrompt:
    def test_classification_prompt_contains_task(self):
        prompt = build_classification_prompt("install express")
        assert "install express" in prompt
        assert "Category:" in prompt

    def test_classification_prompt_has_many_examples(self):
        prompt = build_classification_prompt("test task")
        examples = prompt.count("→")
        assert examples >= 15

    def test_classification_prompt_has_categories(self):
        prompt = build_classification_prompt("test task")
        assert "**code**" in prompt.lower() or "code" in prompt.lower()
        assert "browser" in prompt.lower()
        assert "conversational" in prompt.lower()

    def test_classification_prompt_has_rules(self):
        prompt = build_classification_prompt("test task")
        assert "reading/writing local files" in prompt.lower()
        assert "PRIMARY action" in prompt

    def test_classification_prompt_code_examples(self):
        prompt = build_classification_prompt("test task")
        assert "add dark mode toggle" in prompt
        assert "write unit tests for the UserService" in prompt
        assert "set up a new Next.js project" in prompt

    def test_classification_prompt_browser_examples(self):
        prompt = build_classification_prompt("test task")
        assert "compare iPhone prices" in prompt or "browser" in prompt

    def test_classification_prompt_conversational_examples(self):
        prompt = build_classification_prompt("test task")
        assert "how do I use React hooks" in prompt
