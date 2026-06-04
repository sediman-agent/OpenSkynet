"""Core types used across the agent module.

This module contains data structures that are shared across
different agent components to avoid circular dependencies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class StepEvent:
    """Event emitted during agent step execution.

    Used for progress reporting and streaming output to the UI.
    """
    step: int
    action: str
    observation: str
    phase: str = ""
    detail: str = ""
    url: str | None = None
    tool_name: str | None = None


@dataclass
class AgentResult:
    """Final result from agent execution.

    Contains the complete execution summary including
    results, actions taken, and metadata.
    """
    task: str
    result: str
    steps: list[StepEvent] = field(default_factory=list)
    skill_created: str | None = None
    actions_taken: list[dict[str, Any]] = field(default_factory=list)
    scheduled_job_id: str | None = None
    schedule_cron: str | None = None
    iterations: int = 0
    strategy_used: str = "direct"
    success: bool = True
    confidence: float = 0.5
    validation_status: str = "validated"  # pending, validating, validated, improved, failed
    issues_found: list[str] = field(default_factory=list)
