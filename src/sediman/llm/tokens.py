from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


_TIKTOKEN_AVAILABLE: bool | None = None
_TIKTOKEN_ENC: Any = None


def _get_tiktoken_encoder() -> Any:
    global _TIKTOKEN_AVAILABLE, _TIKTOKEN_ENC
    if _TIKTOKEN_AVAILABLE is None:
        try:
            import tiktoken
            _TIKTOKEN_ENC = tiktoken.get_encoding("cl100k_base")
            _TIKTOKEN_AVAILABLE = True
        except Exception:
            _TIKTOKEN_AVAILABLE = False
    return _TIKTOKEN_ENC if _TIKTOKEN_AVAILABLE else None


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    enc = _get_tiktoken_encoder()
    if enc is not None:
        try:
            return len(enc.encode(text))
        except Exception:
            pass
    has_cjk = any("\u4e00" <= c <= "\u9fff" for c in text[:200])
    if has_cjk:
        return max(1, len(text) // 2)
    return max(1, len(text) // 3)


def estimate_messages_tokens(messages: list[dict[str, Any]]) -> int:
    total = 0
    for m in messages:
        content = str(m.get("content", ""))
        total += estimate_tokens(content)
        tool_calls = m.get("tool_calls", [])
        for tc in tool_calls:
            fn = tc.get("function", {})
            total += estimate_tokens(str(fn.get("name", "")))
            total += estimate_tokens(str(fn.get("arguments", "")))
        total += 4
    return max(total, 1)


MODEL_CONTEXT_WINDOWS: dict[str, int] = {
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4-turbo": 128000,
    "gpt-4": 8192,
    "gpt-3.5-turbo": 16385,
    "o1": 200000,
    "o1-mini": 128000,
    "o3-mini": 200000,
    "claude-3-5-sonnet": 200000,
    "claude-3-sonnet": 200000,
    "claude-3-haiku": 200000,
    "deepseek-chat": 64000,
    "deepseek-coder": 64000,
    "gemini-2.0-flash": 1048576,
    "gemini-1.5-pro": 2097152,
}

DEFAULT_CONTEXT_WINDOW = 128000


def get_model_context_window(model: str) -> int:
    model_lower = model.lower()
    for key, window in MODEL_CONTEXT_WINDOWS.items():
        if key in model_lower:
            return window
    return DEFAULT_CONTEXT_WINDOW


def get_safe_context_budget(model: str, reserve_ratio: float = 0.25) -> int:
    window = get_model_context_window(model)
    return int(window * (1.0 - reserve_ratio))


MODEL_COST_PER_1K_INPUT: dict[str, float] = {
    "gpt-4o": 0.0025,
    "gpt-4o-mini": 0.00015,
    "gpt-4": 0.03,
    "gpt-3.5-turbo": 0.0015,
    "claude-3-5-sonnet-20241022": 0.003,
    "claude-3-haiku-20240307": 0.00025,
    "o1": 0.015,
    "o3-mini": 0.0011,
}

MODEL_COST_PER_1K_OUTPUT: dict[str, float] = {
    "gpt-4o": 0.01,
    "gpt-4o-mini": 0.0006,
    "gpt-4": 0.06,
    "gpt-3.5-turbo": 0.002,
    "claude-3-5-sonnet-20241022": 0.015,
    "claude-3-haiku-20240307": 0.00125,
    "o1": 0.06,
    "o3-mini": 0.0044,
}

DEFAULT_COST_PER_1K_INPUT = 0.003
DEFAULT_COST_PER_1K_OUTPUT = 0.015


def estimate_cost(
    input_tokens: int,
    output_tokens: int,
    model: str,
) -> float:
    input_rate = MODEL_COST_PER_1K_INPUT.get(model, DEFAULT_COST_PER_1K_INPUT)
    output_rate = MODEL_COST_PER_1K_OUTPUT.get(model, DEFAULT_COST_PER_1K_OUTPUT)
    return (input_tokens / 1000 * input_rate) + (output_tokens / 1000 * output_rate)


@dataclass
class UsageRecord:
    model: str
    input_tokens: int
    output_tokens: int
    cost: float
    timestamp: float = field(default_factory=time.time)
    label: str = ""


class TokenTracker:
    def __init__(self, model: str = "gpt-4o"):
        self.model = model
        self._records: list[UsageRecord] = []

    def record(
        self,
        messages: list[dict[str, Any]],
        response_text: str,
        label: str = "",
    ) -> UsageRecord:
        input_text = " ".join(m.get("content", "") or "" for m in messages)
        input_tokens = estimate_tokens(input_text)
        output_tokens = estimate_tokens(response_text)
        cost = estimate_cost(input_tokens, output_tokens, self.model)

        record = UsageRecord(
            model=self.model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost=cost,
            label=label,
        )
        self._records.append(record)
        return record

    @property
    def total_input_tokens(self) -> int:
        return sum(r.input_tokens for r in self._records)

    @property
    def total_output_tokens(self) -> int:
        return sum(r.output_tokens for r in self._records)

    @property
    def total_cost(self) -> float:
        return sum(r.cost for r in self._records)

    @property
    def total_calls(self) -> int:
        return len(self._records)

    def summary(self) -> str:
        return (
            f"LLM Usage: {self.total_calls} calls, "
            f"{self.total_input_tokens:,} input tokens, "
            f"{self.total_output_tokens:,} output tokens, "
            f"${self.total_cost:.4f} cost"
        )

    def reset(self) -> None:
        self._records.clear()
