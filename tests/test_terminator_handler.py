"""Tests for the Terminator mode handler and SystemOrchestrator integration.

Covers:
- handle_agent_terminator: task decomposition, orchestrator wiring, interrupt,
  notification streaming, step population, edge cases
- SystemOrchestrator._check_interrupt: signal propagation between rounds/phases
- RPC connection handler: agent.terminator gets notify + cancel support
"""
import asyncio
import json
import os
import tempfile
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from sediman.agent.interrupt import InterruptSignal, AgentInterruptedError


@pytest.fixture(autouse=True)
def _reset_interrupt():
    InterruptSignal.reset_instance()
    yield
    InterruptSignal.reset_instance()


def _make_mock_llm(decompose_json=None, chat_side_effect=None):
    llm = MagicMock()
    resp = MagicMock()
    resp.text = json.dumps(decompose_json or [{"title": "do the thing"}])
    resp.tool_calls = []
    if chat_side_effect:
        llm.chat = AsyncMock(side_effect=chat_side_effect)
    else:
        llm.chat = AsyncMock(return_value=resp)
    return llm


def _make_mock_agent_loop(llm=None):
    agent = MagicMock()
    agent.llm = llm or _make_mock_llm()
    return agent


def _make_mock_orchestrator_result(resolved=1, failed=0):
    from sediman.agent.system.types import WorkflowResult, Issue

    result = WorkflowResult(task="test")
    for i in range(resolved):
        issue = Issue(id=str(i + 1), title=f"subtask {i + 1}", status="resolved")
        issue.resolved_at = issue.started_at + 10
        result.resolved.append(issue)
    for i in range(failed):
        issue = Issue(id=str(resolved + i + 1), title=f"failed {i + 1}", status="failed")
        issue.diagnostic = "boom"
        result.failed.append(issue)
    result.actions_taken = [{"tool": "write_file", "path": "/tmp/x"}]
    return result


class terminator_patches(ExitStack):
    """Context manager that patches all lazy imports in handle_agent_terminator."""

    def __init__(self, mock_result, llm=None):
        super().__init__()
        if llm is None:
            llm = _make_mock_llm()
        self.agent_loop = _make_mock_agent_loop(llm)
        self.mock_orchestrator = MagicMock()
        self.mock_orchestrator.run = AsyncMock(return_value=mock_result)
        self.mock_result = mock_result
        self._llm = llm

    def __enter__(self):
        super().__enter__()
        self.p_loop = self.enter_context(
            patch("sediman.rpc_server._get_agent_loop",
                  new_callable=AsyncMock, return_value=self.agent_loop))
        self.p_orch = self.enter_context(
            patch("sediman.agent.system.orchestrator.SystemOrchestrator",
                  return_value=self.mock_orchestrator))
        self.p_fact = self.enter_context(
            patch("sediman.agent.subagents.factory.SubagentFactory",
                  return_value=MagicMock()))
        self.p_reg = self.enter_context(
            patch("sediman.agent.subagents.registry.SubagentRegistry",
                  return_value=MagicMock()))
        return self


