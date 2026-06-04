"""Tests for refactored loop modules."""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock

from sediman.agent.loop_modules.conversation import ConversationManager
from sediman.agent.loop_modules.browser_agent import BrowserAgentFactory
from sediman.agent.loop_modules.streaming import StreamingHandler
from sediman.agent.loop_modules.skills import SkillManager
from sediman.agent.loop_modules.persistence import PersistenceManager
from sediman.agent.loop_modules.helpers import AgentHelpers


class TestConversationManager:
    """Test ConversationManager functionality."""

    def test_init_with_conversation_list(self):
        """Test initialization with external conversation list."""
        conv_list = [{"role": "user", "content": "test"}]
        manager = ConversationManager(conversation_list=conv_list)

        assert manager._get_conversation() is conv_list
        assert len(manager.get_conversation()) == 1

    def test_init_with_getter(self):
        """Test initialization with conversation getter callback."""
        conv_list = [{"role": "user", "content": "test"}]
        getter = lambda: conv_list
        manager = ConversationManager(conversation_getter=getter)

        assert manager._get_conversation() is conv_list

    def test_get_set_clear_conversation(self):
        """Test conversation manipulation methods."""
        conv_list = []
        manager = ConversationManager(conversation_list=conv_list)

        # Set conversation
        manager.set_conversation([{"role": "user", "content": "msg1"}])
        assert len(manager.get_conversation()) == 1
        assert manager.get_conversation()[0]["content"] == "msg1"

        # Clear conversation
        manager.clear_conversation()
        assert len(manager.get_conversation()) == 0

    def test_conversation_list_replacement(self):
        """Test that replacing the list reference still works."""
        conv_list = [{"role": "user", "content": "original"}]
        manager = ConversationManager(
            conversation_list=conv_list,
            conversation_getter=lambda: conv_list,
        )

        # Simulate test replacing the list reference
        new_list = [{"role": "user", "content": "new"}]
        conv_list.clear()
        conv_list.extend(new_list)

        # Manager should see the new content through the getter
        assert manager._get_conversation() == new_list
        assert manager._get_conversation()[0]["content"] == "new"

    def test_build_task_with_context_empty(self):
        """Test build_task_with_context with empty conversation."""
        conv_list = []
        manager = ConversationManager(conversation_list=conv_list)

        result = manager.build_task_with_context("test task")
        assert result == "test task"

    def test_build_task_with_context_has_history(self):
        """Test build_task_with_context with conversation history."""
        conv_list = [
            {"role": "user", "content": "first question"},
            {"role": "assistant", "content": "first answer"},
        ]
        manager = ConversationManager(
            conversation_list=conv_list,
            conversation_getter=lambda: conv_list,
        )

        result = manager.build_task_with_context("follow up")
        assert "Previous conversation context" in result
        assert "first question" in result
        assert "follow up" in result

    def test_trim_conversation(self):
        """Test conversation trimming to max_conversation."""
        conv_list = []
        manager = ConversationManager(
            conversation_list=conv_list,
            max_conversation=3,
        )

        # Add more messages than max
        for i in range(5):
            conv_list.append({"role": "user", "content": f"msg{i}"})
            manager._trim_conversation()

        # Should be trimmed to max_conversation
        assert len(manager._get_conversation()) == 3
        # Should keep the most recent messages
        assert manager._get_conversation()[0]["content"] == "msg2"
        assert manager._get_conversation()[2]["content"] == "msg4"


class TestBrowserAgentFactory:
    """Test BrowserAgentFactory functionality."""

    def test_initialization(self):
        """Test BrowserAgentFactory initialization."""
        browser = MagicMock()
        llm = MagicMock()
        factory = BrowserAgentFactory(
            browser_session=browser,
            llm_provider=llm,
            max_steps=10,
        )

        assert factory.browser is browser
        assert factory.llm is llm
        assert factory.max_steps == 10

    def test_set_memory_context(self):
        """Test setting and getting memory context."""
        browser = MagicMock()
        llm = MagicMock()
        factory = BrowserAgentFactory(
            browser_session=browser,
            llm_provider=llm,
        )

        factory.set_memory_context("test context")
        assert factory.get_memory_context() == "test context"

    def test_set_conversation(self):
        """Test setting conversation."""
        browser = MagicMock()
        llm = MagicMock()
        factory = BrowserAgentFactory(
            browser_session=browser,
            llm_provider=llm,
        )

        conv = [{"role": "user", "content": "test"}]
        factory.set_conversation(conv)
        assert factory._conversation == conv


class TestStreamingHandler:
    """Test StreamingHandler functionality."""

    def test_initialization(self):
        """Test StreamingHandler initialization."""
        llm = MagicMock()
        handler = StreamingHandler(llm_provider=llm)

        assert handler.llm is llm
        assert handler.on_streaming_text is None

    def test_stream_text_with_callback(self):
        """Test stream_text with a callback."""
        llm = MagicMock()
        streamed_tokens = []

        def callback(token, phase):
            streamed_tokens.append((token, phase))

        handler = StreamingHandler(llm_provider=llm, on_streaming_text=callback)

        handler.stream_text("test", "responding")
        assert streamed_tokens == [("test", "responding")]

    def test_stream_text_without_callback(self):
        """Test stream_text without callback doesn't raise."""
        llm = MagicMock()
        handler = StreamingHandler(llm_provider=llm)

        # Should not raise any errors
        handler.stream_text("test", "responding")

    @pytest.mark.asyncio
    async def test_stream_text_async(self):
        """Test stream_text_async method."""
        llm = MagicMock()
        streamed_tokens = []

        def callback(token, phase):
            streamed_tokens.append((token, phase))

        handler = StreamingHandler(llm_provider=llm, on_streaming_text=callback)

        await handler.stream_text_async("test text", "responding")
        assert len(streamed_tokens) > 0


