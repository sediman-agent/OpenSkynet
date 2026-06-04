from __future__ import annotations

import asyncio
import json
import re
import time
from pathlib import Path
from typing import Any
import structlog

from sediman.agent.subagents.factory import SubagentFactory
from sediman.agent.subagents.result import SubagentResult
from sediman.agent.system.types import Issue, IssueStatus, VerifyResult, WorkflowConfig, WorkflowResult
from sediman.agent.interrupt import InterruptSignal, AgentInterruptedError
from sediman.agent.system.worktree import (
    create_worktree, remove_worktree, cleanup_worktrees,
    stash_push, stash_pop, find_git_root,
)

logger = structlog.get_logger()
_SAFE_BRANCH_RE = re.compile(r"[^a-zA-Z0-9._-]")


class SystemBoard:
    def __init__(self):
        self._issues: dict[str, Issue] = {}
        self._counter = 0
        self._file_claims: dict[str, str] = {}

    def create_issue(self, title: str, description: str = "",
                     depends_on: list[str] | None = None) -> Issue:
        self._counter += 1
        issue = Issue(id=str(self._counter), title=title,
                      description=description or title, depends_on=depends_on or [])
        self._issues[issue.id] = issue
        return issue

    def get(self, issue_id: str) -> Issue | None:
        return self._issues.get(issue_id)

    def _deps_resolved(self, issue):
        if not issue.depends_on:
            return True
        for dep_id in issue.depends_on:
            dep = self._issues.get(dep_id)
            if not dep or dep.status != IssueStatus.RESOLVED:
                return False
        return True

    def open_issues(self):
        return [i for i in self._issues.values()
                if i.status == IssueStatus.OPEN and self._deps_resolved(i)]

    def in_progress_issues(self):
        return [i for i in self._issues.values()
                if i.status in (IssueStatus.IN_PROGRESS, IssueStatus.VERIFYING, IssueStatus.REVIEWING)]

    def resolved_issues(self):
        return [i for i in self._issues.values() if i.status == IssueStatus.RESOLVED]

    def failed_issues(self):
        return [i for i in self._issues.values() if i.status == IssueStatus.FAILED]

    def transition(self, issue: Issue, new_status: IssueStatus, **kwargs: Any) -> Issue:
        issue.status = new_status
        for key, value in kwargs.items():
            if hasattr(issue, key):
                setattr(issue, key, value)
        return issue

    def is_done(self):
        active = (IssueStatus.OPEN, IssueStatus.IN_PROGRESS, IssueStatus.VERIFYING, IssueStatus.REVIEWING)
        for issue in self._issues.values():
            if issue.status in active:
                return False
        return True

    def pending_count(self):
        active = (IssueStatus.OPEN, IssueStatus.IN_PROGRESS, IssueStatus.VERIFYING, IssueStatus.REVIEWING)
        return sum(1 for i in self._issues.values() if i.status in active)

    def to_context_string(self):
        lines = ["Board:"]
        icons = {IssueStatus.OPEN: "o", IssueStatus.IN_PROGRESS: ".",
                 IssueStatus.VERIFYING: "?", IssueStatus.REVIEWING: "!",
                 IssueStatus.RESOLVED: "*", IssueStatus.FAILED: "x"}
        for issue in sorted(self._issues.values(), key=lambda i: int(i.id)):
            dep = f" (deps: {', '.join('#' + d for d in issue.depends_on)})" if issue.depends_on else ""
            lines.append(f"  #{issue.id} {icons.get(issue.status, '?')} {issue.title}{dep}")
        return "\n".join(lines)

    def all(self):
        return sorted(self._issues.values(), key=lambda i: int(i.id))

    def claim_files(self, issue_id, files):
        conflicts = []
        for f in files:
            if f in self._file_claims and self._file_claims[f] != issue_id:
                conflicts.append(f"File {f} also claimed by #{self._file_claims[f]}")
            self._file_claims[f] = issue_id
        return conflicts


