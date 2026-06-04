from __future__ import annotations

import asyncio
import functools
import inspect
import json
from dataclasses import dataclass
from typing import Any, Awaitable, Callable

import structlog

from sediman.agent.interrupt import InterruptSignal
from sediman.agent.guardrails import assess_risk, GLOBAL_APPROVAL, AuditLog
from sediman.llm.provider import LLMProvider, LLMResponse, ToolDefinition

logger = structlog.get_logger()

_TOOL_REGISTRY: dict[str, dict[str, Any]] = {}

TOOLSET_DEFINITIONS: dict[str, dict[str, Any]] = {
    "file": {"description": "File reading, writing, searching, and editing", "tools": ["read_file", "write_file", "patch", "search_files", "list_files"]},
    "terminal": {"description": "Shell command execution and process management", "tools": ["terminal", "process"]},
    "web": {"description": "Web search and page content extraction", "tools": ["web_search", "web_extract"]},
    "browser": {"description": "Interactive browser automation", "tools": []},
    "skills": {"description": "Skill management and discovery", "tools": ["skill_search", "skill_manage"]},
    "memory": {"description": "Persistent cross-session memory", "tools": ["memory"]},
    "session_search": {"description": "Search past conversation sessions", "tools": ["session_search"]},
    "cronjob": {"description": "Schedule and manage recurring tasks", "tools": ["cronjob", "list_schedules", "get_schedule_results"]},
    "delegation": {"description": "Spawn isolated subagent instances", "tools": ["delegate_task"]},
    "code_execution": {"description": "Run Python scripts that call agent tools", "tools": ["execute_code"]},
    "vision": {"description": "Image analysis via vision AI", "tools": ["vision_analyze"]},
    "image_gen": {"description": "Text-to-image generation", "tools": ["image_generate"]},
    "tts": {"description": "Text-to-speech audio generation", "tools": ["text_to_speech"]},
    "messaging": {"description": "Cross-platform message delivery", "tools": ["send_message"]},
    "clarify": {"description": "Ask user questions for clarification", "tools": ["clarify"]},
    "todo": {"description": "Session task list management", "tools": ["todo"]},
    "safe": {"description": "Read-only research (no file writes, no terminal)", "tools": ["web_search", "web_extract", "vision_analyze"]},
    "debugging": {"description": "Debug bundle (file + terminal + web)", "composite": True, "includes": ["file", "terminal", "web"]},
}


def resolve_toolset(name: str) -> set[str]:
    if name in ("all", "*"):
        all_tools: set[str] = set()
        for ts_def in TOOLSET_DEFINITIONS.values():
            all_tools.update(ts_def.get("tools", []))
        return all_tools
    ts_def = TOOLSET_DEFINITIONS.get(name)
    if ts_def is None:
        return set()
    if ts_def.get("composite"):
        resolved: set[str] = set()
        for included in ts_def.get("includes", []):
            resolved |= resolve_toolset(included)
        return resolved
    return set(ts_def.get("tools", []))


def tool(func: Callable | None = None, *, name: str | None = None, description: str | None = None):
    """Decorator that registers a function as a callable tool.

    Can be used as @tool or @tool(name="my_name", description="Does X").
    The function's type annotations and docstring are auto-extracted
    to build the OpenAI tool schema.

    Example:
        @tool
        def get_stock_price(symbol: str) -> float:
            \"\"\"Get current price for a stock symbol.\"\"\"
            ...

        @tool(name="send_email", description="Send an email via SMTP")
        def send_email_handler(to: str, subject: str, body: str) -> str:
            ...
    """
    def decorator(fn: Callable) -> Callable:
        tool_name = name or fn.__name__
        tool_desc = description or (inspect.getdoc(fn) or fn.__name__).split("\n")[0].strip()

        sig = inspect.signature(fn)
        properties: dict[str, dict[str, Any]] = {}
        required: list[str] = []
        for param_name, param in sig.parameters.items():
            if param_name == "return" or param_name.startswith("_"):
                continue
            param_type = param.annotation if param.annotation is not inspect.Parameter.empty else str
            json_type = _py_type_to_json_type(param_type)
            prop: dict[str, Any] = {"type": json_type}
            if param.default is not inspect.Parameter.empty:
                prop["default"] = param.default
            else:
                required.append(param_name)
            properties[param_name] = prop

        parameters: dict[str, Any] = {
            "type": "object",
            "properties": properties,
        }
        if required:
            parameters["required"] = required

        definition = ToolDefinition(
            name=tool_name,
            description=tool_desc,
            parameters=parameters,
        )

        @functools.wraps(fn)
        async def async_wrapper(**kwargs: Any) -> Any:
            if asyncio.iscoroutinefunction(fn):
                return await fn(**kwargs)
            return fn(**kwargs)

        _TOOL_REGISTRY[tool_name] = {
            "fn": async_wrapper,
            "definition": definition,
            "handler": async_wrapper,
        }
        return fn

    if func is not None:
        return decorator(func)
    return decorator