class TestSkillManager:
    """Test SkillManager functionality."""

    def test_initialization(self):
        """Test SkillManager initialization."""
        browser = MagicMock()
        llm = MagicMock()
        manager = SkillManager(
            llm_provider=llm,
            browser_session=browser,
        )

        assert manager.llm is llm
        assert manager.browser is browser

    @staticmethod
    def test_extract_skill_arguments():
        """Test extract_skill_arguments static method."""
        skill = {"name": "test_skill"}
        task = "test_skill some arguments"

        args = SkillManager.extract_skill_arguments(skill, task)
        assert args["ARGUMENTS"] == "some arguments"
        assert args["0"] == "some arguments"

    @staticmethod
    def test_extract_skill_arguments_no_match():
        """Test extract_skill_arguments when skill name not in task."""
        skill = {"name": "other_skill"}
        task = "different task"

        args = SkillManager.extract_skill_arguments(skill, task)
        assert args["ARGUMENTS"] == "different task"


class TestPersistenceManager:
    """Test PersistenceManager functionality."""

    def test_initialization_with_state_file(self, tmp_path):
        """Test PersistenceManager initialization with state file."""
        state_file = tmp_path / "test_state.json"
        manager = PersistenceManager(state_file=state_file)

        assert manager._state_file == state_file

    def test_get_iters_since_skill(self):
        """Test getting iterations since skill."""
        manager = PersistenceManager(state_file=None)

        assert manager.get_iters_since_skill() == 0

    def test_increment_iters_since_skill(self):
        """Test incrementing iterations since skill."""
        manager = PersistenceManager(state_file=None)

        manager.increment_iters_since_skill(5)
        assert manager.get_iters_since_skill() == 5

        manager.increment_iters_since_skill(3)
        assert manager.get_iters_since_skill() == 8

    def test_reset_iters_since_skill(self):
        """Test resetting iterations since skill."""
        manager = PersistenceManager(state_file=None)

        manager.increment_iters_since_skill(5)
        manager.reset_iters_since_skill()
        assert manager.get_iters_since_skill() == 0


class TestAgentHelpers:
    """Test AgentHelpers functionality."""

    @staticmethod
    def test_looks_like_error():
        """Test looks_like_error helper."""
        assert AgentHelpers.looks_like_error("Error: something went wrong") is True
        assert AgentHelpers.looks_like_error("Failed to complete") is True
        assert AgentHelpers.looks_like_error("Success! All good") is False

    @staticmethod
    def test_build_step_events():
        """Test build_step_events helper."""
        from sediman.agent.state import AgentState, PlanStep, Strategy

        state = AgentState(task="test")
        step = PlanStep(id=0, description="test step", strategy=Strategy.DIRECT)
        step.result = "test result"
        state.plan_steps.append(step)

        events = AgentHelpers.build_step_events(state)
        assert len(events) == 1
        assert events[0].action.startswith("direct:")
        assert "test step" in events[0].action


class TestLoopModulesIntegration:
    """Integration tests for loop modules working together."""

    def test_conversation_manager_with_replaced_reference(self):
        """Test ConversationManager handles list replacement correctly."""
        # Simulate how loop.py uses the manager
        conversation = []

        manager = ConversationManager(
            conversation_list=conversation,
            conversation_getter=lambda: conversation,
        )

        # Add initial message
        manager.set_conversation([{"role": "user", "content": "msg1"}])
        assert len(manager.get_conversation()) == 1

        # Simulate test replacing the reference (like in test_build_task_with_context_has_history)
        conversation = [
            {"role": "user", "content": "replaced msg"},
            {"role": "assistant", "content": "replaced answer"},
        ]

        # Manager should see the replaced conversation through getter
        result = manager.build_task_with_context("follow up")
        assert "replaced msg" in result

    def test_background_task_manager_integration(self):
        """Test BackgroundTaskManager with all dependencies."""
        recorder = MagicMock()
        recorder.record = MagicMock(return_value=None)

        skill_learner = MagicMock()
        skill_learner.review_and_learn = AsyncMock(return_value=None)

        skill_auditor = MagicMock()
        skill_auditor.audit = AsyncMock(return_value={"actions": []})

        subagent_registry = MagicMock()

        memory = MagicMock()
        memory.on_turn_start = AsyncMock()
        memory.on_session_end = AsyncMock()
        memory.should_review = MagicMock(return_value=False)

        from sediman.agent.loop_modules.background_tasks import BackgroundTaskManager

        manager = BackgroundTaskManager(
            recorder=recorder,
            skill_learner=skill_learner,
            skill_auditor=skill_auditor,
            subagent_registry=subagent_registry,
            memory=memory,
        )

        assert manager._recorder is recorder
        assert manager._skill_learner is skill_learner
