"""Background validation and non-blocking reflection system.

Allows results to be delivered to users immediately while validation
and refinement happen in the background.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any, Callable, Optional
from enum import Enum

import structlog

from sediman.agent.state import AgentState, Observation, PlanStep, Reflection
from sediman.agent.reflection.reflector import Reflector

logger = structlog.get_logger()


class ValidationResult(str, Enum):
    """Status of background validation."""
    PENDING = "pending"
    VALIDATING = "validating"
    VALIDATED = "validated"
    IMPROVED = "improved"
    FAILED = "failed"


@dataclass
class ValidationTask:
    """A background validation task."""
    task_id: str
    state: AgentState
    step: PlanStep
    observation: Observation
    original_result: str
    status: ValidationResult = ValidationResult.PENDING
    improved_result: str | None = None
    confidence: float = 0.5
    issues: list[str] = field(default_factory=list)
    created_at: float = field(default_factory=lambda: asyncio.get_event_loop().time())

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "status": self.status.value,
            "original_result": self.original_result[:200],
            "improved_result": self.improved_result[:200] if self.improved_result else None,
            "confidence": self.confidence,
            "issues": self.issues,
        }


class BackgroundValidator:
    """Manages background validation of results.

    Results are delivered to users immediately, while validation
    and potential improvements happen in the background.
    """

    def __init__(
        self,
        reflector: Reflector,
        on_validation_update: Callable[[ValidationTask], None] | None = None,
    ):
        self.reflector = reflector
        self.on_validation_update = on_validation_update
        self._active_tasks: dict[str, ValidationTask] = {}
        self._task_queue: asyncio.Queue[ValidationTask] | None = None
        self._worker_task: asyncio.Task | None = None
        self._running = False

    async def start(self) -> None:
        """Start the background validation worker."""
        if self._running:
            return

        self._running = True
        self._task_queue = asyncio.Queue()
        self._worker_task = asyncio.create_task(self._validation_worker())
        logger.info("background_validator_started")

    async def stop(self) -> None:
        """Stop the background validation worker."""
        if not self._running:
            return

        self._running = False
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
        logger.info("background_validator_stopped")

    async def validate_in_background(
        self,
        state: AgentState,
        step: PlanStep,
        observation: Observation,
        original_result: str,
    ) -> str:
        """Submit a validation task and return immediately.

        Returns a task_id that can be used to check status.
        """
        if not self._running:
            await self.start()

        task_id = f"validate_{asyncio.get_event_loop().time()}_{step.id}"

        task = ValidationTask(
            task_id=task_id,
            state=state,
            step=step,
            observation=observation,
            original_result=original_result,
            status=ValidationResult.PENDING,
        )

        self._active_tasks[task_id] = task
        await self._task_queue.put(task)

        logger.debug("validation_task_queued", task_id=task_id)
        return task_id

    async def _validation_worker(self) -> None:
        """Background worker that processes validation tasks."""
        logger.info("validation_worker_started")

        while self._running:
            try:
                # Get next task with timeout to allow graceful shutdown
                task = await asyncio.wait_for(
                    self._task_queue.get(),
                    timeout=1.0
                )

                await self._process_validation(task)

                # Remove from active tasks
                if task.task_id in self._active_tasks:
                    del self._active_tasks[task.task_id]

            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                logger.info("validation_worker_cancelled")
                break
            except Exception as e:
                logger.error("validation_worker_error", error=str(e))

    async def _process_validation(self, task: ValidationTask) -> None:
        """Process a single validation task."""
        task.status = ValidationResult.VALIDATING
        self._notify_update(task)

        try:
            # Run reflection
            reflection = await self.reflector.reflect(
                task.state,
                task.step,
                task.observation
            )

            if reflection is None:
                # Fast-path acceptance
                task.status = ValidationResult.VALIDATED
                task.confidence = 0.8
                self._notify_update(task)
                return

            # Check if validation found issues
            if reflection.issues:
                task.issues = reflection.issues

            # Determine if result should be improved
            if reflection.task_complete and reflection.confidence >= 0.7:
                # Result is good
                task.status = ValidationResult.VALIDATED
                task.confidence = reflection.confidence
            elif reflection.should_retry and task.step.retries < task.step.max_retries:
                # Could be improved with retry - for now, just note it
                task.status = ValidationResult.VALIDATED
                task.confidence = reflection.confidence
                if reflection.retry_context:
                    task.issues.append(f"Could be improved: {reflection.retry_context[:100]}")
            else:
                # Result has issues but we can't retry
                task.status = ValidationResult.FAILED
                task.confidence = reflection.confidence
                if reflection.reasoning:
                    task.issues.append(reflection.reasoning[:200])

            self._notify_update(task)

        except Exception as e:
            logger.error("validation_processing_error", task_id=task.task_id, error=str(e))
            task.status = ValidationResult.FAILED
            task.issues.append(f"Validation error: {str(e)}")
            self._notify_update(task)

    def _notify_update(self, task: ValidationTask) -> None:
        """Notify callback of validation update."""
        if self.on_validation_update:
            try:
                self.on_validation_update(task)
            except Exception as e:
                logger.error("validation_notify_failed", task_id=task.task_id, error=str(e))

    def get_task_status(self, task_id: str) -> ValidationTask | None:
        """Get status of a validation task."""
        return self._active_tasks.get(task_id)

    def get_all_active_tasks(self) -> list[ValidationTask]:
        """Get all active validation tasks."""
        return list(self._active_tasks.values())


# Singleton instance
_instance: BackgroundValidator | None = None


def get_background_validator() -> BackgroundValidator:
    """Get or create the singleton background validator."""
    global _instance
    if _instance is None:
        # Create with default reflector
        from sediman.agent.reflection.reflector import Reflector
        from sediman.agent.manager import ManagerAgent

        # This will be initialized properly on first use
        _instance = BackgroundValidator(reflector=None)
    return _instance


def set_background_validator(validator: BackgroundValidator) -> None:
    """Set the global background validator instance."""
    global _instance
    _instance = validator
