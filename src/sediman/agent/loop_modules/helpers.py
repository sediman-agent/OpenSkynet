"""Helper utilities for AgentLoop.

Provides common helper functions used across the agent loop.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

import structlog

from sediman.agent.state import Strategy

if TYPE_CHECKING:
    from sediman.agent.state import AgentState, PlanStep
    from sediman.agent.types import StepEvent

logger = structlog.get_logger()


class AgentHelpers:
    """Common helper utilities for agent operations."""

    @staticmethod
    def looks_like_error(text: str) -> bool:
        """Check if text looks like an error message.

        Args:
            text: Text to check

        Returns:
            True if text appears to be an error message
        """
        from sediman.errors import looks_like_error
        return looks_like_error(text)

    @staticmethod
    def try_fallback(step: PlanStep, state: AgentState | None = None) -> bool:
        """Try to fallback to a different strategy for a step.

        Args:
            step: The plan step to fallback
            state: Optional agent state for audit logging

        Returns:
            True if fallback was successful, False otherwise
        """
        if step.fallback_attempted:
            return False

        from sediman.agent.guardrails import AuditLog

        fallback_map = {
            Strategy.USE_SKILL: Strategy.DIRECT,
            Strategy.DELEGATE: Strategy.DIRECT,
            Strategy.DECOMPOSE: Strategy.DELEGATE,
            Strategy.DIRECT: None,
        }

        new_strategy = fallback_map.get(step.strategy)
        if new_strategy is None:
            if state and state.errors:
                AuditLog.get().record("fallback", "direct_exhausted", "no_fallback_from_direct", step=step.id)
            return False

        step.original_strategy = step.original_strategy or step.strategy
        step.strategy = new_strategy
        step.fallback_attempted = True
        step.status = "pending"
        step.retries = 0

        if step.failure_history:
            step.description = f"{step.description}\n[Fallback from {step.original_strategy.value}: {'; '.join(step.failure_history[-1:])}]"

        return True

    @staticmethod
    def build_step_events(state: AgentState) -> list[StepEvent]:
        """Build step events from agent state.

        Args:
            state: The agent state

        Returns:
            List of step events
        """
        from sediman.agent.types import StepEvent

        events = []
        for i, step in enumerate(state.plan_steps):
            events.append(StepEvent(
                step=i,
                action=f"{step.strategy.value}: {step.description[:80]}",
                observation=step.result[:200] if step.result else "",
            ))

        return events

    @staticmethod
    def create_scheduled_job(plan: Any, llm: Any | None = None) -> str | None:
        """Create a scheduled job from a plan.

        Args:
            plan: Manager plan with schedule information
            llm: Optional LLM provider for model info

        Returns:
            Job ID if created, None otherwise
        """
        if not plan.schedule:
            return None

        try:
            from sediman.scheduler.cron import CronManager, validate_cron_expr

            if not validate_cron_expr(plan.schedule.cron):
                logger.warning("invalid_cron_expr", expr=plan.schedule.cron)
                return None

            cron = CronManager()
            job_id = cron.add_job(
                cron_expr=plan.schedule.cron,
                task=plan.schedule.task,
                model=getattr(llm, "model", None) if llm else None,
                base_url=getattr(llm, "base_url", None) if llm else None,
            )

            logger.info(
                "task_scheduled",
                job_id=job_id,
                cron=plan.schedule.cron,
                task=plan.schedule.task
            )
            return job_id

        except Exception as e:
            logger.warning("schedule_creation_failed", error=str(e))
            return None

    @staticmethod
    def emit_step(
        on_step_callback: Any,
        state: AgentState,
        message: str,
        detail: str = "",
        url: str | None = None,
        tool_name: str | None = None,
    ) -> None:
        """Emit a step event callback.

        Args:
            on_step_callback: The callback function
            state: Current agent state
            message: Main message
            detail: Optional detail message
            url: Optional URL
            tool_name: Optional tool name
        """
        if not on_step_callback:
            return

        from sediman.agent.types import StepEvent

        on_step_callback(StepEvent(
            step=state.iteration,
            action=message,
            observation="",
            phase=state.phase.value,
            detail=detail,
            url=url,
            tool_name=tool_name,
        ))

    @staticmethod
    def build_observation(step: PlanStep, actions_taken: list[dict[str, Any]]) -> Any:
        """Build an observation from a step result.

        Args:
            step: The plan step
            actions_taken: List of actions taken

        Returns:
            Observation object
        """
        from sediman.agent.state import Observation
        from sediman.errors import looks_like_error

        content = step.result or ""

        if not content:
            return Observation(
                source=f"step_{step.id}",
                content="No result produced",
                success=False,
                metadata={"strategy": step.strategy.value, "retries": step.retries},
            )

        has_error = looks_like_error(content)
        is_very_short = len(content.strip()) < 20
        has_done_action = any(
            a.get("action") == "done" or a.get("type") == "done"
            for a in actions_taken[-5:]
        )

        success = not has_error and not is_very_short
        if success and not has_done_action and len(content) < 50:
            success = False

        return Observation(
            source=f"step_{step.id}",
            content=content,
            success=success,
            metadata={"strategy": step.strategy.value, "retries": step.retries},
        )
