from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import structlog

logger = structlog.get_logger()

TEMPLATES_DIR = Path(__file__).parent / "templates"

SOUL_FILE = Path.home() / ".sediman" / "SOUL.md"
CONTEXT_FILE = Path.home() / ".sediman" / "CONTEXT.md"

_template_cache: dict[str, str] = {}

# File-based caches with mtime checking
_soul_cache: dict[str, Any] = {"path": None, "mtime": 0, "content": ""}
_context_cache: dict[str, Any] = {"path": None, "mtime": 0, "content": ""}


def _load_template(name: str) -> str:
    if name in _template_cache:
        return _template_cache[name]
    path = TEMPLATES_DIR / name
    if path.exists():
        content = path.read_text()
        _template_cache[name] = content
        return content
    logger.warning("template_not_found", name=name)
    return ""


def _read_file_cached(path: Path, cache: dict[str, Any]) -> str:
    """Read a file only if it has changed since last read (mtime check)."""
    if not path.exists():
        cache["content"] = ""
        return ""
    try:
        mtime = os.path.getmtime(path)
    except OSError:
        return cache.get("content", "")
    if cache.get("path") == str(path) and cache.get("mtime") == mtime:
        return cache["content"]
    content = path.read_text()
    cache["path"] = str(path)
    cache["mtime"] = mtime
    cache["content"] = content
    return content


def load_soul() -> str:
    content = _read_file_cached(SOUL_FILE, _soul_cache)
    if content:
        return content
    return _load_template("identity.md")


def load_project_context() -> str:
    content = _read_file_cached(CONTEXT_FILE, _context_cache)
    if content:
        return content
    agents_md = Path.cwd() / "AGENTS.md"
    if agents_md.exists():
        return agents_md.read_text()
    return ""


class PromptBuilder:
    def __init__(
        self,
        flash_mode: bool = False,
        turbo_mode: bool = False,
        soul_override: str | None = None,
        project_context: str | None = None,
    ):
        self.flash_mode = flash_mode
        self.turbo_mode = turbo_mode
        self._soul_override = soul_override
        self._project_context = project_context
        if turbo_mode:
            self._template_name = "system_turbo.md"
        elif flash_mode:
            self._template_name = "system_flash.md"
        else:
            self._template_name = "system_full.md"
        self._soul = soul_override if soul_override is not None else load_soul()
        self._project_ctx = project_context if project_context is not None else load_project_context()

    def build_system_prompt(
        self,
        skill_summaries: str | None = None,
        memory_context: str | None = None,
        task: str | None = None,
    ) -> str:
        sections: list[str] = []

        template = _load_template(self._template_name)
        sections.append(template)

        if not self.turbo_mode:
            soul = self._soul
            if soul.strip():
                sections.append(f"<persona>\n{soul.strip()}\n</persona>")

            if memory_context and memory_context.strip():
                sections.append(memory_context.strip())

            ctx = self._project_ctx
            if ctx.strip():
                sections.append(f"<project_context>\n{ctx.strip()}\n</project_context>")

            if task:
                task_addon = self._get_task_addon(task)
                if task_addon:
                    sections.append(task_addon)

        if skill_summaries and skill_summaries.strip():
            sections.append(f"<available_skills>\n{skill_summaries.strip()}\n</available_skills>")

        return "\n\n".join(sections)

    @staticmethod
    def _get_task_addon(task: str) -> str | None:
        task_lower = task.lower()
        extraction_kw = (
            "extract", "get the", "find all", "list all", "show me all",
            "what are the", "how many", "price", "prices", "compare",
            "scrape", "collect", "pull", "top ", "best ",
        )
        form_kw = (
            "fill", "submit", "register", "sign up", "apply",
            "login", "log in", "create account", "checkout",
            "book", "reserve", "order",
        )
        search_kw = (
            "search for", "find me", "look up", "research",
            "what is the current", "latest", "news about",
            "information about", "how to",
        )
        navigation_kw = (
            "go to", "navigate", "browse", "visit",
            "click on", "open the", "follow the link",
            "multi-page", "pagination",
        )

        if any(kw in task_lower for kw in extraction_kw):
            return _load_template("task_extraction.md")
        if any(kw in task_lower for kw in form_kw):
            return _load_template("task_form.md")
        if any(kw in task_lower for kw in search_kw):
            return _load_template("task_search.md")
        if any(kw in task_lower for kw in navigation_kw):
            return _load_template("task_navigation.md")
        return None

    def build_skill_executor_prompt(
        self,
        skill_name: str,
        description: str,
        steps: list[str],
        verification: str | None = None,
    ) -> str:
        template = _load_template("skill_executor.md")
        steps_text = "\n".join(f"{i}. {step}" for i, step in enumerate(steps, 1))
        return template.format(
            skill_name=skill_name,
            description=description,
            steps=steps_text,
            verification=verification or "The expected outcome described in the skill was achieved.",
        )

    @staticmethod
    def get_healer_prompt() -> str:
        return _load_template("healer.md")

    @staticmethod
    def get_skill_eval_prompt() -> str:
        return _load_template("skill_eval.md")
