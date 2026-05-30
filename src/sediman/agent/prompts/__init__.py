from __future__ import annotations

from sediman.agent.prompts.builder import PromptBuilder

__all__ = ["PromptBuilder", "build_system_prompt", "load_memory"]


def build_system_prompt(
    memory_context: str | None = None,
    task: str | None = None,
    suggested_skills: str | None = None,
) -> str:
    builder = PromptBuilder()
    return builder.build_system_prompt(
        memory_context=memory_context,
        task=task,
        suggested_skills=suggested_skills,
    )


def load_memory() -> str:
    from sediman.memory.manager import MemoryManager
    return MemoryManager().load_all_memory()
