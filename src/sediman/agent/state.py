from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class AgentPhase(str, Enum):
    PLANNING = "planning"
    EXECUTING = "executing"
    OBSERVING = "observing"
    REFLECTING = "reflecting"
    DELEGATING = "delegating"
    DONE = "done"
    FAILED = "failed"


class Strategy(str, Enum):
    DIRECT = "direct"
    USE_SKILL = "use_skill"
    DELEGATE = "delegate"
    DECOMPOSE = "decompose"
    CONVERSATIONAL = "conversational"


@dataclass
class Observation:
    source: str
    content: str
    success: bool = False
    url: str | None = None
    screenshot: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    data_extracted: dict[str, Any] = field(default_factory=dict)
    verification_passed: bool | None = None


@dataclass
class Reflection:
    task_complete: bool
    confidence: float
    reasoning: str
    issues: list[str] = field(default_factory=list)
    next_action: str | None = None
    should_retry: bool = False
    should_replan: bool = False
    retry_context: str | None = None


@dataclass
class PlanStep:
    id: int
    description: str
    strategy: Strategy
    status: str = "pending"
    result: str | None = None
    observations: list[Observation] = field(default_factory=list)
    retries: int = 0
    max_retries: int = 3
    original_strategy: Strategy | None = None
    fallback_attempted: bool = False
    subagent_type: str | None = None
    failure_history: list[str] = field(default_factory=list)
    plan_signature: str | None = None

    def add_failure(self, reason: str) -> None:
        self.failure_history.append(reason)

    @property
    def last_failure(self) -> str | None:
        return self.failure_history[-1] if self.failure_history else None


@dataclass
class AgentState:
    task: str
    phase: AgentPhase = AgentPhase.PLANNING
    plan_steps: list[PlanStep] = field(default_factory=list)
    current_step_index: int = 0
    observations: list[Observation] = field(default_factory=list)
    reflections: list[Reflection] = field(default_factory=list)
    iteration: int = 0
    max_iterations: int = 5
    result: str = ""
    skill_created: str | None = None
    actions_taken: list[dict[str, Any]] = field(default_factory=list)
    scheduled_job_id: str | None = None
    schedule_cron: str | None = None
    delegate_results: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    plan_signatures: list[str] = field(default_factory=list)
    replan_count: int = 0
    max_replans: int = 3
    _streaming_token: Callable[[str, str], None] | None = field(default=None, repr=False)
    _streaming_callback: Callable[[str], None] | None = field(default=None, repr=False)

    @property
    def current_step(self) -> PlanStep | None:
        if 0 <= self.current_step_index < len(self.plan_steps):
            return self.plan_steps[self.current_step_index]
        return None

    @property
    def completed_steps(self) -> list[PlanStep]:
        return [s for s in self.plan_steps if s.status == "completed"]

    @property
    def pending_steps(self) -> list[PlanStep]:
        return [s for s in self.plan_steps if s.status == "pending"]

    @property
    def failed_steps(self) -> list[PlanStep]:
        return [s for s in self.plan_steps if s.status == "failed"]

    @property
    def total_retries(self) -> int:
        return sum(s.retries for s in self.plan_steps)

    def advance_step(self) -> None:
        self.current_step_index += 1

    def should_continue(self) -> bool:
        if self.phase in (AgentPhase.DONE, AgentPhase.FAILED):
            return False
        if self.iteration >= self.max_iterations:
            return False
        return bool(self.pending_steps) or self.current_step is not None

    def has_seen_plan(self, description: str, strategy: str) -> bool:
        sig = hashlib.md5(f"{strategy}:{description}".encode()).hexdigest()[:12]
        if sig in self.plan_signatures:
            return True
        self.plan_signatures.append(sig)
        return False

    def to_summary(self) -> str:
        parts = [f"Task: {self.task}"]
        parts.append(f"Phase: {self.phase.value}")
        parts.append(f"Iteration: {self.iteration}/{self.max_iterations}")
        parts.append(f"Replans: {self.replan_count}/{self.max_replans}")
        if self.plan_steps:
            parts.append("Steps:")
            for step in self.plan_steps:
                status_icon = {"pending": "○", "in_progress": "◐", "completed": "●", "failed": "✗"}.get(step.status, "?")
                parts.append(f"  {status_icon} [{step.strategy.value}] {step.description[:80]}")
                if step.result:
                    parts.append(f"    Result: {step.result[:100]}")
                if step.failure_history:
                    parts.append(f"    Failures: {'; '.join(step.failure_history[-2:])}")
        if self.errors:
            parts.append(f"Errors: {'; '.join(self.errors[-3:])}")
        if self.observations:
            parts.append(f"Observations: {len(self.observations)} collected")
        return "\n".join(parts)