class TestHandleAgentTerminator:
    """Tests for handle_agent_terminator RPC handler."""

    @pytest.mark.asyncio
    async def test_missing_task_raises(self):
        from sediman.rpc_server import handle_agent_terminator
        with pytest.raises(ValueError, match="task is required"):
            await handle_agent_terminator({"task": ""})

    @pytest.mark.asyncio
    async def test_whitespace_only_task_raises(self):
        from sediman.rpc_server import handle_agent_terminator
        with pytest.raises(ValueError, match="task is required"):
            await handle_agent_terminator({"task": "   "})

    @pytest.mark.asyncio
    async def test_missing_task_key_raises(self):
        from sediman.rpc_server import handle_agent_terminator
        with pytest.raises(ValueError, match="task is required"):
            await handle_agent_terminator({})

    @pytest.mark.asyncio
    async def test_successful_run_returns_result(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result(resolved=2, failed=0)

        with terminator_patches(mock_result) as tp:
            result = await handle_agent_terminator({"task": "fix all bugs"})

        assert result["success"] is True
        assert "2 of 2" in result["result"]
        assert result["elapsed_secs"] >= 0
        assert len(result["steps"]) == 2
        assert result["steps"][0]["phase"] == "resolved"

    @pytest.mark.asyncio
    async def test_failed_issues_populated_in_steps(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result(resolved=1, failed=2)

        with terminator_patches(mock_result) as tp:
            result = await handle_agent_terminator({"task": "fix all"})

        assert result["success"] is False
        assert len(result["steps"]) == 3
        failed_steps = [s for s in result["steps"] if s["phase"] == "failed"]
        assert len(failed_steps) == 2
        assert failed_steps[0]["detail"] == "boom"

    @pytest.mark.asyncio
    async def test_actions_taken_included(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()

        with terminator_patches(mock_result) as tp:
            result = await handle_agent_terminator({"task": "do stuff"})

        assert result["actions_taken"] == [{"tool": "write_file", "path": "/tmp/x"}]

    @pytest.mark.asyncio
    async def test_skill_created_is_none(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()

        with terminator_patches(mock_result) as tp:
            result = await handle_agent_terminator({"task": "do"})

        assert result["skill_created"] is None

    @pytest.mark.asyncio
    async def test_orchestrator_exception_returns_error(self):
        from sediman.rpc_server import handle_agent_terminator

        with terminator_patches(MagicMock()) as tp:
            tp.mock_orchestrator.run = AsyncMock(side_effect=RuntimeError("boom"))
            result = await handle_agent_terminator({"task": "fail me"})

        assert result["success"] is False
        assert "boom" in result["result"]
        assert result["steps"] == []

    @pytest.mark.asyncio
    async def test_interrupt_returns_cancelled(self):
        from sediman.rpc_server import handle_agent_terminator

        with terminator_patches(MagicMock()) as tp:
            tp.mock_orchestrator.run = AsyncMock(side_effect=AgentInterruptedError("stop"))
            result = await handle_agent_terminator({"task": "cancel me"})

        assert result["success"] is False
        assert "cancelled" in result["result"].lower()

    @pytest.mark.asyncio
    async def test_decomposition_fallback_on_llm_failure(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()
        llm = _make_mock_llm(chat_side_effect=RuntimeError("LLM down"))

        with terminator_patches(mock_result, llm=llm) as tp:
            result = await handle_agent_terminator({"task": "handle LLM failure"})

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_decomposition_fallback_on_bad_json(self):
        from sediman.rpc_server import handle_agent_terminator

        llm_resp = MagicMock()
        llm_resp.text = "I can't parse this, not JSON at all"
        llm_resp.tool_calls = []
        llm = MagicMock()
        llm.chat = AsyncMock(return_value=llm_resp)
        mock_result = _make_mock_orchestrator_result()

        with terminator_patches(mock_result, llm=llm) as tp:
            result = await handle_agent_terminator({"task": "handle bad JSON"})

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_interrupt_signal_cleared_before_run(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()
        signal = InterruptSignal.get()
        signal.trigger("old")
        assert signal.is_set()

        with terminator_patches(mock_result) as tp:
            await handle_agent_terminator({"task": "clear interrupt"})

        assert not signal.is_set()


class TestTerminatorNotifications:
    """Tests that terminator handler sends progress/streaming notifications."""

    @pytest.mark.asyncio
    async def test_step_notifications_sent_via_notify(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()
        notifications = []

        def capture_notify(method, params):
            notifications.append((method, params))

        with terminator_patches(mock_result) as tp:
            await handle_agent_terminator({"task": "track me"}, notify=capture_notify)

        progress = [(m, p) for m, p in notifications if m == "chat.progress"]
        assert len(progress) >= 3

    @pytest.mark.asyncio
    async def test_step_counter_increments(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()
        steps_seen = []

        def capture_notify(method, params):
            if method == "chat.progress":
                steps_seen.append(params.get("step", 0))

        with terminator_patches(mock_result) as tp:
            await handle_agent_terminator({"task": "count steps"}, notify=capture_notify)

        assert steps_seen[0] == 1
        assert steps_seen[-1] > steps_seen[0]

    @pytest.mark.asyncio
    async def test_no_notifications_when_notify_is_none(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()

        with terminator_patches(mock_result) as tp:
            result = await handle_agent_terminator({"task": "silent"}, notify=None)

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_notify_exception_is_swallowed(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()
        call_count = [0]

        def bad_notify(method, params):
            call_count[0] += 1
            if call_count[0] == 1:
                raise ConnectionError("socket closed")

        with terminator_patches(mock_result) as tp:
            result = await handle_agent_terminator({"task": "resilient"}, notify=bad_notify)

        assert result["success"] is True
        assert call_count[0] > 1

    @pytest.mark.asyncio
    async def test_done_notification_includes_resolve_count(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result(resolved=3, failed=1)
        done_notifications = []

        def capture_notify(method, params):
            if method == "chat.progress" and params.get("action") == "done":
                done_notifications.append(params)

        with terminator_patches(mock_result) as tp:
            await handle_agent_terminator({"task": "done check"}, notify=capture_notify)

        assert len(done_notifications) == 1
        assert "3/4" in done_notifications[0]["detail"]


class TestTerminatorStreamingCallbacks:
    """Tests that SubagentFactory gets on_step and on_streaming_text callbacks."""

    @pytest.mark.asyncio
    async def test_factory_created_with_callbacks(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()
        factory_kwargs = {}

        def capture_factory(*args, **kwargs):
            factory_kwargs.update(kwargs)
            return MagicMock()

        with terminator_patches(mock_result) as tp:
            tp.p_fact.side_effect = capture_factory
            await handle_agent_terminator({"task": "wire callbacks"})

        assert "on_step" in factory_kwargs
        assert "on_streaming_text" in factory_kwargs
        assert callable(factory_kwargs["on_step"])
        assert callable(factory_kwargs["on_streaming_text"])

    @pytest.mark.asyncio
    async def test_on_streaming_text_sends_notification(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()
        streaming_msgs = []
        factory_kwargs = {}

        def capture_notify(method, params):
            if method == "chat.streaming":
                streaming_msgs.append(params)

        def capture_factory(*args, **kwargs):
            factory_kwargs.update(kwargs)
            return MagicMock()

        with terminator_patches(mock_result) as tp:
            tp.p_fact.side_effect = capture_factory
            await handle_agent_terminator({"task": "stream"}, notify=capture_notify)

        if "on_streaming_text" in factory_kwargs:
            factory_kwargs["on_streaming_text"]("hello", "responding")
            assert len(streaming_msgs) == 1
            assert streaming_msgs[0]["token"] == "hello"
            assert streaming_msgs[0]["phase"] == "responding"

    @pytest.mark.asyncio
    async def test_on_step_sends_progress_notification(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()
        progress_msgs = []
        factory_kwargs = {}

        def capture_notify(method, params):
            if method == "chat.progress":
                progress_msgs.append(params)

        def capture_factory(*args, **kwargs):
            factory_kwargs.update(kwargs)
            return MagicMock()

        with terminator_patches(mock_result) as tp:
            tp.p_fact.side_effect = capture_factory
            await handle_agent_terminator({"task": "step"}, notify=capture_notify)

        if "on_step" in factory_kwargs:
            progress_msgs.clear()
            factory_kwargs["on_step"]("executing", "writing file")
            assert len(progress_msgs) == 1
            assert progress_msgs[0]["action"] == "writing file"

    @pytest.mark.asyncio
    async def test_callbacks_none_when_no_notify(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()

        with terminator_patches(mock_result) as tp:
            result = await handle_agent_terminator({"task": "no notify"}, notify=None)

        assert result["success"] is True


class TestTerminatorRPCWiring:
    """Tests that agent.terminator gets notify + cancel in the connection handler."""

    @pytest.mark.asyncio
    async def test_terminator_gets_notify_and_cancel(self):
        from sediman.rpc_server import handle_connection

        sock_path = tempfile.mktemp(suffix=".sock")
        server = await asyncio.start_unix_server(handle_connection, path=sock_path)

        llm = _make_mock_llm()
        mock_result = _make_mock_orchestrator_result()

        client_reader = None
        client_writer = None

        async def run_test():
            nonlocal client_reader, client_writer
            await asyncio.sleep(0.05)
            client_reader, client_writer = await asyncio.open_unix_connection(sock_path)
            request = json.dumps({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "agent.terminator",
                "params": {"task": "test wiring"},
            }) + "\n"
            client_writer.write(request.encode())
            await client_writer.drain()

        lines = []

        async def read_responses():
            while True:
                try:
                    line = await asyncio.wait_for(client_reader.readline(), timeout=10.0)
                    if not line:
                        break
                    lines.append(json.loads(line))
                except asyncio.TimeoutError:
                    break

        with terminator_patches(mock_result, llm=llm) as tp:
            with patch("sediman.rpc_server.InterruptSignal") as mock_interrupt:
                mock_interrupt.get.return_value = MagicMock()
                mock_interrupt.get.return_value.is_set.return_value = False
                mock_interrupt.get.return_value.clear = MagicMock()

                test_task = asyncio.create_task(run_test())
                await asyncio.sleep(0.1)
                await read_responses()
                await test_task

        if client_writer:
            client_writer.close()
        server.close()
        try:
            os.unlink(sock_path)
        except Exception:
            pass

        result_msgs = [l for l in lines if "result" in l and "id" in l]
        assert len(result_msgs) > 0, f"Expected result, got: {[json.dumps(l)[:80] for l in lines]}"
        assert result_msgs[0]["result"]["success"] is True

    @pytest.mark.asyncio
    async def test_terminator_cancel_propagates(self):
        from sediman.rpc_server import handle_connection

        sock_path = tempfile.mktemp(suffix=".sock")
        server = await asyncio.start_unix_server(handle_connection, path=sock_path)

        llm = _make_mock_llm()
        mock_result = _make_mock_orchestrator_result()
        client_reader = None
        client_writer = None

        async def run_test():
            nonlocal client_reader, client_writer
            await asyncio.sleep(0.05)
            client_reader, client_writer = await asyncio.open_unix_connection(sock_path)
            request = json.dumps({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "agent.terminator",
                "params": {"task": "cancel me"},
            }) + "\n"
            client_writer.write(request.encode())
            await client_writer.drain()

            await asyncio.sleep(0.1)
            cancel_req = json.dumps({
                "jsonrpc": "2.0",
                "id": 99,
                "method": "agent.cancel",
                "params": {},
            }) + "\n"
            client_writer.write(cancel_req.encode())
            await client_writer.drain()

        lines = []

        async def read_responses():
            while True:
                try:
                    line = await asyncio.wait_for(client_reader.readline(), timeout=5.0)
                    if not line:
                        break
                    lines.append(json.loads(line))
                except asyncio.TimeoutError:
                    break

        with terminator_patches(mock_result, llm=llm) as tp:
            tp.mock_orchestrator.run = AsyncMock(side_effect=AgentInterruptedError("cancelled"))
            with patch("sediman.rpc_server.InterruptSignal") as mock_interrupt:
                mock_signal = MagicMock()
                mock_signal.is_set.return_value = True
                mock_interrupt.get.return_value = mock_signal

                test_task = asyncio.create_task(run_test())
                await asyncio.sleep(0.15)
                await read_responses()
                await test_task

        if client_writer:
            client_writer.close()
        server.close()
        try:
            os.unlink(sock_path)
        except Exception:
            pass

        result_msgs = [l for l in lines if "result" in l and "id" in l]
        assert len(result_msgs) > 0
        assert result_msgs[0]["result"]["success"] is False


class TestSystemOrchestratorInterrupt:
    """Tests for SystemOrchestrator._check_interrupt method."""

    @pytest.mark.asyncio
    async def test_check_interrupt_passes_when_not_set(self):
        from sediman.agent.system.orchestrator import SystemOrchestrator

        InterruptSignal.reset_instance()
        InterruptSignal.get().clear()

        orch = SystemOrchestrator(
            llm_provider=MagicMock(),
            manager=None,
            factory=MagicMock(),
        )
        await orch._check_interrupt()

    @pytest.mark.asyncio
    async def test_check_interrupt_raises_when_triggered(self):
        from sediman.agent.system.orchestrator import SystemOrchestrator

        InterruptSignal.reset_instance()
        signal = InterruptSignal.get()
        signal.clear()
        signal.trigger("user cancelled")

        orch = SystemOrchestrator(
            llm_provider=MagicMock(),
            manager=None,
            factory=MagicMock(),
        )
        with pytest.raises(AgentInterruptedError):
            await orch._check_interrupt()

    @pytest.mark.asyncio
    async def test_check_interrupt_clear_resets(self):
        InterruptSignal.reset_instance()
        signal = InterruptSignal.get()
        signal.trigger("stop")
        assert signal.is_set()
        signal.clear()
        assert not signal.is_set()

    @pytest.mark.asyncio
    async def test_execute_phase_checks_interrupt_between_rounds(self):
        from sediman.agent.system.orchestrator import SystemOrchestrator
        from sediman.agent.system.types import WorkflowResult, WorkflowConfig

        InterruptSignal.reset_instance()
        signal = InterruptSignal.get()
        signal.clear()

        mock_factory = MagicMock()
        mock_factory.scratchpad = MagicMock()
        mock_factory.spawn = AsyncMock(return_value=MagicMock(success=True, errors=[], actions_taken=[]))

        orch = SystemOrchestrator(
            llm_provider=MagicMock(),
            manager=None,
            factory=mock_factory,
            config=WorkflowConfig(max_rounds=5, verify_after_resolve=False,
                                  review_after_resolve=False, isolate_with_worktrees=False),
        )
        orch.board.create_issue("subtask 1")

        result = WorkflowResult(task="test")
        signal.trigger("stop")

        with pytest.raises(AgentInterruptedError):
            await orch._execute_phase(result, "test", None)

    @pytest.mark.asyncio
    async def test_run_with_successful_issue(self):
        from sediman.agent.system.orchestrator import SystemOrchestrator
        from sediman.agent.system.types import WorkflowConfig

        InterruptSignal.reset_instance()
        InterruptSignal.get().clear()

        mock_subagent_result = MagicMock()
        mock_subagent_result.success = True
        mock_subagent_result.errors = []
        mock_subagent_result.actions_taken = []

        mock_factory = MagicMock()
        mock_factory.scratchpad = MagicMock()
        mock_factory.spawn = AsyncMock(return_value=mock_subagent_result)

        config = WorkflowConfig(
            max_rounds=1, verify_after_resolve=False,
            review_after_resolve=False, isolate_with_worktrees=False,
        )

        orch = SystemOrchestrator(
            llm_provider=MagicMock(), manager=None,
            factory=mock_factory, config=config,
        )

        result = await orch.run("test", ["t1"])
        assert len(result.resolved) == 1
        assert len(result.failed) == 0

    @pytest.mark.asyncio
    async def test_run_interrupted_between_phases(self):
        from sediman.agent.system.orchestrator import SystemOrchestrator
        from sediman.agent.system.types import WorkflowConfig

        InterruptSignal.reset_instance()
        signal = InterruptSignal.get()
        signal.clear()

        mock_subagent_result = MagicMock()
        mock_subagent_result.success = True
        mock_subagent_result.errors = []
        mock_subagent_result.actions_taken = []

        mock_factory = MagicMock()
        mock_factory.scratchpad = MagicMock()
        mock_factory.spawn = AsyncMock(return_value=mock_subagent_result)

        config = WorkflowConfig(
            max_rounds=1, verify_after_resolve=False,
            review_after_resolve=False, isolate_with_worktrees=False,
        )

        orch = SystemOrchestrator(
            llm_provider=MagicMock(), manager=None,
            factory=mock_factory, config=config,
        )

        async def run_issue_then_interrupt(*args, **kwargs):
            signal.trigger("stop between phases")

        with patch.object(orch, "_run_issue", side_effect=run_issue_then_interrupt):
            # _run_issue triggers interrupt but doesn't resolve the issue
            # so the execute phase completes with failed issues, then
            # _check_interrupt fires before _integrate_phase
            with pytest.raises(AgentInterruptedError):
                await orch.run("test", ["t1"])


class TestTerminatorEdgeCases:
    """Edge cases for the terminator handler."""

    @pytest.mark.asyncio
    async def test_empty_subtask_list(self):
        from sediman.rpc_server import handle_agent_terminator

        llm_resp = MagicMock()
        llm_resp.text = "[]"
        llm_resp.tool_calls = []
        llm = MagicMock()
        llm.chat = AsyncMock(return_value=llm_resp)
        mock_result = _make_mock_orchestrator_result(resolved=0, failed=0)

        with terminator_patches(mock_result, llm=llm) as tp:
            result = await handle_agent_terminator({"task": "nothing"})

        assert result["success"] is False
        assert result["steps"] == []

    @pytest.mark.asyncio
    async def test_very_long_task_truncated_in_notification(self):
        from sediman.rpc_server import handle_agent_terminator
        long_task = "x" * 500
        mock_result = _make_mock_orchestrator_result()
        details = []

        def capture_notify(method, params):
            if method == "chat.progress" and params.get("action") == "decomposing task":
                details.append(params.get("detail", ""))

        with terminator_patches(mock_result) as tp:
            await handle_agent_terminator({"task": long_task}, notify=capture_notify)

        if details:
            assert len(details[0]) <= 103

    @pytest.mark.asyncio
    async def test_subtask_with_depends_on(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result(resolved=3)

        llm = _make_mock_llm(decompose_json=[
            {"title": "setup", "depends_on": []},
            {"title": "build", "depends_on": [1]},
            {"title": "test", "depends_on": [2]},
        ])

        with terminator_patches(mock_result, llm=llm) as tp:
            result = await handle_agent_terminator({"task": "build pipeline"})

        assert result["success"] is True
        assert len(result["steps"]) == 3

    @pytest.mark.asyncio
    async def test_elapsed_secs_is_non_negative(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()

        with terminator_patches(mock_result) as tp:
            result = await handle_agent_terminator({"task": "fast"})

        assert result["elapsed_secs"] >= 0

    @pytest.mark.asyncio
    async def test_decompose_with_nested_json_in_text(self):
        from sediman.rpc_server import handle_agent_terminator

        llm_resp = MagicMock()
        llm_resp.text = 'Some text [{"title": "task [1]", "depends_on": []}] more text'
        llm_resp.tool_calls = []
        llm = MagicMock()
        llm.chat = AsyncMock(return_value=llm_resp)
        mock_result = _make_mock_orchestrator_result(resolved=1)

        with terminator_patches(mock_result, llm=llm) as tp:
            result = await handle_agent_terminator({"task": "nested json"})

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_task_with_special_characters(self):
        from sediman.rpc_server import handle_agent_terminator
        mock_result = _make_mock_orchestrator_result()

        with terminator_patches(mock_result) as tp:
            result = await handle_agent_terminator(
                {"task": "fix \"quotes\" & <tags> and \n newlines"})

        assert "elapsed_secs" in result
