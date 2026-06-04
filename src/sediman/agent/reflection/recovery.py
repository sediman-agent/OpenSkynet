"""Recovery strategies for handling failed steps."""

from __future__ import annotations

import asyncio
import random
import re
from typing import Any

import structlog

from sediman.agent.guardrails import AuditLog, plan_hash
from sediman.agent.manager import ManagerAgent, ManagerPlan
from sediman.agent.state import AgentState, Observation, PlanStep, Reflection, Strategy

logger = structlog.get_logger()


class RecoveryStrategy:
    """Handles recovery from failed steps.

    This class implements various recovery strategies including
    lightweight recovery (HTTP fallback), strategy fallback,
    and replanning.
    """

    def __init__(
        self,
        manager: ManagerAgent,
    ):
        self.manager = manager

    async def handle_reflection_result(
        self,
        state: AgentState,
        step: PlanStep,
        reflection: Reflection,
        observation: Observation,
    ) -> None:
        """Handle the result of a reflection and update state accordingly."""
        if reflection.task_complete and reflection.confidence >= 0.70:
            AuditLog.get().record(
                "reflection_result",
                "completed",
                f"conf={reflection.confidence:.2f}",
                step=step.id,
            )
            step.status = "completed"
            step.result = step.result or observation.content[:2000]
            state.advance_step()

        elif reflection.should_retry and step.retries < step.max_retries:
            step.retries += 1
            step.status = "pending"
            if reflection.retry_context:
                step.add_failure(reflection.retry_context[:200])
            enhanced_desc = step.description
            if step.failure_history:
                last_err = step.failure_history[-1]
                enhanced_desc = f"{step.description}\n[Previous attempt failed: {last_err}]"
            step.description = enhanced_desc
            backoff = min(2 ** step.retries + random.uniform(0, 1), 10)
            AuditLog.get().record(
                "reflection_result",
                "retry",
                f"attempt={step.retries}, backoff={backoff:.1f}s",
                step=step.id,
            )

            # Emit retry progress with countdown
            try:
                # Try to get the streaming callback from state if available
                if hasattr(state, '_streaming_callback') and state._streaming_callback:
                    state._streaming_token(f"Retrying step (attempt {step.retries + 1}/{step.max_retries})", "progress")

                    # Show countdown during backoff
                    countdown_interval = 0.1
                    elapsed = 0
                    while elapsed < backoff:
                        remaining = backoff - elapsed
                        state._streaming_token(
                            f"{{\"retry\": {{\"attempt\": {step.retries + 1}, \"max\": {step.max_retries}, \"countdown\": {remaining:.1f}}}}}",
                            "progress"
                        )
                        await asyncio.sleep(countdown_interval)
                        elapsed += countdown_interval
                else:
                    # Fallback to normal sleep if no streaming callback
                    await asyncio.sleep(backoff)
            except Exception:
                # If streaming fails, fall back to normal sleep
                await asyncio.sleep(backoff)

            logger.info(
                "retrying_step",
                attempt=step.retries + 1,
                max_attempts=step.max_retries,
            )

        elif await self.try_lightweight_recovery(state, step, observation):
            logger.info("recovered_via_lightweight_retry", step=step.id)

        elif self.try_fallback(step, state):
            logger.info(
                "strategy_fallback",
                from_strategy=step.original_strategy.value if step.original_strategy else "unknown",
                to_strategy=step.strategy.value,
                step=step.id,
            )

        elif reflection.should_replan and state.replan_count < state.max_replans:
            state.replan_count += 1
            AuditLog.get().record(
                "reflection_result",
                "replan",
                f"replan#{state.replan_count}",
                step=step.id,
            )
            await self.replan(state, reflection)

        else:
            if reflection.confidence >= 0.5 and reflection.task_complete:
                AuditLog.get().record(
                    "reflection_result",
                    "low_conf_accept",
                    f"conf={reflection.confidence:.2f}",
                    step=step.id,
                )
                step.status = "completed"
                step.result = step.result or observation.content[:2000]
            else:
                AuditLog.get().record(
                    "reflection_result",
                    "failed",
                    f"conf={reflection.confidence:.2f}",
                    step=step.id,
                )
                step.status = "failed"
                state.errors.append(f"Step failed: {step.description[:80]}")
            state.advance_step()

    async def try_lightweight_recovery(
        self,
        state: AgentState,
        step: PlanStep,
        observation: Observation,
    ) -> bool:
        """Try lightweight recovery strategies (e.g., HTTP fallback)."""
        if step.strategy == Strategy.USE_SKILL:
            return False
        if step.retries >= step.max_retries:
            return False

        task_lower = state.task.lower()
        extraction_kw = ("extract", "get the", "price", "scrape", "read the", "pull")
        is_extraction = any(kw in task_lower for kw in extraction_kw)

        if is_extraction and not observation.success:
            try:
                from sediman.web.extract import http_extract
                url_match = re.search(r"https?://[^\s<>\"]+", step.description or state.task)
                if url_match:
                    url = url_match.group(0).rstrip(".,;:)")
                    markdown, stats = await http_extract(url)
                    if markdown and len(markdown.strip()) > 100 and not self._looks_like_error(markdown):
                        step.result = markdown[:2000]
                        step.status = "completed"
                        step.retries = 0
                        state.actions_taken.append({"action": "http_fallback", "url": url})
                        logger.info("recovered_via_http_fallback", url=url)
                        return True
            except Exception as e:
                logger.debug("http_fallback_failed", error=str(e))

        return False

    def try_fallback(self, step: PlanStep, state: AgentState | None = None) -> bool:
        """Try falling back to a different execution strategy."""
        if step.fallback_attempted:
            return False

        fallback_map = {
            Strategy.USE_SKILL: Strategy.DIRECT,
            Strategy.DELEGATE: Strategy.DIRECT,
            Strategy.DECOMPOSE: Strategy.DELEGATE,
            Strategy.DIRECT: None,
        }

        new_strategy = fallback_map.get(step.strategy)
        if new_strategy is None:
            if state and state.errors:
                AuditLog.get().record(
                    "fallback",
                    "direct_exhausted",
                    "no_fallback_from_direct",
                    step=step.id,
                )
            return False

        step.original_strategy = step.original_strategy or step.strategy
        step.strategy = new_strategy
        step.fallback_attempted = True
        step.status = "pending"
        step.retries = 0
        if step.failure_history:
            step.description = (
                f"{step.description}\n[Fallback from {step.original_strategy.value}: "
                f"{'; '.join(step.failure_history[-1:])}]"
            )
        return True

    async def replan(
        self,
        state: AgentState,
        reflection: Reflection,
    ) -> None:
        """Generate a new plan based on reflection."""
        failed_step = state.current_step
        if failed_step:
            failed_step.status = "failed"

        new_task = reflection.next_action or state.task
        failure_ctx = ""
        if reflection.reasoning:
            failure_ctx = f" (Previous approach failed: {reflection.reasoning[:200]})"
        if failed_step and failed_step.failure_history:
            failure_ctx += f" [Attempt history: {'; '.join(failed_step.failure_history[-2:])}]"
        if failure_ctx:
            new_task = f"{new_task}{failure_ctx}"

        plan = await self.manager.plan(new_task, [])

        sig = plan_hash(plan.browser_task or new_task, plan.strategy.value)
        if sig in state.plan_signatures:
            AuditLog.get().record(
                "replan",
                "duplicate_detected",
                sig,
                task=new_task[:80],
            )
            logger.warning("replan_duplicate", signature=sig, task=new_task[:80])
            for step in state.pending_steps:
                step.status = "failed"
                state.errors.append(f"Replan produced duplicate plan: {step.description[:80]}")
            return

        state.plan_signatures.append(sig)

        new_steps_state = AgentState(task=new_task)
        new_steps_state.plan_steps = self._build_plan_steps_from_plan(new_steps_state, plan)

        dead_steps = [s for s in state.plan_steps if s.status == "failed"]
        if len(dead_steps) > 10:
            state.plan_steps = [s for s in state.plan_steps if s.status != "failed"]

        remaining_index = len(state.plan_steps)
        for step in new_steps_state.plan_steps:
            step.id = remaining_index
            state.plan_steps.append(step)
            remaining_index += 1

        AuditLog.get().record(
            "replan",
            "new_plan",
            f"strategy={plan.strategy.value}",
            steps=len(new_steps_state.plan_steps),
        )

    def _build_plan_steps_from_plan(
        self,
        state: AgentState,
        plan: ManagerPlan,
    ) -> list[PlanStep]:
        """Build plan steps from a manager plan."""
        if plan.strategy == Strategy.DELEGATE and plan.subtasks:
            return [
                PlanStep(
                    id=i,
                    description=subtask,
                    strategy=Strategy.DELEGATE,
                    subagent_type=plan.use_subagent,
                )
                for i, subtask in enumerate(plan.subtasks)
            ]
        elif plan.strategy == Strategy.USE_SKILL:
            return [
                PlanStep(
                    id=0,
                    description=f"Execute skill '{plan.skill_to_use}': {plan.browser_task}",
                    strategy=Strategy.USE_SKILL,
                )
            ]
        else:
            return [
                PlanStep(
                    id=0,
                    description=plan.browser_task,
                    strategy=Strategy.DIRECT,
                )
            ]

    def _looks_like_error(self, text: str) -> bool:
        """Check if text looks like an error message."""
        from sediman.errors import looks_like_error
        return looks_like_error(text)
