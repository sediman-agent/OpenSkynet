"""Tests for PostTaskHandler ensuring attribute consistency and functionality."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from sediman.agent.post_task.handler import PostTaskHandler
from sediman.agent.manager import ManagerPlan
from sediman.agent.state import AgentState, Strategy


@pytest.fixture
def mock_dependencies():
    """Create mock dependencies for PostTaskHandler."""
    llm = MagicMock()
    memory = MagicMock()
    memory.on_pre_compress = AsyncMock()
    memory.on_turn_start = AsyncMock()
    memory.on_session_end = AsyncMock()
    memory.should_review = MagicMock(return_value=False)
    memory.handle_tool_call = AsyncMock()
    memory.run_background_review = AsyncMock()

    recorder = MagicMock()
    recorder.record = MagicMock(return_value=None)

    skill_learner = MagicMock()
    skill_learner.review_and_learn = AsyncMock(return_value=None)

    skill_auditor = MagicMock()
    skill_auditor.audit = AsyncMock(return_value={"actions": []})

    subagent_registry = MagicMock()

    return {
        "llm": llm,
        "memory": memory,
        "recorder": recorder,
        "skill_learner": skill_learner,
        "skill_auditor": skill_auditor,
        "subagent_registry": subagent_registry,
    }


class TestPostTaskHandlerInit:

    def test_initialization_sets_recorder_attribute(self, mock_dependencies):
        """Test that recorder is set as self.recorder not self._recorder."""
        handler = PostTaskHandler(
            llm_provider=mock_dependencies["llm"],
            memory=mock_dependencies["memory"],
            recorder=mock_dependencies["recorder"],
        )

        # Should have recorder attribute (not _recorder)
        assert hasattr(handler, 'recorder')
        assert handler.recorder is mock_dependencies["recorder"]

        # Should NOT have _recorder attribute
        assert not hasattr(handler, '_recorder')

    def test_initialization_with_all_dependencies(self, mock_dependencies):
        """Test initialization with all optional dependencies."""
        handler = PostTaskHandler(
            llm_provider=mock_dependencies["llm"],
            memory=mock_dependencies["memory"],
            recorder=mock_dependencies["recorder"],
            skill_learner=mock_dependencies["skill_learner"],
            skill_auditor=mock_dependencies["skill_auditor"],
            subagent_registry=mock_dependencies["subagent_registry"],
        )

        assert handler.llm is mock_dependencies["llm"]
        assert handler.memory is mock_dependencies["memory"]
        assert handler.recorder is mock_dependencies["recorder"]
        assert handler.skill_learner is mock_dependencies["skill_learner"]
        assert handler.skill_auditor is mock_dependencies["skill_auditor"]
        assert handler.subagent_registry is mock_dependencies["subagent_registry"]

    @pytest.mark.asyncio
    async def test_handle_uses_correct_recorder_attribute(self, mock_dependencies):
        """Test that handle() uses self.recorder not self._recorder."""
        handler = PostTaskHandler(
            llm_provider=mock_dependencies["llm"],
            memory=mock_dependencies["memory"],
            recorder=mock_dependencies["recorder"],
        )

        state = AgentState(task="test task")
        plan = ManagerPlan(browser_task="test")

        # This should not raise AttributeError for _recorder
        try:
            await handler.handle(state, plan, "test task")
        except AttributeError as e:
            if "_recorder" in str(e):
                pytest.fail(f"handle() method tried to access _recorder: {e}")
            # Re-raise if it's a different AttributeError
            raise


class TestPostTaskHandle:
    """Test PostTaskHandler.handle() method."""

    @pytest.fixture
    def handler(self, mock_dependencies):
        """Create a PostTaskHandler instance with all dependencies."""
        handler = PostTaskHandler(
            llm_provider=mock_dependencies["llm"],
            memory=mock_dependencies["memory"],
            recorder=mock_dependencies["recorder"],
            skill_learner=mock_dependencies["skill_learner"],
            skill_auditor=mock_dependencies["skill_auditor"],
            subagent_registry=mock_dependencies["subagent_registry"],
        )
        # Set skill_engine which is used in handle()
        handler.skill_engine = MagicMock()
        return handler

    @pytest.fixture
    def basic_state(self):
        """Create a basic AgentState."""
        state = AgentState(task="test task")
        state.result = "Test result"
        state.actions_taken = [{"action": "test"}]
        return state

    @pytest.mark.asyncio
    async def test_handle_with_minimal_plan(self, handler, basic_state):
        """Test handle() with a minimal plan."""
        plan = ManagerPlan(browser_task="test task")

        # Should not raise any errors
        await handler.handle(basic_state, plan, "test task")

    @pytest.mark.asyncio
    async def test_handle_with_schedule(self, handler, basic_state):
        """Test handle() with a scheduled plan."""
        from sediman.agent.planner import ScheduleIntent

        schedule = ScheduleIntent(cron="0 0 * * *", task="scheduled task")
        plan = ManagerPlan(browser_task="", schedule=schedule)

        # Mock the _schedule_job method to avoid actual cron operations
        with patch.object(handler, '_schedule_job') as mock_schedule:
            await handler.handle(basic_state, plan, "test task")

            # Should have called _schedule_job
            mock_schedule.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_calls_recorder_record(self, handler, basic_state, mock_dependencies):
        """Test that handle() calls recorder.record()."""
        plan = ManagerPlan(browser_task="test task")

        await handler.handle(basic_state, plan, "test task")

        # Should have called recorder.record
        mock_dependencies["recorder"].record.assert_called_once()


class TestPostTaskHandlerEdgeCases:
    """Test edge cases and error conditions."""

    @pytest.fixture
    def handler(self):
        """Create a minimal handler."""
        llm = MagicMock()
        memory = MagicMock()
        memory.on_pre_compress = AsyncMock()
        memory.on_turn_start = AsyncMock()
        memory.on_session_end = AsyncMock()
        memory.should_review = MagicMock(return_value=False)
        recorder = MagicMock()
        recorder.record = MagicMock(return_value=None)

        return PostTaskHandler(
            llm_provider=llm,
            memory=memory,
            recorder=recorder,
        )

    @pytest.mark.asyncio
    async def test_handle_with_empty_state(self, handler):
        """Test handle() with an empty state."""
        state = AgentState(task="test")
        plan = ManagerPlan(browser_task="test")

        # Should not raise errors even with empty state
        await handler.handle(state, plan, "test task")

    @pytest.mark.asyncio
    async def test_handle_with_none_result(self, handler):
        """Test handle() when state.result is None."""
        state = AgentState(task="test")
        state.result = None
        state.actions_taken = []
        plan = ManagerPlan(browser_task="test")

        # Should not raise errors
        await handler.handle(state, plan, "test task")

    @pytest.mark.asyncio
    async def test_handle_recorder_exception(self, handler):
        """Test handle() when recorder.record() raises an exception."""
        recorder = MagicMock()
        recorder.record = MagicMock(side_effect=Exception("Recorder error"))

        handler.recorder = recorder
        handler.skill_engine = MagicMock()  # Set skill_engine to avoid None errors
        state = AgentState(task="test")
        state.result = "result"
        state.actions_taken = []
        plan = ManagerPlan(browser_task="test")

        # Current implementation doesn't catch recorder exceptions - it lets them propagate
        with pytest.raises(Exception, match="Recorder error"):
            await handler.handle(state, plan, "test task")
