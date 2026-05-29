"""Tests for Multi-Path Retry — _try_lightweight_recovery and _handle_reflection_result."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from sediman.agent.loop import AgentLoop
from sediman.agent.state import AgentState, Observation, PlanStep, Reflection, Strategy


class TestTryLightweightRecovery:
    def _make_loop(self):
        loop = AgentLoop(llm_provider=MagicMock(), browser_session=MagicMock(), max_steps=5)
        return loop

    @pytest.mark.asyncio
    async def test_skips_use_skill_strategy(self, tmp_sediman_dir):
        loop = self._make_loop()
        state = AgentState(task="extract prices")
        step = PlanStep(id=0, description="use skill", strategy=Strategy.USE_SKILL)
        obs = Observation(source="s", content="failed", success=False)
        result = await loop._try_lightweight_recovery(state, step, obs)
        assert result is False

    @pytest.mark.asyncio
    async def test_skips_when_retries_exhausted(self, tmp_sediman_dir):
        loop = self._make_loop()
        state = AgentState(task="extract prices")
        step = PlanStep(id=0, description="do it", strategy=Strategy.DIRECT, max_retries=2, retries=3)
        obs = Observation(source="s", content="failed", success=False)
        result = await loop._try_lightweight_recovery(state, step, obs)
        assert result is False

    @pytest.mark.asyncio
    async def test_http_fallback_for_extraction_tasks(self, tmp_sediman_dir):
        loop = self._make_loop()
        state = AgentState(task="extract price from https://example.com")
        step = PlanStep(id=0, description="extract price https://example.com", strategy=Strategy.DIRECT)
        obs = Observation(source="s", content="failed", success=False)

        fake_markdown = "Product Price\n" + "$99.99 " * 30

        with patch("sediman.web.extract.http_extract", new_callable=AsyncMock, return_value=(fake_markdown, {})):
            result = await loop._try_lightweight_recovery(state, step, obs)

        assert result is True
        assert step.status == "completed"
        assert step.result is not None
        assert any(a.get("action") == "http_fallback" for a in state.actions_taken)

    @pytest.mark.asyncio
    async def test_http_fallback_skips_short_content(self, tmp_sediman_dir):
        loop = self._make_loop()
        state = AgentState(task="extract price from https://example.com")
        step = PlanStep(id=0, description="extract https://example.com", strategy=Strategy.DIRECT, max_retries=2, retries=0)
        obs = Observation(source="s", content="failed", success=False)

        with patch("sediman.web.extract.http_extract", new_callable=AsyncMock, return_value=("short", {})):
            result = await loop._try_lightweight_recovery(state, step, obs)

        assert result is False

    @pytest.mark.asyncio
    async def test_non_extraction_task_does_simple_retry(self, tmp_sediman_dir):
        loop = self._make_loop()
        state = AgentState(task="go to google and click on news")
        step = PlanStep(id=0, description="go to google", strategy=Strategy.DIRECT, max_retries=2, retries=0)
        obs = Observation(source="s", content="failed", success=False)

        result = await loop._try_lightweight_recovery(state, step, obs)

        assert result is False
        assert step.retries == 1
        assert step.status == "pending"

    @pytest.mark.asyncio
    async def test_http_fallback_handles_exception(self, tmp_sediman_dir):
        loop = self._make_loop()
        state = AgentState(task="extract price https://example.com")
        step = PlanStep(id=0, description="extract https://example.com", strategy=Strategy.DIRECT, max_retries=2, retries=0)
        obs = Observation(source="s", content="failed", success=False)

        with patch("sediman.web.extract.http_extract", new_callable=AsyncMock, side_effect=RuntimeError("network error")):
            result = await loop._try_lightweight_recovery(state, step, obs)

        assert result is False


class TestHandleReflectionResult:
    def _make_loop(self):
        loop = AgentLoop(llm_provider=MagicMock(), browser_session=MagicMock(), max_steps=5)
        return loop

    @pytest.mark.asyncio
    async def test_completed_when_high_confidence(self, tmp_sediman_dir):
        loop = self._make_loop()
        state = AgentState(task="do stuff")
        step = PlanStep(id=0, description="do it", strategy=Strategy.DIRECT)
        obs = Observation(source="s", content="done", success=True)
        reflection = Reflection(task_complete=True, confidence=0.9, reasoning="all good")

        await loop._handle_reflection_result(state, step, reflection, obs)

        assert step.status == "completed"
        assert state.current_step_index == 1

    @pytest.mark.asyncio
    async def test_retry_when_should_retry(self, tmp_sediman_dir):
        loop = self._make_loop()
        state = AgentState(task="do stuff")
        step = PlanStep(id=0, description="do it", strategy=Strategy.DIRECT, max_retries=2)
        obs = Observation(source="s", content="failed", success=False)
        reflection = Reflection(task_complete=False, confidence=0.3, reasoning="try again", should_retry=True)

        await loop._handle_reflection_result(state, step, reflection, obs)

        assert step.retries == 1
        assert step.status == "pending"

    @pytest.mark.asyncio
    async def test_fallback_when_available(self, tmp_sediman_dir):
        loop = self._make_loop()
        state = AgentState(task="do stuff")
        step = PlanStep(id=0, description="do it", strategy=Strategy.USE_SKILL, max_retries=2, retries=2)
        obs = Observation(source="s", content="failed", success=False)
        reflection = Reflection(task_complete=False, confidence=0.2, reasoning="bad", should_retry=False)

        with patch.object(loop, "_try_lightweight_recovery", new_callable=AsyncMock, return_value=False):
            await loop._handle_reflection_result(state, step, reflection, obs)

        assert step.fallback_attempted is True
        assert step.strategy == Strategy.DIRECT

    @pytest.mark.asyncio
    async def test_lightweight_recovery_attempted_before_fallback(self, tmp_sediman_dir):
        loop = self._make_loop()
        state = AgentState(task="do stuff")
        step = PlanStep(id=0, description="do it", strategy=Strategy.DIRECT, max_retries=2, retries=2)
        obs = Observation(source="s", content="failed", success=False)
        reflection = Reflection(task_complete=False, confidence=0.2, reasoning="bad", should_retry=False)

        recovery_called = []

        async def mock_recovery(s, st, o):
            recovery_called.append(True)
            st.status = "completed"
            st.result = "recovered"
            return True

        with patch.object(loop, "_try_lightweight_recovery", side_effect=mock_recovery):
            await loop._handle_reflection_result(state, step, reflection, obs)

        assert len(recovery_called) == 1
        assert step.status == "completed"

    @pytest.mark.asyncio
    async def test_low_confidence_marks_failed(self, tmp_sediman_dir):
        loop = self._make_loop()
        state = AgentState(task="do stuff")
        step = PlanStep(id=0, description="do it", strategy=Strategy.DIRECT, max_retries=2, retries=2)
        obs = Observation(source="s", content="failed", success=False)
        reflection = Reflection(task_complete=False, confidence=0.1, reasoning="failed", should_retry=False)

        with patch.object(loop, "_try_lightweight_recovery", new_callable=AsyncMock, return_value=False), \
             patch.object(loop, "_replan", new_callable=AsyncMock):
            await loop._handle_reflection_result(state, step, reflection, obs)

        assert step.status == "failed"
        assert len(state.errors) == 1

    @pytest.mark.asyncio
    async def test_medium_confidence_completes(self, tmp_sediman_dir):
        loop = self._make_loop()
        state = AgentState(task="do stuff")
        step = PlanStep(id=0, description="do it", strategy=Strategy.DIRECT, max_retries=2, retries=2)
        obs = Observation(source="s", content="partial result", success=True)
        reflection = Reflection(task_complete=False, confidence=0.4, reasoning="uncertain", should_retry=False)

        with patch.object(loop, "_try_lightweight_recovery", new_callable=AsyncMock, return_value=False), \
             patch.object(loop, "_replan", new_callable=AsyncMock):
            await loop._handle_reflection_result(state, step, reflection, obs)

        assert step.status == "completed"
