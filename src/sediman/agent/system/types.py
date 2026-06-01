from __future__ import annotations

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class IssueStatus(str, Enum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    VERIFYING = "verifying"
    REVIEWING = "reviewing"
    INTEGRATING = "integrating"
    RESOLVED = "resolved"
    FAILED = "failed"


class WorkflowPhase(str, Enum):
    EXECUTE = "execute"
    VERIFY = "verify"
    REVIEW = "review"
    INTEGRATE = "integrate"
    RED_TEAM = "red_team"
    LEARN = "learn"
    DONE = "done"


@dataclass
class VerifyResult:
    command: str
    success: bool
    output: str
    exit_code: int
    tool: str = ""


@dataclass
class QualityGate:
    name: str
    level: str
    agent_type: str
    required: bool = True
    max_retries: int = 1


@dataclass
class Issue:
    id: str
    title: str
    description: str = ""
    status: IssueStatus = IssueStatus.OPEN
    agent_id: str | None = None
    branch: str | None = None
    result: str | None = None
    failures: int = 0
    max_failures: int = 3
    iterations: int = 0
    worktree_path: str | None = None

    # Phase 1: Validation gates
    verification_results: list[VerifyResult] = field(default_factory=list)
    review_feedback: str | None = None
    review_failures: int = 0
    max_review_failures: int = 2
    diagnostic: str | None = None

    # Phase 2: Dependency graph
    depends_on: list[str] = field(default_factory=list)

    # Phase 4: Checkpoint rollback
    checkpoint_id: str | None = None

    # Timeline
    started_at: float = 0.0
    resolved_at: float = 0.0

    @property
    def can_retry(self) -> bool:
        return self.failures < self.max_failures

    @property
    def can_review_retry(self) -> bool:
        return self.review_failures < self.max_review_failures

    @property
    def duration_secs(self) -> float:
        if self.started_at and self.resolved_at:
            return self.resolved_at - self.started_at
        return 0.0


@dataclass
class WorkflowConfig:
    concurrency: int = 3
    max_rounds: int = 10
    code_agent: str = "code"
    isolate_with_worktrees: bool = True
    cleanup_worktrees: bool = False

    # Phase 1: Validation gates
    verify_after_resolve: bool = True
    review_after_resolve: bool = True
    debug_on_failure: bool = True

    # Phase 4: Adaptive resilience
    replan_count: int = 0
    max_replans: int = 2
    checkpoint_before_spawn: bool = True

    # Phase 5: Quality gates
    quality_gates: list[QualityGate] = field(default_factory=list)

    # Phase 6: Learning
    record_trajectories: bool = True
    failure_pattern_file: str = ""

    @property
    def failure_pattern_path(self) -> str:
        from sediman.config import DATA_DIR
        return self.failure_pattern_file or str(DATA_DIR / "failure_patterns.json")


@dataclass
class WorkflowTimeline:
    started_at: float = 0.0
    finished_at: float = 0.0
    phases: list[dict[str, Any]] = field(default_factory=list)
    issue_timings: dict[str, dict[str, Any]] = field(default_factory=dict)
    total_tokens_estimate: int = 0

    @property
    def total_duration_secs(self) -> float:
        if self.started_at and self.finished_at:
            return self.finished_at - self.started_at
        return 0.0

    def record_phase(self, name: str, status: str, **attrs: Any) -> None:
        self.phases.append({"name": name, "status": status, "timestamp": time.time(), **attrs})

    def record_issue(self, issue_id: str, final_status: str, notes: list[str] | None = None) -> None:
        existing = self.issue_timings.get(issue_id, {})
        existing["final_status"] = final_status
        if notes:
            existing.setdefault("notes", []).extend(notes)
        self.issue_timings[issue_id] = existing

    def render(self) -> str:
        lines = ["\n" + "=" * 50, "  TERMINATOR WORKFLOW TIMELINE", "=" * 50]
        mins, secs = divmod(int(self.total_duration_secs), 60)
        lines.append(f"  Total: {mins}m {secs}s")
        for iid, t in sorted(self.issue_timings.items(), key=lambda x: int(x[0])):
            dur = t.get("duration_secs", 0)
            dm, ds = divmod(int(dur), 60)
            st = t.get("final_status", "?")
            notes = t.get("notes", [])
            ns = f"  ({', '.join(notes)})" if notes else ""
            lines.append(f"  #{iid}: {st}  {dm}m{ds}s{ns}")
        if self.phases:
            lines.append("")
            for p in self.phases:
                lines.append(f"  Phase {p.get('name', '?')}: {p.get('status', '?')}")
        lines.append("=" * 50)
        return "\n".join(lines)


@dataclass
class WorkflowResult:
    task: str
    resolved: list[Issue] = field(default_factory=list)
    failed: list[Issue] = field(default_factory=list)
    total_rounds: int = 0
    actions_taken: list[dict[str, Any]] = field(default_factory=list)

    # Phase 5: Observability
    timeline: WorkflowTimeline = field(default_factory=WorkflowTimeline)

    # Phase 4: Replanning
    replan_count: int = 0

    @property
    def success(self) -> bool:
        return len(self.resolved) > 0 and len(self.failed) == 0

    @property
    def summary(self) -> str:
        total = len(self.resolved) + len(self.failed)
        lines = [f"Resolved {len(self.resolved)} of {total} issues:"]
        for issue in self.resolved:
            dm, ds = divmod(int(issue.duration_secs), 60)
            lines.append(f"  * #{issue.id}: {issue.title} ({dm}m{ds}s)")
        for issue in self.failed:
            lines.append(f"  x #{issue.id}: {issue.title}")
        if self.replan_count:
            lines.append(f"  Replanned {self.replan_count} time(s)")
        return "\n".join(lines)
