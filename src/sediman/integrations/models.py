from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class Message:
    id: str
    text: str
    author: str
    channel: str
    timestamp: str
    raw: dict[str, Any] | None = None


@dataclass
class Channel:
    id: str
    name: str
    integration: str
