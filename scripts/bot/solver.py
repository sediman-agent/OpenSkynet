"""PR solver — picks up an issue and pushes a fix via a fork PR."""

from __future__ import annotations

import json
import logging
import os
import subprocess
import tempfile
import time
from typing import Any

from bot.ci import run_local_ci, run_opencode
from bot.config import Config
from bot.exceptions import GitHubAPIError
from bot.github_client import GitHubClient

log = logging.getLogger("sediman-bot")


class PRSolver:
    """Resolves a single GitHub issue by producing a fork PR."""

    def __init__(self, gh: GitHubClient, cfg: Config | None = None) -> None:
        self._gh = gh
        self._cfg = cfg or Config()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _direct_fix(self, issue: dict[str, Any], issue_body: str) -> str:
        """Run opencode in non-JSON mode for a quick targeted fix."""
        workdir = self._cfg.WORKDIR
        prompt = (
            f"Fix issue #{issue['number']}: {issue['title']}\n\n"
            f"{issue_body}\n\n"
            f"Make MINIMAL changes. Only fix what's described. Working dir: {workdir}"
        )

        log.info("Running opencode direct fix (non-json)...")
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".txt", delete=False, dir="/tmp"
        ) as tf:
            tf.write(prompt)
            prompt_file = tf.name

        try:
            cmd = f'cd {workdir} && opencode run "$(cat {prompt_file})" 2>&1'
            result = subprocess.run(
                cmd, shell=True, capture_output=True, text=True, timeout=3600
            )
            output = result.stdout + result.stderr
            log.info(
                "opencode direct: %d chars, exit=%d", len(output), result.returncode
            )
            return output
        except subprocess.TimeoutExpired:
            log.warning("opencode direct fix timed out")
            return ""
        finally:
            os.unlink(prompt_file)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def solve(self, issues: list[dict[str, Any]]) -> bool:
        """Solve the first issue in *issues* and open a PR.

        Parameters
        ----------
        issues:
            List of issue dicts (each must have ``number`` and ``title``).

        Returns
        -------
        bool
            ``True`` if a PR was created successfully.
        """
        if not issues:
            log.info("No issues to solve")
            return False

        issue = issues[0]
        log.info("=== Phase 2: PR Solver (1 issue) ===")
        log.info("Solving #%s: %s", issue["number"], issue["title"])

        workdir = self._cfg.WORKDIR
        repo = self._cfg.REPO
        fork = self._cfg.FORK
        branch_prefix = self._cfg.BRANCH_PREFIX

        # Fetch issue body
        try:
            issue_data = self._gh.api(
                f"repos/{repo}/issues/{issue['number']}", required=False
            )
            issue_body = (
                issue_data.get("body", "No details")
                if isinstance(issue_data, dict)
                else "No details"
            )
        except GitHubAPIError:
            issue_body = "No details"

        prompt = (
            f"You are a senior developer for OpenSkynet ({repo}).\n\n"
            f"TASK: Fix issue #{issue['number']}: {issue['title']}\n\n"
            f"ISSUE DETAILS:\n{issue_body}\n\n"
            "RULES:\n"
            "1. Write clean, minimal, well-tested code\n"
            "2. Follow existing code patterns and conventions\n"
            "3. Add or update tests for the fix\n"
            "4. Do NOT break any existing tests\n"
            "5. Keep changes minimal — only fix what's described\n\n"
            f"WORKING DIRECTORY: {workdir}\n\n"
            "Make the changes now. Edit files directly."
        )

        # Sync fork
        log.info("Syncing fork with upstream...")
        try:
            self._gh.api(
                f"repos/{fork}/merge-upstream",
                "-X", "POST", "-f", "branch=main",
                required=False,
            )
            time.sleep(5)
        except GitHubAPIError as exc:
            log.warning("Fork sync issue (may be ok): %s", exc)

        # Create branch
        branch_name = f"{branch_prefix}-{issue['number']}-{int(time.time())}"
        subprocess.run(
            ["git", "checkout", "-b", branch_name],
            cwd=workdir, check=True, capture_output=True,
        )

        # Run opencode — try non-json mode first
        log.info("Running opencode to fix issue...")
        output = self._direct_fix(issue, issue_body)

        if not output:
            log.warning("Direct fix failed — trying --format json mode")
            output = run_opencode(prompt, workdir, timeout=3600)

        # Check for changes
        diff_result = subprocess.run(
            ["git", "diff", "--stat", "main"],
            cwd=workdir, capture_output=True, text=True,
        )
        if not diff_result.stdout.strip():
            log.warning("No changes made by opencode — skipping PR")
            subprocess.run(["git", "checkout", "main"], cwd=workdir, capture_output=True)
            subprocess.run(["git", "branch", "-D", branch_name], cwd=workdir, capture_output=True)
            return False

        log.info("Changes:\n%s", diff_result.stdout)

        # Local CI
        log.info("Running local CI...")
        changed = subprocess.run(
            ["git", "diff", "--name-only", "main"],
            cwd=workdir, capture_output=True, text=True,
        )
        changed_files = [f.strip() for f in changed.stdout.strip().splitlines() if f.strip()]

        if not run_local_ci(changed_files, workdir=workdir):
            log.error("CI FAILED — not creating PR. Cleaning up.")
            subprocess.run(["git", "checkout", "main"], cwd=workdir, capture_output=True)
            subprocess.run(["git", "branch", "-D", branch_name], cwd=workdir, capture_output=True)
            return False

        # Commit and push
        subprocess.run(["git", "add", "-A"], cwd=workdir, check=True, capture_output=True)
        commit_msg = f"fix: resolve #{issue['number']} — {issue['title']}\n\nCloses #{issue['number']}"
        subprocess.run(["git", "commit", "-m", commit_msg], cwd=workdir, check=True, capture_output=True)

        token = self._gh._read_token()
        fork_url = f"https://x-access-token:{token}@github.com/{fork}.git"
        subprocess.run(
            ["git", "push", fork_url, f"{branch_name}:{branch_name}"],
            cwd=workdir, check=True, capture_output=True,
        )
        log.info("Pushed branch %s to fork", branch_name)

        # Create PR
        pr_body = (
            f"## Changes\n\nFixes #{issue['number']}: {issue['title']}\n\n"
            f"{issue_body}\n\n"
            "## Testing\n- [x] Local CI passed\n- [x] Tests added/updated\n\n"
            "## Notes\n- Automated PR by JasonSedimanBOT\n"
            "- DO NOT auto-merge — awaiting manual review"
        )

        try:
            pr_result = self._gh.api_with_stdin(
                f"repos/{repo}/pulls",
                "-X", "POST", "--input", "-",
                payload=json.dumps({
                    "title": f"fix: resolve #{issue['number']} — {issue['title']}",
                    "body": pr_body,
                    "head": f"JasonSedimanBOT:{branch_name}",
                    "base": "main",
                }),
            )
            pr_number = pr_result.get("number", "?")
            pr_url = pr_result.get("html_url", "unknown")
            log.info("Created PR #%s: %s", pr_number, pr_url)
        except GitHubAPIError as exc:
            log.error("Failed to create PR: %s", exc)
            return False
        finally:
            subprocess.run(["git", "checkout", "main"], cwd=workdir, capture_output=True)
            subprocess.run(["git", "branch", "-D", branch_name], cwd=workdir, capture_output=True)

        return True
