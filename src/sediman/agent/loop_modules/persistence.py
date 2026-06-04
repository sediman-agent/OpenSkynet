"""Persistence management for AgentLoop.

Handles session and trajectory saving, and agent state persistence.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

import structlog

if TYPE_CHECKING:
    from sediman.agent.state import AgentState

logger = structlog.get_logger()


class PersistenceManager:
    """Manages persistence of sessions, trajectories, and agent state."""

    def __init__(self, state_file: Path | None = None):
        self._state_file = state_file
        self._iters_since_skill = 0
        self._skill_review_threshold = 10
        self._load_state()

    def _load_state(self) -> None:
        """Load agent state from disk."""
        if not self._state_file:
            return

        try:
            if self._state_file.exists():
                data = json.loads(self._state_file.read_text())
                self._iters_since_skill = data.get("iters_since_skill", 0)
                self._skill_review_threshold = data.get("skill_review_threshold", 10)
        except (json.JSONDecodeError, OSError):
            pass

    def _save_state(self, data: dict[str, Any]) -> None:
        """Save agent state to disk."""
        if not self._state_file:
            return

        try:
            self._state_file.parent.mkdir(parents=True, exist_ok=True)
            self._state_file.write_text(json.dumps(data))
        except OSError:
            pass

    def persist_skill_counter(self) -> None:
        """Persist skill-related counters to disk."""
        self._save_state({
            "iters_since_skill": self._iters_since_skill,
            "skill_review_threshold": self._skill_review_threshold,
        })

    def get_iters_since_skill(self) -> int:
        """Get iterations since last skill creation."""
        return self._iters_since_skill

    def set_iters_since_skill(self, value: int) -> None:
        """Set iterations since last skill creation."""
        self._iters_since_skill = value

    def increment_iters_since_skill(self, count: int) -> None:
        """Increment iterations since last skill creation."""
        self._iters_since_skill += count

    def reset_iters_since_skill(self) -> None:
        """Reset iterations since last skill creation."""
        self._iters_since_skill = 0

    def get_skill_review_threshold(self) -> int:
        """Get the skill review threshold."""
        return self._skill_review_threshold

    def should_review_skills(self) -> bool:
        """Check if skills should be reviewed."""
        return self._iters_since_skill >= self._skill_review_threshold

    def get_trajectory_db(self) -> Any | None:
        """Get the trajectory database instance."""
        try:
            from sediman.memory.trajectories import TrajectoryDB
            return TrajectoryDB()
        except Exception:
            logger.debug("trajectory_db_init_failed")
            return None

    async def save_session(
        self,
        task: str,
        result: str,
        actions: list[dict[str, Any]],
    ) -> None:
        """Save a session to memory.

        Args:
            task: The task that was executed
            result: The result of the execution
            actions: Actions taken during execution
        """
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

    async def save_trajectory(self, state: AgentState, task: str) -> None:
        """Save a trajectory to the database.

        Args:
            state: The current agent state
            task: The task being executed
        """
        db = self.get_trajectory_db()
        if db is None:
            return

        try:
            from sediman.memory.trajectories import Trajectory, TrajectoryStep

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

    @staticmethod
    def _looks_like_error(text: str) -> bool:
        """Check if text looks like an error message."""
        from sediman.errors import looks_like_error
        return looks_like_error(text)
