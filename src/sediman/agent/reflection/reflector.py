"""Reflection engine for analyzing step results."""

from __future__ import annotations

import asyncio
import random
import re as _re
from typing import Any

import structlog

from sediman.agent.guardrails import AuditLog
from sediman.agent.manager import ManagerAgent
from sediman.agent.state import AgentState, Observation, PlanStep, Reflection
from sediman.llm.provider import LLMProvider

logger = structlog.get_logger()


class Reflector:
    """Analyzes step results and determines next actions.

    This class implements the reflection logic that determines
    whether a step was successful, should be retried, or requires
    replanning.
    """

    def __init__(
        self,
        manager: ManagerAgent,
        llm: LLMProvider,
        skip_reflection_on_success: bool = True,
    ):
        self.manager = manager
        self.llm = llm
        self.skip_reflection_on_success = skip_reflection_on_success

    async def reflect(
        self,
        state: AgentState,
        step: PlanStep,
        observation: Observation,
    ) -> Reflection | None:
        """Analyze a step result and return reflection.

        Returns None for fast-path successful steps that don't
        need reflection, avoiding unnecessary LLM calls.
        """
        content = observation.content or ""

        # Stream reflection status to user
        if hasattr(state, '_streaming_token') and state._streaming_token:
            try:
                state._streaming_token("Reflecting on result...", "reflecting")
            except Exception:
                pass

        def _has_data_values(text: str) -> bool:
            if _re.search(r'\d+\.?\d*', text):
                return True
            if _re.search(r'https?://\S+', text):
                return True
            if _re.search(r'[\w.-]+@[\w.-]+', text):
                return True
            return False

        has_done_action = any(
            a.get("action") == "done" or a.get("type") == "done"
            for a in state.actions_taken[-5:]
        )
        has_error_indicators = self._looks_like_error(content)

        # Single-step fast path with data
        if len(state.plan_steps) == 1 and observation.success and not state.errors:
            if _has_data_values(content) and len(content) > 80:
                AuditLog.get().record(
                    "reflection",
                    "single_step_fast_path",
                    "single-step success with data",
                    step=step.id,
                )
                return Reflection(
                    task_complete=True,
                    confidence=0.75,
                    reasoning="Single-step plan completed with grounded data.",
                    should_retry=False,
                    should_replan=False,
                )
            elif has_done_action and not has_error_indicators and len(content) > 40:
                AuditLog.get().record(
                    "reflection",
                    "single_step_done",
                    "single-step with done action",
                    step=step.id,
                )
                return Reflection(
                    task_complete=True,
                    confidence=0.70,
                    reasoning="Single-step plan completed, browser reported done, no errors.",
                    should_retry=False,
                    should_replan=False,
                )
            elif not state.errors and step.retries == 0:
                AuditLog.get().record(
                    "reflection",
                    "single_step_verify",
                    "single-step but no grounded data, verifying",
                    step=step.id,
                )

        # Fast-path for successful steps with done action
        if self.skip_reflection_on_success:
            if (
                observation.success
                and has_done_action
                and len(content) > 80
                and not state.errors
                and not has_error_indicators
                and step.retries == 0
                and _has_data_values(content)
            ):
                AuditLog.get().record(
                    "reflection",
                    "fast_path_success",
                    "done_action_with_data",
                    step=step.id,
                )
                return Reflection(
                    task_complete=True,
                    confidence=0.70,
                    reasoning="Fast-path: browser reported done with grounded data, no errors.",
                    should_retry=False,
                    should_replan=False,
                )

        # Fast-path for errors
        if not observation.success and self._looks_like_error(content):
            AuditLog.get().record(
                "reflection",
                "fast_path_error",
                "error_indicators_detected",
                step=step.id,
            )
            should_retry = step.retries < step.max_retries
            return Reflection(
                task_complete=False,
                confidence=0.15,
                reasoning="Error fast-path: result contains error indicators.",
                should_retry=should_retry,
                should_replan=not should_retry and state.iteration < state.max_iterations,
                retry_context=f"Error detected: {content[:200]}",
            )

        # Fast-path for failure without specific error
        if not observation.success:
            should_retry = step.retries < step.max_retries
            return Reflection(
                task_complete=False,
                confidence=0.3,
                reasoning="Observation reports failure without specific error pattern.",
                should_retry=should_retry,
                should_replan=not should_retry and state.iteration < state.max_iterations,
                retry_context=f"Observation marked as failed: {content[:200]}",
            )

        # Fast-path for too short output
        if len(content) < 80:
            return Reflection(
                task_complete=False,
                confidence=0.25,
                reasoning=f"Result too short ({len(content)} chars) to contain meaningful data.",
                should_retry=step.retries < step.max_retries,
                retry_context="Previous attempt produced insufficient output.",
            )

        # Data-match heuristic
        task_lower = state.task.lower()
        task_words = [
            w for w in task_lower.split()
            if len(w) > 3 and w not in (
                "check", "find", "search", "look", "what", "show", "tell", "please",
                "could", "would", "about", "from", "with", "that", "this",
            )
        ]
        has_err = self._looks_like_error(content)
        if task_words and observation.success and not has_err and len(content) > 150 and _has_data_values(content):
            content_lower = content.lower()
            matched = sum(1 for w in task_words if w in content_lower)
            threshold = max(3, len(task_words) * 3 // 4)
            if matched >= threshold:
                AuditLog.get().record(
                    "reflection",
                    "data_match",
                    f"{matched}/{len(task_words)} keywords",
                    step=step.id,
                )
                return Reflection(
                    task_complete=True,
                    confidence=0.7,
                    reasoning=f"Data-match: {matched}/{len(task_words)} task keywords found with grounded values.",
                    should_retry=False,
                    should_replan=False,
                )

        # Fall through to LLM reflection
        if len(content) > 80 and observation.success and step.retries == 0 and not state.errors and not has_err:
            AuditLog.get().record(
                "reflection",
                "llm_reflect",
                "falling_through_to_llm",
                step=step.id,
                content_len=len(content),
            )

        return await self._llm_reflect(state, step, observation)

    async def _llm_reflect(
        self,
        state: AgentState,
        step: PlanStep,
        observation: Observation,
    ) -> Reflection:
        """Perform LLM-based reflection."""
        try:
            # Stream that we're doing deep analysis
            if hasattr(state, '_streaming_token') and state._streaming_token:
                try:
                    state._streaming_token("Analyzing result with LLM...", "reflecting")
                except Exception:
                    pass

            result = await self.manager.reflect(
                task=state.task,
                result=observation.content,
                observations=[o.content[:300] for o in state.observations[-5:]],
            )

            issues = result.get("issues", [])
            suggested_fix = result.get("suggested_fix")

            should_retry = not observation.success and step.retries < step.max_retries
            should_replan = (
                not observation.success
                and step.retries >= step.max_retries
                and suggested_fix
                and state.iteration < state.max_iterations
            )

            tc = result.get("task_complete", False)
            if not isinstance(tc, bool):
                tc = str(tc).lower() in ("true", "yes", "1")
            conf = float(result.get("confidence", 0.3))
            conf = max(0.0, min(1.0, conf))
            reasoning_text = result.get("reasoning", "")
            retry_ctx = reasoning_text if not tc else None

            return Reflection(
                task_complete=tc,
                confidence=conf,
                reasoning=reasoning_text,
                issues=issues,
                next_action=suggested_fix,
                should_retry=should_retry,
                should_replan=should_replan,
                retry_context=retry_ctx,
            )

        except Exception as e:
            logger.warning("reflection_failed", error=str(e))
            AuditLog.get().record("reflection", "failed", str(e), step_id=step.id)
            return Reflection(
                task_complete=False,
                confidence=0.2,
                reasoning=f"Reflection LLM call failed: {e}. Defaulting to incomplete for safety.",
                should_retry=not observation.success and step.retries < step.max_retries,
                retry_context=f"Previous attempt produced: {observation.content[:200] if observation.content else 'no output'}",
            )

    def _looks_like_error(self, text: str) -> bool:
        """Check if text looks like an error message."""
        from sediman.errors import looks_like_error
        return looks_like_error(text)
