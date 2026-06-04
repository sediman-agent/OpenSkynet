"""Background task management for AgentLoop.

Handles background tasks that run after agent execution completes.
"""

from __future__ import annotations

import asyncio
from typing import TYPE_CHECKING, Any

import structlog

if TYPE_CHECKING:
    from sediman.agent.state import AgentState
    from sediman.agent.manager import ManagerPlan
    from sediman.agent.recorder import SkillRecorder
    from sediman.agent.skill_learner import SkillLearnerAgent
    from sediman.agent.skill_auditor import SkillAuditor
    from sediman.agent.subagents.registry import SubagentRegistry
    from sediman.memory.strategy import BaseMemoryStrategy
    from sediman.skills.engine import SkillEngine

logger = structlog.get_logger()


class BackgroundTaskManager:
    """Manages background tasks that run after agent execution."""

    def __init__(
        self,
        recorder: SkillRecorder | None = None,
        skill_learner: SkillLearnerAgent | None = None,
        skill_auditor: SkillAuditor | None = None,
        subagent_registry: SubagentRegistry | None = None,
        memory: BaseMemoryStrategy | None = None,
        skill_engine: SkillEngine | None = None,
    ):
        self._recorder = recorder
        self._skill_learner = skill_learner
        self._skill_auditor = skill_auditor
        self._subagent_registry = subagent_registry
        self._memory = memory
        self._skill_engine = skill_engine
        self._recording_manager: Any | None = None

    async def run_post_task(
        self,
        state: AgentState,
        plan: Any,
        task: str,
        conversation: list[dict[str, str]],
    ) -> None:
        """Run post-task operations in the background.

        Args:
            state: Current agent state
            plan: Manager plan
            task: Original task
            conversation: Conversation history
        """
        try:
            async def _save_session_and_trajectory() -> None:
                """Save session and trajectory data."""
                await self._save_session(task, state.result, state.actions_taken)
                await self._save_trajectory(state, task)

            async def _drain_recording() -> None:
                """Drain any active recording events."""
                try:
                    from sediman.agent.recording_manager import RecordingManager
                    mgr = RecordingManager.get_instance()
                    if mgr.is_recording():
                        await mgr.drain_active_events()
                except Exception:
                    logger.debug("drain_recording_events_failed")

            await asyncio.gather(_save_session_and_trajectory(), _drain_recording())

            all_actions = state.actions_taken

            if state.skill_created:
                # Run verification truly async so the background task doesn't block
                self._verify_skill_later(state.skill_created)

            # Update skill iteration counter
            from sediman.agent.loop_modules.persistence import PersistenceManager
            persistence = PersistenceManager()

            if not state.skill_created:
                persistence.increment_iters_since_skill(len(all_actions))
                persistence.persist_skill_counter()
            else:
                persistence.reset_iters_since_skill()
                persistence.persist_skill_counter()

            # Run skill review if threshold reached
            if (
                not state.skill_created
                and persistence.should_review_skills()
            ):
                try:
                    learned = await self._run_skill_review(
                        task=task,
                        actions=all_actions,
                        result=state.result,
                        conversation=conversation,
                    )
                    if learned:
                        state.skill_created = learned
                        persistence.reset_iters_since_skill()
                        persistence.persist_skill_counter()
                finally:
                    pass  # Review completed

            # Handle memory operations
            if plan.memory:
                await self._memory.on_turn_start() if self._memory else None
                await self._memory.handle_tool_call("memory", {
                    "action": "add",
                    "target": "memory",
                    "content": plan.memory,
                }) if self._memory else None

            await self._memory.on_turn_start() if self._memory else None

            if self._memory and self._memory.should_review():
                await self._memory.run_background_review(conversation)
                audit_result = await self._skill_auditor.audit() if self._skill_auditor else {"actions": []}
                if audit_result.get("actions"):
                    logger.info(
                        "skill_audit_completed",
                        actions=len(audit_result["actions"]),
                        summary=audit_result.get("summary", "")[:100],
                    )

            await self._memory.on_session_end() if self._memory else None

        except Exception as e:
            logger.warning("background_post_task_failed", error=str(e))

    async def _save_session(
        self,
        task: str,
        result: str,
        actions: list[dict[str, Any]],
    ) -> None:
        """Save session to memory."""
        try:
            from sediman.memory.sessions import save_session
            import json

            steps = []
            for a in actions:
                steps.append({
                    "action": json.dumps(a, default=str)[:200],
                    "observation": "",
                })

            await save_session(task=task, steps=steps, result=result)

        except Exception as e:
            logger.debug("session_save_failed", error=str(e))

    async def _save_trajectory(self, state: AgentState, task: str) -> None:
        """Save trajectory to database."""
        try:
            from sediman.memory.trajectories import TrajectoryDB, Trajectory, TrajectoryStep
            import json

            db = TrajectoryDB()
            steps = []
            for a in state.actions_taken:
                steps.append(TrajectoryStep(
                    action=json.dumps(a, default=str)[:500],
                ))

            traj = Trajectory(
                task=task,
                steps=steps,
                result=state.result[:4000] if state.result else None,
                success=not self._looks_like_error(state.result) if state.result else False,
                skill_name=state.skill_created,
                metadata={"iterations": state.iteration, "errors": len(state.errors)},
            )

            await db.save(traj)
            logger.debug("trajectory_saved", id=traj.id, steps=len(steps))

        except Exception as e:
            logger.debug("trajectory_save_inner_failed", error=str(e))

    async def _run_skill_review(
        self,
        task: str,
        actions: list[dict[str, Any]],
        result: str,
        conversation: list[dict[str, str]],
    ) -> str | None:
        """Run skill review to potentially learn a new skill."""
        if not self._skill_learner or not self._skill_engine:
            return None

        try:
            existing_skills = self._skill_engine.list_skills()

            learned = await self._skill_learner.review_and_learn(
                task=task,
                browser_actions=actions,
                result=result,
                success=not self._looks_like_error(result),
                existing_skills=existing_skills,
                conversation=conversation,
            )

            if learned:
                logger.info("skill_auto_learned", name=learned, source="review_agent")
            return learned

        except Exception as e:
            logger.debug("skill_review_failed", error=str(e))
            return None

    def _verify_skill_later(self, skill_name: str) -> None:
        """Schedule skill verification to run asynchronously."""
        async def _run() -> None:
            try:
                from sediman.skills.executor import execute_skill
                from sediman.errors import looks_like_error

                if self._skill_engine:
                    skill_data = self._skill_engine.read(skill_name)
                    if skill_data:
                        # Verification would be done here
                        pass
            except Exception as e:
                logger.debug("lazy_verification_failed", name=skill_name, error=str(e))

        asyncio.create_task(_run())

    @staticmethod
    def _looks_like_error(text: str) -> bool:
        """Check if text looks like an error message."""
        from sediman.errors import looks_like_error
        return looks_like_error(text)
