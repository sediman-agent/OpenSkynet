"""Issue scanner — pre-scans the codebase and files GitHub issues."""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any

from bot.ci import parse_json_from_output, run_opencode
from bot.config import Config
from bot.github_client import GitHubClient

log = logging.getLogger("sediman-bot")


class IssueScanner:
    """Finds potential bugs in the codebase and files GitHub issues."""

    def __init__(self, gh: GitHubClient, cfg: Config | None = None) -> None:
        self._gh = gh
        self._cfg = cfg or Config()

    # ------------------------------------------------------------------
    # Codebase pre-scan
    # ------------------------------------------------------------------

    def prescan_codebase(self) -> list[str]:
        """Return up to 3 high-priority source files worth auditing.

        Files are scored by security keywords, core-agent keywords, file
        size, and lack of test coverage.  Test files are excluded.
        """
        log.info("Pre-scanning codebase for candidate files...")
        candidates: list[tuple[str, int]] = []

        security_patterns = [
            "auth", "session", "token", "permission", "sandbox",
            "execute", "command", "shell", "inject", "input",
            "validate", "sanitize", "crypt", "secret", "key",
        ]
        core_patterns = [
            "agent", "tool", "skill", "provider", "cron", "server",
        ]

        workdir = self._cfg.WORKDIR
        for root, dirs, files in os.walk(workdir):
            dirs[:] = [
                d
                for d in dirs
                if not d.startswith(".")
                and d not in ("__pycache__", "node_modules", "target", ".venv", "dist", "build")
            ]
            for f in files:
                if not f.endswith((".py", ".ts", ".rs", ".go")):
                    continue
                full = os.path.join(root, f)
                rel = os.path.relpath(full, workdir)

                if "/test" in rel or "test_" in f or ".test." in f or "_test." in f:
                    continue

                score = 0
                rel_lower = rel.lower()

                for p in security_patterns:
                    if p in rel_lower:
                        score += 3
                for p in core_patterns:
                    if p in rel_lower:
                        score += 2

                try:
                    size = os.path.getsize(full)
                    if size > 10_000:
                        score += 1
                    if size > 30_000:
                        score += 1
                except OSError:
                    pass

                base = os.path.splitext(f)[0]
                test_exists = False
                for test_dir in ("tests/", "test/"):
                    for ext in (".py", ".ts", ".rs", ".go"):
                        if os.path.exists(os.path.join(workdir, test_dir, f"test_{base}{ext}")):
                            test_exists = True
                            break
                        if os.path.exists(os.path.join(workdir, test_dir, f"{base}_test{ext}")):
                            test_exists = True
                            break
                if not test_exists:
                    score += 2

                if score >= 3:
                    candidates.append((rel, score))

        candidates.sort(key=lambda x: -x[1])
        top = [c[0] for c in candidates[:3]]
        log.info("Pre-scan: %d candidates, top 3: %s", len(candidates), top)
        return top

    # ------------------------------------------------------------------
    # Deduplication
    # ------------------------------------------------------------------

    def get_existing_issue_titles(self) -> set[str]:
        """Fetch all open + closed issue titles for deduplication."""
        titles: set[str] = set()
        repo = self._cfg.REPO
        for state in ("open", "closed"):
            try:
                issues = self._gh.api(
                    f"repos/{repo}/issues?state={state}&per_page=100",
                    required=False,
                )
                if isinstance(issues, list):
                    for i in issues:
                        titles.add(i["title"].lower().strip())
                time.sleep(2)
            except Exception as exc:
                log.warning("Could not fetch %s issues: %s", state, exc)
        log.info("Dedup: found %d existing issue titles", len(titles))
        return titles

    # ------------------------------------------------------------------
    # Main scan
    # ------------------------------------------------------------------

    def scan(self) -> list[dict[str, Any]]:
        """Run the full issue-scanning pipeline.

        Pre-scans the codebase, asks opencode to find bugs, deduplicates
        against existing issues, and files 2-4 new GitHub issues.

        Returns
        -------
        list[dict]
            Each dict has ``number`` and ``title`` keys for created issues.
        """
        log.info("=== Phase 1: Issue Scanner ===")

        target_files = self.prescan_codebase()
        if not target_files:
            log.warning("No candidate files found in pre-scan")
            return []

        existing = self.get_existing_issue_titles()

        file_contents: list[str] = []
        workdir = self._cfg.WORKDIR
        for f in target_files[:5]:
            full_path = os.path.join(workdir, f)
            try:
                lines = Path(full_path).read_text().splitlines()[:50]
                file_contents.append(
                    f"### {f} (first 50 lines)\n```{Path(f).suffix.lstrip('.')}\n"
                    + "\n".join(lines)
                    + "\n```"
                )
            except OSError:
                pass

        prompt = (
            f"Read {' and '.join(f'{workdir}/{f}' for f in target_files)}. "
            "Find 2-4 real bugs.\n\n"
            "For EACH bug you MUST include a Proof of Concept — a short code "
            "snippet that reproduces the bug. No PoC = not a real bug. Skip it.\n\n"
            'Reply with ONLY a JSON array:\n'
            '[{"title":"[SEVERITY] concise bug title","body":"## Bug\\n'
            "What's wrong at file:line.\\n\\n## PoC (Reproduction)\\n"
            "```python\\n# code that triggers the bug\\n```\\n\\n"
            "## Expected\\nWhat should happen.\\n\\n## Fix\\n"
            'One-line suggestion.","labels":["bug"]}]\n\n'
            "No text outside the JSON array."
        )

        log.info("Running opencode for targeted issue analysis...")
        output = run_opencode(prompt, workdir, timeout=300)

        issues = parse_json_from_output(output)
        if not issues:
            log.warning("No valid issues parsed from opencode output")
            log.info("Raw output was: %s", output[:500])
            return []

        created: list[dict[str, Any]] = []
        repo = self._cfg.REPO
        for issue in issues:
            title = issue.get("title", "").strip()
            if not title:
                continue
            if title.lower().strip() in existing:
                log.info("Skipping duplicate: %s", title)
                continue
            try:
                body = issue.get("body", "")
                labels = issue.get("labels", ["bot"])
                result = self._gh.api_with_stdin(
                    f"repos/{repo}/issues",
                    "-X", "POST",
                    "--input", "-",
                    payload=json.dumps({"title": title, "body": body, "labels": labels}),
                )
                number = result.get("number", "?")
                log.info("Created issue #%s: %s", number, title)
                created.append({"number": number, "title": title})
                time.sleep(5)
            except Exception as exc:
                log.error("Failed to create issue '%s': %s", title, exc)

        return created
