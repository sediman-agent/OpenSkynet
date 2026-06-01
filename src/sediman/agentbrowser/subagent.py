from __future__ import annotations

import os
from typing import Callable

import structlog

from sediman.agentbrowser.session import AgentBrowserSession
from sediman.llm.provider import LLMProvider
from sediman.types import BrowserResult

logger = structlog.get_logger()


class AgentBrowserSubagent:
    def __init__(
        self,
        browser_session: AgentBrowserSession,
        llm_provider: LLMProvider,
        max_steps: int = 50,
        on_browser_step: Callable[[str, str], None] | None = None,
        conversation: list[dict[str, str]] | None = None,
        memory_context: str | None = None,
        recording_name: str | None = None,
    ):
        self.browser = browser_session
        self.llm = llm_provider
        self.max_steps = max_steps
        self._on_step = on_browser_step
        self._conversation = conversation or []
        self._memory_context = memory_context
        self._recording_name = recording_name

    async def run(self, task: str) -> BrowserResult:
        from sediman.agentbrowser.client import AgentBrowserClient

        client = self.browser.get_client()
        if not client:
            return BrowserResult(
                text="Agent-browser client not available.",
                actions=[],
            )

        if not client.is_initialized:
            api_key = os.environ.get("OPENAI_API_KEY", "")
            model = getattr(self.llm, "model", None) or "gpt-4"
            base_url = getattr(self.llm, "base_url", None)

            system_addon = ""
            if self._memory_context:
                system_addon += f"\n\n<user_context>\n{self._memory_context}\n</user_context>"
            if self._conversation:
                from sediman.utils import format_conversation_context
                ctx = format_conversation_context(self._conversation, limit=6)
                system_addon += f"\n\n<conversation_context>\n{ctx}\n</conversation_context>"

            def _on_notification(msg: dict[str, Any]) -> None:
                if self._on_step and msg.get("method") == "agent.thinking":
                    chunk = msg.get("params", {}).get("chunk", "")
                    if chunk:
                        self._on_step("thinking", chunk[:80])
                elif self._on_step and msg.get("method") == "agent.status":
                    status = msg.get("params", {}).get("status", "")
                    if status:
                        self._on_step("status", status)

            client.set_notification_handler(_on_notification)

            initialized = await client.init(
                api_key=api_key,
                model=model,
                base_url=base_url,
                max_rounds=self.max_steps,
                custom_instructions=system_addon if system_addon else None,
            )
            if not initialized:
                return BrowserResult(
                    text="Failed to initialize agent-browser.",
                    actions=[],
                )

        logger.info("agent_browser_subagent_start", task=task[:80])
        if self._on_step:
            self._on_step("start", task[:80])

        result_text = await client.chat(task)

        actions: list[dict[str, Any]] = []
        try:
            history = await client.get_history()
            for msg in history:
                if msg.get("role") == "tool":
                    actions.append({
                        "action": "tool_call",
                        "name": msg.get("name", ""),
                        "content": (msg.get("content") or "")[:200],
                    })
        except Exception:
            logger.debug("history_fetch_failed")

        logger.info(
            "agent_browser_subagent_done",
            result_length=len(result_text),
            actions=len(actions),
        )

        return BrowserResult(text=result_text, actions=actions)