def _make_branch_name(issue):
    safe = _SAFE_BRANCH_RE.sub("", issue.title.lower().replace(" ", "-"))[:40]
    return f"feature-issue-{issue.id}-{safe}".rstrip("-")


def _extract_files(actions):
    files = []
    for a in actions:
        if a.get("tool") in ("write_file", "patch", "read_file"):
            path = a.get("input", {}).get("path", "")
            if path:
                files.append(path)
    return list(set(files))


def _detect_project(wt):
    info = {"root_dir": str(wt), "lint": [], "test": [], "format": []}
    if (wt / "pyproject.toml").exists() or (wt / "setup.py").exists():
        info["lint"] = ["ruff check ."]
        info["test"] = ["python -m pytest -x -q"]
        info["format"] = ["ruff format --check ."]
    if (wt / "package.json").exists():
        info["lint"].append("npx eslint .")
        info["test"].append("npm test")
        info["format"].append("npx prettier --check .")
    if (wt / "Cargo.toml").exists():
        info["lint"].append("cargo clippy -- -D warnings")
        info["test"].append("cargo test")
    return info


def _build_subagent_prompt(issue, board, wt, branch, scratchpad=None, warnings=None):
    dep_ctx = ""
    if issue.depends_on and scratchpad:
        dl = []
        for dep_id in issue.depends_on:
            dep = board.get(dep_id)
            if dep and dep.status == IssueStatus.RESOLVED:
                dl.append(f"  - #{dep_id}: {dep.result or 'done'}")
                exp = scratchpad.read(f"issue_{dep_id}_exports")
                if exp:
                    dl.append(f"    Exports: {exp}")
        if dl:
            dep_ctx = "\nResolved dependencies:\n" + "\n".join(dl)
    warn_ctx = ""
    if warnings:
        warn_ctx = "\nKnown failure patterns:\n" + "\n".join(f"  - {w}" for w in warnings)
    return f"""<workflow_context>
Issue #{issue.id}: "{issue.title}"
Workspace: {wt}  Branch: "{branch}"

{board.to_context_string()}
{dep_ctx}
{warn_ctx}

Instructions:
  1. Read relevant files to understand the codebase
  2. Implement the solution
  3. Verify: compile + tests pass
  4. Commit: git_commit path="{wt}"
  5. Return summary of changes and files changed

Use path="{wt}" for git tools. Do NOT push. Workspace is isolated.
</workflow_context>"""


def _build_retry_prompt(issue, board, wt, branch, scratchpad=None):
    parts = [
        f'#{issue.id} "{issue.title}" - RETRY ({issue.failures + 1}/{issue.max_failures})',
        f"Workspace: {wt}  Branch: {branch}",
        f"\n{board.to_context_string()}",
        f"\nPrevious: {issue.result or 'no output'}",
    ]
    if issue.diagnostic:
        parts.append(f"\nRoot cause:\n{issue.diagnostic}")
    if issue.verification_results:
        failed = [v for v in issue.verification_results if not v.success]
        if failed:
            parts.append("\nVerify failures:")
            for v in failed:
                parts.append(f"  [{v.tool}] {v.command} (exit {v.exit_code})")
                if v.output:
                    parts.append(f"  {v.output[:500]}")
    if issue.review_feedback:
        parts.append(f"\nReview feedback:\n{issue.review_feedback}")
    if issue.depends_on and scratchpad:
        for d in issue.depends_on:
            s = scratchpad.read(f"issue_{d}_summary")
            if s:
                parts.append(f"\nDep #{d}: {s}")
    if issue.failures >= 2:
        parts.append("\n!! Two approaches failed. Try a DIFFERENT strategy.")
    parts.append(f'\nFix it. Use path="{wt}" for git. Run tests. Commit.')
    return "<workflow_context>\n" + "\n".join(parts) + "\n</workflow_context>"


