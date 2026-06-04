"""Tests for browser mode fixes.

Covers:
- handle_agent_run: mode param propagation to AgentLoop.run
- AgentLoop.run: browser fast path (mode="browser" skips ManagerAgent)
- handle_browser_configure: headless toggle recreates browser session
- is_started (not is_running) used in status/doctor handlers
- browser.configure registered in HANDLERS dispatch
"""
from __future__ import annotations

from contextlib import ExitStack
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import pytest

from sediman.agent.interrupt import InterruptSignal


@pytest.fixture(autouse=True)
def _reset_interrupt():
    InterruptSignal.reset_instance()
    yield
    InterruptSignal.reset_instance()


class TestHandleAgentRunModeParam:
    """Tests for mode param propagation in handle_agent_run."""

    @pytest.mark.asyncio
    async def test_default_mode_is_manager(self):
        """When no mode param, defaults to 'manager'."""
        from sediman.rpc_server import handle_agent_run

        mock_result = MagicMock()
        mock_result.result = "ok"
        mock_result.success = True
        mock_result.steps = []
        mock_result.skill_created = None
        mock_result.actions_taken = []
        mock_result.scheduled_job_id = None
        mock_result.schedule_cron = None
        mock_result.iterations = 0
        mock_result.strategy_used = "direct"

        mock_agent = MagicMock()
        mock_agent.run = AsyncMock(return_value=mock_result)
        mock_agent.on_step = None
        mock_agent.on_streaming_text = None

        with patch("sediman.rpc_server._get_agent_loop", new_callable=AsyncMock, return_value=mock_agent):
            result = await handle_agent_run({"task": "hello"})

        mock_agent.run.assert_called_once_with("hello", mode="manager")
        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_browser_mode_propagated(self):
        """mode='browser' is passed through to AgentLoop.run."""
        from sediman.rpc_server import handle_agent_run

        mock_result = MagicMock()
        mock_result.result = "browsed"
        mock_result.success = True
        mock_result.steps = []
        mock_result.skill_created = None
        mock_result.actions_taken = []
        mock_result.scheduled_job_id = None
        mock_result.schedule_cron = None
        mock_result.iterations = 0
        mock_result.strategy_used = "browser"

        mock_agent = MagicMock()
        mock_agent.run = AsyncMock(return_value=mock_result)
        mock_agent.on_step = None
        mock_agent.on_streaming_text = None

        with patch("sediman.rpc_server._get_agent_loop", new_callable=AsyncMock, return_value=mock_agent):
            result = await handle_agent_run({"task": "go to https://example.com", "mode": "browser"})

        mock_agent.run.assert_called_once_with("go to https://example.com", mode="browser")
        assert result["strategy_used"] == "browser"

    @pytest.mark.asyncio
    async def test_coder_mode_propagated(self):
        """mode='coder' is passed through to AgentLoop.run."""
        from sediman.rpc_server import handle_agent_run

        mock_result = MagicMock()
        mock_result.result = "coded"
        mock_result.success = True
        mock_result.steps = []
        mock_result.skill_created = None
        mock_result.actions_taken = []
        mock_result.scheduled_job_id = None
        mock_result.schedule_cron = None
        mock_result.iterations = 0
        mock_result.strategy_used = "coder"

        mock_agent = MagicMock()
        mock_agent.run = AsyncMock(return_value=mock_result)
        mock_agent.on_step = None
        mock_agent.on_streaming_text = None

        with patch("sediman.rpc_server._get_agent_loop", new_callable=AsyncMock, return_value=mock_agent):
            result = await handle_agent_run({"task": "write a function", "mode": "coder"})

        mock_agent.run.assert_called_once_with("write a function", mode="coder")

    @pytest.mark.asyncio
    async def test_mode_whitespace_trimmed(self):
        """Whitespace in mode param is stripped."""
        from sediman.rpc_server import handle_agent_run

        mock_result = MagicMock()
        mock_result.result = "ok"
        mock_result.success = True
        mock_result.steps = []
        mock_result.skill_created = None
        mock_result.actions_taken = []
        mock_result.scheduled_job_id = None
        mock_result.schedule_cron = None
        mock_result.iterations = 0
        mock_result.strategy_used = "direct"

        mock_agent = MagicMock()
        mock_agent.run = AsyncMock(return_value=mock_result)
        mock_agent.on_step = None
        mock_agent.on_streaming_text = None

        with patch("sediman.rpc_server._get_agent_loop", new_callable=AsyncMock, return_value=mock_agent):
            result = await handle_agent_run({"task": "hello", "mode": "  manager  "})

        mock_agent.run.assert_called_once_with("hello", mode="manager")

    @pytest.mark.asyncio
    async def test_empty_mode_defaults_to_manager(self):
        """Empty mode param defaults to 'manager'."""
        from sediman.rpc_server import handle_agent_run

        mock_result = MagicMock()
        mock_result.result = "ok"
        mock_result.success = True
        mock_result.steps = []
        mock_result.skill_created = None
        mock_result.actions_taken = []
        mock_result.scheduled_job_id = None
        mock_result.schedule_cron = None
        mock_result.iterations = 0
        mock_result.strategy_used = "direct"

        mock_agent = MagicMock()
        mock_agent.run = AsyncMock(return_value=mock_result)
        mock_agent.on_step = None
        mock_agent.on_streaming_text = None

        with patch("sediman.rpc_server._get_agent_loop", new_callable=AsyncMock, return_value=mock_agent):
            result = await handle_agent_run({"task": "hello", "mode": ""})

        mock_agent.run.assert_called_once_with("hello", mode="manager")

    @pytest.mark.asyncio
    async def test_interrupt_clears_before_run(self):
        """InterruptSignal is cleared before running."""
        from sediman.rpc_server import handle_agent_run

        mock_result = MagicMock()
        mock_result.result = "ok"
        mock_result.success = True
        mock_result.steps = []
        mock_result.skill_created = None
        mock_result.actions_taken = []
        mock_result.scheduled_job_id = None
        mock_result.schedule_cron = None
        mock_result.iterations = 0
        mock_result.strategy_used = "direct"

        mock_agent = MagicMock()
        mock_agent.run = AsyncMock(return_value=mock_result)
        mock_agent.on_step = None
        mock_agent.on_streaming_text = None

        sig = InterruptSignal.get()
        sig.trigger("test")

        with patch("sediman.rpc_server._get_agent_loop", new_callable=AsyncMock, return_value=mock_agent):
            result = await handle_agent_run({"task": "hello"})

        assert not sig.is_set()

    @pytest.mark.asyncio
    async def test_callbacks_restored_after_run(self):
        """on_step and on_streaming_text are restored after run completes."""
        from sediman.rpc_server import handle_agent_run

        mock_result = MagicMock()
        mock_result.result = "ok"
        mock_result.success = True
        mock_result.steps = []
        mock_result.skill_created = None
        mock_result.actions_taken = []
        mock_result.scheduled_job_id = None
        mock_result.schedule_cron = None
        mock_result.iterations = 0
        mock_result.strategy_used = "direct"

        original_step = lambda e: None
        original_stream = lambda t, p: None

        mock_agent = MagicMock()
        mock_agent.run = AsyncMock(return_value=mock_result)
        mock_agent.on_step = original_step
        mock_agent.on_streaming_text = original_stream

        with patch("sediman.rpc_server._get_agent_loop", new_callable=AsyncMock, return_value=mock_agent):
            await handle_agent_run({"task": "hello"}, notify=lambda m, d: None)

        assert mock_agent.on_step is original_step
        assert mock_agent.on_streaming_text is original_stream