def _py_type_to_json_type(py_type: type) -> str:
    type_map: dict[type, str] = {
        str: "string",
        int: "integer",
        float: "number",
        bool: "boolean",
        list: "array",
        dict: "object",
        type(None): "null",
    }
    origin = getattr(py_type, "__origin__", None)
    if origin is list:
        return "array"
    if origin is dict:
        return "object"
    return type_map.get(py_type, "string")


def discover_tools(module: str | None = None) -> list[tuple[str, Callable, ToolDefinition]]:
    """Discover all registered @tool functions and their schemas.
    If module is given, only return tools from that module.
    """
    results: list[tuple[str, Callable, ToolDefinition]] = []
    for tool_name, entry in _TOOL_REGISTRY.items():
        results.append((tool_name, entry["handler"], entry["definition"]))
    return results


def register_tool_fn(
    name: str,
    handler: Callable,
    definition: ToolDefinition,
) -> None:
    """Manually register a tool function (used for non-decorator tools)."""
    _TOOL_REGISTRY[name] = {
        "fn": handler,
        "definition": definition,
        "handler": handler,
    }


def get_decorated_tool_definitions() -> list[ToolDefinition]:
    """Get ToolDefinitions for all @tool-decorated functions."""
    return [entry["definition"] for entry in _TOOL_REGISTRY.values()]


def get_decorated_tool_handlers() -> dict[str, Callable]:
    """Get handler dict for all @tool-decorated functions."""
    return {name: entry["handler"] for name, entry in _TOOL_REGISTRY.items()}


@dataclass
class ToolResult:
    success: bool
    output: str
    data: dict[str, Any] | None = None