class SystemOrchestrator:
    def __init__(self, llm_provider, manager, factory, config=None):
        self.llm = llm_provider
        self.manager = manager
        self.factory = factory
        self.config = config or WorkflowConfig()
        self.board = SystemBoard()

    async def _check_interrupt(self):
        if InterruptSignal.get().is_set():
            raise AgentInterruptedError("Terminator interrupted")

    async def run(self, task: str, subtasks: list[str]) -> WorkflowResult:
        result = WorkflowResult(task=task)
        result.timeline.started_at = time.time()

        for st in subtasks:
            if isinstance(st, dict):
                self.board.create_issue(st.get("title", str(st)),
                                        st.get("description", ""),
                                        st.get("depends_on", []))
            else:
                self.board.create_issue(st)
        logger.info("terminator_start", task=task[:80], issues=len(subtasks),
                     worktrees=self.config.isolate_with_worktrees)

        repo_root = None
        stashed = False
        if self.config.isolate_with_worktrees:
            repo_root = find_git_root()
            if repo_root is not None:
                stashed = stash_push(repo_root)

        try:
            await self._execute_phase(result, task, repo_root)
            await self._check_interrupt()
            if result.resolved and not result.failed:
                await self._integrate_phase(result, repo_root)
            await self._check_interrupt()
            if result.resolved:
                await self._redteam_phase(result, repo_root)
        finally:
            if stashed and repo_root:
                stash_pop(repo_root)
            if self.config.cleanup_worktrees and repo_root is not None:
                cleanup_worktrees(repo_root)

        result.timeline.finished_at = time.time()
        await self._learn_phase(result, task)
        logger.info("terminator_done", resolved=len(result.resolved),
                     failed=len(result.failed), duration=int(result.timeline.total_duration_secs))
        return result

    # ── Execute (Phase 1+2+4) ──────────────────────────────────────────

    async def _execute_phase(self, result, task, repo_root):
        result.timeline.record_phase("execute", "started")
        round_num = 0
        while not self.board.is_done() and round_num < self.config.max_rounds:
            await self._check_interrupt()
            round_num += 1
            open_issues = self.board.open_issues()
            if not open_issues:
                if not self.board.in_progress_issues():
                    break
                await asyncio.sleep(1)
                continue
            batch = open_issues[:self.config.concurrency]
            logger.info("terminator_round", round=round_num, batch=len(batch),
                         remaining=self.board.pending_count())
            sem = asyncio.Semaphore(self.config.concurrency)
            async def _proc(idx, issue):
                async with sem:
                    await self._run_issue(issue, result, task, repo_root)
            await asyncio.gather(*[_proc(i, issue) for i, issue in enumerate(batch)])
            if self._should_replan():
                await self._replan(result, task)

        result.total_rounds = round_num
        for issue in self.board.all():
            if issue.status in (IssueStatus.OPEN, IssueStatus.IN_PROGRESS,
                                IssueStatus.VERIFYING, IssueStatus.REVIEWING):
                self.board.transition(issue, IssueStatus.FAILED)
                result.failed.append(issue)
        result.timeline.record_phase("execute", "done")

    async def _run_issue(self, issue, result, task, repo_root):
        branch = _make_branch_name(issue)
        wt = None
        if self.config.isolate_with_worktrees and repo_root is not None:
            try:
                wt = create_worktree(repo_root, branch)
            except Exception as e:
                self.board.transition(issue, IssueStatus.FAILED, result=f"Worktree failed: {e}")
                result.failed.append(issue)
                return
        else:
            wt = Path.cwd()

        self.board.transition(issue, IssueStatus.IN_PROGRESS, branch=branch,
                              worktree_path=str(wt) if wt else None, started_at=time.time())

        cp_id = await self._checkpoint(wt)

        warnings = []
        try:
            from sediman.agent.system.failure_patterns import FailurePatternStore
            warnings = FailurePatternStore(self.config.failure_pattern_path).get_warnings(
                issue.title + " " + issue.description)
        except Exception:
            logger.debug("failure_pattern_load_failed")

        wtp = wt or Path.cwd()
        if issue.failures == 0:
            prompt = _build_subagent_prompt(issue, self.board, wtp, branch,
                                            self.factory.scratchpad, warnings or None)
        else:
            await asyncio.sleep(min(2 ** issue.failures, 30))
            prompt = _build_retry_prompt(issue, self.board, wtp, branch, self.factory.scratchpad)

        ctx = {"task": task, "worktree_path": issue.worktree_path,
               "branch": issue.branch, "issue_id": issue.id}
        sr = await self.factory.spawn(agent_type=self.config.code_agent, task=prompt, parent_context=ctx)

        if sr.success and not sr.errors:
            # File conflict detection
            files = _extract_files(sr.actions_taken)
            conflicts = self.board.claim_files(issue.id, files)
            if conflicts:
                logger.warning("terminator_file_conflict", issue=issue.id, conflicts=conflicts)

            # Phase 1.1: Verify
            if self.config.verify_after_resolve and not await self._verify(issue, wt):
                await self._fail(issue, result, sr, wt, cp_id)
                return
            # Phase 1.2: Review
            if self.config.review_after_resolve and not await self._review(issue, sr, wt):
                if issue.can_review_retry:
                    issue.failures += 1
                    self.board.transition(issue, IssueStatus.OPEN)
                else:
                    self.board.transition(issue, IssueStatus.FAILED)
                    result.failed.append(issue)
                return

            self.board.transition(issue, IssueStatus.RESOLVED, result=sr.summary,
                                  iterations=issue.iterations + 1, resolved_at=time.time())
            result.resolved.append(issue)
            result.actions_taken.extend(sr.actions_taken)
            logger.info("terminator_resolved", id=issue.id, title=issue.title[:60])
            self._to_scratchpad(issue, sr)
            result.timeline.record_issue(issue.id, "RESOLVED", notes=[f"iter={issue.iterations + 1}"])
            result.timeline.issue_timings[issue.id] = {"duration_secs": issue.duration_secs}
            if self.config.cleanup_worktrees and issue.worktree_path:
                remove_worktree(Path(issue.worktree_path))
        else:
            await self._fail(issue, result, sr, wt, cp_id)

    # ── Phase 1.1: Verify ──────────────────────────────────────────────

    async def _verify(self, issue, wt):
        self.board.transition(issue, IssueStatus.VERIFYING)
        if not wt:
            return True
        try:
            from sediman.agent.coding_agent.verifier import InlineVerifier
            from sediman.agent.coding_agent.types import ProjectInfo
            p = _detect_project(wt)
            project = ProjectInfo(root_dir=p["root_dir"], lint_commands=p["lint"],
                                  test_commands=p["test"], format_commands=p["format"])
            results = await InlineVerifier(project).verify_all(aggressive=True)
            issue.verification_results = [
                VerifyResult(command=r.command, success=r.success, output=r.output,
                             exit_code=r.exit_code, tool=r.tool) for r in results]
            ok = all(r.success for r in results)
            logger.info(f"terminator_verify_{'pass' if ok else 'fail'}", id=issue.id)
            return ok
        except Exception as e:
            logger.warning("terminator_verify_error", id=issue.id, error=str(e))
            return True

    # ── Phase 1.2: Review ──────────────────────────────────────────────

    async def _review(self, issue, sr, wt):
        self.board.transition(issue, IssueStatus.REVIEWING)
        diff = ""
        if wt and issue.branch:
            try:
                proc = await asyncio.create_subprocess_exec(
                    "git", "-C", str(wt), "diff", "HEAD~1", "--stat",
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                out, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
                diff = out.decode(errors="replace")[:3000]
            except Exception:
                logger.debug("git_diff_read_failed")
        files = _extract_files(sr.actions_taken)
        prompt = f"""Review #{issue.id}: "{issue.title}"
Summary: {sr.summary or 'none'}
Files: {', '.join(files) if files else 'unknown'}
Diff: {diff or 'n/a'}
Rate: PASS, NEEDS_FIX, or REJECT. Explain if not PASS."""
        try:
            rr = await self.factory.spawn(agent_type="review", task=prompt,
                                          parent_context={"issue_id": issue.id})
            text = (rr.summary or "").strip().upper()
            if "REJECT" in text:
                issue.review_feedback = rr.summary
                issue.review_failures += 1
                return False
            if "NEEDS_FIX" in text or "NEEDS FIX" in text:
                issue.review_feedback = rr.summary
                issue.review_failures += 1
                return False
            return True
        except Exception as e:
            logger.warning("terminator_review_error", error=str(e))
            return True

    # ── Phase 1.3: Debug + failure handling ─────────────────────────────

    async def _fail(self, issue, result, sr, wt, cp_id=None):
        issue.failures += 1
        issue.result = sr.summary
        if self.config.debug_on_failure and issue.can_retry:
            issue.diagnostic = await self._diagnose(issue, sr, wt)
        if cp_id and wt:
            await self._rollback(cp_id, wt)
        if issue.can_retry:
            self.board.transition(issue, IssueStatus.OPEN)
            logger.info("terminator_retry", id=issue.id, f=issue.failures, max=issue.max_failures)
        else:
            self.board.transition(issue, IssueStatus.FAILED)
            result.failed.append(issue)
            result.timeline.record_issue(issue.id, "FAILED", notes=[f"failures={issue.failures}"])
            result.timeline.issue_timings[issue.id] = {"duration_secs": issue.duration_secs}
            if self.config.cleanup_worktrees and issue.worktree_path:
                remove_worktree(Path(issue.worktree_path))

    async def _diagnose(self, issue, sr, wt):
        vctx = ""
        if issue.verification_results:
            failed = [v for v in issue.verification_results if not v.success]
            if failed:
                vctx = "\n".join(f"  [{v.tool}] {v.command}: {v.output[:300]}" for v in failed)
        prompt = f"""Diagnose failure for #{issue.id}: "{issue.title}"
Output: {sr.summary or 'none'}
Errors: {', '.join(sr.errors) if sr.errors else 'none'}
{vctx}
Workspace: {wt or 'unknown'}
ROOT CAUSE in 1-2 sentences. SPECIFIC fix needed."""
        try:
            dr = await self.factory.spawn(agent_type="debug", task=prompt,
                                          parent_context={"issue_id": issue.id})
            return dr.summary
        except Exception:
            logger.debug("diagnose_spawn_failed")
            return None

    # ── Phase 2.2: Scratchpad ──────────────────────────────────────────

    def _to_scratchpad(self, issue, sr):
        sp = self.factory.scratchpad
        if not sp:
            return
        sp.write(f"issue_{issue.id}_summary", sr.summary or "", author=f"issue_{issue.id}")
        files = _extract_files(sr.actions_taken)
        if files:
            sp.write(f"issue_{issue.id}_files_changed", ", ".join(files), author=f"issue_{issue.id}")
        exports = [f for f in files if f.endswith((".py", ".ts", ".js", ".rs", ".go"))]
        if exports:
            sp.write(f"issue_{issue.id}_exports", ", ".join(exports), author=f"issue_{issue.id}")

    # ── Phase 3: Integrate ─────────────────────────────────────────────

    async def _integrate_phase(self, result, repo_root):
        result.timeline.record_phase("integrate", "started")
        if not repo_root:
            return
        resolved = self.board.resolved_issues()
        branches = [i.branch for i in resolved if i.branch]
        if not branches:
            return
        il = "\n".join(f"  #{i.id}: {i.title} -> {i.branch}" for i in resolved)
        mc = "\n".join(f"     git merge {b}" for b in branches)
        prompt = f"""Integration agent. Repo: {repo_root}
Resolved:
{il}
Merge each branch:
{mc}
Resolve conflicts. Run full tests. Fix breakages. No push."""
        try:
            ir = await self.factory.spawn(agent_type="integrate", task=prompt,
                                          parent_context={"branches": branches, "repo_root": str(repo_root)})
            st = "done" if ir.success else "failed"
            result.timeline.record_phase("integrate", st, summary=ir.summary)
        except Exception as e:
            result.timeline.record_phase("integrate", "error", error=str(e))

    # ── Phase 4: Replan ────────────────────────────────────────────────

    def _should_replan(self):
        if self.config.replan_count >= self.config.max_replans:
            return False
        all_i = self.board.all()
        if not all_i:
            return False
        return sum(1 for i in all_i if i.status == IssueStatus.FAILED) > len(all_i) / 2

    async def _replan(self, result, task):
        self.config.replan_count += 1
        result.replan_count += 1
        failed = self.board.failed_issues()
        resolved = self.board.resolved_issues()
        fc = [f"#{i.id}: {i.title} - {i.result or '?'}" + (f"\n  Dx: {i.diagnostic}" if i.diagnostic else "")
              for i in failed]
        rc = [f"#{i.id}: {i.title} - OK: {i.result or 'done'}" for i in resolved]
        prompt = f"""Re-decompose: "{task}"
OK: {chr(10).join(rc) if rc else 'none'}
Failed: {chr(10).join(fc) if fc else 'none'}
JSON: [{{"title":"...", "depends_on":[]}}]"""
        try:
            resp = await self.llm.chat(
                messages=[{"role": "system", "content": "Decomposition specialist. JSON only."},
                          {"role": "user", "content": prompt}], tools=[])
            m = re.search(r"\[.*\]", resp.text or "", re.DOTALL)
            if m:
                new = json.loads(m.group())
                for i in list(self.board._issues.values()):
                    if i.status == IssueStatus.FAILED:
                        del self.board._issues[i.id]
                for s in new:
                    if isinstance(s, dict):
                        self.board.create_issue(s.get("title", str(s)), depends_on=s.get("depends_on", []))
                    else:
                        self.board.create_issue(str(s))
        except Exception as e:
            logger.warning("terminator_replan_error", error=str(e))

    # ── Phase 4.2: Checkpoints ─────────────────────────────────────────

    async def _checkpoint(self, wt):
        if not wt:
            return None
        try:
            from sediman.agent.checkpoint import CheckpointManager
            info = await CheckpointManager(enabled=True).maybe_checkpoint(
                "terminal", {"command": "terminator"}, cwd=str(wt))
            return info.id if info else None
        except Exception:
            logger.debug("checkpoint_failed")
            return None

    async def _rollback(self, cp_id, wt):
        try:
            from sediman.agent.checkpoint import CheckpointManager
            return await CheckpointManager(enabled=True).revert(cp_id, str(wt))
        except Exception:
            logger.debug("rollback_failed")
            return False

    # ── Phase 7: Red team + contracts ───────────────────────────────────

    async def _redteam_phase(self, result, repo_root):
        result.timeline.record_phase("red_team", "started")
        resolved = self.board.resolved_issues()
        await self._verify_contracts(result, resolved)
        if not repo_root:
            return
        all_files = list(set(f for i in resolved for f in _extract_files(result.actions_taken)))
        if not all_files:
            return
        fl = "\n".join(f"  - {f}" for f in all_files)
        prompt = f"""Adversarial test engineer. Repo: {repo_root}
Files:
{fl}
Find untested edge cases. Write adversarial tests. Run all tests.
ONLY create test files. Never modify source."""
        try:
            rr = await self.factory.spawn(agent_type="redteam", task=prompt,
                                          parent_context={"files": all_files, "repo_root": str(repo_root)})
            result.timeline.record_phase("red_team", "done" if rr.success else "issues", summary=rr.summary)
        except Exception as e:
            result.timeline.record_phase("red_team", "error", error=str(e))

    async def _verify_contracts(self, result, resolved):
        sp = self.factory.scratchpad
        if not sp:
            return
        for issue in resolved:
            for dep_id in issue.depends_on:
                dep = self.board.get(dep_id)
                if not dep or dep.status != IssueStatus.RESOLVED:
                    continue
                exports = sp.read(f"issue_{dep_id}_exports")
                if not exports:
                    continue
                prompt = f"Verify #{issue.id} uses #{dep_id}'s API. Exports: {exports}. PASS or describe mismatches."
                try:
                    cr = await self.factory.spawn(agent_type="review", task=prompt,
                                                  parent_context={"issue_id": issue.id, "dep_id": dep_id})
                    if cr.summary and "PASS" not in (cr.summary or "").upper():
                        logger.warning("terminator_contract_mismatch", issue=issue.id, dep=dep_id)
                except Exception:
                    logger.debug("contract_verify_failed")

    # ── Phase 5+6: Learn ───────────────────────────────────────────────

    async def _learn_phase(self, result, task):
        result.timeline.record_phase("learn", "started")
        for issue in result.resolved + result.failed:
            if issue.id in result.timeline.issue_timings:
                result.timeline.issue_timings[issue.id]["duration_secs"] = issue.duration_secs
        if self.config.record_trajectories:
            await self._save_trajectories(result, task)
        if result.failed:
            await self._save_failure_patterns(result, task)
        result.timeline.record_phase("learn", "done")
        logger.info("terminator_timeline\n%s", result.timeline.render())

    async def _save_trajectories(self, result, task):
        try:
            from sediman.memory.trajectories import Trajectory, TrajectoryDB, TrajectoryStep
            db = TrajectoryDB()
            for issue in result.resolved + result.failed:
                steps = [TrajectoryStep(a.get("tool", "?"), str(a.get("output", ""))[:200])
                         for a in result.actions_taken if a.get("issue_id") == issue.id]
                await db.save(Trajectory(
                    task=f"[terminator] #{issue.id}: {issue.title}", steps=steps,
                    result=issue.result, success=issue.status == IssueStatus.RESOLVED,
                    metadata={"workflow_task": task, "branch": issue.branch,
                              "failures": issue.failures, "duration_secs": issue.duration_secs}))
            wf_steps = [TrajectoryStep(f"resolve_{i.id}", i.result or "")
                        for i in result.resolved + result.failed]
            await db.save(Trajectory(
                task=f"[terminator-workflow] {task}", steps=wf_steps,
                result=result.summary, success=result.success,
                metadata={"rounds": result.total_rounds, "resolved": len(result.resolved),
                          "failed": len(result.failed), "replans": result.replan_count,
                          "duration_secs": result.timeline.total_duration_secs}))
        except Exception as e:
            logger.warning("terminator_trajectory_error", error=str(e))

    async def _save_failure_patterns(self, result, task):
        try:
            from sediman.agent.system.failure_patterns import FailurePatternStore
            store = FailurePatternStore(self.config.failure_pattern_path)
            for issue in result.failed:
                pat = issue.title
                if issue.diagnostic:
                    pat += f" - {issue.diagnostic[:200]}"
                mit = ""
                if issue.verification_results:
                    failed = [v for v in issue.verification_results if not v.success]
                    if failed:
                        mit = f"Verify: {', '.join(v.command for v in failed)}"
                elif issue.review_feedback:
                    mit = f"Review: {issue.review_feedback[:200]}"
                elif issue.result:
                    mit = f"Output: {issue.result[:200]}"
                if pat and mit:
                    store.add_pattern(task[:100], pat, mit)
            store.save()
        except Exception as e:
            logger.warning("terminator_pattern_error", error=str(e))