class TestAgentLoopBrowserMode:
    """Tests for AgentLoop.run with mode='browser' fast path."""

    def _make_loop(self):
        from sediman.agent.loop import AgentLoop

        mock_llm = MagicMock()
        mock_llm.set_token_callback = MagicMock()
        mock_browser = MagicMock()
        mock_browser.start = AsyncMock()

        loop = AgentLoop(llm_provider=mock_llm, browser_session=mock_browser)
        loop._memory_initialized = True
        return loop

    @pytest.mark.asyncio
    async def test_browser_mode_skips_manager(self):
        """mode='browser' skips ManagerAgent classification and forces DIRECT."""
        loop = self._make_loop()

        exec_result = MagicMock()
        exec_result.content = "Page loaded"
        exec_result.actions = [{"action": "navigate"}]

        mock_post = MagicMock()
        mock_post.run_background = AsyncMock()

        with patch.object(loop, "_get_direct_executor") as mock_get_exec:
            mock_executor = MagicMock()
            mock_executor.execute = AsyncMock(return_value=exec_result)
            mock_get_exec.return_value = mock_executor
            with patch.object(loop, "_get_post_task_handler", return_value=mock_post):
                result = await loop.run("go to https://example.com", mode="browser")

        assert result.strategy_used == "browser"
        assert result.result == "Page loaded"
        assert result.actions_taken == [{"action": "navigate"}]

    @pytest.mark.asyncio
    async def test_browser_mode_uses_direct_strategy(self):
        """Browser mode creates a ManagerPlan with Strategy.DIRECT."""
        loop = self._make_loop()

        exec_result = MagicMock()
        exec_result.content = "done"
        exec_result.actions = []

        mock_post = MagicMock()
        mock_post.run_background = AsyncMock()

        with patch.object(loop, "_get_direct_executor") as mock_get_exec:
            mock_executor = MagicMock()
            mock_executor.execute = AsyncMock(return_value=exec_result)
            mock_get_exec.return_value = mock_executor
            with patch.object(loop, "_get_post_task_handler", return_value=mock_post):
                result = await loop.run("browse example.com", mode="browser")

        assert result.result == "done"

    @pytest.mark.asyncio
    async def test_manager_mode_does_not_use_browser_fast_path(self):
        """mode='manager' does NOT trigger the browser fast path — it reaches _manager.plan."""
        from sediman.agent.state import Strategy

        loop = self._make_loop()

        mock_mgr = MagicMock()
        plan = MagicMock()
        plan.strategy = Strategy.CONVERSATIONAL
        plan.browser_task = None
        plan.coding_task = None
        plan.response = "hello"
        plan.schedule = None
        plan.subtasks = None
        plan.milestones = []
        mock_mgr.plan = AsyncMock(return_value=plan)

        mock_post = MagicMock()
        mock_post.run_background = AsyncMock()

        with patch.object(loop, "_turbo_handler") as mock_turbo:
            mock_turbo.is_eligible.return_value = False
            with patch.object(loop, "_url_handler") as mock_url:
                mock_url.matches.return_value = False
                with patch.object(loop, "_schedule_handler") as mock_sched:
                    mock_sched.matches.return_value = None
                    with patch.object(loop, "_regex_planner") as mock_regex:
                        mock_regex.plan.return_value = None
                        with patch.object(loop, "_memory") as mock_mem:
                            mock_mem.get_context = AsyncMock(return_value="")
                            with patch.object(loop, "_manager", mock_mgr):
                                with patch.object(loop, "_emit"):
                                    with patch.object(loop, "_get_post_task_handler", return_value=mock_post):
                                        result = await loop.run("test task", mode="manager")

        assert mock_mgr.plan.called
        assert result.strategy_used == "conversational"