ToolHandler = Callable[..., Awaitable[ToolResult]]


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}
        self._handlers: dict[str, ToolHandler] = {}
        self._toolsets: dict[str, str] = {}
        self._checkpoint_manager: Any | None = None

    def set_checkpoint_manager(self, manager: Any) -> None:
        self._checkpoint_manager = manager

    def register(
        self,
        definition: ToolDefinition,
        handler: ToolHandler,
    ) -> None:
        self._tools[definition.name] = definition
        self._handlers[definition.name] = handler
        self._toolsets[definition.name] = definition.toolset

    def _filter_toolset(self, toolsets: list[str] | None) -> set[str] | None:
        if toolsets is None:
            return None
        allowed: set[str] = set()
        for ts in toolsets:
            allowed |= resolve_toolset(ts)
        registered = set(self._tools.keys())
        return allowed & registered

    def get_definitions(self, toolsets: list[str] | None = None) -> list[ToolDefinition]:
        allowed = self._filter_toolset(toolsets)
        if allowed is None:
            return list(self._tools.values())
        return [t for t in self._tools.values() if t.name in allowed]

    def get_openai_tools(self, toolsets: list[str] | None = None) -> list[dict[str, Any]]:
        definitions = self.get_definitions(toolsets=toolsets)
        return [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            }
            for t in definitions
        ]

    def get_toolsets(self) -> dict[str, list[str]]:
        result: dict[str, list[str]] = {}
        for tool_name, ts_name in self._toolsets.items():
            result.setdefault(ts_name, []).append(tool_name)
        return result

    def get_tools_by_toolset(self, toolset: str) -> list[ToolDefinition]:
        return [t for t in self._tools.values() if self._toolsets.get(t.name) == toolset]

    async def dispatch(self, tool_name: str, arguments: dict[str, Any]) -> ToolResult:
        handler = self._handlers.get(tool_name)
        if not handler:
            return ToolResult(success=False, output=f"Unknown tool: {tool_name}")
        try:
            risk = assess_risk(tool_name, arguments)
            if risk == "high":
                AuditLog.get().record("tool", "risk_assessment", f"high_risk: {tool_name}", args=str(arguments)[:200])
                approved = await GLOBAL_APPROVAL.request(tool_name, arguments)
                if not approved:
                    AuditLog.get().record("tool", "blocked", f"user_denied: {tool_name}")
                    return ToolResult(success=False, output=f"Tool '{tool_name}' was not approved for this action.")

            if self._checkpoint_manager is not None:
                cwd = arguments.get("cwd") if tool_name == "terminal" else None
                await self._checkpoint_manager.maybe_checkpoint(tool_name, arguments, cwd=cwd)

            result = await handler(**arguments)
            logger.info("tool_dispatched", tool=tool_name, success=result.success, risk=risk)
            return result
        except Exception as e:
            logger.warning("tool_dispatch_failed", tool=tool_name, error=str(e))
            return ToolResult(success=False, output=f"Tool error: {e}")

    def register_decorated(self) -> None:
        """Auto-register all @tool-decorated functions."""
        for name, handler, definition in discover_tools():
            if name not in self._tools:
                self._tools[name] = definition
                self._handlers[name] = handler

    def has_tool(self, name: str) -> bool:
        return name in self._tools

    def list_tools(self) -> list[str]:
        return list(self._tools.keys())

    def get_definition(self, name: str) -> ToolDefinition:
        return self._tools[name]


_TOOL_RESULT_SOFT_LIMIT = 8000
_TOOL_RESULT_HARD_LIMIT = 16000
_RECENT_TOOL_RESULTS_TO_KEEP = 12


