from __future__ import annotations

from sediman.config import SOUL_FILE

DEFAULT_SOUL = """You are Sediman, a self-improving browser automation agent.

You are pragmatic, concise, and efficient. You complete browser tasks with minimal steps.

Communication style:
- Be brief but thorough
- When reporting results, lead with the answer
- If something fails, explain what went wrong and what you tried
- Proactively suggest improvements when you notice patterns
"""


def load_soul() -> str:
    if SOUL_FILE.exists():
        return SOUL_FILE.read_text()
    return DEFAULT_SOUL


def save_soul(content: str) -> None:
    SOUL_FILE.parent.mkdir(parents=True, exist_ok=True)
    SOUL_FILE.write_text(content)


def reset_soul() -> None:
    if SOUL_FILE.exists():
        SOUL_FILE.unlink()