class TestBrowserConfigure:
    """Tests for handle_browser_configure RPC endpoint."""

    @pytest.mark.asyncio
    async def test_browser_configure_stops_existing_browser(self):
        """Calling browser.configure stops and recreates the browser."""
        from sediman.rpc_server import handle_browser_configure

        mock_old_browser = MagicMock()
        mock_old_browser.stop = AsyncMock()
        mock_new_browser = MagicMock()
        mock_new_browser.start = AsyncMock()

        with patch("sediman.rpc_server._browser", mock_old_browser):
            with patch("sediman.rpc_server.BrowserSession", return_value=mock_new_browser):
                with patch("sediman.rpc_server.STEALTH_ENABLED", False):
                    with patch("sediman.rpc_server.STEALTH_PROXY", ""):
                        result = await handle_browser_configure({"headless": False})

        mock_old_browser.stop.assert_called_once()
        mock_new_browser.start.assert_called_once()
        assert result["configured"] is True
        assert result["headless"] is False

    @pytest.mark.asyncio
    async def test_browser_configure_default_headless_true(self):
        """Default headless is True."""
        from sediman.rpc_server import handle_browser_configure

        mock_browser = MagicMock()
        mock_browser.start = AsyncMock()

        with patch("sediman.rpc_server._browser", None):
            with patch("sediman.rpc_server.BrowserSession", return_value=mock_browser) as mock_cls:
                with patch("sediman.rpc_server.STEALTH_ENABLED", False):
                    with patch("sediman.rpc_server.STEALTH_PROXY", ""):
                        result = await handle_browser_configure({})

        mock_cls.assert_called_once_with(headless=True, stealth=False, proxy=None)
        assert result["headless"] is True

    @pytest.mark.asyncio
    async def test_browser_configure_stops_old_browser_failure_swallowed(self):
        """If stopping old browser fails, it's swallowed."""
        from sediman.rpc_server import handle_browser_configure

        mock_old_browser = MagicMock()
        mock_old_browser.stop = AsyncMock(side_effect=RuntimeError("stop failed"))
        mock_new_browser = MagicMock()
        mock_new_browser.start = AsyncMock()

        with patch("sediman.rpc_server._browser", mock_old_browser):
            with patch("sediman.rpc_server.BrowserSession", return_value=mock_new_browser):
                with patch("sediman.rpc_server.STEALTH_ENABLED", False):
                    with patch("sediman.rpc_server.STEALTH_PROXY", ""):
                        result = await handle_browser_configure({"headless": True})

        assert result["configured"] is True

    @pytest.mark.asyncio
    async def test_browser_configure_passes_stealth_settings(self):
        """Stealth and proxy settings are forwarded to BrowserSession."""
        from sediman.rpc_server import handle_browser_configure

        mock_browser = MagicMock()
        mock_browser.start = AsyncMock()

        with patch("sediman.rpc_server._browser", None):
            with patch("sediman.rpc_server.BrowserSession", return_value=mock_browser) as mock_cls:
                with patch("sediman.rpc_server.STEALTH_ENABLED", True):
                    with patch("sediman.rpc_server.STEALTH_PROXY", "socks5://proxy:1080"):
                        result = await handle_browser_configure({"headless": True})

        mock_cls.assert_called_once_with(
            headless=True, stealth=True, proxy="socks5://proxy:1080"
        )