class ToolLoop:
    def __init__(self, llm: LLMProvider, registry: ToolRegistry, max_rounds: int = 30, budget: Any = None, max_context_tokens: int | None = None):
        self.llm = llm
        self.registry = registry
        self.max_rounds = max_rounds
        self._budget = budget
        if max_context_tokens is not None:
            self._max_context_tokens = max_context_tokens
        else:
            from sediman.llm.tokens import get_safe_context_budget
            model = getattr(llm, "model", "gpt-4o")
            self._max_context_tokens = get_safe_context_budget(model)

    def _estimate_tokens(self, messages: list[dict[str, Any]]) -> int:
        from sediman.llm.tokens import estimate_messages_tokens
        return estimate_messages_tokens(messages)

    def _smart_truncate_tool_result(self, content: str) -> str:
        if len(content) <= _TOOL_RESULT_SOFT_LIMIT:
            return content
        is_error = any(
            marker in content[:500].lower()
            for marker in ("error", "fail", "traceback", "exception", "fatal", "denied")
        )
        if is_error:
            if len(content) <= _TOOL_RESULT_HARD_LIMIT:
                return content
            lines = content.splitlines()
            if len(lines) > 20:
                head = "\n".join(lines[:10])
                tail = "\n".join(lines[-10:])
                return f"{head}\n... ({len(lines) - 20} lines omitted) ...\n{tail}"
            return content[:_TOOL_RESULT_HARD_LIMIT] + "\n... (truncated)"
        lines = content.splitlines()
        if len(lines) > 40:
            head = "\n".join(lines[:8])
            tail = "\n".join(lines[-8:])
            return f"{head}\n... ({len(lines) - 16} lines omitted, {len(content)} chars total) ...\n{tail}"
        if len(content) > _TOOL_RESULT_HARD_LIMIT:
            return content[:_TOOL_RESULT_HARD_LIMIT] + "\n... (truncated)"
        return content

    def _compress_tool_results(self, messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
        compressed = []
        for m in messages:
            if m.get("role") == "tool":
                content = str(m.get("content", ""))
                truncated = self._smart_truncate_tool_result(content)
                if truncated is not content:
                    compressed.append({**m, "content": truncated})
                else:
                    compressed.append(m)
            else:
                compressed.append(m)
        return compressed

    def _summarize_old_messages(self, messages: list[dict[str, Any]]) -> str:
        parts = []
        for m in messages:
            role = m.get("role", "")
            content = str(m.get("content", ""))
            if role == "user":
                parts.append(f"User: {content[:200]}")
            elif role == "assistant":
                tool_calls = m.get("tool_calls", [])
                if tool_calls:
                    tools_used = ", ".join(tc.get("function", {}).get("name", "?") for tc in tool_calls)
                    parts.append(f"Assistant called: {tools_used}")
                elif content:
                    parts.append(f"Assistant: {content[:200]}")
            elif role == "tool":
                parts.append(f"Tool result: {content[:150]}...")
            elif role == "system":
                if "truncat" not in content.lower() and "compac" not in content.lower():
                    parts.append(f"System: {content[:100]}")
        return "\n".join(parts)

    def _maybe_compress(self, messages: list[dict[str, Any]], system_len: int = 0) -> list[dict[str, Any]]:
        from sediman.llm.tokens import estimate_tokens
        current_tokens = self._estimate_tokens(messages) + system_len
        if current_tokens <= self._max_context_tokens:
            return messages

        logger.info(
            "tool_loop_compressing",
            current_tokens=current_tokens,
            max_tokens=self._max_context_tokens,
            message_count=len(messages),
        )

        compressed = self._compress_tool_results(messages)
        new_tokens = self._estimate_tokens(compressed) + system_len
        if new_tokens > self._max_context_tokens:
            keep = []
            recent_count = 0
            for m in reversed(compressed):
                if m.get("role") == "tool":
                    recent_count += 1
                keep.insert(0, m)
                if recent_count >= _RECENT_TOOL_RESULTS_TO_KEEP and m.get("role") == "user":
                    break
            dropped = [m for m in compressed if m not in keep]
            if dropped and len(keep) < len(compressed):
                summary = self._summarize_old_messages(dropped)
                keep.insert(0, {
                    "role": "system",
                    "content": (
                        f"[{len(dropped)} earlier messages were summarized to conserve context. "
                        f"Summary of prior work:\n{summary}]"
                    ),
                })
            compressed = keep

        logger.info(
            "tool_loop_compressed",
            new_tokens=self._estimate_tokens(compressed) + system_len,
            new_count=len(compressed),
        )
        return compressed

    async def run(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        on_tool_call: Callable[[str, dict[str, Any]], None] | None = None,
    ) -> LLMResponse:
        from sediman.agent.guardrails import Budget

        all_messages: list[dict[str, Any]] = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        response: LLMResponse | None = None
        from sediman.llm.tokens import estimate_tokens
        system_tokens = estimate_tokens(system or "")
        for _round in range(self.max_rounds):
            if self._budget is not None:
                exhausted, reason = self._budget.is_exhausted()
                if exhausted:
                    logger.warning("tool_loop_budget_exhausted", reason=reason, round=_round)
                    break

            InterruptSignal.get().check()

            all_messages = self._maybe_compress(all_messages, system_tokens)

            response = await self.llm.chat(
                messages=all_messages,
                tools=self.registry.get_definitions(),
            )

            if not response.tool_calls:
                InterruptSignal.get().check()
                return response

            all_messages.append(
                {
                    "role": "assistant",
                    "content": response.text or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.name,
                                "arguments": json.dumps(tc.arguments),
                            },
                        }
                        for tc in response.tool_calls
                    ],
                }
            )

            if len(response.tool_calls) > 1:
                async def _dispatch_one(tc: Any) -> tuple[str, ToolResult]:
                    if on_tool_call:
                        result_cb = on_tool_call(tc.name, tc.arguments)
                        if inspect.isawaitable(result_cb):
                            await result_cb
                    result = await self.registry.dispatch(tc.name, tc.arguments)
                    return (tc.id, result)

                dispatch_results = await asyncio.gather(
                    *[_dispatch_one(tc) for tc in response.tool_calls]
                )
                for tc_id, result in dispatch_results:
                    all_messages.append(
                        {"role": "tool", "tool_call_id": tc_id, "content": result.output}
                    )
            else:
                tc = response.tool_calls[0]
                if on_tool_call:
                    result_cb = on_tool_call(tc.name, tc.arguments)
                    if inspect.isawaitable(result_cb):
                        await result_cb
                result = await self.registry.dispatch(tc.name, tc.arguments)
                all_messages.append(
                    {"role": "tool", "tool_call_id": tc.id, "content": result.output}
                )

        if response and response.tool_calls:
            tool_summary = "; ".join(f"{tc.name}({list(tc.arguments.keys())})" for tc in response.tool_calls)
            return LLMResponse(
                text=f"[Tool loop exhausted after {self.max_rounds} rounds. Pending: {tool_summary}]",
                tool_calls=[],
                done=True,
            )

        return response or LLMResponse(text="", tool_calls=[], done=True)

    async def run_streaming(
        self,
        messages: list[dict[str, Any]],
        system: str | None = None,
        on_tool_call: Callable[[str, dict[str, Any]], None] | None = None,
        on_streaming_text: Callable[[str], None] | None = None,
    ) -> LLMResponse:
        """Like run() but streams text tokens via on_streaming_text callback.

        Each LLM call uses chat_stream_with_tools() so the caller sees
        tokens as they arrive. Tool calls are still dispatched normally.
        """
        from sediman.agent.guardrails import Budget

        all_messages: list[dict[str, Any]] = []
        if system:
            all_messages.append({"role": "system", "content": system})
        all_messages.extend(messages)

        response: LLMResponse | None = None
        from sediman.llm.tokens import estimate_tokens
        system_tokens = estimate_tokens(system or "")
        for _round in range(self.max_rounds):
            if self._budget is not None:
                exhausted, reason = self._budget.is_exhausted()
                if exhausted:
                    logger.warning("tool_loop_budget_exhausted", reason=reason, round=_round)
                    break

            InterruptSignal.get().check()

            all_messages = self._maybe_compress(all_messages, system_tokens)

            response = await self.llm.chat_stream_with_tools(
                messages=all_messages,
                tools=self.registry.get_definitions(),
                on_token=on_streaming_text,
            )

            if not response.tool_calls:
                InterruptSignal.get().check()
                return response

            if response.text and on_streaming_text:
                pass

            all_messages.append(
                {
                    "role": "assistant",
                    "content": response.text or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.name,
                                "arguments": json.dumps(tc.arguments),
                            },
                        }
                        for tc in response.tool_calls
                    ],
                }
            )

            if len(response.tool_calls) > 1:
                async def _dispatch_one(tc: Any) -> tuple[str, ToolResult]:
                    if on_tool_call:
                        result_cb = on_tool_call(tc.name, tc.arguments)
                        if inspect.isawaitable(result_cb):
                            await result_cb
                    result = await self.registry.dispatch(tc.name, tc.arguments)
                    return (tc.id, result)

                dispatch_results = await asyncio.gather(
                    *[_dispatch_one(tc) for tc in response.tool_calls]
                )
                for tc_id, result in dispatch_results:
                    all_messages.append(
                        {"role": "tool", "tool_call_id": tc_id, "content": result.output}
                    )
            else:
                tc = response.tool_calls[0]
                if on_tool_call:
                    result_cb = on_tool_call(tc.name, tc.arguments)
                    if inspect.isawaitable(result_cb):
                        await result_cb
                result = await self.registry.dispatch(tc.name, tc.arguments)
                all_messages.append(
                    {"role": "tool", "tool_call_id": tc.id, "content": result.output}
                )

        if response and response.tool_calls:
            tool_summary = "; ".join(f"{tc.name}({list(tc.arguments.keys())})" for tc in response.tool_calls)
            return LLMResponse(
                text=f"[Tool loop exhausted after {self.max_rounds} rounds. Pending: {tool_summary}]",
                tool_calls=[],
                done=True,
            )

        return response or LLMResponse(text="", tool_calls=[], done=True)
