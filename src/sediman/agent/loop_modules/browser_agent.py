"""Browser agent factory for AgentLoop.

Handles creation of browser agents for different use cases.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Callable

if TYPE_CHECKING:
    from sediman.browser.session import BrowserSession
    from sediman.llm.provider import LLMProvider
    from sediman.agent.types import StepEvent
    from sediman.agent.browser_agent import BrowserSubagent


class BrowserAgentFactory:
    """Factory for creating browser agents with proper configuration."""

    def __init__(
        self,
        browser_session: BrowserSession,
        llm_provider: LLMProvider,
        max_steps: int = 25,
        flash_mode: bool = True,
        turbo_mode: bool = False,
        on_step: Callable[[StepEvent], None] | None = None,
    ):
        self.browser = browser_session
        self.llm = llm_provider
        self.max_steps = max_steps
        self.flash_mode = flash_mode
        self.turbo_mode = turbo_mode
        self.on_step = on_step
        self._cached_memory_context: str | None = None
        self._cached_browser_use_llm: Any | None = None
        self._conversation: list[dict[str, str]] = []

    def set_conversation(self, conversation: list[dict[str, str]]) -> None:
        """Set conversation context for browser agents."""
        self._conversation = conversation

    def set_memory_context(self, context: str) -> None:
        """Set cached memory context."""
        self._cached_memory_context = context

    def get_memory_context(self) -> str | None:
        """Get cached memory context."""
        return self._cached_memory_context

    def set_browser_use_llm(self, llm: Any) -> None:
        """Cache browser use LLM instance."""
        self._cached_browser_use_llm = llm

    def get_browser_use_llm(self) -> Any | None:
        """Get cached browser use LLM instance."""
        return self._cached_browser_use_llm

    def get_browser_agent(
        self,
        recording_name: str | None = None,
        task: str = "",
    ) -> BrowserSubagent:
        """Get a browser agent instance.

        Handles both standard browser sessions and agent browser sessions.
        """
        # Check if this is an AgentBrowserSession
        if hasattr(self.browser, '__class__') and self.browser.__class__.__name__ == 'AgentBrowserSession':
            return self._get_agent_browser_agent(recording_name=recording_name, task=task)

        return self._get_standard_browser_agent(recording_name=recording_name, task=task)

    def _get_standard_browser_agent(
        self,
        recording_name: str | None = None,
        task: str = "",
    ) -> BrowserSubagent:
        """Create a standard browser subagent."""
        from sediman.agent.browser_agent import BrowserSubagent

        on_browser_step = self._create_browser_step_callback()
        memory_context = self._get_or_load_memory_context(task)

        agent = BrowserSubagent(
            browser_session=self.browser,
            llm_provider=self.llm,
            max_steps=self.max_steps,
            flash_mode=self.flash_mode,
            turbo_mode=self.turbo_mode,
            on_browser_step=on_browser_step,
            conversation=self._conversation,
            recording_name=recording_name,
            memory_context=memory_context,
            browser_use_llm=self._cached_browser_use_llm,
        )

        # Cache the browser_use_llm if set by the agent
        if agent._browser_use_llm is not None:
            self._cached_browser_use_llm = agent._browser_use_llm

        return agent

    def _get_agent_browser_agent(
        self,
        recording_name: str | None = None,
        task: str = "",
    ) -> BrowserSubagent:
        """Create an agent browser subagent."""
        from sediman.agentbrowser.subagent import AgentBrowserSubagent

        on_browser_step = self._create_browser_step_callback()
        memory_context = self._get_or_load_memory_context(task)

        return AgentBrowserSubagent(
            browser_session=self.browser,
            llm_provider=self.llm,
            max_steps=self.max_steps,
            on_browser_step=on_browser_step,
            conversation=self._conversation,
            memory_context=memory_context,
            recording_name=recording_name,
        )

    def _create_browser_step_callback(self) -> Callable[[str, str], None] | None:
        """Create a callback for browser step events."""
        if not self.on_step:
            return None

        from sediman.agent.types import StepEvent
        browser_step_counter = [0]

        def on_browser_step(action: str, url: str) -> None:
            browser_step_counter[0] += 1
            self.on_step(StepEvent(
                step=browser_step_counter[0],
                action=action,
                observation=url,
                phase="executing",
                url=url if url.startswith("http") else None,
            ))

        return on_browser_step

    def _get_or_load_memory_context(self, task: str) -> str:
        """Get memory context, loading it if not cached."""
        if self._cached_memory_context is not None:
            return self._cached_memory_context

        try:
            from sediman.memory.store import MemoryStore
            memory_store = MemoryStore()
            self._cached_memory_context = memory_store.format_for_system_prompt_filtered(
                task or "browser task", max_chars=800
            )
        except Exception:
            self._cached_memory_context = ""

        return self._cached_memory_context

    async def ensure_browser_controller(self) -> Any:
        """Ensure a browser controller is available.

        Returns the browser controller instance.
        """
        from sediman.browser.tools import get_default_browser_controller, set_default_browser_controller
        import structlog

        logger = structlog.get_logger()

        ctrl = get_default_browser_controller()
        if ctrl is not None:
            return ctrl

        from sediman.browser.controller import BrowserController
        ctrl = BrowserController(headless=self.browser.headless)

        try:
            browser_obj = self.browser.browser
            if browser_obj is not None:
                try:
                    page = await browser_obj.get_current_page()
                    if page:
                        ctrl._own_page = page
                except Exception:
                    logger.debug("browser_page_extract_failed")
        except Exception:
            logger.debug("browser_obj_access_failed")

        set_default_browser_controller(ctrl)
        return ctrl
