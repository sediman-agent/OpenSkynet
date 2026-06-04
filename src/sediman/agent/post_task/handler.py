"""Post-task handler for operations after task execution."""

from __future__ import annotations

import asyncio
import json
from typing import Any

import structlog

from sediman.agent.manager import ManagerPlan
from sediman.agent.recorder import SkillRecorder
from sediman.agent.skill_auditor import SkillAuditor
from sediman.agent.skill_learner import SkillLearnerAgent
from sediman.agent.state import AgentState
from sediman.errors import looks_like_error
from sediman.llm.provider import LLMProvider
from sediman.memory.strategy import BaseMemoryStrategy

logger = structlog.get_logger()


class PostTaskHandler:
    """Handles all post-execution operations.

    This class coordinates:
    - Subagent creation from plans
    - Job scheduling
    - Skill recording and learning
    - Session/trajectory saving
    - Memory review
    """

    def __init__(
        self,
        llm_provider: LLMProvider,
        memory: BaseMemoryStrategy,
        recorder: SkillRecorder,
        skill_engine: Any | None = None,
        skill_learner: SkillLearnerAgent | None = None,
        skill_auditor: SkillAuditor | None = None,
        subagent_registry: Any | None = None,
    ):
        self.llm = llm_provider
        self.memory = memory
        self.recorder = recorder
        self.skill_engine = skill_engine
        self.skill_learner = skill_learner
        self.skill_auditor = skill_auditor
        self.subagent_registry = subagent_registry

        self._iters_since_skill = 0
        self._skill_review_threshold = 10
        self._pending_review = False

        self._load_persistent_state()

    async def handle(
        self,
        state: AgentState,
        plan: ManagerPlan,
        task: str,
    ) -> None:
        """Handle post-task operations synchronously."""
        # Create subagent if specified
        if getattr(plan, "create_subagent", None):
            self._create_subagent(plan, state)

        # Schedule job if specified
        if plan.schedule:
            self._schedule_job(plan, state)

        # Record skill if applicable
        skill_created = self.recorder.record(
            task=task,
            plan=plan,
            browser_result=state.result,
            browser_actions=state.actions_taken,
            engine=self.skill_engine,
        )
        if skill_created:
            state.skill_created = skill_created

        # Kick off background tasks
        asyncio.create_task(self.run_background(state, plan, task))

    async def run_background(
        self,
        state: AgentState,
        plan: ManagerPlan,
        task: str,
    ) -> None:
        """Run background post-task operations."""
        try:
            async def _save_session_and_trajectory() -> None:
                await self._save_session(task, state.result, state.actions_taken)
                await self._save_trajectory(state, task)

            async def _drain_recording() -> None:
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
                self._verify_skill_later(state.skill_created)

            if not state.skill_created:
                self._iters_since_skill += len(all_actions)
            else:
                self._iters_since_skill = 0

            self._save_persistent_state()

            if (
                not state.skill_created
                and not self._pending_review
                and self._iters_since_skill >= self._skill_review_threshold
            ):
                self._pending_review = True
                try:
                    learned = await self._run_skill_review(
                        task=task,
                        actions=all_actions,
                        result=state.result,
                    )
                    if learned:
                        state.skill_created = learned
                        self._iters_since_skill = 0
                        self._save_persistent_state()
                finally:
                    self._pending_review = False

            if plan.memory:
                await self.memory.handle_tool_call("memory", {
                    "action": "add",
                    "target": "memory",
                    "content": plan.memory,
                })

            await self.memory.on_turn_start()
            if self.memory.should_review():
                await self.memory.run_background_review([])
                if self.skill_auditor:
                    audit_result = await self.skill_auditor.audit()
                    if audit_result.get("actions"):
                        logger.info(
                            "skill_audit_completed",
                            actions=len(audit_result["actions"]),
                            summary=audit_result.get("summary", "")[:100],
                        )

            await self.memory.on_session_end()

        except Exception as e:
            logger.warning("background_post_task_failed", error=str(e))

    def _create_subagent(self, plan: ManagerPlan, state: AgentState) -> None:
        """Create subagent from plan if specified."""
        if not getattr(plan, "create_subagent", None):
            return

        try:
            from sediman.agent.subagents.template import AgentTemplate

            subagent_data = plan.create_subagent
            subagent_template = AgentTemplate(
                name=subagent_data.get("name", "auto-agent"),
                description=subagent_data.get("description", ""),
                mode="subagent",
                model=subagent_data.get("model"),
                permissions=subagent_data.get("permissions", {}),
                system_prompt=subagent_data.get("system_prompt", ""),
                max_iterations=int(subagent_data.get("max_iterations", 5)),
            )
            self.subagent_registry.save(subagent_template)
            state.result += f"\n\n[Created new subagent: {subagent_template.name}]"
        except Exception as e:
            logger.warning("auto_subagent_save_failed", error=str(e))

    def _schedule_job(self, plan: ManagerPlan, state: AgentState) -> None:
        """Schedule cron job if specified."""
        if not plan.schedule:
            return

        try:
            from sediman.scheduler.cron import CronManager, validate_cron_expr
            if not validate_cron_expr(plan.schedule.cron):
                logger.warning("invalid_cron_expr", expr=plan.schedule.cron)
                return

            cron = CronManager()
            job_id = cron.add_job(
                cron_expr=plan.schedule.cron,
                task=plan.schedule.task,
                model=getattr(self.llm, "model", None),
                base_url=getattr(self.llm, "base_url", None),
            )
            state.scheduled_job_id = job_id
            state.schedule_cron = plan.schedule.cron

            schedule_tag = f"[Scheduled: {plan.schedule.cron} → {plan.schedule.task}]"
            if schedule_tag not in state.result and f"Schedule configured: {plan.schedule.cron}" not in state.result:
                state.result += f"\n\n{schedule_tag}"

            logger.info("task_scheduled", job_id=job_id, cron=plan.schedule.cron, task=plan.schedule.task)
        except Exception as e:
            logger.warning("schedule_creation_failed", error=str(e))

    async def _run_skill_review(
        self,
        task: str,
        actions: list[dict[str, Any]],
        result: str,
    ) -> str | None:
        """Run skill review and learning."""
        if not self.skill_learner or not self.skill_engine:
            return None

        try:
            existing_skills = self.skill_engine.list_skills()

            learned = await self.skill_learner.review_and_learn(
                task=task,
                browser_actions=actions,
                result=result,
                success=not looks_like_error(result),
                existing_skills=existing_skills,
                conversation=[],
            )
            if learned:
                logger.info("skill_auto_learned", name=learned, source="review_agent")
            return learned
        except Exception as e:
            logger.debug("skill_review_failed", error=str(e))
            return None

    def _verify_skill_later(self, skill_name: str) -> None:
        """Fire-and-forget skill verification."""
        async def _run() -> None:
            try:
                if self.skill_engine:
                    skill_data = self.skill_engine.read(skill_name)
                    if skill_data:
                        from sediman.skills.executor import execute_skill
                        result = await execute_skill(skill_data, None, self.llm, max_retries=0)
                        if looks_like_error(result):
                            logger.info("skill_verification_failed", name=skill_name, result=result[:100])
                        else:
                            logger.info("skill_verification_passed", name=skill_name)
            except Exception as e:
                logger.debug("lazy_verification_failed", name=skill_name, error=str(e))

        asyncio.create_task(_run())

    async def _save_session(self, task: str, result: str, actions: list[dict[str, Any]]) -> None:
        """Save session to memory."""
        try:
            from sediman.memory.sessions import save_session
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

            db = TrajectoryDB()
            if db is None:
                return

            steps = []
            for a in state.actions_taken:
                steps.append(TrajectoryStep(
                    action=json.dumps(a, default=str)[:500],
                ))

            traj = Trajectory(
                task=task,
                steps=steps,
                result=state.result[:4000] if state.result else None,
                success=not looks_like_error(state.result) if state.result else False,
                skill_name=state.skill_created,
                metadata={"iterations": state.iteration, "errors": len(state.errors)},
            )
            await db.save(traj)
            logger.debug("trajectory_saved", id=traj.id, steps=len(steps))
        except Exception as e:
            logger.debug("trajectory_save_inner_failed", error=str(e))

    def _load_persistent_state(self) -> None:
        """Load persistent state from disk."""
        try:
            from sediman.config import AGENT_STATE_FILE
            if AGENT_STATE_FILE.exists():
                data = json.loads(AGENT_STATE_FILE.read_text())
                self._iters_since_skill = data.get("iters_since_skill", 0)
                self._skill_review_threshold = data.get("skill_review_threshold", 10)
        except Exception:
            pass

    def _save_persistent_state(self) -> None:
        """Save persistent state to disk."""
        try:
            from sediman.config import AGENT_STATE_FILE
            AGENT_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
            AGENT_STATE_FILE.write_text(json.dumps({
                "iters_since_skill": self._iters_since_skill,
                "skill_review_threshold": self._skill_review_threshold,
            }))
        except Exception:
            pass