class TestBrowserStartedField:
    """Tests that is_started (not is_running) is used."""

    @pytest.mark.asyncio
    async def test_system_status_uses_is_started(self):
        """handle_system_status checks browser.is_started."""
        from sediman.rpc_server import handle_system_status

        mock_browser = MagicMock()
        mock_browser.is_started = True
        mock_agent = MagicMock()
        mock_agent._conversation = []

        with patch("sediman.rpc_server._browser", mock_browser):
            with patch("sediman.rpc_server._llm", MagicMock()):
                with patch("sediman.rpc_server._agent_loop", mock_agent):
                    with patch("sediman.rpc_server._llm_config", {"provider": "openai"}):
                        result = await handle_system_status({})

        assert result["browser_open"] is True

    @pytest.mark.asyncio
    async def test_system_status_browser_none(self):
        """handle_system_status with no browser."""
        from sediman.rpc_server import handle_system_status

        mock_agent = MagicMock()
        mock_agent._conversation = []

        with patch("sediman.rpc_server._browser", None):
            with patch("sediman.rpc_server._llm", None):
                with patch("sediman.rpc_server._agent_loop", mock_agent):
                    with patch("sediman.rpc_server._llm_config", {}):
                        result = await handle_system_status({})

        assert result["browser_open"] is False

    @pytest.mark.asyncio
    async def test_system_doctor_uses_is_started(self):
        """handle_system_doctor checks browser.is_started."""
        from sediman.rpc_server import handle_system_doctor

        mock_browser = MagicMock()
        mock_browser.is_started = False

        with patch("sediman.rpc_server._browser", mock_browser):
            with patch("sediman.rpc_server._llm", MagicMock()):
                with patch("sediman.rpc_server._llm_config", {"provider": "openai"}):
                    result = await handle_system_doctor({})

        assert result["checks"]["browser_running"] is False

    @pytest.mark.asyncio
    async def test_system_doctor_browser_running_when_started(self):
        """handle_system_doctor shows browser_running=True when is_started."""
        from sediman.rpc_server import handle_system_doctor

        mock_browser = MagicMock()
        mock_browser.is_started = True

        with patch("sediman.rpc_server._browser", mock_browser):
            with patch("sediman.rpc_server._llm", MagicMock()):
                with patch("sediman.rpc_server._llm_config", {"provider": "openai"}):
                    result = await handle_system_doctor({})

        assert result["checks"]["browser_running"] is True


class TestHandlersRegistration:
    """Tests for HANDLERS dispatch table."""

    def test_browser_configure_registered(self):
        """browser.configure is registered in HANDLERS."""
        from sediman.rpc_server import HANDLERS
        assert "browser.configure" in HANDLERS

    def test_agent_run_registered(self):
        """agent.run is registered in HANDLERS."""
        from sediman.rpc_server import HANDLERS
        assert "agent.run" in HANDLERS

    def test_agent_terminator_registered(self):
        """agent.terminator is registered in HANDLERS."""
        from sediman.rpc_server import HANDLERS
        assert "agent.terminator" in HANDLERS

    def test_agent_cancel_registered(self):
        """agent.cancel is registered in HANDLERS."""
        from sediman.rpc_server import HANDLERS
        assert "agent.cancel" in HANDLERS
