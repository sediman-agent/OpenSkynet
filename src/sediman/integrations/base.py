from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from sediman.agent.tool_dispatch import ToolDefinition


class Integration(ABC):
    name: str = ""

    def __init__(self, config: dict[str, Any]) -> None:
        self._config = config

    @abstractmethod
    async def send(self, target: str, content: str, **kwargs: Any) -> str:
        ...

    @abstractmethod
    async def read(self, target: str, limit: int = 10) -> list[dict[str, Any]]:
        ...

    async def listen(self) -> None:
        """Optional background listener for inbound messages."""
        pass

    @abstractmethod
    def get_tools(self) -> list[tuple[ToolDefinition, Any]]:
        ...

    @property
    def enabled(self) -> bool:
        return self._config.get("enabled", False)

    @property
    def is_configured(self) -> bool:
        return bool(self._config.get("token"))
